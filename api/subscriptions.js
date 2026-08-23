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

function sqlClient() {
  if (!DATABASE_URL) return null;
  try { return neon(DATABASE_URL); } catch { return null; }
}

const sql = sqlClient();
let schemaPromise = null;

function send(res, status, payload) { res.status(status).json(payload); }
function fail(res, status, message, error = "request_failed") { send(res, status, { error, message }); }

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
        ADD COLUMN IF NOT EXISTS receipt_history JSONB NOT NULL DEFAULT '[]'::jsonb;
      `;
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
      await sql`
        CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_user_status
        ON teacher_subscriptions (user_id, status, updated_at DESC);
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_updated_at
        ON teacher_subscriptions (updated_at DESC, id DESC);
      `;
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
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_teacher_subscriptions_user_id
        ON teacher_subscriptions (user_id);
      `;
    })();
  }
  await schemaPromise;
  return true;
}

async function dbReady(res) {
  if (!sql) {
    fail(res, 500, "قاعدة البيانات غير مفعلة. أضف DATABASE_URL أو POSTGRES_URL في Vercel.", "db_not_configured");
    return false;
  }
  await ensureSchema();
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

function canonicalGradeName(value) {
  const raw = String(value || '').replace(/^الصف\s+/, '').trim();
  const compact = raw.replace(/أ/g, 'ا').replace(/إ/g, 'ا').replace(/آ/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  const names = {
    'الاول': 'الأول',
    'الثاني': 'الثاني',
    'الثالث': 'الثالث',
    'الرابع': 'الرابع',
    'الخامس': 'الخامس',
    'السادس': 'السادس',
    'السابع': 'السابع',
    'الثامن': 'الثامن',
    'التاسع': 'التاسع',
    'العاشر': 'العاشر',
    'الحادي عشر': 'الحادي عشر',
    'الثاني عشر': 'الثاني عشر'
  };
  const name = names[compact] || raw;
  return name ? `الصف ${name}` : '';
}
function subscriptionGrades(row) {
  const values = Array.isArray(row?.grades) ? row.grades : [];
  const list = values.map(canonicalGradeName).filter(Boolean);
  const legacy = canonicalGradeName(row?.grade || '');
  if (legacy) list.push(legacy);
  return [...new Set(list)];
}

function joinGrades(grades) {
  return [...new Set((grades || []).map(canonicalGradeName).filter(Boolean))].join('، ');
}

function subscriptionHistory(row) {
  return Array.isArray(row?.receipt_history) ? row.receipt_history : [];
}
function rowToSubscription(row) {
  const grades = subscriptionGrades(row);
  return {
    id: row.id,
    userId: row.user_id,
    grade: joinGrades(grades) || row.grade,
    grades,
    status: row.status,
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
    SELECT * FROM teacher_subscriptions
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC, id DESC;
  `;
  const subscriptions = (rows || []).map(rowToSubscription);
  const activeGrades = [...new Set(subscriptions.filter((s) => s.status === "active").flatMap((s) => Array.isArray(s.grades) ? s.grades : [s.grade]).filter(Boolean))];
  const pending = subscriptions.filter((s) => s.status === "pending");
  send(res, 200, { activeGrades, pending, subscriptions, paymentNumber: PAYMENT_NUMBER });
}

async function requestSubscription(req, res) {
  if (!(await dbReady(res))) return;
  const body = await readBodyBuffer(req);
  const { fields, files } = parseMultipart(body, String(req.headers["content-type"] || ""));
  const userId = String(fields.userId || "").trim();
  const grade = canonicalGradeName(fields.grade);
  const receipt = files.receipt;
  if (!userId || !grade) return fail(res, 400, "اختر الصف وسجل الدخول قبل إرسال طلب الاشتراك.", "invalid_payload");
  if (!receipt || !receipt.buffer?.length) return fail(res, 400, "يرجى رفع صورة الإيصال أو ملف PDF الإيصال.", "missing_receipt");
  if (receipt.buffer.length > MAX_RECEIPT_SIZE) return fail(res, 413, "حجم الإيصال أكبر من 12MB.", "file_too_large");
  const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
  if (!allowed.includes(String(receipt.contentType || "").toLowerCase())) {
    return fail(res, 400, "نوع الإيصال غير مدعوم. ارفع صورة PNG/JPG/WEBP أو PDF.", "invalid_file_type");
  }
  const existingRows = await sql`
    SELECT * FROM teacher_subscriptions
    WHERE user_id = ${userId}
    LIMIT 1;
  `;
  const existing = existingRows?.[0] || {};
  const existingGrades = subscriptionGrades(existing);
  const existingHistory = subscriptionHistory(existing);
  const nextGrades = [...new Set([...existingGrades, grade])];
  const gradeText = joinGrades(nextGrades);
  const operationAt = new Date().toISOString();
  const blob = await put(`receipts/${userId}/${Date.now()}-${receipt.fileName}`, receipt.buffer, {
    access: "public",
    contentType: receipt.contentType,
    addRandomSuffix: true,
  });
  const nextHistory = [
    {
      grade,
      grades: nextGrades,
      receiptUrl: blob.url,
      receiptFileName: receipt.fileName,
      receiptFileType: receipt.contentType,
      status: 'active',
      operation: 'subscription_request',
      createdAt: operationAt,
    },
    ...existingHistory,
  ].slice(0, 50);
  const rows = await sql`
    INSERT INTO teacher_subscriptions (
      user_id, grade, grades, status, receipt_url, receipt_file_name, receipt_file_type, receipt_history, admin_note, created_at, updated_at
    ) VALUES (
      ${userId}, ${gradeText}, ${JSON.stringify(nextGrades)}::jsonb, 'active', ${blob.url}, ${receipt.fileName}, ${receipt.contentType}, ${JSON.stringify(nextHistory)}::jsonb, '', NOW(), NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      grade = EXCLUDED.grade,
      grades = EXCLUDED.grades,
      status = 'active',
      receipt_url = EXCLUDED.receipt_url,
      receipt_file_name = EXCLUDED.receipt_file_name,
      receipt_file_type = EXCLUDED.receipt_file_type,
      receipt_history = EXCLUDED.receipt_history,
      admin_note = '',
      updated_at = NOW()
    RETURNING *;
  `;
  send(res, 200, { ok: true, subscription: rowToSubscription(rows[0]), message: "تم إرسال الإيصال وتفعيل الاشتراك مباشرة. تم تحديث إيصال المستخدم الحالي مع الاحتفاظ بالصفوف السابقة." });
}

async function adminList(req, res) {
  if (!(await dbReady(res))) return;
  const auth = requireAdmin(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error, message: auth.message });
  const rows = await sql`
    SELECT s.*, u.profile
    FROM teacher_subscriptions s
    LEFT JOIN teacher_users u ON u.id = s.user_id
    ORDER BY s.updated_at DESC, s.id DESC;
  `;
  const subscriptions = (rows || []).map((row) => ({ ...rowToSubscription(row), profile: row.profile || {} }));
  send(res, 200, { subscriptions, paymentNumber: PAYMENT_NUMBER });
}

async function adminUpdate(req, res) {
  if (!(await dbReady(res))) return;
  const auth = requireAdmin(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error, message: auth.message });
  const body = await readJsonBody(req);
  const id = Number(body.id || 0);
  const status = String(body.status || "").trim();
  const note = String(body.note || "").trim();
  const allowed = new Set(["pending", "active", "rejected", "stopped"]);
  if (!id || !allowed.has(status)) return fail(res, 400, "بيانات تحديث الاشتراك غير صحيحة.", "invalid_payload");
  const rows = await sql`
    UPDATE teacher_subscriptions
    SET status = ${status}, admin_note = ${note}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *;
  `;
  if (!rows?.[0]) return fail(res, 404, "طلب الاشتراك غير موجود.", "not_found");
  send(res, 200, { ok: true, subscription: rowToSubscription(rows[0]) });
}

export default async function handler(req, res) {
  try {
    const action = String(req.query?.action || "status");
    if (req.method === "GET" && action === "status") return await getStatus(req, res);
    if (req.method === "POST" && action === "request") return await requestSubscription(req, res);
    if (req.method === "GET" && action === "admin_list") return await adminList(req, res);
    if (req.method === "POST" && action === "admin_update") return await adminUpdate(req, res);
    return send(res, 404, { error: "unknown_action" });
  } catch (error) {
    return fail(res, error?.statusCode || 500, String(error?.message || error), "server_error");
  }
}







