import { createHash, randomBytes, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { isTeacherSessionOrigin, readTeacherSession } from "../enjazy/server_api/_lib/teacher-session.js";
import { readPreparationSubscription } from "./subscriptions.js";
import { googleExportUrl, linkedSpreadsheet, saveGoogleAttendance } from "./_lib/ghiyab-attendance-google.js";

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const idPattern = /^[^\u0000-\u001f\u007f/]{1,200}$/;
const uuidPattern = /^[a-f0-9-]{36}$/;
const schoolLinkId = "@all-classes";
const maxRequestBytes = 3 * 1024 * 1024;
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const label = (value, size = 160) => typeof value === "string" ? value.trim().slice(0, size) : "";
const hash = value => createHash("sha256").update(value).digest("hex");
const validId = value => typeof value === "string" && idPattern.test(value);

function dateIsValid(value) {
  if(typeof value !== "string" || !/^20\d\d-\d\d-\d\d$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseClass(entry) {
  if(!isObject(entry) || !validId(entry.id) || entry.id === schoolLinkId ||
    !Array.isArray(entry.students) || entry.students.length > 250) return null;
  const className = label(entry.className), grade = label(entry.grade) || className;
  if(!className) return null;
  const seen = new Set();
  const students = [];
  for(const student of entry.students){
    if(!isObject(student) || !validId(student.id) || seen.has(student.id) || !label(student.name)) return null;
    seen.add(student.id);
    students.push({id: student.id, name: label(student.name)});
  }
  return {id: entry.id, className, grade, section: label(entry.section), students};
}

function parseRoster(body) {
  const roster = body.roster;
  if(!isObject(roster) || !Number.isInteger(roster.periods) || roster.periods < 0 || roster.periods > 12) return null;
  const school = label(roster.school);
  if(!school) return null;
  const periods = roster.periods;
  if(body.classId !== schoolLinkId){
    const entry = parseClass({...roster, id: body.classId});
    return entry?.students.length ? {...entry, school, periods} : null;
  }
  if(!Array.isArray(roster.classes) || roster.classes.length < 1 || roster.classes.length > 300 ||
    !Array.isArray(roster.teachers) || roster.teachers.length < 1 || roster.teachers.length > 400) return null;
  const classes = roster.classes.map(parseClass);
  if(classes.some(entry => !entry) || new Set(classes.map(entry => entry.id)).size !== classes.length ||
    !classes.some(entry => entry.students.length)) return null;
  const teachers = roster.teachers.map(name => label(name, 100));
  if(teachers.some(name => name.length < 3) || new Set(teachers).size !== teachers.length) return null;
  return {school, periods, classes, teachers};
}

function selectionAt(items, key) {
  return Number.isInteger(key) && key >= 0 && key < items.length ? items[key] : null;
}

function validPeriod(period, periodCount) {
  return Number.isInteger(period) && (periodCount ? period >= 1 && period <= periodCount : period === 0);
}

function makeRecord(body, invite, selected, teacher) {
  const roster = invite.roster;
  const period = body.period;
  if(!teacher || teacher.length < 3 || !validPeriod(period, roster.periods) ||
    !selected.students.length || !Array.isArray(body.marks) || body.marks.length > selected.students.length) return null;

  const used = new Set();
  const categories = {a: [], e: [], l: []};
  for(const mark of body.marks){
    if(!isObject(mark) || !Number.isInteger(mark.key) || mark.key < 0 || mark.key >= selected.students.length ||
      used.has(mark.key) || !Object.hasOwn(categories, mark.status)) return null;
    used.add(mark.key);
    const student = selected.students[mark.key];
    categories[mark.status].push({id: student.id, n: student.name});
  }
  return {
    date: invite.date, classId: selected.id, className: selected.className, grade: selected.grade,
    periods: {[period]: {teacher, absent: categories.a, excused: categories.e, late: categories.l, total: selected.students.length}}
  };
}

function requestBody(req) {
  const body = req.body;
  if(Number(req.headers?.["content-length"]) > maxRequestBytes || body == null) return null;
  try {
    const raw = Buffer.isBuffer(body) || typeof body === "string" ? String(body) : JSON.stringify(body);
    if(Buffer.byteLength(raw) > maxRequestBytes) return null;
    const decoded = JSON.parse(raw);
    return isObject(decoded) ? decoded : null;
  } catch { return null; }
}

export function createTeacherLinkHandler(sql, readSession = readTeacherSession, readSubscription = readPreparationSubscription) {
  let schema;
  function ensureSchema() {
    if(!sql) throw Error("Database unavailable");
    if(!schema){
      schema = (async () => {
        await sql`
          CREATE TABLE IF NOT EXISTS ghiyab_teacher_links (
            owner_id TEXT NOT NULL REFERENCES teacher_users(id) ON DELETE CASCADE,
            workspace_id TEXT NOT NULL,
            class_id TEXT NOT NULL,
            attendance_date DATE NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            roster JSONB NOT NULL,
            PRIMARY KEY (owner_id, workspace_id, class_id, attendance_date)
          );`;
        await sql`
          CREATE TABLE IF NOT EXISTS ghiyab_teacher_receipts (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL REFERENCES teacher_users(id) ON DELETE CASCADE,
            workspace_id TEXT NOT NULL,
            class_id TEXT NOT NULL,
            attendance_date DATE NOT NULL,
            period SMALLINT NOT NULL,
            record JSONB,
            google_sheet_id TEXT, google_synced_at TIMESTAMPTZ,
            submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (owner_id, workspace_id, class_id, attendance_date, period)
          );`;
        await sql`
          ALTER TABLE ghiyab_teacher_receipts
            ADD COLUMN IF NOT EXISTS google_sheet_id TEXT,
            ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;`;
      })().catch(error => { schema = undefined; throw error; });
    }
    return schema;
  }

  async function resolveInvite(token) {
    if(typeof token !== "string" || !tokenPattern.test(token)) return null;
    await ensureSchema();
    const tokenHash = hash(token);
    const [match] = await sql`
      SELECT owner_id, workspace_id, class_id, attendance_date::text AS date, roster
      FROM ghiyab_teacher_links WHERE token_hash = ${tokenHash} AND expires_at > NOW();`;
    if(!match) return null;
    const access = await readSubscription(match.owner_id);
    if(access?.status === 401 || access?.status === 403) return null;
    if(access?.status !== 200) throw Error("Subscription unavailable");
    return {...match, tokenHash};
  }

  function currentSheetId(ownerId, id) {
    if(typeof id !== "string" || !/^[A-Za-z0-9_-]{2,160}$/.test(id)) return null;
    return linkedSpreadsheet(ownerId, new URL("https://docs.google.com/spreadsheets/d/" + id + "/export"));
  }

  async function syncReceipts(ownerId, workspace, receipts) {
    if(!receipts.length) return "not_linked";
    if(receipts.every(receipt => receipt.sheetSaved)) return "saved";
    const waiting = receipts.filter(receipt => receipt.sheetId && !receipt.sheetSaved);
    const eligible = waiting.filter(receipt => receipt.record && currentSheetId(ownerId, receipt.sheetId));
    if(!eligible.length) return waiting.length ? "pending" : "not_linked";
    const target = eligible[0].sheetId;
    const entries = eligible.map(({period, record, submittedAt}) => {
      const data = record.periods[period];
      return {
        date:record.date, classId:record.classId, className:record.className, period:Number(period),
        teacher:data.teacher, at:new Date(submittedAt).toISOString(), total:data.total,
        absent:data.absent.map(student => student.n),
        excused:data.excused.map(student => student.n),
        late:data.late.map(student => student.n)
      };
    });

    for(const delay of [0, 500, 1000, 1500]){
      if(delay) await new Promise(resolve => setTimeout(resolve, delay));
      try{
        await saveGoogleAttendance(target, entries);
      }catch(failure){
        if(failure?.code === "attendance_sheet_busy") continue;
        return "pending";
      }
      try{
        const ids = eligible.map(receipt => receipt.id);
        await sql`UPDATE ghiyab_teacher_receipts SET google_synced_at = NOW()
          WHERE owner_id = ${ownerId} AND workspace_id = ${workspace}
          AND google_sheet_id = ${target} AND id = ANY(${ids}::text[]);`;
      }catch{
        // Google accepted the write. The next attempt can update the same rows.
      }
      return eligible.length === waiting.length ? "saved" : "pending";
    }
    return "pending";
  }

  async function handleTeacher(body, res, fail) {
    const invite = await resolveInvite(body.token);
    if(!invite) return fail(404, "link_unavailable");
    const roster = invite.roster;
    const schoolLink = Array.isArray(roster.classes);
    const {school, periods} = roster;
    if(schoolLink && body.action === "view"){
      return res.status(200).json({
        school, date: invite.date, periods, teachers: roster.teachers,
        classes: roster.classes.map(({className, grade, section}, key) => ({className, grade, section, key}))
      });
    }

    const selected = schoolLink ? selectionAt(roster.classes, body.classKey) : {...roster, id: invite.class_id};
    const teacher = schoolLink ? selectionAt(roster.teachers, body.teacherKey) : label(body.teacher, 100);
    if(!selected || (schoolLink && !teacher)) return fail(400, "invalid_selection");
    if(body.action === "view" || body.action === "roster"){
      const captured = await sql`
        SELECT period, google_sheet_id AS "sheetId", google_synced_at IS NOT NULL AS "sheetSaved",
          record #>> ARRAY['periods', period::text, 'teacher'] AS teacher
        FROM ghiyab_teacher_receipts WHERE owner_id = ${invite.owner_id}
        AND workspace_id = ${invite.workspace_id}
        AND class_id = ${selected.id} AND attendance_date = ${invite.date}::date;`;
      return res.status(200).json({
        school, className: selected.className, date: invite.date, periods,
        students: selected.students.map(({name}, key) => ({name, key})),
        captured: captured.map(row => Number(row.period)),
        savedSheets: captured.filter(row => row.sheetSaved).map(row => Number(row.period)),
        pendingSheets: captured.filter(row => row.sheetId &&
          row.sheetId === roster.attendanceSheetId && !row.sheetSaved && row.teacher === teacher).map(row => Number(row.period))
      });
    }

    if(body.action === "sync_sheet"){
      if(!teacher || teacher.length < 3 || !validPeriod(body.period, periods)) return fail(400, "invalid_attendance");
      const [receipt] = await sql`
        SELECT id, period, record, submitted_at AS "submittedAt", google_sheet_id AS "sheetId",
          google_synced_at IS NOT NULL AS "sheetSaved"
        FROM ghiyab_teacher_receipts WHERE owner_id = ${invite.owner_id}
        AND workspace_id = ${invite.workspace_id} AND class_id = ${selected.id}
        AND attendance_date = ${invite.date}::date AND period = ${body.period};`;
      if(!receipt?.sheetId || receipt.sheetId !== roster.attendanceSheetId) return fail(409, "sheet_receipt_unavailable");
      if(receipt.sheetSaved) return res.status(200).json({saved:true, sheetStatus:"saved"});
      if(receipt.record?.periods?.[body.period]?.teacher !== teacher) return fail(409, "sheet_receipt_unavailable");
      const sheetStatus = await syncReceipts(invite.owner_id, invite.workspace_id, [receipt]);
      return res.status(200).json({saved:true, sheetStatus});
    }

    const record = makeRecord(body, invite, selected, teacher);
    if(!record) return fail(400, "invalid_attendance");
    const sheetId = roster.attendanceSheetId || null;
    const [written] = await sql`
      WITH eligible AS (
        SELECT owner_id, workspace_id, attendance_date FROM ghiyab_teacher_links
        WHERE token_hash = ${invite.tokenHash} AND expires_at > NOW()
        FOR UPDATE
      ), receipt AS (
        INSERT INTO ghiyab_teacher_receipts (id, owner_id, workspace_id, class_id, attendance_date, period, record, google_sheet_id)
        SELECT ${randomUUID()}, owner_id, workspace_id, ${selected.id}, attendance_date, ${body.period}, ${JSON.stringify(record)}::jsonb, ${sheetId} FROM eligible
        ON CONFLICT (owner_id, workspace_id, class_id, attendance_date, period) DO NOTHING
        RETURNING id, submitted_at
      )
      SELECT EXISTS (SELECT 1 FROM eligible) AS active,
        (SELECT id FROM receipt) AS id, (SELECT submitted_at FROM receipt) AS "submittedAt";`;
    if(!written?.active) return fail(404, "link_unavailable");
    if(!written.id) return fail(409, "already_submitted");
    const sheetStatus = await syncReceipts(invite.owner_id, invite.workspace_id, [{
      id:written.id, period:body.period, record, submittedAt:written.submittedAt, sheetId
    }]);
    return res.status(200).json({saved:true, sheetStatus});
  }

  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const fail = (status, error) => res.status(status).json({error});
    if(req.method !== "POST"){
      res.setHeader("Allow", "POST");
      return fail(405, "method_not_allowed");
    }
    if(!isTeacherSessionOrigin(req)) return fail(403, "origin_not_allowed");
    if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"] || ""))) return fail(415, "invalid_request");
    const body = requestBody(req);
    if(!body) return fail(400, "invalid_request");
    try {
      if(["view", "roster", "submit", "sync_sheet"].includes(body.action)) return await handleTeacher(body, res, fail);
      if(!["create", "links", "revoke", "pending", "ack"].includes(body.action)) return fail(400, "invalid_request");
      const session = await readSession(req, res);
      if(!session) return fail(401, "sign_in_required");
      const access = await readSubscription(session.userId);
      if(access?.status !== 200) return fail([401, 403].includes(access?.status) ? access.status : 503, access?.error || "service_unavailable");
      const ownerId = session.userId;
      if(!validId(body.workspace)) return fail(400, "invalid_request");
      const workspace = body.workspace;
      await ensureSchema();
      if(body.action === "pending"){
        const receipts = await sql`
          SELECT id, period, record, submitted_at AS "submittedAt",
            google_sheet_id IS NOT NULL AS "directSheet" FROM ghiyab_teacher_receipts
          WHERE owner_id = ${ownerId} AND workspace_id = ${workspace} AND record IS NOT NULL
          ORDER BY (google_sheet_id IS NOT NULL AND google_synced_at IS NULL), submitted_at, id LIMIT 10;`;
        return res.status(200).json({receipts});
      }
      if(body.action === "ack"){
        if(!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 30 ||
          body.ids.some(id => typeof id !== "string" || !uuidPattern.test(id))) return fail(400, "invalid_request");
        const pending = await sql`
          SELECT id, period, record, submitted_at AS "submittedAt", google_sheet_id AS "sheetId"
          FROM ghiyab_teacher_receipts WHERE owner_id = ${ownerId} AND workspace_id = ${workspace}
          AND id = ANY(${body.ids}::text[]) AND record IS NOT NULL AND google_sheet_id IS NOT NULL
          AND google_synced_at IS NULL ORDER BY submitted_at LIMIT 10;`;
        const sheetStatus = await syncReceipts(ownerId, workspace, pending);
        await sql`
          UPDATE ghiyab_teacher_receipts SET record = NULL
          WHERE owner_id = ${ownerId} AND workspace_id = ${workspace} AND id = ANY(${body.ids}::text[])
          AND (google_sheet_id IS NULL OR google_synced_at IS NOT NULL);`;
        return res.status(200).json({ok:true, sheetStatus});
      }
      if(body.action === "links"){
        if(!dateIsValid(body.date)) return fail(400, "invalid_request");
        const links = await sql`
          SELECT class_id AS id, CASE WHEN class_id = ${schoolLinkId}
            THEN 'جميع الصفوف والشُّعب' ELSE roster->>'className' END AS name
          FROM ghiyab_teacher_links
          WHERE owner_id = ${ownerId} AND workspace_id = ${workspace}
          AND attendance_date = ${body.date}::date AND expires_at > NOW()
          ORDER BY name;`;
        return res.status(200).json({links});
      }
      if(!validId(body.classId) || !dateIsValid(body.date)) return fail(400, "invalid_request");
      if(body.action === "revoke"){
        await sql`
          DELETE FROM ghiyab_teacher_links WHERE owner_id = ${ownerId} AND workspace_id = ${workspace}
          AND class_id = ${body.classId} AND attendance_date = ${body.date}::date;`;
        return res.status(200).json({revoked: true});
      }
      const roster = parseRoster(body);
      if(!roster) return fail(400, "invalid_roster");
      const target = linkedSpreadsheet(ownerId, googleExportUrl(body.sheetUrl));
      if(target) roster.attendanceSheetId = target;
      const token = randomBytes(32).toString("base64url");
      const [saved] = await sql`
        WITH expired AS (
          DELETE FROM ghiyab_teacher_links WHERE owner_id = ${ownerId} AND expires_at <= NOW()
          AND (workspace_id <> ${workspace} OR class_id <> ${body.classId} OR attendance_date <> ${body.date}::date)
        )
        INSERT INTO ghiyab_teacher_links (owner_id, workspace_id, class_id, attendance_date, token_hash, expires_at, roster)
        VALUES (${ownerId}, ${workspace}, ${body.classId}, ${body.date}::date, ${hash(token)}, NOW() + INTERVAL '24 hours', ${JSON.stringify(roster)}::jsonb)
        ON CONFLICT (owner_id, workspace_id, class_id, attendance_date) DO UPDATE
        SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, roster = EXCLUDED.roster
        RETURNING expires_at AS "expiresAt";`;
      return res.status(200).json({token, expiresAt:saved.expiresAt, directSheet:!!target && !!process.env.GHIYAB_SHEETS_SERVICE_ACCOUNT});
    } catch {
      return fail(503, "service_unavailable");
    }
  };
}

export default createTeacherLinkHandler(databaseUrl.trim() ? neon(databaseUrl.trim()) : null);
