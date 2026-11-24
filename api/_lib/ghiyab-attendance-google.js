import { createSign, randomInt, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const tabTitle = "سجل الغياب";
const portalTabTitle = "سجل رصد المعلمين";
const columns = [
  "معرّف الرصد", "التاريخ", "الصف والشعبة", "الحصة", "المعلم",
  "الغائبون", "الغائبون بعذر", "المتأخرون", "وقت الاعتماد", "عدد طلبة الشعبة"
];
const portalColumns = [...columns, "المتسربون", "حالة الرصد"];
const tokenUrl = "https://oauth2.googleapis.com/token";
const sheetScope = "https://www.googleapis.com/auth/spreadsheets";
const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
const sql = dbUrl.trim() ? neon(dbUrl.trim()) : null;
let tokenCache, leaseSchema;

function error(code) { return Object.assign(new Error(code), {code}); }
function plain(value, limit) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function quoteTab(name) { return "'" + name.replaceAll("'", "''") + "'"; }

export function googleExportUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  let cleaned = value.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/&amp;/gi, "&").trim();
  if (/^(?:docs|drive)\.google\.com\//i.test(cleaned)) cleaned = "https://" + cleaned;
  let input;
  try { input = new URL(cleaned); } catch { return null; }
  if (input.protocol !== "https:" || input.username || input.password || input.port) return null;

  const pathname = input.pathname;
  const idPattern = /^[A-Za-z0-9_-]{2,160}$/;
  let id, published = false;
  if (input.hostname === "docs.google.com") {
    const sheet = /^\/spreadsheets(?:\/u\/\d+)?\/d\/(e\/)?([A-Za-z0-9_-]+)(?:\/|$)/.exec(pathname);
    if (sheet) {
      published = Boolean(sheet[1]);
      id = sheet[2];
    } else if (/^\/open\/?$/.test(pathname)) {
      id = input.searchParams.get("id");
    }
  } else if (input.hostname === "drive.google.com") {
    const file = /^\/file(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(pathname);
    id = file?.[1] ?? (/^\/(?:open|uc)\/?$/.test(pathname) ? input.searchParams.get("id") : null);
  }
  if (!id || !idPattern.test(id)) return null;

  const output = published
    ? new URL(`https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv`)
    : new URL(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`);
  const gid = input.searchParams.get("gid") || new URLSearchParams(input.hash.slice(1)).get("gid");
  if (/^\d{1,12}$/.test(gid ?? "")) {
    output.searchParams.set("gid", gid);
    if (published) output.searchParams.set("single", "true");
  }
  const resourceKey = input.searchParams.get("resourcekey");
  if (/^[A-Za-z0-9_-]{1,200}$/.test(resourceKey ?? "")) output.searchParams.set("resourcekey", resourceKey);
  return output;
}

export function attendanceBinding(ownerId, exportUrl) {
  if(!exportUrl) return {reason:"attendance_source_invalid"};
  const spreadsheetId = exportUrl.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)\/export$/)?.[1];
  if(!spreadsheetId) return {reason:"attendance_source_published"};
  const raw = process.env.GHIYAB_SHEETS_BY_ACCOUNT;
  if(!raw?.trim()) return {spreadsheetId, reason:"attendance_binding_missing"};
  let map;
  try{ map = JSON.parse(raw); }
  catch{ return {spreadsheetId, reason:"attendance_binding_invalid"}; }
  if(!map || typeof map !== "object" || Array.isArray(map)) return {spreadsheetId, reason:"attendance_binding_invalid"};
  if(!Object.hasOwn(map, ownerId)) return {spreadsheetId, reason:"attendance_account_unlinked"};
  if(map[ownerId] !== spreadsheetId) return {spreadsheetId, reason:"attendance_sheet_mismatch"};
  if(Object.values(map).filter(id => id === spreadsheetId).length !== 1){
    return {spreadsheetId, reason:"attendance_binding_conflict"};
  }
  return {spreadsheetId};
}

export function linkedSpreadsheet(ownerId, exportUrl) {
  const result = attendanceBinding(ownerId, exportUrl);
  return result.reason ? null : result.spreadsheetId;
}

export function schoolSpreadsheetUrl(value) {
  const input = typeof value === "string" ? value.trim() : "";
  return googleExportUrl(/^[A-Za-z0-9_-]{2,160}$/.test(input)
    ? "https://docs.google.com/spreadsheets/d/" + input + "/edit"
    : input);
}

function encode(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
async function googleToken(signal) {
  if(tokenCache && tokenCache.expiresAt > Date.now() + 60000) return tokenCache.value;
  let assertion;
  try{
    const key = JSON.parse(process.env.GHIYAB_SHEETS_SERVICE_ACCOUNT || "{}");
    if(typeof key.client_email !== "string" || typeof key.private_key !== "string") throw Error();
    const now = Math.floor(Date.now() / 1000);
    const jwt = encode({alg:"RS256", typ:"JWT"}) + "." + encode({
      iss:key.client_email, scope:sheetScope, aud:tokenUrl, iat:now, exp:now + 3600
    });
    assertion = jwt + "." + createSign("RSA-SHA256").update(jwt).sign(key.private_key, "base64url");
  }catch{ throw error("attendance_credentials_missing"); }
  const response = await fetch(tokenUrl, {
    method:"POST", signal, redirect:"error",
    body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer", assertion})
  });
  const body = await response.json().catch(() => ({}));
  if(!response.ok || typeof body.access_token !== "string") throw error("attendance_credentials_missing");
  tokenCache = {value:body.access_token, expiresAt: Date.now() + Number(body.expires_in || 0) * 1000};
  return tokenCache.value;
}

async function google(id, path, {signal, method = "GET", body} = {}) {
  const token = await googleToken(signal);
  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + id + path, {
    method, signal, redirect:"error",
    headers:{Authorization:"Bearer " + token, ...(body ? {"Content-Type":"application/json"} : {})},
    body:body ? JSON.stringify(body) : undefined
  });
  if(!response.ok){
    await response.body?.cancel();
    if([401, 403, 404].includes(response.status)) throw error("attendance_sheet_permission");
    const failure = error("attendance_google_unavailable");
    failure.googleStatus = response.status;
    throw failure;
  }
  return response.json();
}

async function tabs(id, signal) {
  const data = await google(id, "?fields=sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)) )".replaceAll(" ", ""), {signal});
  return (data.sheets || []).map(sheet => sheet.properties);
}

export async function checkGoogleAttendanceAccess(id, portal = false) {
  const sheets = await tabs(id, AbortSignal.timeout(7500));
  const log = sheets.find(sheet => sheet.title === (portal ? portalTabTitle : tabTitle));
  return {url:log ? "https://docs.google.com/spreadsheets/d/" + id + "/edit#gid=" + log.sheetId : ""};
}

export async function readPrivateRoster(id, exportUrl) {
  const signal = AbortSignal.timeout(15000);
  const list = (await tabs(id, signal)).filter(sheet => !sheet.hidden && ![tabTitle, portalTabTitle, "store"].includes(sheet.title));
  const gid = exportUrl.searchParams.get("gid");
  const tab = gid == null ? list[0] : list.find(sheet => String(sheet.sheetId) === gid);
  if(!tab) throw error("sheet_or_tab_not_found");
  const width = Math.min(52, tab.gridProperties?.columnCount || 26);
  const lastColumn = width <= 26 ? String.fromCharCode(64 + width) : "A" + String.fromCharCode(64 + width - 26);
  const height = Math.min(3001, tab.gridProperties?.rowCount || 1000);
  const range = encodeURIComponent(quoteTab(tab.title) + "!A1:" + lastColumn + height);
  const data = await google(id, "/values/" + range, {signal});
  const rows = data.values || [];
  if(!rows.length) throw error("empty_sheet");
  if(rows.length > 3000) throw error("sheet_too_large");
  return rows.map(row => row.map(value => '"' + String(value ?? "").replaceAll('"', '""') + '"').join(",")).join("\r\n");
}

async function logTab(id, title, header, signal) {
  let existing = (await tabs(id, signal)).find(sheet => sheet.title === title);
  if(existing) return existing;
  const sheetId = randomInt(1, 2000000000);
  try{
    await google(id, ":batchUpdate", {method:"POST", signal, body:{requests:[
      {addSheet:{properties:{sheetId, title, rightToLeft:true, gridProperties:{rowCount:1000, columnCount:header.length, frozenRowCount:1}}}},
      {updateCells:{start:{sheetId, rowIndex:0, columnIndex:0},
        rows:[{values:header.map(name => ({userEnteredValue:{stringValue:name}, userEnteredFormat:{textFormat:{bold:true}}}))}],
        fields:"userEnteredValue,userEnteredFormat.textFormat"}},
      {updateDimensionProperties:{range:{sheetId, dimension:"COLUMNS", startIndex:0, endIndex:1}, properties:{hiddenByUser:true}, fields:"hiddenByUser"}},
      {repeatCell:{range:{sheetId, startColumnIndex:5, endColumnIndex:8},
        cell:{userEnteredFormat:{wrapStrategy:"WRAP"}}, fields:"userEnteredFormat.wrapStrategy"}}
    ]}});
    return {sheetId, title, gridProperties:{rowCount:1000}};
  }catch(failure){
    if(failure.googleStatus !== 400) throw failure;
    existing = (await tabs(id, signal)).find(sheet => sheet.title === title);
    if(existing) return existing;
    throw failure;
  }
}

function attendanceRows(entries, workspace) {
  if(!Array.isArray(entries) || entries.length < 1 || entries.length > 40) throw error("attendance_invalid");
  const result = new Map();
  for(const row of entries){
    const date = row?.date, classId = plain(row?.classId, 200), className = plain(row?.className, 160);
    const period = row?.period, isoTime = Date.parse(row?.at);
    if(typeof date !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(date) || !classId || !className || !Number.isInteger(period) ||
      period < 0 || period > 12 || !Number.isFinite(isoTime) || !Number.isInteger(row.total) || row.total < 0 ||
      row.total > 1000) throw error("attendance_invalid");
    const at = new Date(isoTime).toISOString();
    const people = field => {
      const names = row[field];
      if(!Array.isArray(names) || names.length > row.total) throw error("attendance_invalid");
      const list = names.map(name => plain(name, 160)).filter(Boolean).join("\n");
      if(list.length > 49000) throw error("attendance_invalid");
      return list;
    };
    const identity = workspace ? JSON.stringify([workspace, classId]) : classId;
    const key = date + "|" + Buffer.from(identity).toString("base64url") + "|" + period;
    const values = [key, date, className, period === 0 ? "اليوم" : "الحصة " + period, plain(row.teacher, 100),
      people("absent"), people("excused"), people("late"), at, row.total];
    if(workspace){
      const dropout = people("dropout");
      const status = dropout ? "تسرب"
        : row.absent.length === row.total && row.total > 0 ? "غياب كامل"
        : values[5] || values[6] || values[7] ? "حالات حضور وغياب" : "حضور كامل";
      values.push(dropout, status);
    }
    if(!result.has(key) || Date.parse(result.get(key)[8]) <= isoTime) result.set(key, values);
  }
  return result;
}

async function acquire(id) {
  if(!sql) throw error("attendance_google_unavailable");
  if(!leaseSchema){
    leaseSchema = sql`
      CREATE TABLE IF NOT EXISTS ghiyab_sheet_write_locks (
        spreadsheet_id TEXT PRIMARY KEY, lease TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
      );`.catch(failure => {leaseSchema = undefined; throw failure;});
  }
  await leaseSchema;
  const lease = randomUUID();
  const rows = await sql`
    INSERT INTO ghiyab_sheet_write_locks (spreadsheet_id, lease, expires_at)
    VALUES (${id}, ${lease}, NOW() + INTERVAL '40 seconds')
    ON CONFLICT (spreadsheet_id) DO UPDATE SET lease = EXCLUDED.lease, expires_at = EXCLUDED.expires_at
    WHERE ghiyab_sheet_write_locks.expires_at < NOW()
    RETURNING lease;`;
  if(!rows.length) throw error("attendance_sheet_busy");
  return lease;
}

export async function saveGoogleAttendance(id, entries, {workspace = ""} = {}) {
  const rows = attendanceRows(entries, workspace);
  const title = workspace ? portalTabTitle : tabTitle;
  const header = workspace ? portalColumns : columns;
  const lastColumn = workspace ? "L" : "J";
  const lease = await acquire(id);
  const signal = AbortSignal.timeout(22000);
  try{
    const sheet = await logTab(id, title, header, signal);
    const prefix = quoteTab(title) + "!";
    const query = new URLSearchParams();
    for(const range of ["A1:" + lastColumn + "1", "A:A", "I:I"]) query.append("ranges", prefix + range);
    const current = (await google(id, "/values:batchGet?" + query, {signal})).valueRanges || [];
    if(JSON.stringify(current[0]?.values?.[0]) !== JSON.stringify(header)) throw error("attendance_tab_conflict");
    const keys = current[1]?.values || [], dates = current[2]?.values || [];
    const occupied = new Map();
    for(let index = 1; index < keys.length; index++){
      const key = keys[index][0];
      if(!key) continue;
      if(occupied.has(key)) throw error("attendance_tab_conflict");
      occupied.set(key, index + 1);
    }
    let lastRow = Math.max(1, keys.length, dates.length);
    const data = [];
    for(const [key, values] of rows){
      const previous = occupied.get(key);
      const number = previous || ++lastRow;
      if(previous && Date.parse(dates[previous - 1]?.[0]) > Date.parse(values[8])) continue;
      data.push({range:prefix + "A" + number + ":" + lastColumn + number, values:[values]});
    }
    if(data.length){
      const gridRows = Number(sheet.gridProperties?.rowCount || 1000);
      if(lastRow > gridRows) await google(id, ":batchUpdate", {signal, method:"POST", body:{requests:[
        {appendDimension:{sheetId:sheet.sheetId, dimension:"ROWS", length:lastRow - gridRows}}
      ]}});
      await google(id, "/values:batchUpdate", {signal, method:"POST", body:{valueInputOption:"RAW", data}});
    }
    return {enabled:true, saved:data.length, url:"https://docs.google.com/spreadsheets/d/" + id + "/edit#gid=" + sheet.sheetId};
  }finally{
    try{ await sql`DELETE FROM ghiyab_sheet_write_locks WHERE spreadsheet_id = ${id} AND lease = ${lease};`; }
    catch{ /* An interrupted lease expires automatically. */ }
  }
}
