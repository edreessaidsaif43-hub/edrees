import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { requireAdmin } from "../enjazy/server_api/_lib/admin-auth.js";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";
const MAX_RECEIPT_SIZE = 12 * 1024 * 1024;
const PAYMENT_NUMBER = "91470590";
const ADMIN_LIST_DEFAULT_LIMIT = 25;
const ADMIN_LIST_MAX_LIMIT = 50;
const RUN_SCHEMA_MIGRATIONS = process.env.RUN_SUBSCRIPTION_SCHEMA_MIGRATIONS === "1";

function sqlClient() {
  if (!DATABASE_URL) return null;
  try { return neon(DATABASE_URL); } catch { return null; }
}

const sql = sqlClient();
let schemaPromise = null;

function send(res, status, payload) { res.status(status).json(payload); }
function fail(res, status, message, error = "request_failed") { send(res, status, { error, message }); }
function boundedInt(value, fallback, min, max) {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

async function ensureSchema() {
  if (!sql) return false;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS teacher_subscriptions (
          id BIGSERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          grade TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending',
          receipt_url TEXT NOT NULL DEFAULT '',
          receipt_file_name TEXT NOT NULL DEFAULT '',
          receipt_file_type TEXT NOT NULL DEFAULT '',
          receipt_history JSONB NOT NULL DEFAULT '[]'::jsonb,
          admin_note TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await sql`
        ALTER TABLE teacher_subscriptions
        ADD COLUMN IF NOT EXISTS grades JSONB NOT NULL DEFAULT '[]'::jsonb;
      `;
      await sql`
        ALTER TABLE teacher_subscriptions
        ADD COLUMN IF NOT EXISTS subjects JSONB NOT NULL DEFAULT '[]'::jsonb;
      `;
      await sql`
        ALTER TABLE teacher_subscriptions
        ADD COLUMN IF NOT EXISTS receipt_history JSONB NOT NULL DEFAULT '[]'::jsonb;
      `;
      if (RUN_SCHEMA_MIGRATIONS) {
        await sql`
          UPDATE teacher_subscriptions
          SET grades = jsonb_build_array(grade)
          WHERE (grades IS NULL OR grades = '[]'::jsonb)
            AND COALESCE(grade, '') <> '';
        `;
        await sql`
          UPDATE teacher_subscriptions
          SET receipt_history = jsonb_build_array(jsonb_build_object(
            'grade', grade,
            'grades', grades,
            'receiptUrl', receipt_url,
            'receiptFileName', receipt_file_name,
            'receiptFileType', receipt_file_type,
            'status', status,
            'createdAt', updated_at
          ))
          WHERE (receipt_history IS NULL OR receipt_history = '[]'::jsonb)
            AND COALESCE(receipt_url, '') <> '';
        `;
      }
      await sql`
        CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_user_status
        ON teacher_subscriptions (user_id, status, updated_at DESC);
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_updated_at
        ON teacher_subscriptions (updated_at DESC, id DESC);
      `;
      if (RUN_SCHEMA_MIGRATIONS) {
        await sql`
          WITH flattened_subscription_grades AS (
            SELECT user_id, jsonb_array_elements_text(COALESCE(grades, '[]'::jsonb)) AS grade_name
            FROM teacher_subscriptions
            UNION ALL
            SELECT user_id, grade AS grade_name
            FROM teacher_subscriptions
            WHERE COALESCE(grade, '') <> ''
          ), merged_subscription_grades AS (
            SELECT
              user_id,
              jsonb_agg(DISTINCT grade_name) FILTER (WHERE COALESCE(grade_name, '') <> '') AS grades,
              string_agg(DISTINCT grade_name, '، ') FILTER (WHERE COALESCE(grade_name, '') <> '') AS grade_text
            FROM flattened_subscription_grades
            GROUP BY user_id
          ), keepers AS (
            SELECT user_id, MAX(id) AS keep_id
            FROM teacher_subscriptions
            GROUP BY user_id
          )
          UPDATE teacher_subscriptions target
          SET
            grades = COALESCE(merged_subscription_grades.grades, '[]'::jsonb),
            grade = COALESCE(merged_subscription_grades.grade_text, target.grade)
          FROM merged_subscription_grades, keepers
          WHERE target.id = keepers.keep_id
            AND keepers.user_id = merged_subscription_grades.user_id;
        `;
        await sql`
          DELETE FROM teacher_subscriptions a
          USING teacher_subscriptions b
          WHERE a.user_id = b.user_id
            AND a.id < b.id;
        `;
      }
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_teacher_subscriptions_user_id
        ON teacher_subscriptions (user_id);
      `;
    })();
  }
  await schemaPromise;
  return true;
}

async function dbReady(res, ensure = true) {
  if (!sql) {
    fail(res, 500, "قاعدة البيانات غير مفعلة. أضف DATABASE_URL أو POSTGRES_URL في Vercel.", "db_not_configured");
    return false;
  }
  if (ensure) await ensureSchema();
  return true;
}

async function readBodyBuffer(req, maxBytes = MAX_RECEIPT_SIZE + 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error("حجم الإيصال أكبر من الحد المسموح.");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const buf = await readBodyBuffer(req, 2 * 1024 * 1024);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString("utf8")); } catch { return {}; }
}

function safeFileName(name) {
  return String(name || "receipt.bin").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim().slice(0, 160) || "receipt.bin";
}

function parseContentDisposition(value = "") {
  const out = {};
  String(value).split(";").forEach((part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    const key = String(rawKey || "").trim().toLowerCase();
    if (!key || !rest.length) return;
    out[key] = rest.join("=").trim().replace(/^"|"$/g, "");
  });
  return out;
}

function parseMultipart(buffer, contentType = "") {
  const match = String(contentType).match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
  const boundary = match && (match[1] || match[2]);
  if (!boundary) return { fields: {}, files: {} };
  const raw = buffer.toString("latin1");
  const parts = raw.split("--" + boundary);
  const fields = {};
  const files = {};
  for (const part of parts) {
    if (!part || part === "--\r\n" || part === "--") continue;
    const cleaned = part.replace(/^\r\n/, "").replace(/\r\n--$/, "");
    const splitAt = cleaned.indexOf("\r\n\r\n");
    if (splitAt < 0) continue;
    const headerText = cleaned.slice(0, splitAt);
    let bodyText = cleaned.slice(splitAt + 4);
    if (bodyText.endsWith("\r\n")) bodyText = bodyText.slice(0, -2);
    const headers = {};
    headerText.split("\r\n").forEach((line) => {
      const i = line.indexOf(":");
      if (i > -1) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    });
    const disposition = parseContentDisposition(headers["content-disposition"] || "");
    const name = disposition.name;
    if (!name) continue;
    if (disposition.filename) {
      files[name] = {
        fileName: safeFileName(disposition.filename),
        contentType: headers["content-type"] || "application/octet-stream",
        buffer: Buffer.from(bodyText, "latin1"),
      };
    } else {
      fields[name] = Buffer.from(bodyText, "latin1").toString("utf8").trim();
    }
  }
  return { fields, files };
}

function splitGradeValues(value) {
  if (Array.isArray(value)) return value.flatMap(splitGradeValues);
  const text = String(value || '').trim();
  if (!text) return [];
  const normalized = normalizeGradeKey(text);
  const found = [];
  gradeDefinitions().forEach((item) => {
    item.aliases.forEach((alias) => {
      const pattern = alias.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
      const matches = normalized.match(new RegExp('(^|\\s)' + pattern + '(?=\\s|$)', 'g'));
      if (matches) matches.forEach(() => found.push(item.display));
    });
  });
  if (found.length) return found.map((grade) => 'الصف ' + grade);
  return text.split(/[،,]/).map((part) => part.trim()).filter(Boolean);
}

function gradeDefinitions() {
  return [
    { key: 'الحادي عشر', display: 'الحادي عشر', aliases: ['الحادي عشر', '11', '١١'] },
    { key: 'الثاني عشر', display: 'الثاني عشر', aliases: ['الثاني عشر', '12', '١٢'] },
    { key: 'الاول', display: 'الأول', aliases: ['الاول', '1', '١'] },
    { key: 'الثاني', display: 'الثاني', aliases: ['الثاني', '2', '٢'] },
    { key: 'الثالث', display: 'الثالث', aliases: ['الثالث', '3', '٣'] },
    { key: 'الرابع', display: 'الرابع', aliases: ['الرابع', '4', '٤'] },
    { key: 'الخامس', display: 'الخامس', aliases: ['الخامس', '5', '٥'] },
    { key: 'السادس', display: 'السادس', aliases: ['السادس', '6', '٦'] },
    { key: 'السابع', display: 'السابع', aliases: ['السابع', '7', '٧'] },
    { key: 'الثامن', display: 'الثامن', aliases: ['الثامن', '8', '٨'] },
    { key: 'التاسع', display: 'التاسع', aliases: ['التاسع', '9', '٩'] },
    { key: 'العاشر', display: 'العاشر', aliases: ['العاشر', '10', '١٠'] }
  ];
}

function normalizeGradeKey(value) {
  return String(value || '')
    .replace(/\bgrade\b/gi, '')
    .replace(/الصف/g, '')
    .replace(/صف/g, '')
    .replace(/أ/g, 'ا')
    .replace(/إ/g, 'ا')
    .replace(/آ/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[،,؛;|/\\_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalGradeName(value) {
  const key = normalizeGradeKey(value);
  const found = gradeDefinitions().find((item) => item.key === key || item.aliases.includes(key));
  return found ? `الصف ${found.display}` : String(value || '').trim();
}

function uniqueCanonicalGrades(values) {
  const seen = new Set();
  const out = [];
  splitGradeValues(values).forEach((value) => {
    const grade = canonicalGradeName(value);
    const key = normalizeGradeKey(grade);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(grade);
  });
  return out;
}

function subscriptionGrades(row) {
  const values = Array.isArray(row?.grades) ? row.grades : [];
  return uniqueCanonicalGrades([values, row?.grade || '']);
}

function joinGrades(grades) {
  return uniqueCanonicalGrades(grades || []).join('، ');
}

function parseRequestedGrades(fields = {}) {
  const rawGrades = String(fields.grades || '').trim();
  let values = [];
  if (rawGrades) {
    try {
      const parsed = JSON.parse(rawGrades);
      if (Array.isArray(parsed)) values = parsed;
    } catch {
      values = splitGradeValues(rawGrades);
    }
  }
  if (!values.length && fields.grade) values = splitGradeValues(fields.grade);
  return uniqueCanonicalGrades(values);
}

function normalizeSubjectName(value) {
  return String(value || '')
    .replace(/أ/g, 'ا')
    .replace(/إ/g, 'ا')
    .replace(/آ/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

function subjectKey(item) {
  return normalizeGradeKey(item?.grade || '') + '::' + normalizeSubjectName(item?.subject || '');
}

function subscriptionExpiryDate(now = new Date()) {
  const year = now.getMonth() > 5 || (now.getMonth() === 5 && now.getDate() > 10)
    ? now.getFullYear() + 1
    : now.getFullYear();
  return String(year).padStart(4, '0') + '-06-10';
}

function isSubjectEntryActive(item, now = new Date()) {
  if (!item?.subject) return false;
  if (item.status && item.status !== 'active') return false;
  const expiresAt = String(item.expiresAt || item.expires_at || '').slice(0, 10);
  if (!expiresAt) return true;
  const end = new Date(expiresAt + 'T23:59:59');
  return !Number.isFinite(end.getTime()) || end >= now;
}

function uniqueSubscriptionSubjects(values) {
  const out = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach((item) => {
    const grade = canonicalGradeName(item?.grade || '');
    const subject = String(item?.subject || '').trim();
    if (!grade || !subject) return;
    const next = {
      grade,
      subject,
      expiresAt: item.expiresAt || item.expires_at || '',
      status: item.status || 'active',
      product: item.product || '',
      createdAt: item.createdAt || item.created_at || new Date().toISOString(),
    };
    const key = subjectKey(next);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(next);
  });
  return out;
}

function subscriptionSubjects(row) {
  return uniqueSubscriptionSubjects(Array.isArray(row?.subjects) ? row.subjects : []);
}

function subscriptionAmountOmr(fields = {}, subjects = [], grades = []) {
  if (String(fields.product || "") === "motivation") return 2;
  return subjects.length || grades.length || 1;
}

function subscriptionInitialStatus(fields = {}) {
  if (String(fields.product || "") === "motivation") return "active";
  return "active";
}

function parseRequestedSubjects(fields = {}) {
  const grade = canonicalGradeName(fields.grade || '');
  let values = [];
  const raw = String(fields.subjects || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      values = Array.isArray(parsed) ? parsed : [];
    } catch {
      values = raw.split(/[،,]/).map((part) => part.trim()).filter(Boolean);
    }
  }
  return uniqueSubscriptionSubjects(values.map((item) => {
    if (item && typeof item === 'object') {
      return { grade: item.grade || grade, subject: item.subject || item.name || '', product: item.product || fields.product || '' };
    }
    return { grade, subject: item, product: fields.product || '' };
  }));
}

function subscriptionHistory(row) {
  return Array.isArray(row?.receipt_history) ? row.receipt_history : [];
}

function isMotivationSubscription(row, subjects = []) {
  const history = subscriptionHistory(row);
  const text = [
    row?.grade,
    ...(Array.isArray(row?.grades) ? row.grades : []),
    ...subjects.flatMap((item) => [item?.product, item?.grade, item?.subject]),
    ...history.flatMap((item) => [item?.product, item?.grade, ...(Array.isArray(item?.grades) ? item.grades : [])])
  ].join(" ");
  return /motivation|تحفيز/i.test(text);
}

function rowToSubscription(row) {
  const grades = subscriptionGrades(row);
  const subjects = subscriptionSubjects(row);
  const motivation = isMotivationSubscription(row, subjects);
  const status = motivation && row.status === "pending" ? "active" : row.status;
  const normalizedSubjects = motivation
    ? subjects.map((item) => item.status === "pending" ? { ...item, status: "active" } : item)
    : subjects;
  return {
    id: row.id,
    userId: row.user_id,
    grade: joinGrades(grades) || row.grade,
    grades,
    subjects: normalizedSubjects,
    status,
    receiptUrl: row.receipt_url,
    receiptFileName: row.receipt_file_name,
    receiptFileType: row.receipt_file_type,
    receiptHistory: subscriptionHistory(row),
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getStatus(req, res) {
  if (!(await dbReady(res))) return;
  const userId = String(req.query?.userId || "").trim();
  if (!userId) return send(res, 200, { activeGrades: [], pending: [], subscriptions: [], paymentNumber: PAYMENT_NUMBER });
  const rows = await sql`
    SELECT
      id,
      user_id,
      grade,
      CASE WHEN pg_column_size(grades) <= 1048576 THEN grades ELSE '[]'::jsonb END AS grades,
      CASE WHEN pg_column_size(subjects) <= 1048576 THEN subjects ELSE '[]'::jsonb END AS subjects,
      status,
      receipt_url,
      receipt_file_name,
      receipt_file_type,
      admin_note,
      created_at,
      updated_at
    FROM teacher_subscriptions
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC, id DESC;
  `;
  const subscriptions = (rows || []).map(rowToSubscription);
  const allSubjects = subscriptions
    .filter((s) => s.status === "active")
    .flatMap((s) => subscriptionSubjects(s));
  const activeSubjects = uniqueSubscriptionSubjects(allSubjects).filter((item) => isSubjectEntryActive(item));
  const activeGrades = uniqueCanonicalGrades([
    ...activeSubjects.map((item) => item.grade),
    ...subscriptions.filter((s) => s.status === "active" && !subscriptionSubjects(s).length).flatMap((s) => subscriptionGrades(s)),
  ]);
  const pending = subscriptions
    .map((s) => ({ ...s, subjects: subscriptionSubjects(s).filter((item) => item.status === "pending") }))
    .filter((s) => s.status === "pending" || s.subjects.length);
  send(res, 200, { activeGrades, activeSubjects, pending, subscriptions, paymentNumber: PAYMENT_NUMBER });
}

async function requestSubscription(req, res) {
  if (!(await dbReady(res))) return;
  const body = await readBodyBuffer(req);
  const { fields, files } = parseMultipart(body, String(req.headers["content-type"] || ""));
  const userId = String(fields.userId || "").trim();
  const requestedSubjects = parseRequestedSubjects(fields);
  const requestedGrades = requestedSubjects.length ? uniqueCanonicalGrades(requestedSubjects.map((item) => item.grade)) : parseRequestedGrades(fields);
  const receipt = files.receipt;
  if (!userId || (!requestedSubjects.length && !requestedGrades.length)) return fail(res, 400, "اختر الصف والمادة وسجل الدخول قبل إرسال طلب الاشتراك.", "invalid_payload");
  if (!receipt || !receipt.buffer?.length) return fail(res, 400, "يرجى رفع صورة الإيصال.", "missing_receipt");
  if (receipt.buffer.length > MAX_RECEIPT_SIZE) return fail(res, 413, "حجم الإيصال أكبر من 12MB.", "file_too_large");
  if (!String(receipt.contentType || "").toLowerCase().startsWith("image/")) {
    return fail(res, 400, "نوع الإيصال غير مدعوم. ارفع صورة فقط، ملفات PDF غير مقبولة.", "invalid_file_type");
  }
  const existingRows = await sql`
    SELECT
      id,
      user_id,
      grade,
      CASE WHEN pg_column_size(grades) <= 1048576 THEN grades ELSE '[]'::jsonb END AS grades,
      CASE WHEN pg_column_size(subjects) <= 1048576 THEN subjects ELSE '[]'::jsonb END AS subjects,
      status,
      receipt_url,
      receipt_file_name,
      receipt_file_type,
      admin_note,
      created_at,
      updated_at
    FROM teacher_subscriptions
    WHERE user_id = ${userId}
    LIMIT 1;
  `;
  const existing = existingRows?.[0] || {};
  const existingGrades = subscriptionGrades(existing);
  const existingSubjects = subscriptionSubjects(existing);
  const reusableExistingSubjects = existingSubjects.filter((item) => isSubjectEntryActive(item));
  const keepLegacyGrades = existing.status === "active" && !existingSubjects.length;
  const activeExistingSubjects = reusableExistingSubjects;
  const activeSubjectKeys = new Set(activeExistingSubjects.map(subjectKey));
  const expiryDate = subscriptionExpiryDate();
  const requestedNewSubjects = requestedSubjects.filter((item) => !activeSubjectKeys.has(subjectKey(item)));
  if (requestedSubjects.length && !requestedNewSubjects.length) return fail(res, 409, "هذه المادة مشتركة مسبقًا ولن تظهر ضمن مواد الاشتراك الجديدة.", "already_subscribed");
  const requestStatus = subscriptionInitialStatus(fields);
  const operationAt = new Date().toISOString();
  const stampedSubjects = requestedNewSubjects.map((item) => ({ ...item, expiresAt: expiryDate, status: requestStatus, createdAt: operationAt }));
  const nextSubjects = uniqueSubscriptionSubjects([...stampedSubjects, ...reusableExistingSubjects]);
  const nextGrades = uniqueCanonicalGrades([keepLegacyGrades ? existingGrades : [], requestedGrades, nextSubjects.map((item) => item.grade)]);
  const gradeText = joinGrades(nextGrades);
  const selectedGradeText = requestedNewSubjects.length ? requestedNewSubjects.map((item) => item.grade + ' - ' + item.subject).join('، ') : joinGrades(requestedGrades);
  const amountOmr = subscriptionAmountOmr(fields, requestedNewSubjects, requestedGrades);
  const blob = await put(`receipts/${userId}/${Date.now()}-${receipt.fileName}`, receipt.buffer, {
    access: "public",
    contentType: receipt.contentType,
    addRandomSuffix: true,
  });
  const nextHistoryEntry = {
    grade: selectedGradeText,
    grades: requestedGrades,
    subjects: stampedSubjects,
    allGrades: nextGrades,
    allSubjects: nextSubjects,
    amountOmr,
    expiresAt: expiryDate,
    receiptUrl: blob.url,
    receiptFileName: receipt.fileName,
    receiptFileType: receipt.contentType,
    status: requestStatus,
    product: fields.product || '',
    operation: 'subscription_request',
    createdAt: operationAt,
  };
  const rows = await sql`
    INSERT INTO teacher_subscriptions (
      user_id, grade, grades, subjects, status, receipt_url, receipt_file_name, receipt_file_type, receipt_history, admin_note, created_at, updated_at
    ) VALUES (
      ${userId}, ${gradeText}, ${JSON.stringify(nextGrades)}::jsonb, ${JSON.stringify(nextSubjects)}::jsonb, ${requestStatus}, ${blob.url}, ${receipt.fileName}, ${receipt.contentType}, ${JSON.stringify([nextHistoryEntry])}::jsonb, '', NOW(), NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      grade = EXCLUDED.grade,
      grades = EXCLUDED.grades,
      subjects = EXCLUDED.subjects,
      status = EXCLUDED.status,
      receipt_url = EXCLUDED.receipt_url,
      receipt_file_name = EXCLUDED.receipt_file_name,
      receipt_file_type = EXCLUDED.receipt_file_type,
      receipt_history = EXCLUDED.receipt_history,
      admin_note = '',
      updated_at = NOW()
    RETURNING
      id,
      user_id,
      grade,
      CASE WHEN pg_column_size(grades) <= 1048576 THEN grades ELSE '[]'::jsonb END AS grades,
      CASE WHEN pg_column_size(subjects) <= 1048576 THEN subjects ELSE '[]'::jsonb END AS subjects,
      status,
      receipt_url,
      receipt_file_name,
      receipt_file_type,
      admin_note,
      created_at,
      updated_at;
  `;
  send(res, 200, { ok: true, subscription: rowToSubscription(rows[0]), amountOmr, message: (requestStatus === "pending" ? "تم إرسال الإيصال للمراجعة. المبلغ المطلوب: " : "تم إرسال الإيصال وتفعيل الاشتراك مباشرة. المبلغ المطلوب: ") + amountOmr + " ريال عماني. ينتهي الاشتراك في " + expiryDate + "." });
}

async function adminList(req, res) {
  if (!(await dbReady(res, false))) return;
  const auth = requireAdmin(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error, message: auth.message });
  const limit = boundedInt(req.query?.limit, ADMIN_LIST_DEFAULT_LIMIT, 1, ADMIN_LIST_MAX_LIMIT);
  const offset = boundedInt(req.query?.offset, 0, 0, 1000000);
  const fetchLimit = limit + 1;
  const rows = await sql`
    SELECT
      s.id,
      s.user_id,
      s.grade,
      s.status,
      s.receipt_url,
      s.receipt_file_name,
      s.receipt_file_type,
      s.admin_note,
      s.created_at,
      s.updated_at,
      jsonb_build_object(
        'name', COALESCE(u.profile->>'name', ''),
        'contact', COALESCE(u.profile->>'contact', '')
      ) AS profile
    FROM teacher_subscriptions s
    LEFT JOIN teacher_users u ON u.id = s.user_id
    ORDER BY s.updated_at DESC, s.id DESC
    LIMIT ${fetchLimit} OFFSET ${offset};
  `;
  const pageRows = (rows || []).slice(0, limit);
  const subscriptions = pageRows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    grade: row.grade,
    grades: row.grade ? [row.grade] : [],
    subjects: [],
    status: row.status,
    receiptUrl: row.receipt_url,
    receiptFileName: row.receipt_file_name,
    receiptFileType: row.receipt_file_type,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    receiptHistory: [],
    receiptHistoryCount: 0,
    profile: row.profile || {},
  }));
  send(res, 200, {
    subscriptions,
    limit,
    offset,
    hasMore: (rows || []).length > limit,
    paymentNumber: PAYMENT_NUMBER,
  });
}

async function adminActiveList(req, res) {
  if (!(await dbReady(res, false))) return;
  const auth = requireAdmin(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error, message: auth.message });
  const limit = boundedInt(req.query?.limit, ADMIN_LIST_DEFAULT_LIMIT, 1, ADMIN_LIST_MAX_LIMIT);
  const offset = boundedInt(req.query?.offset, 0, 0, 1000000);
  const fetchLimit = limit + 1;
  const rows = await sql`
    SELECT
      s.id,
      s.user_id,
      s.grade,
      s.status,
      s.receipt_url,
      s.receipt_file_name,
      s.receipt_file_type,
      s.admin_note,
      s.created_at,
      s.updated_at,
      jsonb_build_object(
        'name', COALESCE(u.profile->>'name', ''),
        'contact', COALESCE(u.profile->>'contact', '')
      ) AS profile
    FROM teacher_subscriptions s
    LEFT JOIN teacher_users u ON u.id = s.user_id
    WHERE s.status = 'active'
    ORDER BY s.updated_at DESC, s.id DESC
    LIMIT ${fetchLimit} OFFSET ${offset};
  `;
  const subscriptions = (rows || []).slice(0, limit).map((row) => ({
    id: row.id,
    userId: row.user_id,
    grade: row.grade,
    grades: row.grade ? [row.grade] : [],
    subjects: [],
    status: row.status,
    receiptUrl: row.receipt_url,
    receiptFileName: row.receipt_file_name,
    receiptFileType: row.receipt_file_type,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    profile: row.profile || {},
  }));
  send(res, 200, {
    subscriptions,
    limit,
    offset,
    hasMore: (rows || []).length > limit,
    paymentNumber: PAYMENT_NUMBER,
  });
}

async function adminUpdate(req, res) {
  if (!(await dbReady(res, false))) return;
  const auth = requireAdmin(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error, message: auth.message });
  const body = await readJsonBody(req);
  const id = Number(body.id || 0);
  const status = String(body.status || "").trim();
  const note = String(body.note || "").trim();
  const allowed = new Set(["pending", "active", "rejected", "stopped"]);
  if (!id || !allowed.has(status)) return fail(res, 400, "بيانات تحديث الاشتراك غير صحيحة.", "invalid_payload");
  const existingRows = await sql`
    SELECT
      id,
      CASE WHEN pg_column_size(subjects) <= 1048576 THEN subjects ELSE '[]'::jsonb END AS subjects
    FROM teacher_subscriptions
    WHERE id = ${id}
    LIMIT 1;
  `;
  if (!existingRows?.[0]) return fail(res, 404, "طلب الاشتراك غير موجود.", "not_found");
  const updatedSubjects = subscriptionSubjects(existingRows[0]).map((item) => ({ ...item, status }));
  const rows = await sql`
    UPDATE teacher_subscriptions
    SET status = ${status}, subjects = ${JSON.stringify(updatedSubjects)}::jsonb, admin_note = ${note}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING
      id,
      user_id,
      grade,
      CASE WHEN pg_column_size(grades) <= 1048576 THEN grades ELSE '[]'::jsonb END AS grades,
      CASE WHEN pg_column_size(subjects) <= 1048576 THEN subjects ELSE '[]'::jsonb END AS subjects,
      status,
      receipt_url,
      receipt_file_name,
      receipt_file_type,
      admin_note,
      created_at,
      updated_at;
  `;
  send(res, 200, { ok: true, subscription: rowToSubscription(rows[0]) });
}

export default async function handler(req, res) {
  try {
    const action = String(req.query?.action || "status");
    if (req.method === "GET" && action === "status") return await getStatus(req, res);
    if (req.method === "POST" && action === "request") return await requestSubscription(req, res);
    if (req.method === "GET" && action === "admin_list") return await adminList(req, res);
    if (req.method === "GET" && action === "admin_active_list") return await adminActiveList(req, res);
    if (req.method === "POST" && action === "admin_update") return await adminUpdate(req, res);
    return send(res, 404, { error: "unknown_action" });
  } catch (error) {
    return fail(res, error?.statusCode || 500, String(error?.message || error), "server_error");
  }
}







