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
          admin_note TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_user_status
        ON teacher_subscriptions (user_id, status, updated_at DESC);
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_teacher_subscriptions_updated_at
        ON teacher_subscriptions (updated_at DESC, id DESC);
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
function rowToSubscription(row) {
  return {
    id: row.id,
    userId: row.user_id,
    grade: row.grade,
    status: row.status,
    receiptUrl: row.receipt_url,
    receiptFileName: row.receipt_file_name,
    receiptFileType: row.receipt_file_type,
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
  const activeGrades = [...new Set(subscriptions.filter((s) => s.status === "active").map((s) => s.grade).filter(Boolean))];
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
  const existingActive = await sql`
    SELECT id FROM teacher_subscriptions
    WHERE user_id = ${userId} AND grade = ${grade} AND status = 'active'
    LIMIT 1;
  `;
  if (existingActive?.[0]) return send(res, 200, { ok: true, alreadyActive: true, message: "اشتراك هذا الصف مفعل بالفعل." });
  const blob = await put(`receipts/${userId}/${Date.now()}-${receipt.fileName}`, receipt.buffer, {
    access: "public",
    contentType: receipt.contentType,
    addRandomSuffix: true,
  });
  const rows = await sql`
    INSERT INTO teacher_subscriptions (
      user_id, grade, status, receipt_url, receipt_file_name, receipt_file_type, admin_note, created_at, updated_at
    ) VALUES (
      ${userId}, ${grade}, 'pending', ${blob.url}, ${receipt.fileName}, ${receipt.contentType}, '', NOW(), NOW()
    )
    RETURNING *;
  `;
  send(res, 200, { ok: true, subscription: rowToSubscription(rows[0]), message: "تم إرسال الإيصال وتفعيل الاشتراك مباشرة. ستتم مراجعة الإيصال من الإدارة لاحقًا." });
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


