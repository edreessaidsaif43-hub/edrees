import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const MAX_UPLOAD_SIZE = 629145600;
const INLINE_GEMINI_LIMIT = 20 * 1024 * 1024;

const DATABASE_URL =
  process.env.AI_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

function send(res, status, payload) {
  res.status(status).json(payload);
}

function fail(res, status, message, error = "request_failed") {
  send(res, status, { error, message });
}

function sqlClient() {
  if (!DATABASE_URL) return null;
  try {
    return neon(DATABASE_URL);
  } catch {
    return null;
  }
}

const sql = sqlClient();
let schemaPromise = null;

async function ensureSchema() {
  if (!sql) return false;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS ai_attachments (
          id BIGSERIAL PRIMARY KEY,
          title TEXT NOT NULL DEFAULT '',
          file_name TEXT NOT NULL DEFAULT '',
          file_type TEXT NOT NULL DEFAULT '',
          file_size BIGINT NOT NULL DEFAULT 0,
          file_path TEXT NOT NULL DEFAULT '',
          extracted_text TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS ai_lessons (
          id BIGSERIAL PRIMARY KEY,
          grade TEXT NOT NULL DEFAULT '',
          subject TEXT NOT NULL DEFAULT '',
          semester TEXT NOT NULL DEFAULT '',
          unit TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL DEFAULT '',
          attachment_id BIGINT REFERENCES ai_attachments(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at DATE NOT NULL DEFAULT CURRENT_DATE
        );
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_ai_lessons_created_at
        ON ai_lessons (created_at DESC, id DESC);
      `;
    })();
  }
  await schemaPromise;
  return true;
}

async function dbReady(res) {
  if (!sql) {
    fail(
      res,
      500,
      "قاعدة البيانات غير مضافة في Vercel. أضف Neon Postgres ثم اربط متغير DATABASE_URL أو AI_DATABASE_URL.",
      "db_not_configured"
    );
    return false;
  }
  await ensureSchema();
  return true;
}

function safeFileName(name) {
  return String(name || "upload.bin")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim()
    .slice(0, 180) || "upload.bin";
}

function decodeMeta(raw = "") {
  if (!raw) return {};
  try {
    let b64 = String(raw).replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(Buffer.from(b64, "base64").toString("utf8"));
    const data = JSON.parse(json);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

async function readBodyBuffer(req, maxBytes = MAX_UPLOAD_SIZE) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error("حجم الملف أكبر من 600 MB");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const buf = await readBodyBuffer(req, 25 * 1024 * 1024);
  if (!buf.length) return {};
  try {
    const data = JSON.parse(buf.toString("utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function extractText(buffer, fileName, fileType, fileSize, fields) {
  const manualText = String(fields?.extractedText || "").trim();
  if (manualText) return manualText;
  const lower = String(fileName || "").toLowerCase();
  if ((lower.endsWith(".txt") || String(fileType || "").startsWith("text/")) && fileSize <= 2 * 1024 * 1024) {
    return buffer.toString("utf8");
  }
  return [
    `[محتوى المرفق: ${fileName}]`,
    "تم حفظ الملف في قاعدة البيانات بنجاح.",
    `حجم الملف: ${(fileSize / 1048576).toFixed(1)} MB`,
    `الوحدة: ${fields?.unit || ""}`,
    `المادة: ${fields?.subject || ""}`,
    `الصف: ${fields?.grade || ""}`,
    "",
    "ملاحظة: سيتم إرسال PDF إلى الذكاء الاصطناعي عند التوليد إذا كان مفتاح Gemini متوفرًا.",
  ].join("\n");
}

function receiveClientUpload(upload, meta) {
  const fileName = safeFileName(upload?.fileName || upload?.pathname?.split("/").pop() || "upload.bin");
  const fileType = String(upload?.fileType || upload?.contentType || "application/octet-stream");
  const fileSize = Number(upload?.fileSize || upload?.size || 0);
  const filePath = String(upload?.filePath || upload?.url || "");
  if (!filePath || !/^https?:\/\//i.test(filePath)) {
    const err = new Error("لم يرجع Vercel Blob رابط الملف بعد الرفع.");
    err.statusCode = 400;
    err.error = "invalid_blob_upload";
    throw err;
  }
  if (fileSize > MAX_UPLOAD_SIZE) {
    const err = new Error("حجم الملف أكبر من 600 MB");
    err.statusCode = 413;
    throw err;
  }
  return {
    fileName,
    fileType,
    fileSize,
    filePath,
    extractedText: extractText(Buffer.alloc(0), fileName, fileType, fileSize, meta),
  };
}

async function receiveUpload(req, meta) {
  const length = Number(req.headers["content-length"] || 0);
  if (length > MAX_UPLOAD_SIZE) {
    const err = new Error("حجم الملف أكبر من 600 MB");
    err.statusCode = 413;
    throw err;
  }
  const fileName = safeFileName(decodeURIComponent(String(req.headers["x-file-name"] || "upload.bin")));
  const fileType = decodeURIComponent(String(req.headers["x-file-type"] || "application/octet-stream"));
  const buffer = await readBodyBuffer(req, MAX_UPLOAD_SIZE);
  const pathname = `ai/uploads/${Date.now()}-${Math.floor(Math.random() * 900000 + 100000)}-${fileName}`;
  let blob;
  try {
    blob = await put(pathname, buffer, {
      access: "public",
      contentType: fileType,
      addRandomSuffix: true,
    });
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("BLOB_READ_WRITE_TOKEN")) {
      const err = new Error("Vercel Blob غير مفعّل. أضف Blob Storage في Vercel أو متغير BLOB_READ_WRITE_TOKEN.");
      err.statusCode = 500;
      err.error = "blob_not_configured";
      throw err;
    }
    const err = new Error("تعذر رفع الملف إلى Vercel Blob: " + message);
    err.statusCode = 502;
    err.error = "blob_upload_failed";
    throw err;
  }
  return {
    fileName,
    fileType,
    fileSize: buffer.length,
    filePath: blob.url,
    extractedText: extractText(buffer, fileName, fileType, buffer.length, meta),
  };
}

function lessonRow(row) {
  return {
    id: Number(row.id),
    grade: row.grade || "",
    subject: row.subject || "",
    semester: row.semester || "",
    unit: row.unit || "",
    title: row.title || "",
    attachmentId: row.attachment_id == null ? null : Number(row.attachment_id),
    status: row.status || "active",
    createdAt: row.created_at ? String(row.created_at).slice(0, 10) : "",
  };
}

function attachmentRow(row) {
  return {
    id: Number(row.id),
    title: row.title || "",
    fileName: row.file_name || "",
    fileType: row.file_type || "",
    fileSize: Number(row.file_size || 0),
    filePath: row.file_path || "",
    extractedText: row.extracted_text || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  };
}

async function listData(res) {
  if (!(await dbReady(res))) return;
  const lessons = await sql`SELECT * FROM ai_lessons ORDER BY created_at DESC, id DESC;`;
  const attachments = await sql`SELECT * FROM ai_attachments ORDER BY created_at DESC, id DESC;`;
  send(res, 200, { lessons: lessons.map(lessonRow), attachments: attachments.map(attachmentRow) });
}

async function insertAttachment(upload, title) {
  const rows = await sql`
    INSERT INTO ai_attachments (title, file_name, file_type, file_size, file_path, extracted_text)
    VALUES (${title}, ${upload.fileName}, ${upload.fileType}, ${upload.fileSize}, ${upload.filePath}, ${upload.extractedText})
    RETURNING id;
  `;
  return Number(rows[0].id);
}

async function saveSingle(req, res) {
  if (!(await dbReady(res))) return;
  const isJson = String(req.headers["content-type"] || "").includes("application/json");
  const body = isJson ? await readJsonBody(req) : {};
  const meta = body.meta && typeof body.meta === "object" ? body.meta : decodeMeta(req.query?.meta || "");
  for (const field of ["grade", "subject", "semester", "unit", "title"]) {
    if (!meta[field]) return fail(res, 400, "يرجى تعبئة جميع الحقول المطلوبة", "invalid_payload");
  }
  const upload = body.upload ? receiveClientUpload(body.upload, meta) : await receiveUpload(req, meta);
  const attachmentId = await insertAttachment(upload, `${meta.unit} - ${meta.title}`);
  await sql`
    INSERT INTO ai_lessons (grade, subject, semester, unit, title, attachment_id, status, created_at)
    VALUES (${meta.grade}, ${meta.subject}, ${meta.semester}, ${meta.unit}, ${meta.title}, ${attachmentId}, ${meta.status || "active"}, ${today()});
  `;
  send(res, 200, { ok: true });
}

async function saveMulti(req, res) {
  if (!(await dbReady(res))) return;
  const isJson = String(req.headers["content-type"] || "").includes("application/json");
  const body = isJson ? await readJsonBody(req) : {};
  const meta = body.meta && typeof body.meta === "object" ? body.meta : decodeMeta(req.query?.meta || "");
  const titles = Array.isArray(meta.titles) ? meta.titles.map((x) => String(x || "").trim()).filter(Boolean) : [];
  if (!meta.grade || !meta.subject || !meta.semester || !meta.unit || !titles.length) {
    return fail(res, 400, "يرجى تعبئة البيانات وإضافة درس واحد على الأقل", "invalid_payload");
  }
  const upload = body.upload ? receiveClientUpload(body.upload, meta) : await receiveUpload(req, meta);
  const attachmentId = await insertAttachment(upload, meta.unit);
  for (const title of titles) {
    await sql`
      INSERT INTO ai_lessons (grade, subject, semester, unit, title, attachment_id, status, created_at)
      VALUES (${meta.grade}, ${meta.subject}, ${meta.semester}, ${meta.unit}, ${title}, ${attachmentId}, 'active', ${today()});
    `;
  }
  send(res, 200, { ok: true });
}

async function getAttachment(id) {
  const rows = await sql`SELECT * FROM ai_attachments WHERE id = ${id} LIMIT 1;`;
  return rows?.[0] ? attachmentRow(rows[0]) : null;
}

async function fetchBlobBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("تعذر قراءة ملف PDF من التخزين.");
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

async function uploadGeminiFile(apiKey, attachment) {
  const response = await fetch(attachment.filePath);
  if (!response.ok) throw new Error("تعذر قراءة ملف PDF من التخزين.");
  const bytes = Buffer.from(await response.arrayBuffer());
  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": attachment.fileType || "application/pdf",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: attachment.fileName || "lesson.pdf" } }),
  });
  if (!start.ok) throw new Error("تعذر بدء رفع PDF إلى Gemini.");
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("لم يرجع Gemini رابط رفع الملف.");
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  const data = await upload.json().catch(() => ({}));
  if (!upload.ok) throw new Error(data?.error?.message || "تعذر رفع PDF إلى Gemini.");
  if (!data?.file?.uri) throw new Error("لم يرجع Gemini رابط الملف بعد الرفع.");
  return data.file.uri;
}

async function generateGemini(req, res) {
  if (!(await dbReady(res))) return;
  const body = await readJsonBody(req);
  const apiKey = String(body.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "").trim();
  const model = String(body.model || process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  const prompt = String(body.prompt || "");
  if (!apiKey) return fail(res, 400, "مفتاح Gemini غير موجود. أضفه في إعدادات AI داخل الصفحة أو أضف GEMINI_API_KEY في Vercel ثم أعد النشر.", "missing_gemini_key");
  if (!prompt) return fail(res, 400, "نص الطلب غير موجود.", "invalid_payload");
  const parts = [];
  if (body.includePdf && body.attachmentId) {
    const attachment = await getAttachment(Number(body.attachmentId));
    if (!attachment) return fail(res, 404, "لم يتم العثور على ملف PDF.", "not_found");
    const mimeType = attachment.fileType || "application/pdf";
    if (Number(attachment.fileSize || 0) > INLINE_GEMINI_LIMIT) {
      const fileUri = await uploadGeminiFile(apiKey, attachment);
      parts.push({ file_data: { mime_type: mimeType, file_uri: fileUri } });
    } else {
      const data = await fetchBlobBase64(attachment.filePath);
      parts.push({ inline_data: { mime_type: mimeType, data } });
    }
  }
  parts.push({ text: prompt });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: body.includePdf ? 0.1 : 0.2, responseMimeType: "application/json" },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return fail(res, response.status || 500, data?.error?.message || "تعذر الاتصال بخدمة Gemini.", "gemini_failed");
  const text = (data?.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("");
  if (!text.trim()) return fail(res, 500, "لم يرجع Gemini نتيجة صالحة.", "empty_gemini_response");
  send(res, 200, { text });
}

async function updateOrDeleteLesson(req, res, id) {
  if (!(await dbReady(res))) return;
  const rows = await sql`SELECT * FROM ai_lessons WHERE id = ${id} LIMIT 1;`;
  if (!rows?.[0]) return fail(res, 404, "لم يتم العثور على الدرس", "not_found");
  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    await sql`
      UPDATE ai_lessons
      SET title = COALESCE(${body.title ?? null}, title),
          unit = COALESCE(${body.unit ?? null}, unit),
          status = COALESCE(${body.status ?? null}, status)
      WHERE id = ${id};
    `;
    return send(res, 200, { ok: true });
  }
  if (req.method === "DELETE") {
    const attachmentId = rows[0].attachment_id;
    await sql`DELETE FROM ai_lessons WHERE id = ${id};`;
    if (attachmentId != null) {
      const used = await sql`SELECT id FROM ai_lessons WHERE attachment_id = ${attachmentId} LIMIT 1;`;
      if (!used?.[0]) await sql`DELETE FROM ai_attachments WHERE id = ${attachmentId};`;
    }
    return send(res, 200, { ok: true });
  }
  return fail(res, 405, "طريقة الطلب غير مدعومة", "method_not_allowed");
}

export default async function handler(req, res) {
  try {
    const path = String(req.query?.path || req.query?.route || "");
    if (req.method === "GET" && path === "/api/lessons") return await listData(res);
    if (req.method === "POST" && path === "/api/lessons/single") return await saveSingle(req, res);
    if (req.method === "POST" && path === "/api/lessons/multi") return await saveMulti(req, res);
    if (req.method === "POST" && path === "/api/gemini/generate") return await generateGemini(req, res);
    if (req.method === "GET" && path === "/api/export") return await listData(res);
    const match = path.match(/^\/api\/lessons\/(\d+)$/);
    if (match) return await updateOrDeleteLesson(req, res, Number(match[1]));
    return fail(res, 404, "المسار غير موجود", "not_found");
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return fail(res, status, String(error?.message || "حدث خطأ في الخادم"), error?.error || "server_error");
  }
}
