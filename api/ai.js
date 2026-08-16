import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { inflateSync } from "node:zlib";

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
          attachment_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
          status TEXT NOT NULL DEFAULT 'active',
          created_at DATE NOT NULL DEFAULT CURRENT_DATE
        );
      `;
      await sql`
        ALTER TABLE ai_lessons
        ADD COLUMN IF NOT EXISTS attachment_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
      `;
      await sql`
        ALTER TABLE ai_attachments
        ADD COLUMN IF NOT EXISTS extracted_text TEXT NOT NULL DEFAULT '';
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
      "Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª ØºÙŠØ± Ù…Ø¶Ø§ÙØ© ÙÙŠ Vercel. Ø£Ø¶Ù Neon Postgres Ø«Ù… Ø§Ø±Ø¨Ø· Ù…ØªØºÙŠØ± DATABASE_URL Ø£Ùˆ AI_DATABASE_URL.",
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
      const err = new Error("Ø­Ø¬Ù… Ø§Ù„Ù…Ù„Ù Ø£ÙƒØ¨Ø± Ù…Ù† 600 MB");
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

function normalizeExtractedText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ \u00a0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 180000);
}

function cleanDbText(text, maxLength = 2000) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function decodePdfLiteralString(raw) {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== "\\") { out += ch; continue; }
    const next = raw[++i] || "";
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else if (next === "(" || next === ")" || next === "\\") out += next;
    else if (/[0-7]/.test(next)) {
      let oct = next;
      for (let j = 0; j < 2 && /[0-7]/.test(raw[i + 1] || ""); j++) oct += raw[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else {
      out += next;
    }
  }
  return out;
}

function decodePdfHexString(hex) {
  const clean = String(hex || "").replace(/[^0-9a-fA-F]/g, "");
  if (!clean) return "";
  const bytes = Buffer.from(clean.length % 2 ? clean + "0" : clean, "hex");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return bytes.slice(2).toString("utf16le").replace(/(.)(.)/g, "$2$1");
  if (bytes.length >= 4 && bytes.filter((_, i) => i % 2 === 0 && bytes[i] === 0).length > bytes.length / 4) return bytes.swap16().toString("utf16le");
  return bytes.toString("utf8");
}

function extractPdfStringsFromContent(content) {
  const chunks = [];
  const text = String(content || "");
  const btBlocks = text.match(/BT[\s\S]*?ET/g) || [text];
  for (const block of btBlocks) {
    const literalRe = /\((?:\\.|[^\\)])*\)\s*(?:Tj|'|"|\]|TJ)?/g;
    let m;
    while ((m = literalRe.exec(block))) chunks.push(decodePdfLiteralString(m[0].replace(/^\(|\)\s*(?:Tj|'|"|\]|TJ)?$/g, "")));
    const hexRe = /<([0-9a-fA-F\s]+)>\s*(?:Tj|\]|TJ)?/g;
    while ((m = hexRe.exec(block))) chunks.push(decodePdfHexString(m[1]));
  }
  return chunks.join(" ");
}

function extractPdfTextLocal(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return "";
  const pdf = buffer.toString("latin1");
  const chunks = [];
  const streamRe = /(<<[\s\S]*?>>)\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  let m;
  while ((m = streamRe.exec(pdf))) {
    const dict = m[1];
    let stream = Buffer.from(m[2], "latin1");
    try {
      if (/FlateDecode/.test(dict)) stream = inflateSync(stream);
      chunks.push(extractPdfStringsFromContent(stream.toString("utf8")));
    } catch {
      chunks.push(extractPdfStringsFromContent(m[2]));
    }
  }
  chunks.push(extractPdfStringsFromContent(pdf));
  return normalizeExtractedText(chunks.join("\n"));
}

async function extractTextWithGemini(filePath, fileName, fileSize) {
  const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "").trim();
  if (!apiKey || !filePath) return "";
  try {
    const parts = [{
      text: [
        "استخرج النص الكامل من ملف PDF بدقة عالية جدًا.",
        "أعد النص فقط بدون تلخيص وبدون JSON وبدون شرح إضافي.",
        "حافظ على العربية، العناوين، أرقام الصفحات إن وجدت، ترتيب الفقرات، والجداول بصيغة نصية واضحة.",
        "لا تحذف الأسئلة أو التعليمات أو الأمثلة، واكتب النص غير الواضح بأقرب قراءة ممكنة."
      ].join("\n")
    }];
    if (Number(fileSize || 0) > INLINE_GEMINI_LIMIT) {
      const uri = await uploadGeminiFile(apiKey, { filePath, fileName, fileSize, fileType: "application/pdf" });
      parts.push({ file_data: { mime_type: "application/pdf", file_uri: uri } });
    } else {
      const data = await fetchBlobBase64(filePath);
      parts.push({ inline_data: { mime_type: "application/pdf", data } });
    }
    const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0 }
      }),
    }, 85000);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return "";
    return normalizeExtractedText((result?.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("\n"));
  } catch {
    return "";
  }
}

function attachmentPlaceholder(fileName, fileSize, fields) {
  return [
    `[PDF saved: ${fileName}]`,
    "The file was saved, but text extraction did not return readable text.",
    `File size: ${(Number(fileSize || 0) / 1048576).toFixed(1)} MB`,
    `Unit: ${fields?.unit || ""}`,
    `Subject: ${fields?.subject || ""}`,
    `Grade: ${fields?.grade || ""}`,
  ].join("\n");
}

function hasUsableExtractedText(text) {
  const value = normalizeExtractedText(text);
  if (value.length < 40) return false;
  const weakMarkers = [
    "[PDF saved:",
    "The file was saved, but text extraction did not return readable text",
    "تم حفظ الملف في قاعدة البيانات بنجاح",
    "ملاحظة: لاستخراج نصوص PDF",
    "ملاحظة: سيتم إرسال PDF إلى الذكاء الاصطناعي",
    "عنوان الملف:",
    "النص سيُستخرج عند التوليد"
  ];
  return !weakMarkers.some((marker) => value.includes(marker)) || value.length > 500;
}

async function extractText(buffer, fileName, fileType, fileSize, fields, filePath = "") {
  const manualText = normalizeExtractedText(fields?.extractedText || "");
  if (manualText) return manualText;
  const lower = String(fileName || "").toLowerCase();
  if ((lower.endsWith(".txt") || String(fileType || "").startsWith("text/")) && fileSize <= 2 * 1024 * 1024) {
    return normalizeExtractedText(buffer.toString("utf8"));
  }
  if (lower.endsWith(".pdf") || String(fileType || "").includes("pdf")) {
    let pdfBuffer = buffer;
    if ((!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length) && filePath && Number(fileSize || 0) <= INLINE_GEMINI_LIMIT) {
      pdfBuffer = await fetchBlobBuffer(filePath).catch(() => Buffer.alloc(0));
    }
    const localText = extractPdfTextLocal(pdfBuffer);
    if (localText.length >= 1500) return localText;
    const geminiText = await extractTextWithGemini(filePath, fileName, fileSize);
    if (geminiText.length > localText.length) return geminiText;
    if (localText) return localText;
  }
  return attachmentPlaceholder(fileName, fileSize, fields);
}

function assertPdfUpload(upload) {
  const type = String(upload?.fileType || upload?.contentType || "").toLowerCase();
  const name = String(upload?.fileName || upload?.pathname || upload?.url || "").toLowerCase();
  if (type !== "application/pdf" && !name.endsWith(".pdf") && !name.includes(".pdf")) {
    const err = new Error("ÙŠØ³Ù…Ø­ Ø¨Ø±ÙØ¹ Ù…Ù„ÙØ§Øª PDF ÙÙ‚Ø·.");
    err.statusCode = 400;
    err.error = "pdf_only";
    throw err;
  }
}

async function receiveClientUpload(upload, meta) {
  assertPdfUpload(upload);
  const fileName = safeFileName(upload?.fileName || upload?.pathname?.split("/").pop() || "upload.pdf");
  const fileType = "application/pdf";
  const fileSize = Number(upload?.fileSize || upload?.size || 0);
  const filePath = String(upload?.filePath || upload?.url || "");
  if (!filePath || !/^https?:\/\//i.test(filePath)) {
    const err = new Error("Ù„Ù… ÙŠØ±Ø¬Ø¹ Vercel Blob Ø±Ø§Ø¨Ø· Ø§Ù„Ù…Ù„Ù Ø¨Ø¹Ø¯ Ø§Ù„Ø±ÙØ¹.");
    err.statusCode = 400;
    err.error = "invalid_blob_upload";
    throw err;
  }
  if (fileSize > MAX_UPLOAD_SIZE) {
    const err = new Error("Ø­Ø¬Ù… Ø§Ù„Ù…Ù„Ù Ø£ÙƒØ¨Ø± Ù…Ù† 600 MB");
    err.statusCode = 413;
    throw err;
  }
  return {
    fileName,
    fileType,
    fileSize,
    filePath,
    extractedText: await extractText(Buffer.alloc(0), fileName, fileType, fileSize, meta, filePath),
  };
}

async function receiveUpload(req, meta) {
  const length = Number(req.headers["content-length"] || 0);
  if (length > MAX_UPLOAD_SIZE) {
    const err = new Error("Ø­Ø¬Ù… Ø§Ù„Ù…Ù„Ù Ø£ÙƒØ¨Ø± Ù…Ù† 600 MB");
    err.statusCode = 413;
    throw err;
  }
  const fileName = safeFileName(decodeURIComponent(String(req.headers["x-file-name"] || "upload.pdf")));
  const headerType = decodeURIComponent(String(req.headers["x-file-type"] || "application/pdf"));
  if (headerType.toLowerCase() !== "application/pdf" && !fileName.toLowerCase().endsWith(".pdf")) {
    const err = new Error("ÙŠØ³Ù…Ø­ Ø¨Ø±ÙØ¹ Ù…Ù„ÙØ§Øª PDF ÙÙ‚Ø·.");
    err.statusCode = 400;
    err.error = "pdf_only";
    throw err;
  }
  const fileType = "application/pdf";
  const buffer = await readBodyBuffer(req, MAX_UPLOAD_SIZE);
  const pathname = `ai/uploads/${Date.now()}-${Math.floor(Math.random() * 900000 + 100000)}-${fileName}`;
  let blob;
  try {
    blob = await put(pathname, buffer, {
      access: "public",
      contentType: "application/pdf",
      addRandomSuffix: true,
    });
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("BLOB_READ_WRITE_TOKEN")) {
      const err = new Error("Vercel Blob ØºÙŠØ± Ù…ÙØ¹Ù‘Ù„. Ø£Ø¶Ù Blob Storage ÙÙŠ Vercel Ø£Ùˆ Ù…ØªØºÙŠØ± BLOB_READ_WRITE_TOKEN.");
      err.statusCode = 500;
      err.error = "blob_not_configured";
      throw err;
    }
    const err = new Error("ØªØ¹Ø°Ø± Ø±ÙØ¹ Ø§Ù„Ù…Ù„Ù Ø¥Ù„Ù‰ Vercel Blob: " + message);
    err.statusCode = 502;
    err.error = "blob_upload_failed";
    throw err;
  }
  return {
    fileName,
    fileType,
    fileSize: buffer.length,
    filePath: blob.url,
    extractedText: await extractText(buffer, fileName, fileType, buffer.length, meta, blob.url),
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
    attachmentIds: Array.isArray(row.attachment_ids) && row.attachment_ids.length
      ? row.attachment_ids.map((id) => Number(id)).filter(Boolean)
      : (row.attachment_id == null ? [] : [Number(row.attachment_id)]),
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
    VALUES (${cleanDbText(title)}, ${cleanDbText(upload.fileName, 300)}, ${cleanDbText(upload.fileType, 120)}, ${upload.fileSize}, ${cleanDbText(upload.filePath, 1200)}, ${normalizeExtractedText(upload.extractedText)})
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
    if (!meta[field]) return fail(res, 400, "ÙŠØ±Ø¬Ù‰ ØªØ¹Ø¨Ø¦Ø© Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©", "invalid_payload");
  }
  const upload = body.upload ? await receiveClientUpload(body.upload, meta) : await receiveUpload(req, meta);
  const attachmentId = await insertAttachment(upload, `${meta.unit} - ${meta.title}`);
  await sql`
    INSERT INTO ai_lessons (grade, subject, semester, unit, title, attachment_id, attachment_ids, status, created_at)
    VALUES (${cleanDbText(meta.grade)}, ${cleanDbText(meta.subject)}, ${cleanDbText(meta.semester)}, ${cleanDbText(meta.unit)}, ${cleanDbText(meta.title)}, ${attachmentId}, ${JSON.stringify([attachmentId])}::jsonb, ${cleanDbText(meta.status || "active", 60)}, ${today()});
  `;
  send(res, 200, { ok: true });
}

async function saveMulti(req, res) {
  if (!(await dbReady(res))) return;
  const isJson = String(req.headers["content-type"] || "").includes("application/json");
  const body = isJson ? await readJsonBody(req) : {};
  const meta = body.meta && typeof body.meta === "object" ? body.meta : decodeMeta(req.query?.meta || "");
  const units = Array.isArray(meta.units) ? meta.units : [];
  if (units.length) {
    if (!meta.grade || !meta.subject || !meta.semester) {
      return fail(res, 400, "ÙŠØ±Ø¬Ù‰ ØªØ¹Ø¨Ø¦Ø© Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØµÙ ÙˆØ§Ù„Ù…Ø§Ø¯Ø© ÙˆØ§Ù„ÙØµÙ„", "invalid_payload");
    }
    const sharedUploads = Array.isArray(meta.uploads) ? meta.uploads : [];
    if (!sharedUploads.length) {
      return fail(res, 400, "ÙŠØ±Ø¬Ù‰ Ø±ÙØ¹ Ù…Ø±ÙÙ‚ ÙˆØ§Ø­Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ Ù„ÙŠØ´Ù…Ù„ ÙƒÙ„ Ø§Ù„ÙˆØ­Ø¯Ø§Øª", "invalid_payload");
    }
    const attachmentIds = [];
    for (const uploadPayload of sharedUploads) {
      const upload = await receiveClientUpload(uploadPayload, {
        unit: "Ù…Ø±ÙÙ‚Ø§Øª Ù…Ø´ØªØ±ÙƒØ©",
        extractedText: units.map((unitItem) => String(unitItem?.extractedText || "").trim()).filter(Boolean).join("\n\n")
      });
      const attachmentId = await insertAttachment(upload, "Ù…Ø±ÙÙ‚Ø§Øª Ù…Ø´ØªØ±ÙƒØ© Ù„ÙƒÙ„ Ø§Ù„ÙˆØ­Ø¯Ø§Øª");
      attachmentIds.push(attachmentId);
    }
    const primaryAttachmentId = attachmentIds[0];
    let lessonCount = 0;
    const fileCount = attachmentIds.length;
    for (const unitItem of units) {
      const unit = String(unitItem?.unit || "").trim();
      const titles = Array.isArray(unitItem?.titles) ? unitItem.titles.map((x) => String(x || "").trim()).filter(Boolean) : [];
      if (!unit || !titles.length) {
        return fail(res, 400, "ÙƒÙ„ ÙˆØ­Ø¯Ø© ØªØ­ØªØ§Ø¬ Ø§Ø³Ù… ÙˆØ­Ø¯Ø© ÙˆØ¯Ø±Ø³ ÙˆØ§Ø­Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„", "invalid_payload");
      }
      for (const title of titles) {
        await sql`
          INSERT INTO ai_lessons (grade, subject, semester, unit, title, attachment_id, attachment_ids, status, created_at)
          VALUES (${cleanDbText(meta.grade)}, ${cleanDbText(meta.subject)}, ${cleanDbText(meta.semester)}, ${cleanDbText(unit)}, ${cleanDbText(title)}, ${primaryAttachmentId}, ${JSON.stringify(attachmentIds)}::jsonb, 'active', ${today()});
        `;
        lessonCount += 1;
      }
    }
    return send(res, 200, { ok: true, lessonCount, fileCount });
  }

  const titles = Array.isArray(meta.titles) ? meta.titles.map((x) => String(x || "").trim()).filter(Boolean) : [];
  if (!meta.grade || !meta.subject || !meta.semester || !meta.unit || !titles.length) {
    return fail(res, 400, "ÙŠØ±Ø¬Ù‰ ØªØ¹Ø¨Ø¦Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª ÙˆØ¥Ø¶Ø§ÙØ© Ø¯Ø±Ø³ ÙˆØ§Ø­Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„", "invalid_payload");
  }
  const upload = body.upload ? await receiveClientUpload(body.upload, meta) : await receiveUpload(req, meta);
  const attachmentId = await insertAttachment(upload, meta.unit);
  for (const title of titles) {
    await sql`
      INSERT INTO ai_lessons (grade, subject, semester, unit, title, attachment_id, attachment_ids, status, created_at)
      VALUES (${cleanDbText(meta.grade)}, ${cleanDbText(meta.subject)}, ${cleanDbText(meta.semester)}, ${cleanDbText(meta.unit)}, ${cleanDbText(title)}, ${attachmentId}, ${JSON.stringify([attachmentId])}::jsonb, 'active', ${today()});
    `;
  }
  send(res, 200, { ok: true, lessonCount: titles.length, fileCount: 1 });
}

async function getAttachment(id) {
  const rows = await sql`SELECT * FROM ai_attachments WHERE id = ${id} LIMIT 1;`;
  return rows?.[0] ? attachmentRow(rows[0]) : null;
}

function isPdfAttachment(attachment) {
  const type = String(attachment?.fileType || "").toLowerCase();
  const name = String(attachment?.fileName || "").toLowerCase();
  const path = String(attachment?.filePath || "").toLowerCase();
  let urlPath = "";
  try { urlPath = new URL(path).pathname.toLowerCase(); } catch {}
  return type.includes("pdf") || name.endsWith(".pdf") || path.includes(".pdf") || urlPath.endsWith(".pdf");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 55000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutError = new Error("انتهت مهلة الاتصال بخدمة Gemini أو التخزين.");
      timeoutError.code = "timeout";
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBlobBase64(url) {
  return (await fetchBlobBuffer(url)).toString("base64");
}

async function fetchBlobBuffer(url) {
  const response = await fetchWithTimeout(url, {}, 25000);
  if (!response.ok) throw new Error("ØªØ¹Ø°Ø± Ù‚Ø±Ø§Ø¡Ø© Ù…Ù„Ù PDF Ù…Ù† Ø§Ù„ØªØ®Ø²ÙŠÙ†.");
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadGeminiFile(apiKey, attachment) {
  const response = await fetchWithTimeout(attachment.filePath, {}, 25000);
  if (!response.ok) throw new Error("ØªØ¹Ø°Ø± Ù‚Ø±Ø§Ø¡Ø© Ù…Ù„Ù PDF Ù…Ù† Ø§Ù„ØªØ®Ø²ÙŠÙ†.");
  const bytes = Buffer.from(await response.arrayBuffer());
  const start = await fetchWithTimeout(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: attachment.fileName || "lesson.pdf" } }),
  }, 25000);
  if (!start.ok) throw new Error("ØªØ¹Ø°Ø± Ø¨Ø¯Ø¡ Ø±ÙØ¹ PDF Ø¥Ù„Ù‰ Gemini.");
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Ù„Ù… ÙŠØ±Ø¬Ø¹ Gemini Ø±Ø§Ø¨Ø· Ø±ÙØ¹ Ø§Ù„Ù…Ù„Ù.");
  const upload = await fetchWithTimeout(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  }, 35000);
  const data = await upload.json().catch(() => ({}));
  if (!upload.ok) throw new Error(data?.error?.message || "ØªØ¹Ø°Ø± Ø±ÙØ¹ PDF Ø¥Ù„Ù‰ Gemini.");
  if (!data?.file?.uri) throw new Error("Ù„Ù… ÙŠØ±Ø¬Ø¹ Gemini Ø±Ø§Ø¨Ø· Ø§Ù„Ù…Ù„Ù Ø¨Ø¹Ø¯ Ø§Ù„Ø±ÙØ¹.");
  return data.file.uri;
}

async function generateGemini(req, res) {
  if (!(await dbReady(res))) return;
  const body = await readJsonBody(req);
  const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "").trim();
  let model = String(body.model || process.env.GEMINI_MODEL || "gemini-3.6-flash").trim();
  if (model === "gemini-2.5-flash-lite") model = "gemini-3.1-flash-lite";
  const prompt = String(body.prompt || "");
  if (!apiKey) return fail(res, 400, "Ù…ÙØªØ§Ø­ Gemini ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯ Ø¹Ù„Ù‰ Ø§Ù„Ø®Ø§Ø¯Ù…. Ø£Ø¶Ù GEMINI_API_KEY ÙÙŠ Vercel Ø«Ù… Ø£Ø¹Ø¯ Ø§Ù„Ù†Ø´Ø±.", "missing_gemini_key");
  if (!prompt) return fail(res, 400, "Ù†Øµ Ø§Ù„Ø·Ù„Ø¨ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯.", "invalid_payload");
  const parts = [];
  let usesPdfAttachment = false;
  if (body.includePdf && (body.attachmentId || Array.isArray(body.attachmentIds))) {
    const ids = Array.isArray(body.attachmentIds) && body.attachmentIds.length
      ? body.attachmentIds.map((id) => Number(id)).filter(Boolean)
      : [Number(body.attachmentId)].filter(Boolean);
    if (!ids.length) return fail(res, 404, "Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ù…Ù„Ù PDF.", "not_found");
    for (const id of ids.slice(0, 6)) {
      const attachment = await getAttachment(id);
      if (!attachment || !isPdfAttachment(attachment)) continue;
      const savedText = normalizeExtractedText(attachment.extractedText || "");
      if (hasUsableExtractedText(savedText)) {
        parts.push({
          text: [
            `النص المستخرج والمحفوظ من المرفق (${attachment.fileName || "PDF"}):`,
            savedText
          ].join("\n")
        });
        continue;
      }
      const extractedNow = await extractText(Buffer.alloc(0), attachment.fileName, attachment.fileType, attachment.fileSize, {}, attachment.filePath);
      if (hasUsableExtractedText(extractedNow)) {
        await sql`UPDATE ai_attachments SET extracted_text = ${normalizeExtractedText(extractedNow)} WHERE id = ${Number(attachment.id)};`;
        parts.push({
          text: [
            `النص المستخرج والمحفوظ من المرفق (${attachment.fileName || "PDF"}):`,
            extractedNow
          ].join("\n")
        });
        continue;
      }
      const mimeType = "application/pdf";
      if (Number(attachment.fileSize || 0) > INLINE_GEMINI_LIMIT) {
        const fileUri = await uploadGeminiFile(apiKey, attachment);
        parts.push({ file_data: { mime_type: mimeType, file_uri: fileUri } });
      } else {
        const data = await fetchBlobBase64(attachment.filePath);
        parts.push({ inline_data: { mime_type: mimeType, data } });
      }
      usesPdfAttachment = true;
    }
    if (!parts.length) return fail(res, 404, "Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ù…Ù„Ù PDF ØµØ§Ù„Ø­.", "not_found");
  }
  parts.push({ text: prompt });
  async function requestGemini(selectedModel) {
    const selectedGenerationConfig = selectedModel.startsWith("gemini-3")
      ? { responseMimeType: "application/json" }
      : { temperature: usesPdfAttachment ? 0.1 : 0.2, responseMimeType: "application/json" };
    const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: selectedGenerationConfig,
      }),
    }, usesPdfAttachment ? 85000 : 55000);
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }
  function isHighDemandResponse(response, data) {
    const message = String(data?.error?.message || "").toLowerCase();
    return response.status === 503 ||
      message.includes("high demand") ||
      message.includes("spikes in demand") ||
      message.includes("try again later") ||
      message.includes("overloaded") ||
      message.includes("unavailable");
  }
  let { response, data } = await requestGemini(model);
  const deniedMessage = String(data?.error?.message || "").toLowerCase();
  if (!response.ok && response.status === 403 && model !== "gemini-3.6-flash" && deniedMessage.includes("permission")) {
    model = "gemini-3.6-flash";
    ({ response, data } = await requestGemini(model));
  }
  if (!response.ok && isHighDemandResponse(response, data) && model !== "gemini-3.1-flash-lite") {
    model = "gemini-3.1-flash-lite";
    ({ response, data } = await requestGemini(model));
  }
  const notAvailableMessage = String(data?.error?.message || "").toLowerCase();
  if (!response.ok && model !== "gemini-2.5-flash" && (response.status === 404 || notAvailableMessage.includes("no longer available") || notAvailableMessage.includes("not found"))) {
    model = "gemini-2.5-flash";
    ({ response, data } = await requestGemini(model));
  }
  if (!response.ok) {
    const message = data?.error?.message || "ØªØ¹Ø°Ø± Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø®Ø¯Ù…Ø© Gemini.";
    const friendly = /invalid argument/i.test(message)
      ? "Ø±ÙØ¶ Gemini Ø§Ù„Ø·Ù„Ø¨ Ù„Ø£Ù† Ù…Ù„Ù PDF ØºÙŠØ± ØµØ§Ù„Ø­ Ø£Ùˆ Ù„Ø£Ù† Ø§Ù„Ù…Ø±ÙÙ‚ Ù„ÙŠØ³ PDF ÙØ¹Ù„ÙŠÙ‹Ø§. Ø§Ø³ØªØ®Ø¯Ù… Ù…Ù„Ù PDF ØµØ§Ù„Ø­Ù‹Ø§ Ø£Ùˆ Ø§Ù„ØµÙ‚ Ù†Øµ Ø§Ù„Ø¯Ø±Ø³ ÙÙŠ Ù„ÙˆØ­Ø© Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©."
      : message;
    return fail(res, response.status || 500, friendly, "gemini_failed");
  }
  const text = (data?.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("");
  if (!text.trim()) return fail(res, 500, "Ù„Ù… ÙŠØ±Ø¬Ø¹ Gemini Ù†ØªÙŠØ¬Ø© ØµØ§Ù„Ø­Ø©.", "empty_gemini_response");
  send(res, 200, { text });
}

function normalizeAttachmentIdsFromRow(row) {
  const ids = new Set();
  if (row?.attachment_id != null) ids.add(Number(row.attachment_id));
  const raw = row?.attachment_ids;
  if (Array.isArray(raw)) {
    raw.forEach((value) => {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    });
  }
  return Array.from(ids).filter(Boolean);
}

async function cleanupUnusedAttachments(attachmentIds = []) {
  const uniqueIds = Array.from(new Set(attachmentIds.map((id) => Number(id)).filter(Boolean)));
  for (const attachmentId of uniqueIds) {
    const usedByPrimary = await sql`
      SELECT id FROM ai_lessons
      WHERE attachment_id = ${attachmentId}
      LIMIT 1;
    `;
    if (usedByPrimary?.[0]) continue;

    const usedByList = await sql`
      SELECT id FROM ai_lessons
      WHERE attachment_ids @> ${JSON.stringify([attachmentId])}::jsonb
      LIMIT 1;
    `;
    if (usedByList?.[0]) continue;

    await sql`DELETE FROM ai_attachments WHERE id = ${attachmentId};`;
  }
}

function needsTextRefresh(text = "") {
  const value = String(text || "").trim();
  if (!value) return true;
  return value.includes("[PDF saved:") ||
    value.includes("[Ù…Ø­ØªÙˆÙ‰ Ø§Ù„Ù…Ø±ÙÙ‚") ||
    value.includes("The file was saved, but text extraction did not return readable text") ||
    value.length < 500;
}

async function refreshAttachmentText(req, res) {
  if (!(await dbReady(res))) return;
  const body = req.method === "POST" ? await readJsonBody(req).catch(() => ({})) : {};
  const force = !!body.force;
  const limit = Math.max(1, Math.min(20, Number(body.limit || 8)));
  const rows = force
    ? await sql`
        SELECT * FROM ai_attachments
        WHERE file_path <> ''
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit};
      `
    : await sql`
        SELECT * FROM ai_attachments
        WHERE file_path <> ''
          AND (
            extracted_text IS NULL
            OR btrim(extracted_text) = ''
            OR char_length(extracted_text) < 500
            OR extracted_text LIKE '%[PDF saved:%'
            OR extracted_text LIKE '%The file was saved, but text extraction did not return readable text%'
            OR extracted_text LIKE '%النص سيُستخرج عند التوليد%'
          )
        ORDER BY created_at ASC, id ASC
        LIMIT ${limit};
      `;
  const remainingBeforeRows = force ? [{ count: 0 }] : await sql`
    SELECT COUNT(*)::int AS count
    FROM ai_attachments
    WHERE file_path <> ''
      AND (
        extracted_text IS NULL
        OR btrim(extracted_text) = ''
        OR char_length(extracted_text) < 500
        OR extracted_text LIKE '%[PDF saved:%'
        OR extracted_text LIKE '%The file was saved, but text extraction did not return readable text%'
        OR extracted_text LIKE '%النص سيُستخرج عند التوليد%'
      );
  `;
  const remainingBefore = Number(remainingBeforeRows?.[0]?.count || 0);
  let scanned = 0;
  let updated = 0;
  const results = [];
  for (const row of rows || []) {
    scanned++;
    const currentText = row.extracted_text || "";
    if (!force && !needsTextRefresh(currentText)) {
      results.push({ id: Number(row.id), status: "skipped", textLength: currentText.length });
      continue;
    }
    const attachment = attachmentRow(row);
    const text = await extractText(Buffer.alloc(0), attachment.fileName, attachment.fileType, attachment.fileSize, {}, attachment.filePath);
    if (text && (text.length > currentText.length || (hasUsableExtractedText(text) && !hasUsableExtractedText(currentText)))) {
      await sql`UPDATE ai_attachments SET extracted_text = ${normalizeExtractedText(text)} WHERE id = ${Number(row.id)};`;
      updated++;
      results.push({ id: Number(row.id), status: "updated", textLength: text.length });
    } else {
      results.push({ id: Number(row.id), status: "unchanged", textLength: currentText.length });
    }
  }
  const remaining = force ? 0 : Math.max(0, remainingBefore - scanned);
  send(res, 200, { ok: true, scanned, updated, remaining, results });
}

async function updateOrDeleteLesson(req, res, id) {
  if (!(await dbReady(res))) return;
  const rows = await sql`SELECT * FROM ai_lessons WHERE id = ${id} LIMIT 1;`;
  if (!rows?.[0]) return fail(res, 404, "Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø§Ù„Ø¯Ø±Ø³", "not_found");
  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    await sql`
      UPDATE ai_lessons
      SET title = COALESCE(${body.title == null ? null : cleanDbText(body.title)}, title),
          unit = COALESCE(${body.unit == null ? null : cleanDbText(body.unit)}, unit),
          status = COALESCE(${body.status == null ? null : cleanDbText(body.status, 60)}, status)
      WHERE id = ${id};
    `;
    return send(res, 200, { ok: true });
  }
  if (req.method === "DELETE") {
    const attachmentIds = normalizeAttachmentIdsFromRow(rows[0]);
    await sql`DELETE FROM ai_lessons WHERE id = ${id};`;
    await cleanupUnusedAttachments(attachmentIds);
    return send(res, 200, { ok: true, deletedAttachmentIdsChecked: attachmentIds });
  }
  return fail(res, 405, "Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø·Ù„Ø¨ ØºÙŠØ± Ù…Ø¯Ø¹ÙˆÙ…Ø©", "method_not_allowed");
}

export default async function handler(req, res) {
  try {
    const path = String(req.query?.path || req.query?.route || "");
    if (req.method === "GET" && path === "/api/lessons") return await listData(res);
    if (req.method === "POST" && path === "/api/lessons/single") return await saveSingle(req, res);
    if (req.method === "POST" && path === "/api/lessons/multi") return await saveMulti(req, res);
    if (req.method === "POST" && path === "/api/gemini/generate") return await generateGemini(req, res);
    if (req.method === "POST" && path === "/api/attachments/extract-text") return await refreshAttachmentText(req, res);
    if (req.method === "GET" && path === "/api/export") return await listData(res);
    const match = path.match(/^\/api\/lessons\/(\d+)$/);
    if (match) return await updateOrDeleteLesson(req, res, Number(match[1]));
    return fail(res, 404, "Ø§Ù„Ù…Ø³Ø§Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯", "not_found");
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return fail(res, status, String(error?.message || "Ø­Ø¯Ø« Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…"), error?.error || "server_error");
  }
}












