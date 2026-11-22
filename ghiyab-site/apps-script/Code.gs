/**
 * نظام رصد غياب الطلبة — الخادم على Google Apps Script
 *
 * طريقة التركيب باختصار (التفاصيل في ملف «اقرأني»):
 *  1. افتح ملف Google Sheet ← الإضافات (Extensions) ← Apps Script
 *  2. احذف المحتوى والصق هذا الملف كاملاً ثم احفظ
 *  3. نشر (Deploy) ← نشر جديد ← تطبيق ويب، التنفيذ باسم: أنا، الوصول: أي شخص
 *  4. أضف خاصية SUBSCRIBERS ثم انسخ رابط تطبيق الويب إلى config.js
 *
 * تُحفظ بيانات كل مدرسة في store ضمن مسار مستقل باسم tenants/<tenant>.
 */

// رمز ربط اختياري: إن وضعت قيمة هنا فضع القيمة نفسها في GHIYAB_TOKEN داخل config.js
const TOKEN = "";

const STORE = "store";
const LOG_SHEET = "سجل الغياب";

function doGet() {
  return out_({ ok: true, name: "ghiyab-api", time: new Date().toISOString() });
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (req.op === "activate") {
      if (TOKEN && req.token !== TOKEN) return out_({ ok: false, code: "unauthorized", error: "رمز ربط الخدمة غير صحيح" });
      const activation = subscription_(req.license);
      if (!activation.active) return out_({ ok: false, code: "subscription_required", error: "رمز الاشتراك غير صالح أو منتهي" });
      return out_({ ok: true, data: { active: true, expires: activation.expires, tenant: activation.tenant } });
    }
    const access = subscription_(req.subscriber);
    if (!access.active) return out_({ ok: false, code: "subscription_required", error: "يلزم اشتراك ساري لاستخدام النظام" });
    if (TOKEN && req.token !== TOKEN) return out_({ ok: false, code: "unauthorized", error: "رمز الربط غير صحيح" });
    const write = ["set", "merge", "del", "batch"].indexOf(req.op) >= 0;
    let lock = null;
    if (write) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) return out_({ ok: false, code: "unavailable", error: "الخادم مشغول، أعد المحاولة" });
    }
    try {
      return out_({ ok: true, data: handle_(scopeRequest_(req, access.tenant)) });
    } finally {
      if (lock) lock.releaseLock();
    }
  } catch (err) {
    return out_({ ok: false, code: "server", error: String((err && err.message) || err) });
  }
}

function handle_(q) {
  switch (q.op) {
    case "get": {
      const db = load_();
      return parse_(db.docs[q.path]);
    }
    case "list":
      return list_(load_().docs, q.col, q.filters || []);
    case "multi": {
      const db = load_();
      return (q.queries || []).map(function (x) {
        return x.doc ? parse_(db.docs[x.doc]) : list_(db.docs, x.col, x.filters || []);
      });
    }
    case "set":
    case "merge":
    case "del":
      return batch_([q]);
    case "batch":
      return batch_(q.ops || []);
    case "readSheet":
      return readSheet_(q.url);
  }
  throw new Error("عملية غير معروفة: " + q.op);
}


/**
 * Codes are maintained by the service owner in Script Properties > SUBSCRIBERS.
 * Example JSON: {"SCHOOL-ABC-2027":"2027-12-31","SCHOOL-XYZ":true}
 * A value may be an expiry date (inclusive), true/"active", or {active:true, expires:"YYYY-MM-DD"}.
 */
function subscription_(code) {
  code = String(code || "").trim();
  if (!code) return { active: false, expires: "" };
  const raw = PropertiesService.getScriptProperties().getProperty("SUBSCRIBERS") || "{}";
  let list;
  try { list = JSON.parse(raw); } catch (e) { return { active: false, expires: "", tenant: "" }; }
  const item = list[code];
  if (!item) return { active: false, expires: "", tenant: "" };
  let active = false, expires = "", tenant = code;
  if (item === true || item === "active") active = true;
  else if (typeof item === "string") { expires = item; active = /^\d{4}-\d{2}-\d{2}$/.test(expires) && expires >= Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd"); }
  else if (typeof item === "object") { expires = String(item.expires || ""); tenant = String(item.tenant || code); active = item.active !== false && (!expires || (/^\d{4}-\d{2}-\d{2}$/.test(expires) && expires >= Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd"))); }
  if (!/^[A-Za-z0-9_-]+$/.test(tenant)) active = false;
  return { active: active, expires: expires, tenant: tenant };
}

/** Prefix all database paths with the authorized subscriber tenant. */
function scopeRequest_(req, tenant) {
  const out = JSON.parse(JSON.stringify(req));
  const prefix = "tenants/" + tenant + "/";
  if (out.path) out.path = prefix + out.path;
  if (out.col) out.col = prefix + out.col;
  (out.queries || []).forEach(function (q) {
    if (q.doc) q.doc = prefix + q.doc;
    if (q.col) q.col = prefix + q.col;
  });
  (out.ops || []).forEach(function (o) { if (o.path) o.path = prefix + o.path; });
  return out;
}
/* ---------- التخزين ---------- */
function store_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(STORE);
  if (!sh) {
    sh = ss.insertSheet(STORE);
    sh.getRange(1, 1, 1, 3).setValues([["path", "json", "updated"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function load_() {
  const sh = store_();
  const n = sh.getLastRow() - 1;
  const vals = n > 0 ? sh.getRange(2, 1, n, 2).getValues() : [];
  const idx = {}, docs = {};
  for (let i = 0; i < vals.length; i++) {
    const p = String(vals[i][0] || "");
    if (!p) continue;
    idx[p] = i + 2;
    docs[p] = String(vals[i][1] || "");
  }
  return { sh: sh, idx: idx, docs: docs };
}

function parse_(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function cmp_(a, op, b) {
  switch (op) {
    case "==": return a === b;
    case ">=": return a >= b;
    case "<=": return a <= b;
    case ">": return a > b;
    case "<": return a < b;
  }
  return true;
}

function list_(docs, col, filters) {
  const out = [], pre = col + "/";
  for (const p in docs) {
    if (p.indexOf(pre) !== 0) continue;
    const id = p.slice(pre.length);
    if (id.indexOf("/") >= 0) continue;
    // سجلات الغياب تبدأ بالتاريخ: نصفّي بالتاريخ قبل قراءة المحتوى لتسريع الاستعلام
    if (col === "att") {
      const d = id.slice(0, 10);
      if (!filters.every(function (f) { return f[0] !== "date" || cmp_(d, f[1], f[2]); })) continue;
    }
    const o = parse_(docs[p]);
    if (!o) continue;
    if (!filters.every(function (f) { return cmp_(o[f[0]], f[1], f[2]); })) continue;
    o.id = id;
    out.push(o);
  }
  return out;
}

function merge_(t, s) {
  Object.keys(s).forEach(function (k) {
    const v = s[k];
    if (v && typeof v === "object" && !Array.isArray(v) && t[k] && typeof t[k] === "object" && !Array.isArray(t[k])) merge_(t[k], v);
    else t[k] = v;
  });
  return t;
}

function batch_(ops) {
  const db = load_(), sh = db.sh, now = new Date().toISOString();
  const updates = {};
  ops.forEach(function (o) {
    if (!o.path) return;
    const cur = Object.prototype.hasOwnProperty.call(updates, o.path) ? updates[o.path] : (db.docs[o.path] || null);
    if (o.op === "set") updates[o.path] = JSON.stringify(o.data || {});
    else if (o.op === "merge") updates[o.path] = JSON.stringify(merge_(parse_(cur) || {}, o.data || {}));
    else if (o.op === "del") updates[o.path] = null;
  });

  const appends = [], delPaths = {};
  let delCount = 0;
  for (const p in updates) {
    const v = updates[p], row = db.idx[p];
    if (v === null) { if (row) { delPaths[p] = true; delCount++; } continue; }
    if (v.length > 49000) throw new Error("حجم البيانات أكبر من حد خلية Google Sheets: " + p);
    if (row) sh.getRange(row, 2, 1, 2).setValues([[v, now]]);
    else appends.push([p, v, now]);
  }
  if (appends.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, appends.length, 1).setNumberFormat("@");
    sh.getRange(start, 1, appends.length, 3).setValues(appends);
  }
  if (delCount) {
    const n = sh.getLastRow() - 1;
    const all = sh.getRange(2, 1, n, 3).getValues();
    const keep = all.filter(function (r) { return r[0] && !delPaths[String(r[0])]; });
    sh.getRange(2, 1, n, 3).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, 3).setValues(keep);
  }
  return { count: ops.length };
}

/* ---------- قراءة ملف الطلاب ---------- */
function readSheet_(url) {
  const ss = url ? SpreadsheetApp.openByUrl(url) : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets()
    .filter(function (s) { const n = s.getName(); return n !== STORE && n !== LOG_SHEET && !s.isSheetHidden(); })
    .map(function (s) { return { name: s.getName(), rows: s.getDataRange().getDisplayValues() }; });
}

/* ---------- سجل غياب مقروء داخل الشيت (اختياري) ---------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("نظام الغياب")
    .addItem("تحديث ورقة «سجل الغياب»", "buildAbsenceLog")
    .addToUi();
}

function buildAbsenceLog() {
  const docs = load_().docs;
  const labels = { absent: "غائب", excused: "غائب بعذر", late: "متأخر" };
  const rows = [];
  list_(docs, "att", []).forEach(function (r) {
    Object.keys(r.periods || {}).forEach(function (k) {
      const p = r.periods[k];
      ["absent", "excused", "late"].forEach(function (key) {
        (p[key] || []).forEach(function (s) {
          rows.push([r.date, r.className, k === "0" ? "اليوم" : "الحصة " + k, s.n, labels[key], p.teacher || ""]);
        });
      });
    });
  });
  rows.sort(function (a, b) { return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0; });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(LOG_SHEET) || ss.insertSheet(LOG_SHEET);
  sh.clear();
  sh.setRightToLeft(true);
  sh.getRange(1, 1, 1, 6).setValues([["التاريخ", "الصف", "الحصة", "الطالب", "الحالة", "المعلم"]]).setFontWeight("bold");
  if (rows.length) sh.getRange(2, 1, rows.length, 6).setValues(rows);
  sh.setFrozenRows(1);
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}





