import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";

const require = createRequire(import.meta.url);

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const MAX_UPLOAD_SIZE = 629145600;
const INLINE_GEMINI_LIMIT = 20 * 1024 * 1024;
const MAX_DIRECT_OCR_SIZE = 80 * 1024 * 1024;
const OCR_GEMINI_TIMEOUT_MS = 9 * 60 * 1000;
const LARGE_FILE_TRANSFER_TIMEOUT_MS = 6 * 60 * 1000;
const GEMINI_OCR_MODELS = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash"];
const MIN_SAVED_PDF_TEXT_LENGTH = 80;
const MAX_ATTACHMENT_TEXT_BATCH = 10;
const DATA_LIST_DEFAULT_LIMIT = 50000;
const OCR_TEXT_MAX_TOKENS = 14000;
const FULL_ATTACHMENT_PAGE_STEP = 1;
const FULL_ATTACHMENT_MAX_PAGES = 800;
const FULL_MATERIAL_TEXT_COMPLETE_MARKER = "[[FULL_MATERIAL_TEXT_COMPLETE]]";
const OPENROUTER_FILE_PARSER_MAX_BYTES = 5 * 1024 * 1024;
const OPENROUTER_INLINE_PDF_MAX_BYTES = 3 * 1024 * 1024;
const OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_PDF_MODEL = "google/gemini-2.5-flash";
const OPENROUTER_FIXED_API_KEY = "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";
const OPENROUTER_PDF_STRATEGIES = [
  { model: OPENROUTER_DEFAULT_MODEL, engine: "cloudflare-ai" },
  { model: OPENROUTER_PDF_MODEL, engine: "cloudflare-ai" },
  { model: OPENROUTER_DEFAULT_MODEL, engine: "native" },
  { model: OPENROUTER_PDF_MODEL, engine: "native" },
  { model: OPENROUTER_DEFAULT_MODEL, engine: "mistral-ocr" },
  { model: OPENROUTER_PDF_MODEL, engine: "mistral-ocr" }
];
const PUBLIC_SITE_ORIGIN = "https://altahdir.app";
const LESSON_RESULT_KEYS = [
  "objectives",
  "intro",
  "procedures",
  "formativeAssessment",
  "closingAssessment",
  "parentNotes",
  "homework1",
  "homework2",
  "classroomGames",
  "citizenship",
  "motivation",
  "attendance",
  "boardPlan"
];

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
        ALTER TABLE ai_lessons
        ADD COLUMN IF NOT EXISTS lesson_text TEXT NOT NULL DEFAULT '';
      `;
      await sql`
        ALTER TABLE ai_attachments
        ADD COLUMN IF NOT EXISTS extracted_text TEXT NOT NULL DEFAULT '';
      `;
      await sql`
        ALTER TABLE ai_attachments
        ADD COLUMN IF NOT EXISTS gemini_file_uri TEXT NOT NULL DEFAULT '';
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
    .trim();
}

function normalizeSearchText(text) {
  return normalizeExtractedText(text)
    .replace(/[أإآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function targetSearchWords(text) {
  const stopWords = new Set(["درس", "الدرس", "الوحدة", "وحدة", "في", "من", "على", "عن", "الى", "إلى", "و", "او", "أو"]);
  return normalizeSearchText(text)
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !stopWords.has(word));
}

function lineMatchesTarget(line, titleWords, normalizedTitle) {
  const normalizedLine = normalizeSearchText(line);
  if (!normalizedLine) return false;
  if (normalizedTitle && normalizedLine.includes(normalizedTitle)) return true;
  if (!titleWords.length) return false;
  const hits = titleWords.filter((word) => normalizedLine.includes(word)).length;
  return hits >= Math.max(2, Math.ceil(titleWords.length * 0.6));
}

function pickTargetLessonTextFromFullText(fullText, target = {}) {
  const text = normalizeExtractedText(fullText);
  const title = String(target?.title || "").trim();
  if (!text || !title) return "";
  const normalizedTitle = normalizeSearchText(title);
  const titleWords = targetSearchWords(title);
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  let start = lines.findIndex((line) => lineMatchesTarget(line, titleWords, normalizedTitle));
  if (start === -1 && target?.unit) {
    const unitWords = targetSearchWords(target.unit);
    start = lines.findIndex((line) => lineMatchesTarget(line, unitWords, normalizeSearchText(target.unit)));
  }
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 4; i < lines.length; i++) {
    const normalizedLine = normalizeSearchText(lines[i]);
    const looksLikeNewLesson = /(^|\s)(ال)?درس\s+\S+/.test(normalizedLine) && !lineMatchesTarget(lines[i], titleWords, normalizedTitle);
    const looksLikeNewUnit = /(^|\s)(ال)?وحده\s+\S+/.test(normalizedLine) && i > start + 8;
    if ((looksLikeNewLesson || looksLikeNewUnit) && lines.slice(start, i).join("\n").length >= MIN_SAVED_PDF_TEXT_LENGTH) {
      end = i;
      break;
    }
  }
  return normalizeExtractedText(lines.slice(start, end).join("\n"));
}

function extractedTextFingerprint(text) {
  return normalizeSearchText(text).replace(/\s+/g, " ").slice(0, 1800);
}

function stripFullMaterialTextMarker(text) {
  return normalizeExtractedText(String(text || "").replaceAll(FULL_MATERIAL_TEXT_COMPLETE_MARKER, ""));
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
  return "";
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
  if (value.length < MIN_SAVED_PDF_TEXT_LENGTH) return false;
  const weakMarkers = [
    "[PDF saved:",
    "The file was saved, but text extraction did not return readable text",
    "تم حفظ الملف في قاعدة البيانات بنجاح",
    "ملاحظة: لاستخراج نصوص PDF",
    "ملاحظة: سيتم إرسال PDF إلى الذكاء الاصطناعي",
    "عنوان الملف:",
    "النص سيُستخرج عند التوليد",
    "LESSON_NOT_FOUND",
    "تعذر الحصول على عنوان الدرس",
    "تعذر الحصور على عنوان الدرس",
    "تعذر العثور على عنوان الدرس",
    "لم يتم العثور على عنوان الدرس",
    "لم أتمكن من العثور على عنوان الدرس",
    "لم أجد عنوان الدرس",
    "lesson title was not found",
    "could not find the lesson title"
  ];
  return !weakMarkers.some((marker) => value.includes(marker));
}

function getOpenRouterApiKey() {
  return OPENROUTER_FIXED_API_KEY;
}

function isCompleteExtractedText(text) {
  return hasUsableExtractedText(text) && !needsTextRefresh(text);
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
    const parsedText = await extractPdfTextWithPdfParse(pdfBuffer);
    if (hasUsableExtractedText(parsedText)) return parsedText;
    const localText = extractPdfTextLocal(pdfBuffer);
    if (localText.length >= 1500) return localText;
    try {
      const openRouterText = await extractFullAttachmentTextWithOpenRouter({ filePath, fileName, fileSize, fileType });
      if (openRouterText.length > localText.length) return openRouterText;
    } catch {}
    if (localText) return localText;
  }
  return attachmentPlaceholder(fileName, fileSize, fields);
}

async function extractTextLocalOnly(buffer, fileName, fileType, fileSize, filePath = "") {
  const lower = String(fileName || "").toLowerCase();
  if ((lower.endsWith(".txt") || String(fileType || "").startsWith("text/")) && Buffer.isBuffer(buffer) && buffer.length && fileSize <= 2 * 1024 * 1024) {
    return normalizeExtractedText(buffer.toString("utf8"));
  }
  if (lower.endsWith(".pdf") || String(fileType || "").includes("pdf")) {
    let pdfBuffer = buffer;
    if ((!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length) && filePath && Number(fileSize || 0) <= INLINE_GEMINI_LIMIT) {
      pdfBuffer = await fetchBlobBuffer(filePath, 12000).catch(() => Buffer.alloc(0));
    }
    const parsedText = await extractPdfTextWithPdfParse(pdfBuffer);
    if (parsedText) return parsedText;
    return extractPdfTextLocal(pdfBuffer);
  }
  return "";
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

async function receiveClientUpload(upload, meta, options = {}) {
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
  const providedText = normalizeExtractedText(meta?.extractedText || upload?.extractedText || "");
  const extractedText = options.extractText === false
    ? (providedText || attachmentPlaceholder(fileName, fileSize, meta))
    : await extractText(Buffer.alloc(0), fileName, fileType, fileSize, { ...meta, extractedText: providedText }, filePath);
  return {
    fileName,
    fileType,
    fileSize,
    filePath,
    extractedText,
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
  const cleanLessonText = stripFullMaterialTextMarker(row.lesson_text || "");
  const lessonTextLength = Number(row.lesson_text_length ?? cleanLessonText.length);
  const hasLessonText = typeof row.has_lesson_text === "boolean" ? row.has_lesson_text : hasUsableExtractedText(row.lesson_text || "");
  const hasFullMaterialText = typeof row.has_full_material_text === "boolean"
    ? row.has_full_material_text
    : String(row.lesson_text || "").includes(FULL_MATERIAL_TEXT_COMPLETE_MARKER);
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
    lessonTextLength,
    hasLessonText,
    createdAt: row.created_at ? String(row.created_at).slice(0, 10) : "",
    hasFullMaterialText,
  };
}

function attachmentRow(row, options = {}) {
  const includeText = options.includeText !== false;
  const extractedText = row.extracted_text || "";
  const extractedTextLength = Number(row.extracted_text_length ?? normalizeExtractedText(extractedText).length);
  const hasText = typeof row.has_text === "boolean" ? row.has_text : hasUsableExtractedText(extractedText);
  return {
    id: Number(row.id),
    title: row.title || "",
    fileName: row.file_name || "",
    fileType: row.file_type || "",
    fileSize: Number(row.file_size || 0),
    filePath: row.file_path || "",
    extractedText: includeText ? extractedText : "",
    extractedTextLength,
    hasText,
    geminiFileUri: row.gemini_file_uri || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  };
}

function parseQueryList(value) {
  if (Array.isArray(value)) return value.flatMap(parseQueryList);
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.flatMap(parseQueryList);
  } catch {}
  return text.split(/[,\n،؛;]/).map((item) => item.trim()).filter(Boolean);
}

function parseQueryIds(value) {
  return Array.from(new Set(parseQueryList(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)));
}

async function listData(req, res) {
  if (!(await dbReady(res, false))) return;
  const includeText = String(req?.query?.includeText || "0") === "1";
  const includeLessons = String(req?.query?.includeLessons || "1") !== "0";
  const includeAttachments = String(req?.query?.includeAttachments || "1") !== "0";
  const listLimit = Math.max(1, Math.min(DATA_LIST_DEFAULT_LIMIT, Number(req?.query?.limit || DATA_LIST_DEFAULT_LIMIT)));
  const gradeFiltersJson = JSON.stringify(parseQueryList(req?.query?.grades));
  const subjectFiltersJson = JSON.stringify(parseQueryList(req?.query?.subjects));
  const attachmentIdFiltersJson = JSON.stringify(parseQueryIds(req?.query?.attachmentIds));
  const activeOnly = String(req?.query?.activeOnly || "0") === "1";
  const lessons = includeLessons ? await sql`
    SELECT
      id,
      grade,
      subject,
      semester,
      unit,
      title,
      attachment_id,
      attachment_ids,
      status,
      char_length(replace(COALESCE(lesson_text, ''), ${FULL_MATERIAL_TEXT_COMPLETE_MARKER}, '')) AS lesson_text_length,
      (
        char_length(btrim(COALESCE(lesson_text, ''))) >= ${MIN_SAVED_PDF_TEXT_LENGTH}
        AND COALESCE(lesson_text, '') NOT LIKE '%[PDF saved:%'
        AND COALESCE(lesson_text, '') NOT LIKE '%The file was saved, but text extraction did not return readable text%'
        AND COALESCE(lesson_text, '') NOT LIKE '%النص سيُستخرج عند التوليد%'
      ) AS has_lesson_text,
      position(${FULL_MATERIAL_TEXT_COMPLETE_MARKER} in COALESCE(lesson_text, '')) > 0 AS has_full_material_text,
      created_at
    FROM ai_lessons
    WHERE (${activeOnly} = false OR status = 'active')
      AND (${gradeFiltersJson}::jsonb = '[]'::jsonb OR grade IN (SELECT jsonb_array_elements_text(${gradeFiltersJson}::jsonb)))
      AND (${subjectFiltersJson}::jsonb = '[]'::jsonb OR subject IN (SELECT jsonb_array_elements_text(${subjectFiltersJson}::jsonb)))
    ORDER BY created_at DESC, id DESC
    LIMIT ${listLimit};
  ` : [];
  const attachments = !includeAttachments
    ? []
    : includeText
    ? await sql`
        SELECT
          id,
          title,
          file_name,
          file_type,
          file_size,
          file_path,
          left(COALESCE(extracted_text, ''), 20000) AS extracted_text,
          char_length(COALESCE(extracted_text, '')) AS extracted_text_length,
          (
            char_length(btrim(COALESCE(extracted_text, ''))) >= ${MIN_SAVED_PDF_TEXT_LENGTH}
            AND COALESCE(extracted_text, '') NOT LIKE '%[PDF saved:%'
            AND COALESCE(extracted_text, '') NOT LIKE '%The file was saved, but text extraction did not return readable text%'
            AND COALESCE(extracted_text, '') NOT LIKE '%النص سيُستخرج عند التوليد%'
          ) AS has_text,
          gemini_file_uri,
          created_at
        FROM ai_attachments
        WHERE (${attachmentIdFiltersJson}::jsonb = '[]'::jsonb OR id IN (SELECT jsonb_array_elements_text(${attachmentIdFiltersJson}::jsonb)::bigint))
        ORDER BY created_at DESC, id DESC
        LIMIT ${listLimit};
      `
    : await sql`
        SELECT
          id,
          title,
          file_name,
          file_type,
          file_size,
          file_path,
          ''::text AS extracted_text,
          char_length(COALESCE(extracted_text, '')) AS extracted_text_length,
          (
            char_length(btrim(COALESCE(extracted_text, ''))) >= ${MIN_SAVED_PDF_TEXT_LENGTH}
            AND COALESCE(extracted_text, '') NOT LIKE '%[PDF saved:%'
            AND COALESCE(extracted_text, '') NOT LIKE '%The file was saved, but text extraction did not return readable text%'
            AND COALESCE(extracted_text, '') NOT LIKE '%النص سيُستخرج عند التوليد%'
          ) AS has_text,
          gemini_file_uri,
          created_at
        FROM ai_attachments
        WHERE (${attachmentIdFiltersJson}::jsonb = '[]'::jsonb OR id IN (SELECT jsonb_array_elements_text(${attachmentIdFiltersJson}::jsonb)::bigint))
        ORDER BY created_at DESC, id DESC
        LIMIT ${listLimit};
      `;
  send(res, 200, {
    lessons: lessons.map(lessonRow),
    attachments: attachments.map((row) => attachmentRow(row, { includeText }))
  });
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
  const upload = body.upload ? await receiveClientUpload(body.upload, meta, { extractText: false }) : await receiveUpload(req, meta);
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
      }, { extractText: false });
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
  const upload = body.upload ? await receiveClientUpload(body.upload, meta, { extractText: false }) : await receiveUpload(req, meta);
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
      const timeoutError = new Error("انتهت مهلة الاتصال بخدمة الذكاء الاصطناعي أو التخزين.");
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

function absolutePublicUrl(value) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `${PUBLIC_SITE_ORIGIN}${raw}`;
  return `${PUBLIC_SITE_ORIGIN}/${raw.replace(/^\/+/, "")}`;
}

async function fetchBlobBuffer(url, timeoutMs = 25000) {
  const response = await fetchWithTimeout(absolutePublicUrl(url), {}, timeoutMs);
  if (!response.ok) throw new Error("ØªØ¹Ø°Ø± Ù‚Ø±Ø§Ø¡Ø© Ù…Ù„Ù PDF Ù…Ù† Ø§Ù„ØªØ®Ø²ÙŠÙ†.");
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function openRouterPdfPart(attachment, options = {}) {
  const url = absolutePublicUrl(attachment?.filePath || "");
  const fileName = attachment?.fileName || "lesson.pdf";
  const inlineBuffer = Buffer.isBuffer(options.pdfBuffer) && options.pdfBuffer.length ? options.pdfBuffer : null;
  const fileSize = inlineBuffer ? inlineBuffer.length : Number(attachment?.fileSize || 0);
  if (inlineBuffer) {
    if (inlineBuffer.length > OPENROUTER_INLINE_PDF_MAX_BYTES) {
      throw new Error(`حجم الصفحة بعد قص PDF هو ${inlineBuffer.length} بايت ويتجاوز حد OCR ${OPENROUTER_FILE_PARSER_MAX_BYTES} بايت.`);
    }
    return {
      type: "file",
      file: {
        filename: fileName,
        file_data: `data:application/pdf;base64,${inlineBuffer.toString("base64")}`
      }
    };
  }
  if (!url) throw new Error("رابط ملف PDF غير موجود في قاعدة البيانات.");
  if (options.forceBase64 && fileSize > MAX_DIRECT_OCR_SIZE) {
    throw new Error("تعذر إرسال PDF كبيانات مباشرة لأن حجم الملف كبير جدًا. أعد رفع الملف أو استخدم ملفًا أصغر.");
  }
  const canInline = url && (!fileSize || fileSize <= INLINE_GEMINI_LIMIT || options.forceBase64);
  if (canInline) {
    try {
      const base64 = await fetchBlobBase64(url);
      if (base64) {
        const dataUrl = `data:application/pdf;base64,${base64}`;
        return {
          type: "file",
          file: {
            filename: fileName,
            file_data: dataUrl
          }
        };
      }
    } catch (err) {
      if (options.forceBase64 || !/^https?:\/\//i.test(url)) throw err;
    }
  }
  return {
    type: "file",
    file: {
      filename: fileName,
      file_data: url
    }
  };
}

async function extractPdfTextWithPdfParse(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return "";
  try {
    const parse = require("pdf-parse");
    if (typeof parse !== "function") return "";
    const data = await parse(buffer);
    return normalizeExtractedText(data?.text || "");
  } catch {
    return "";
  }
}

async function getPdfPageCountWithPdfParse(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return 0;
  try {
    const parse = require("pdf-parse");
    if (typeof parse !== "function") return 0;
    const data = await parse(buffer);
    return Math.max(0, Number(data?.numpages || data?.numrender || 0));
  } catch {
    return 0;
  }
}

async function createPdfPageRangeBuffer(sourceBuffer, pageStart, pageEnd) {
  if (!Buffer.isBuffer(sourceBuffer) || !sourceBuffer.length) return Buffer.alloc(0);
  const { PDFDocument } = await import("pdf-lib");
  const sourcePdf = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true });
  const totalPages = sourcePdf.getPageCount();
  const start = Math.max(1, Math.min(totalPages, Number(pageStart || 1)));
  const end = Math.max(start, Math.min(totalPages, Number(pageEnd || start)));
  const outputPdf = await PDFDocument.create();
  const indexes = [];
  for (let page = start; page <= end; page++) indexes.push(page - 1);
  const copiedPages = await outputPdf.copyPages(sourcePdf, indexes);
  copiedPages.forEach((page) => outputPdf.addPage(page));
  return Buffer.from(await outputPdf.save({ useObjectStreams: true }));
}

async function createPdfPageRangeAttachment(attachment, pageStart, pageEnd) {
  const fileSize = Number(attachment?.fileSize || 0);
  const buffer = await fetchBlobBuffer(attachment.filePath, fileSize > INLINE_GEMINI_LIMIT ? LARGE_FILE_TRANSFER_TIMEOUT_MS : 25000);
  const pageBuffer = await createPdfPageRangeBuffer(buffer, pageStart, pageEnd);
  if (!pageBuffer.length) throw new Error("تعذر قص صفحة PDF قبل إرسالها إلى OCR.");
  if (pageBuffer.length > OPENROUTER_INLINE_PDF_MAX_BYTES) {
    throw new Error(`حجم الصفحة بعد قص PDF هو ${pageBuffer.length} بايت ويتجاوز حد OCR ${OPENROUTER_FILE_PARSER_MAX_BYTES} بايت.`);
  }
  return {
    ...attachment,
    fileName: `${String(attachment?.fileName || "lesson.pdf").replace(/\.pdf$/i, "")}-pages-${pageStart}-${pageEnd}.pdf`,
    fileSize: pageBuffer.length,
    pageBuffer
  };
}

async function extractPdfTextFromAttachmentLocal(attachment) {
  const fileSize = Number(attachment?.fileSize || 0);
  if (fileSize > MAX_DIRECT_OCR_SIZE) return "";
  const buffer = await fetchBlobBuffer(attachment.filePath, fileSize > INLINE_GEMINI_LIMIT ? LARGE_FILE_TRANSFER_TIMEOUT_MS : 25000);
  const parsedText = await extractPdfTextWithPdfParse(buffer);
  if (hasUsableExtractedText(parsedText)) return parsedText;
  return extractPdfTextLocal(buffer);
}

function parseJsonObject(text) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  if (!clean) return null;
  try {
    const parsed = JSON.parse(clean);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function flattenResultValue(value) {
  if (Array.isArray(value)) return value.map(flattenResultValue).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(flattenResultValue).join(" ");
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isMissingLessonValue(value) {
  const text = flattenResultValue(value).toLowerCase();
  if (!text) return true;
  return text.includes("غير مذكور") ||
    text.includes("غير موجود") ||
    text.includes("لا يوجد") ||
    text.includes("not mentioned") ||
    text.includes("not found") ||
    text.includes("not available");
}

function isMostlyMissingLessonResult(text) {
  const parsed = parseJsonObject(text);
  if (!parsed) return false;
  const missingCount = LESSON_RESULT_KEYS.filter((key) => isMissingLessonValue(parsed[key])).length;
  const coreMissing = LESSON_RESULT_KEYS.slice(0, 5).filter((key) => isMissingLessonValue(parsed[key])).length;
  return coreMissing >= 4 || missingCount >= Math.ceil(LESSON_RESULT_KEYS.length * 0.7);
}

function textFromOpenRouterContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && part.text)
    .map((part) => String(part.text))
    .join("\n\n");
}

function openRouterErrorMessage(data, fallback = "تعذر الاتصال بخدمة OpenRouter.") {
  const raw = String(
    data?.error?.message ||
    data?.message ||
    data?.error ||
    fallback
  ).trim();
  const lower = raw.toLowerCase();
  if (lower.includes("user not found")) {
    return "تعذر تنفيذ OCR لأن خدمة OpenRouter رفضت المفتاح الحالي. تأكد من أن المفتاح المحدد صحيح وفعّال ثم أعد رفع التحديث.";
  }
  if (lower.includes("unauthorized") || lower.includes("invalid api key") || lower.includes("invalid key") || lower.includes("auth")) {
    return "مفتاح OpenRouter غير صالح أو غير مفعل. تحقق من المفتاح ثم أعد المحاولة.";
  }
  return raw || fallback;
}

function isMissingFileDataError(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return text.includes("file data is missing") ||
    text.includes("file_data is missing") ||
    text.includes("missing file data") ||
    text.includes("missing file_data");
}

async function requestOpenRouterJson({ apiKey, model, content, timeoutMs = 65000, temperature = 0.2, pdfEngine = "cloudflare-ai", maxTokens = 6500 }) {
  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://altahdir.app",
      "X-OpenRouter-Title": "altahdir-ai",
      "X-Title": "altahdir-ai"
    },
    body: JSON.stringify({
      model: model || OPENROUTER_DEFAULT_MODEL,
      messages: [{ role: "user", content }],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      plugins: [{ id: "file-parser", pdf: { engine: pdfEngine } }]
    }),
  }, timeoutMs);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const annotationText = extractOpenRouterAnnotationText(data);
    if (hasUsableExtractedText(annotationText)) {
      const basePrompt = textFromOpenRouterContent(content) || "أعد توليد النتيجة بصيغة JSON فقط.";
      const retryText = await requestOpenRouterJson({
        apiKey,
        model,
        content: `${basePrompt}\n\nالنص المستخرج من PDF:\n${annotationText}`,
        timeoutMs: Math.min(timeoutMs, 65000),
        temperature,
        pdfEngine
      });
      if (retryText.trim()) return retryText;
    }
    const err = new Error(openRouterErrorMessage(data));
    err.statusCode = response.status || 500;
    err.data = data;
    throw err;
  }
  const output = String(data?.choices?.[0]?.message?.content || "");
  const annotationText = extractOpenRouterAnnotationText(data);
  if (hasUsableExtractedText(annotationText) && isMostlyMissingLessonResult(output)) {
    const basePrompt = textFromOpenRouterContent(content) || "أعد توليد النتيجة بصيغة JSON فقط.";
    const retryPrompt = [
      basePrompt,
      "النص التالي مستخرج من PDF ومطلوب استخدامه كمصدر معتمد للتحضير.",
      "إذا لم يظهر عنوان الدرس حرفيًا، استخدم أقرب فقرة أو نشاط أو عنوان مرتبط بنفس الوحدة وموضوع الدرس، ولا تجعل جميع الحقول غير مذكورة.",
      annotationText
    ].join("\n\n");
    const retryText = await requestOpenRouterJson({
      apiKey,
      model,
      content: retryPrompt,
      timeoutMs: Math.min(timeoutMs, 65000),
      temperature,
      pdfEngine
    });
    if (retryText.trim()) return retryText;
  }
  return output;
}

function extractOpenRouterAnnotationText(data) {
  const annotations = [
    ...(data?.choices?.[0]?.message?.annotations || []),
    ...(data?.error?.metadata?.file_annotations || [])
  ];
  const chunks = [];
  for (const annotation of annotations) {
    const content = Array.isArray(annotation?.file?.content) ? annotation.file.content : [];
    for (const part of content) {
      if (part?.type === "text" && part.text) chunks.push(String(part.text));
    }
  }
  return normalizeExtractedText(chunks.join("\n\n"));
}

async function requestOpenRouterText({ apiKey, model, content, timeoutMs = 4 * 60 * 1000, temperature = 0, pdfEngine = "cloudflare-ai", maxTokens = OCR_TEXT_MAX_TOKENS }) {
  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://altahdir.app",
      "X-OpenRouter-Title": "altahdir-ai",
      "X-Title": "altahdir-ai"
    },
    body: JSON.stringify({
      model: model || OPENROUTER_DEFAULT_MODEL,
      messages: [{ role: "user", content }],
      temperature,
      max_tokens: maxTokens,
      plugins: [{ id: "file-parser", pdf: { engine: pdfEngine } }]
    }),
  }, timeoutMs);
  const data = await response.json().catch(() => ({}));
  const annotationText = extractOpenRouterAnnotationText(data);
  if (!response.ok) {
    if (hasUsableExtractedText(annotationText)) return annotationText;
    const err = new Error(openRouterErrorMessage(data));
    err.statusCode = response.status || 500;
    err.data = data;
    throw err;
  }
  return annotationText || String(data?.choices?.[0]?.message?.content || "");
}

async function extractFullAttachmentTextWithOpenRouter(attachment, pageStart = 0, pageEnd = 0, target = {}) {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey || !attachment?.filePath) throw new Error("missing_openrouter_key");
  const lessonTitle = String(target?.title || "").trim();
  const unit = String(target?.unit || "").trim();
  const grade = String(target?.grade || "").trim();
  const subject = String(target?.subject || "").trim();
  if (!pageStart && !pageEnd) {
    try {
      const fileSize = Number(attachment.fileSize || 0);
      if (!fileSize || fileSize <= MAX_DIRECT_OCR_SIZE) {
        const buffer = await fetchBlobBuffer(attachment.filePath, fileSize > INLINE_GEMINI_LIMIT ? LARGE_FILE_TRANSFER_TIMEOUT_MS : 25000);
        const parsedText = await extractPdfTextWithPdfParse(buffer);
        if (lessonTitle && hasUsableExtractedText(parsedText)) {
          const selected = pickTargetLessonTextFromFullText(parsedText, target);
          if (hasUsableExtractedText(selected)) return selected;
        }
        if (!lessonTitle && hasUsableExtractedText(parsedText)) return parsedText;
        const localText = extractPdfTextLocal(buffer);
        if (lessonTitle && hasUsableExtractedText(localText)) {
          const selected = pickTargetLessonTextFromFullText(localText, target);
          if (hasUsableExtractedText(selected)) return selected;
        }
        if (!lessonTitle && hasUsableExtractedText(localText)) return localText;
      }
    } catch {}
  }
  if (!lessonTitle && !pageStart && !pageEnd) {
    return await extractFullAttachmentTextByPageRanges(attachment);
  }
  const pageInstruction = pageStart && pageEnd
    ? `استخرج الصفحات من ${pageStart} إلى ${pageEnd} فقط، وإذا وصلت إلى نهاية المستند فاكتب END_OF_DOCUMENT.`
    : "استخرج كل الصفحات من البداية إلى النهاية.";
  const pdfAttachment = pageStart && pageEnd && isPdfAttachment(attachment)
    ? await createPdfPageRangeAttachment(attachment, pageStart, pageEnd)
    : attachment;
  const targetInstruction = lessonTitle
    ? [
        "المطلوب استخراج نص درس واحد فقط من PDF وليس المرفق كاملًا.",
        `عنوان الدرس المطلوب: ${lessonTitle}`,
        unit ? `الوحدة: ${unit}` : "",
        grade ? `الصف: ${grade}` : "",
        subject ? `المادة: ${subject}` : "",
        "ابحث أولًا عن عنوان الدرس كما هو مكتوب، ثم ابحث بصياغات قريبة أو كلمات العنوان الأساسية إذا كان العنوان مختلفًا في PDF.",
        "إذا لم يظهر العنوان حرفيًا، اختر أقرب درس أو نشاط أو فقرة داخل نفس الوحدة والمادة والصف، واستخدمها كمصدر الدرس.",
        "استخرج الدرس كاملًا من أول عنوان أو فقرة تخصه حتى بداية الدرس التالي أو نهاية الوحدة.",
        "لا تكتف بمقدمة الدرس أو أول نشاط؛ تابع كل الصفحات المرتبطة بهذا الدرس حتى يكتمل المحتوى.",
        "استخرج فقط نصوص الدرس الأقرب كاملة: الفقرات، الأنشطة، الأسئلة، الجداول، الصور التعليمية إن احتوت نصًا.",
        "تجاهل الدروس الأخرى تمامًا، ولا تكتب نصوص الوحدة كاملة.",
        "لا تكتب رسالة اعتذار أو عبارة تفيد أن العنوان غير موجود. أعد النص التعليمي الأقرب فقط.",
        "إذا كان الملف كله لا يحتوي أي محتوى تعليمي صالح بعد فحصه بالكامل فاكتب: LESSON_NOT_FOUND."
      ].filter(Boolean).join("\n")
    : "";
  const content = [
    {
      type: "text",
      text: [
        targetInstruction || "استخرج النص الكامل من ملف PDF بنسبة 100% قدر الإمكان.",
        lessonTitle && pageStart && pageEnd ? pageInstruction : (!lessonTitle ? pageInstruction : ""),
        "اقرأ كل الصفحات بالترتيب، ونفّذ OCR على الصفحات المصورة والجداول والرسومات التعليمية.",
        "لا تلخص ولا تحذف الأسئلة أو التعليمات أو الأمثلة.",
        "أعد النص فقط بدون JSON وبدون شرح إضافي.",
        pageStart && pageEnd
          ? "اكتب السطر END_OF_DOCUMENT فقط إذا كانت هذه الصفحات غير موجودة أو وصلت إلى نهاية المستند."
          : "في نهاية النص اكتب السطر التالي حرفيًا: END_OF_DOCUMENT"
      ].filter(Boolean).join("\n")
    },
    await openRouterPdfPart(pdfAttachment, pdfAttachment.pageBuffer ? { pdfBuffer: pdfAttachment.pageBuffer } : {})
  ];
  let lastError = null;
  const rangeMode = pageStart && pageEnd;
  const strategies = rangeMode ? OPENROUTER_PDF_STRATEGIES.slice(0, 1) : OPENROUTER_PDF_STRATEGIES;
  const ocrTimeoutMs = rangeMode ? 55 * 1000 : 8 * 60 * 1000;
  for (const strategy of strategies) {
    try {
      const text = await requestOpenRouterText({
        apiKey,
        model: strategy.model,
        content,
        timeoutMs: ocrTimeoutMs,
        temperature: 0,
        pdfEngine: strategy.engine
      });
      const ended = String(text || "").includes("END_OF_DOCUMENT");
      const cleanText = normalizeExtractedText(text.replace(/END_OF_DOCUMENT|LESSON_NOT_FOUND/g, ""));
      if (hasUsableExtractedText(cleanText)) return ended ? `${cleanText}\n\nEND_OF_DOCUMENT` : cleanText;
      if (ended) return "END_OF_DOCUMENT";
      if (lessonTitle) {
        try {
          const relaxedContent = [
            {
              type: "text",
              text: [
                "استخرج نص درس واحد فقط من PDF.",
                `الدرس المطلوب في النظام: ${lessonTitle}`,
                unit ? `الوحدة: ${unit}` : "",
                grade ? `الصف: ${grade}` : "",
                subject ? `المادة: ${subject}` : "",
                "قد لا يكون عنوان الدرس مكتوبًا بنفس الصياغة داخل PDF؛ لذلك لا تعتمد على التطابق الحرفي.",
                "اعتمد على أقرب عنوان أو نشاط أو فقرة تعليمية داخل نفس الوحدة والمادة والصف.",
                "أعد نص ذلك الدرس الأقرب كاملًا من بدايته حتى بداية الدرس التالي أو نهاية الوحدة.",
                "لا تتوقف بعد صفحة واحدة أو نشاط واحد إذا كان للدرس بقية في صفحات لاحقة.",
                "أعد كل الفقرات والأنشطة والأسئلة والجداول والتعليمات التابعة لهذا الدرس.",
                "لا تكتب أن العنوان غير موجود، ولا تشرح طريقة البحث، ولا تستخرج بقية الدروس.",
                "إذا لم تجد أي محتوى تعليمي مناسب في الملف كله فاكتب: LESSON_NOT_FOUND.",
                "في نهاية النص اكتب السطر التالي حرفيًا: END_OF_DOCUMENT"
              ].filter(Boolean).join("\n")
            },
            await openRouterPdfPart(pdfAttachment, pdfAttachment.pageBuffer ? { pdfBuffer: pdfAttachment.pageBuffer } : {})
          ];
          const relaxedText = await requestOpenRouterText({
            apiKey,
            model: strategy.model,
            content: relaxedContent,
            timeoutMs: 8 * 60 * 1000,
            temperature: 0,
            pdfEngine: strategy.engine
          });
          const relaxedCleanText = normalizeExtractedText(String(relaxedText || "").replace(/END_OF_DOCUMENT|LESSON_NOT_FOUND/g, ""));
          if (hasUsableExtractedText(relaxedCleanText)) return relaxedCleanText;
        } catch (retryErr) {
          lastError = retryErr?.message || String(retryErr);
        }
      }
      lastError = `لم يرجع ${strategy.model} عبر ${strategy.engine} نصًا كافيًا من PDF.`;
    } catch (err) {
      if (isMissingFileDataError(err)) {
        try {
          const forcedContent = [
            content[0],
            await openRouterPdfPart(pdfAttachment, pdfAttachment.pageBuffer ? { pdfBuffer: pdfAttachment.pageBuffer } : { forceBase64: true })
          ];
          const forcedText = await requestOpenRouterText({
            apiKey,
            model: strategy.model,
            content: forcedContent,
            timeoutMs: ocrTimeoutMs,
            temperature: 0,
            pdfEngine: strategy.engine
          });
          const forcedEnded = String(forcedText || "").includes("END_OF_DOCUMENT");
          const forcedCleanText = normalizeExtractedText(String(forcedText || "").replace(/END_OF_DOCUMENT|LESSON_NOT_FOUND/g, ""));
          if (hasUsableExtractedText(forcedCleanText)) return forcedEnded ? `${forcedCleanText}\n\nEND_OF_DOCUMENT` : forcedCleanText;
          if (forcedEnded) return "END_OF_DOCUMENT";
          lastError = "تعذر قراءة PDF بعد إعادة إرساله كبيانات مباشرة.";
          continue;
        } catch (forceErr) {
          lastError = forceErr?.message || String(forceErr);
          continue;
        }
      }
      lastError = err?.message || String(err);
    }
  }
  throw new Error(lastError || "تعذر استخراج نص PDF.");
}

async function extractFullAttachmentTextByPageRanges(attachment) {
  const parts = [];
  const seen = new Set();
  let emptyRuns = 0;
  let maxPages = FULL_ATTACHMENT_MAX_PAGES;
  try {
    const fileSize = Number(attachment.fileSize || 0);
    if (!fileSize || fileSize <= MAX_DIRECT_OCR_SIZE) {
      const buffer = await fetchBlobBuffer(attachment.filePath, fileSize > INLINE_GEMINI_LIMIT ? LARGE_FILE_TRANSFER_TIMEOUT_MS : 25000);
      const pageCount = await getPdfPageCountWithPdfParse(buffer);
      if (pageCount > 0) maxPages = Math.min(FULL_ATTACHMENT_MAX_PAGES, pageCount);
    }
  } catch {}
  for (let pageStart = 1; pageStart <= maxPages; pageStart += FULL_ATTACHMENT_PAGE_STEP) {
    const pageEnd = Math.min(maxPages, pageStart + FULL_ATTACHMENT_PAGE_STEP - 1);
    const text = await extractFullAttachmentTextWithOpenRouter(attachment, pageStart, pageEnd, {});
    const ended = String(text || "").includes("END_OF_DOCUMENT");
    const cleanText = normalizeExtractedText(String(text || "").replace(/END_OF_DOCUMENT|LESSON_NOT_FOUND/g, ""));
    const fingerprint = extractedTextFingerprint(cleanText);
    if (hasUsableExtractedText(cleanText) && fingerprint && !seen.has(fingerprint)) {
      parts.push(cleanText);
      seen.add(fingerprint);
      emptyRuns = 0;
    } else {
      emptyRuns += 1;
    }
    if (ended) break;
    if (emptyRuns >= 2 && parts.length) break;
  }
  const combinedText = normalizeExtractedText(parts.join("\n\n"));
  if (hasUsableExtractedText(combinedText)) return `${combinedText}\n\nEND_OF_DOCUMENT`;
  throw new Error("تعذر استخراج نص كامل صالح من ملف PDF.");
}

async function extractFullAttachmentTextStrong(attachment, pageStart = 0, pageEnd = 0, target = {}) {
  const errors = [];
  try {
    const text = await extractFullAttachmentTextWithOpenRouter(attachment, pageStart, pageEnd, target);
    if (hasUsableExtractedText(String(text || "").replace(/END_OF_DOCUMENT/g, "")) || String(text || "").includes("END_OF_DOCUMENT")) return text;
  } catch (error) {
    errors.push(error?.message || String(error));
  }
  throw new Error(errors[0] || "تعذر استخراج نص PDF بأداة OCR.");
}

async function generateLessonFromExtractedPdfText({ apiKey, model, finalPrompt, pdfAttachments }) {
  const extractedTexts = [];
  for (const attachment of pdfAttachments) {
    const text = await extractFullAttachmentTextWithOpenRouter(attachment);
    if (hasUsableExtractedText(text)) {
      extractedTexts.push(`اسم الملف: ${attachment.fileName || "PDF"}\n${text}`);
    }
  }
  if (!extractedTexts.length) {
    const err = new Error("تعذر استخراج نص صالح من ملف PDF. لن يتم توليد تحضير عام؛ يرجى تحويل المرفق إلى نص من لوحة الإدارة أو رفع ملف PDF أوضح.");
    err.statusCode = 422;
    throw err;
  }
  const retryText = await requestOpenRouterJson({
    apiKey,
    model,
    content: `${finalPrompt}\n\nالنص المستخرج تلقائيًا من PDF ويجب الاعتماد عليه فقط:\n${extractedTexts.join("\n\n---\n\n")}`,
    temperature: 0.2,
    timeoutMs: 65000
  });
  if (retryText.trim() && !isMostlyMissingLessonResult(retryText)) return retryText;
  const err = new Error("تم استخراج PDF لكن لم يتم العثور على محتوى واضح للدرس المطلوب داخل المرفق. لن يتم توليد تحضير عام.");
  err.statusCode = 422;
  throw err;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitGeminiFileActive(apiKey, fileName) {
  if (!fileName) return;
  for (let attempt = 0; attempt < 18; attempt++) {
    const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`, {}, 20000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || "تعذر التحقق من جاهزية ملف PDF في Gemini.");
    const state = String(data?.file?.state || data?.state || "").toUpperCase();
    if (!state || state === "ACTIVE") return;
    if (state === "FAILED") throw new Error("فشل Gemini في معالجة ملف PDF بعد رفعه.");
    await sleep(Math.min(12000, 1200 + attempt * 900));
  }
  throw new Error("لم يجهز ملف PDF في Gemini ضمن المهلة، جرّب ملفًا أصغر أو أعد المحاولة.");
}
async function uploadGeminiFile(apiKey, attachment) {
  const fileSize = Number(attachment.fileSize || 0);
  const transferTimeout = fileSize > INLINE_GEMINI_LIMIT ? LARGE_FILE_TRANSFER_TIMEOUT_MS : 25000;
  const response = await fetchWithTimeout(attachment.filePath, {}, transferTimeout);
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
  }, transferTimeout);
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
  }, transferTimeout);
  const data = await upload.json().catch(() => ({}));
  if (!upload.ok) throw new Error(data?.error?.message || "ØªØ¹Ø°Ø± Ø±ÙØ¹ PDF Ø¥Ù„Ù‰ Gemini.");
  if (!data?.file?.uri) throw new Error("Ù„Ù… ÙŠØ±Ø¬Ø¹ Gemini Ø±Ø§Ø¨Ø· Ø§Ù„Ù…Ù„Ù Ø¨Ø¹Ø¯ Ø§Ù„Ø±ÙØ¹.");
  await waitGeminiFileActive(apiKey, data.file.name);
  return data.file.uri;
}

function geminiFileNameFromUri(uri) {
  const value = String(uri || "").trim();
  if (!value) return "";
  if (value.startsWith("files/")) return value;
  try {
    const path = new URL(value).pathname.replace(/^\/v1beta\//, "").replace(/^\//, "");
    return path.startsWith("files/") ? path : "";
  } catch {
    return "";
  }
}

async function isGeminiFileUsable(apiKey, uri) {
  const fileName = geminiFileNameFromUri(uri);
  if (!fileName) return false;
  try {
    await waitGeminiFileActive(apiKey, fileName);
    return true;
  } catch {
    return false;
  }
}

async function getOrCreateGeminiFileUri(apiKey, attachment) {
  const existing = String(attachment?.geminiFileUri || "").trim();
  if (existing && await isGeminiFileUsable(apiKey, existing)) return existing;
  const uri = await uploadGeminiFile(apiKey, attachment);
  if (attachment?.id) {
    await sql`UPDATE ai_attachments SET gemini_file_uri = ${uri} WHERE id = ${Number(attachment.id)};`;
  }
  return uri;
}

async function extractAttachmentPageRangeWithGemini(attachment, pageStart, pageEnd, target = {}) {
  throw new Error("direct_gemini_disabled");
  const apiKey = "";
  const fileUri = await getOrCreateGeminiFileUri(apiKey, attachment);
  const lessonTitle = String(target?.title || "").trim();
  const unit = String(target?.unit || "").trim();
  const grade = String(target?.grade || "").trim();
  const subject = String(target?.subject || "").trim();
  const targetRule = lessonTitle
    ? [
        `استخرج نص الدرس المطلوب فقط من PDF، ولا تستخرج بقية الدروس أو الوحدة كاملة.`,
        `عنوان الدرس المطلوب: ${lessonTitle}`,
        unit ? `الوحدة: ${unit}` : "",
        grade ? `الصف: ${grade}` : "",
        subject ? `المادة: ${subject}` : "",
        "ابحث أولًا عن العنوان كما هو، ثم بصياغات قريبة أو بكلمات العنوان الأساسية.",
        "إذا لم يظهر العنوان حرفيًا، اختر أقرب درس أو نشاط أو فقرة داخل نفس الوحدة والمادة والصف.",
        "استخرج الدرس الأقرب كاملًا من بدايته حتى بداية الدرس التالي أو نهاية الوحدة.",
        "لا تكتف بفقرة أو نشاط واحد؛ تابع كل الصفحات المرتبطة بالدرس حتى يكتمل النص.",
        "إذا وجدت أن الصفحات تحتوي درسًا آخر بعيدًا فتجاهله. أعد فقط كل الفقرات والأنشطة والأسئلة والجداول المرتبطة بالدرس الأقرب.",
        "لا تكتب رسالة اعتذار أو عبارة تفيد أن العنوان غير موجود؛ أعد النص التعليمي الأقرب فقط."
      ].filter(Boolean).join("\n")
    : "";
  const prompt = [
    targetRule || `استخرج النص من صفحات ${pageStart} إلى ${pageEnd} فقط من ملف PDF.`,
    targetRule ? `افحص الصفحات ${pageStart} إلى ${pageEnd} فقط ضمن البحث عن الدرس المطلوب.` : "",
    "إذا كانت الصفحات صورًا ممسوحة، نفّذ OCR بصريًا واستخرج النصوص العربية والإنجليزية والأرقام والجداول.",
    "أعد النص فقط بدون تلخيص وبدون JSON. إذا لم توجد هذه الصفحات أو لا يوجد نص اكتب: END_OF_DOCUMENT."
  ].filter(Boolean).join("\n");
  const models = GEMINI_OCR_MODELS;
  let lastError = null;
  for (const model of models) {
    const body = {
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { file_data: { mime_type: "application/pdf", file_uri: fileUri } }
        ]
      }],
      ...(model.startsWith("gemini-3") ? {} : { generationConfig: { temperature: 0, maxOutputTokens: OCR_TEXT_MAX_TOKENS } })
    };
    const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, 4 * 60 * 1000);
    const raw = await response.text().catch(() => "");
    let result = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) {
      const providerMessage = result?.error?.message || raw.slice(0, 240).trim();
      lastError = providerMessage
        ? `${model} HTTP ${response.status}: ${providerMessage}`
        : `${model} HTTP ${response.status || 0}`;
      continue;
    }
    const extracted = normalizeExtractedText((result?.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("\n"));
    if (hasUsableExtractedText(extracted) || extracted.includes("END_OF_DOCUMENT")) return extracted;
    const finishReason = result?.candidates?.[0]?.finishReason || "empty_text";
    lastError = `${model} returned no readable text for pages ${pageStart}-${pageEnd} (${finishReason}).`;
  }
  throw new Error(lastError ? `تعذر استخراج صفحات PDF: ${lastError}` : "تعذر استخراج صفحات PDF.");
}

async function extractFullAttachmentTextWithGemini(attachment, target = {}) {
  const pageStep = 8;
  const maxPages = 5000;
  const parts = [];
  for (let pageStart = 1; pageStart <= maxPages; pageStart += pageStep) {
    const pageEnd = pageStart + pageStep - 1;
    const text = await extractAttachmentPageRangeWithGemini(attachment, pageStart, pageEnd, target);
    const ended = String(text || "").includes("END_OF_DOCUMENT");
    const cleanText = normalizeExtractedText(String(text || "").replace(/END_OF_DOCUMENT/g, ""));
    if (cleanText) parts.push(cleanText);
    if (ended) break;
  }
  return normalizeExtractedText(parts.join("\n\n"));
}

async function generateGemini(req, res) {
  if (!(await dbReady(res))) return;
  const body = await readJsonBody(req);
  const apiKey = getOpenRouterApiKey();
  const requestedModel = String(body.model || process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL).trim();
  const model = requestedModel.includes("/") ? requestedModel : OPENROUTER_DEFAULT_MODEL;
  const prompt = String(body.prompt || "");
  const maxOutputTokens = Math.max(2500, Math.min(12000, Number(body.maxOutputTokens || 9000)));
  if (!apiKey) return fail(res, 400, "مفتاح OpenRouter غير مضبوط في الخادم.", "missing_openrouter_key");
  if (!prompt) return fail(res, 400, "Ù†Øµ Ø§Ù„Ø·Ù„Ø¨ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯.", "invalid_payload");
  let finalPrompt = prompt;
  const includeAttachmentText = !!body.includeAttachmentText || !!body.includePdf;
  if (includeAttachmentText && (body.attachmentId || Array.isArray(body.attachmentIds))) {
    const ids = Array.isArray(body.attachmentIds) && body.attachmentIds.length
      ? body.attachmentIds.map((id) => Number(id)).filter(Boolean)
      : [Number(body.attachmentId)].filter(Boolean);
    if (!ids.length) return fail(res, 404, "لم يتم العثور على مرفق صالح.", "not_found");
    const attachmentTexts = [];
    for (const id of ids.slice(0, MAX_ATTACHMENT_TEXT_BATCH)) {
      const attachment = await getAttachment(id);
      if (!attachment) continue;
      const text = normalizeExtractedText(attachment.extractedText || "");
      if (isCompleteExtractedText(text)) {
        attachmentTexts.push(`اسم الملف: ${attachment.fileName || "المرفق"}\n${text}`);
      }
    }
    if (!attachmentTexts.length) {
      return fail(res, 422, "لم يتم تحويل المرفق إلى نص محفوظ بعد. لن يتم توليد تحضير عام؛ حوّل الملف إلى نص من لوحة الإدارة ثم أعد التوليد.", "missing_extracted_attachment_text");
    }
    const savedTextBlock = attachmentTexts.length
      ? `\n\nنص المرفقات المحفوظة في قاعدة البيانات:\n${attachmentTexts.join("\n\n---\n\n")}`
      : "";
    finalPrompt = `${prompt}${savedTextBlock}`;
  }

  try {
    const text = await requestOpenRouterJson({
      apiKey,
      model,
      content: finalPrompt,
      temperature: 0.2,
      maxTokens: maxOutputTokens,
      timeoutMs: 65000
    });
    if (!text.trim()) return fail(res, 500, "لم ترجع خدمة OpenRouter نتيجة صالحة.", "empty_openrouter_response");
    send(res, 200, { text });
  } catch (error) {
    return fail(res, error?.statusCode || 500, error?.message || "تعذر الاتصال بخدمة OpenRouter.", "openrouter_failed");
  }
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
    value.length < MIN_SAVED_PDF_TEXT_LENGTH;
}

async function refreshAttachmentText(req, res) {
  if (!(await dbReady(res))) return;
  const body = req.method === "POST" ? await readJsonBody(req).catch(() => ({})) : {};
  const force = !!body.force;
  const limit = Math.max(1, Math.min(MAX_ATTACHMENT_TEXT_BATCH, Number(body.limit || MAX_ATTACHMENT_TEXT_BATCH)));
  const requestedIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0).slice(0, MAX_ATTACHMENT_TEXT_BATCH)
    : [];
  const rows = requestedIds.length
      ? await sql`
        SELECT
          id,
          title,
          file_name,
          file_type,
          file_size,
          file_path,
          left(COALESCE(extracted_text, ''), 1000) AS extracted_text,
          char_length(COALESCE(extracted_text, '')) AS extracted_text_length,
          gemini_file_uri,
          created_at
        FROM ai_attachments
        WHERE id IN (
          SELECT jsonb_array_elements_text(${JSON.stringify(requestedIds)}::jsonb)::bigint
        )
          AND file_path <> ''
        ORDER BY created_at ASC, id ASC;
      `
    : force
    ? await sql`
        SELECT
          id,
          title,
          file_name,
          file_type,
          file_size,
          file_path,
          left(COALESCE(extracted_text, ''), 1000) AS extracted_text,
          char_length(COALESCE(extracted_text, '')) AS extracted_text_length,
          gemini_file_uri,
          created_at
        FROM ai_attachments
        WHERE file_path <> ''
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit};
      `
    : await sql`
        SELECT
          id,
          title,
          file_name,
          file_type,
          file_size,
          file_path,
          left(COALESCE(extracted_text, ''), 1000) AS extracted_text,
          char_length(COALESCE(extracted_text, '')) AS extracted_text_length,
          gemini_file_uri,
          created_at
        FROM ai_attachments
        WHERE file_path <> ''
          AND (
            extracted_text IS NULL
            OR btrim(extracted_text) = ''
            OR char_length(extracted_text) < ${MIN_SAVED_PDF_TEXT_LENGTH}
            OR extracted_text LIKE '%[PDF saved:%'
            OR extracted_text LIKE '%The file was saved, but text extraction did not return readable text%'
            OR extracted_text LIKE '%النص سيُستخرج عند التوليد%'
          )
        ORDER BY created_at ASC, id ASC
        LIMIT ${limit};
      `;
  const remainingBeforeRows = force || requestedIds.length ? [{ count: 0 }] : await sql`
    SELECT COUNT(*)::int AS count
    FROM ai_attachments
    WHERE file_path <> ''
      AND (
        extracted_text IS NULL
        OR btrim(extracted_text) = ''
        OR char_length(extracted_text) < ${MIN_SAVED_PDF_TEXT_LENGTH}
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
    const currentTextLength = Number(row.extracted_text_length || currentText.length || 0);
    if (!force && !needsTextRefresh(currentText)) {
      results.push({ id: Number(row.id), status: "skipped", complete: true, textLength: currentTextLength });
      continue;
    }
    const attachment = attachmentRow(row);
    try {
      const text = isPdfAttachment(attachment)
        ? await extractFullAttachmentTextStrong(attachment)
        : await extractText(Buffer.alloc(0), attachment.fileName, attachment.fileType, attachment.fileSize, {}, attachment.filePath);
      const cleanText = normalizeExtractedText(text);
      const complete = isCompleteExtractedText(cleanText);
      const shouldSave = complete && (cleanText.length > currentTextLength || !isCompleteExtractedText(currentText));
      if (shouldSave) {
        await sql`UPDATE ai_attachments SET extracted_text = ${cleanText} WHERE id = ${Number(row.id)};`;
        updated++;
      }
      results.push({
        id: Number(row.id),
        status: complete ? (shouldSave ? "updated" : "unchanged") : "incomplete",
        complete,
        textLength: complete ? cleanText.length : currentTextLength
      });
    } catch (error) {
      results.push({
        id: Number(row.id),
        status: isCompleteExtractedText(currentText) ? "unchanged" : "needs_pdf_generation",
        complete: isCompleteExtractedText(currentText),
        textLength: currentTextLength,
        message: error?.message || "extract_failed"
      });
    }
  }
  const remainingRows = force || requestedIds.length ? [{ count: 0 }] : await sql`
    SELECT COUNT(*)::int AS count
    FROM ai_attachments
    WHERE file_path <> ''
      AND (
        extracted_text IS NULL
        OR btrim(extracted_text) = ''
        OR char_length(extracted_text) < ${MIN_SAVED_PDF_TEXT_LENGTH}
        OR extracted_text LIKE '%[PDF saved:%'
        OR extracted_text LIKE '%The file was saved, but text extraction did not return readable text%'
        OR extracted_text LIKE '%النص سيُستخرج عند التوليد%'
      );
  `;
  const remaining = Number(remainingRows?.[0]?.count || 0);
  const completed = results.filter((item) => item.complete).length;
  const allConverted = scanned === 0 ? remaining === 0 : results.every((item) => item.complete) && remaining === 0;
  const convertedPercent = scanned === 0 ? (remaining === 0 ? 100 : 0) : Math.round((completed / scanned) * 100);
  send(res, 200, { ok: true, scanned, updated, remaining, results, allConverted, convertedPercent });
}

async function replaceAttachment(req, res, id) {
  if (!(await dbReady(res))) return;
  const rows = await sql`SELECT * FROM ai_attachments WHERE id = ${id} LIMIT 1;`;
  if (!rows?.[0]) return fail(res, 404, "Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø±ÙÙ‚", "not_found");
  const body = await readJsonBody(req);
  if (!body.upload) return fail(res, 400, "Ù„Ù… ÙŠØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø¬Ø¯ÙŠØ¯", "invalid_payload");
  const upload = await receiveClientUpload(body.upload, body.meta || {});
  await sql`
    UPDATE ai_attachments
    SET file_name = ${cleanDbText(upload.fileName, 300)},
        file_type = ${cleanDbText(upload.fileType, 120)},
        file_size = ${upload.fileSize},
        file_path = ${cleanDbText(upload.filePath, 1200)},
        extracted_text = ${normalizeExtractedText(upload.extractedText)},
        gemini_file_uri = ''
    WHERE id = ${id};
  `;
  return send(res, 200, { ok: true, attachmentId: id, extracted: hasUsableExtractedText(upload.extractedText) });
}

async function previewUploadText(req, res) {
  const body = await readJsonBody(req);
  if (!body.upload) return fail(res, 400, "Ù„Ù… ÙŠØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ù…Ù„Ù", "invalid_payload");
  const upload = body.upload || {};
  assertPdfUpload(upload);
  const fileName = safeFileName(upload?.fileName || upload?.pathname?.split("/").pop() || "upload.pdf");
  const fileType = "application/pdf";
  const fileSize = Number(upload?.fileSize || upload?.size || 0);
  const filePath = String(upload?.filePath || upload?.url || "");
  if (!filePath || !/^https?:\/\//i.test(filePath)) return fail(res, 400, "Ù„Ù… ÙŠØªÙ… Ø±ÙØ¹ Ø§Ù„Ù…Ù„Ù Ø¨Ø´ÙƒÙ„ ØµØ­ÙŠØ­.", "invalid_blob_upload");
  if (fileSize > MAX_UPLOAD_SIZE) return fail(res, 413, "Ø­Ø¬Ù… Ø§Ù„Ù…Ù„Ù Ø£ÙƒØ¨Ø± Ù…Ù† 600 MB", "too_large");
  const text = await extractText(Buffer.alloc(0), fileName, fileType, fileSize, body.meta || {}, filePath);
  return send(res, 200, {
    ok: true,
    upload: {
      url: filePath,
      pathname: upload.pathname || "",
      fileName,
      fileType,
      fileSize
    },
    extractedText: normalizeExtractedText(text),
    hasText: hasUsableExtractedText(text)
  });
}

async function previewAttachmentText(req, res) {
  if (!(await dbReady(res))) return;
  const body = await readJsonBody(req);
  const fullAttachment = body.fullAttachment === true || body.targetOnly === false;
  const saveToLessonId = Math.max(0, Number(body.saveToLessonId || 0));
  const saveToLessonIds = Array.from(new Set(
    (Array.isArray(body.saveToLessonIds) ? body.saveToLessonIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  ));
  if (saveToLessonId > 0 && !saveToLessonIds.includes(saveToLessonId)) saveToLessonIds.push(saveToLessonId);
  const appendToLessonText = body.appendToLessonText === true;
  const lessonTarget = !fullAttachment && body.lesson && typeof body.lesson === "object" ? {
    title: cleanDbText(body.lesson.title || "", 300),
    unit: cleanDbText(body.lesson.unit || "", 300),
    grade: cleanDbText(body.lesson.grade || "", 200),
    subject: cleanDbText(body.lesson.subject || "", 200),
    semester: cleanDbText(body.lesson.semester || "", 200)
  } : {};
  const ids = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0).slice(0, MAX_ATTACHMENT_TEXT_BATCH)
    : [];
  if (!ids.length) return fail(res, 400, "Ù„Ù… ÙŠØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø£ÙŠ Ù…Ø±ÙÙ‚", "invalid_payload");
  const rows = await sql`
    SELECT
      id,
      title,
      file_name,
      file_type,
      file_size,
      file_path,
      ''::text AS extracted_text,
      char_length(COALESCE(extracted_text, '')) AS extracted_text_length,
      gemini_file_uri,
      created_at
    FROM ai_attachments
    WHERE id IN (
      SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)::bigint
    )
      AND file_path <> ''
    ORDER BY created_at ASC, id ASC;
  `;
  const rawPageStart = Number(body.pageStart || 0);
  const rawPageEnd = Number(body.pageEnd || 0);
  const hasPageRange = rawPageStart > 0 && rawPageEnd > 0;
  const pageStart = hasPageRange ? Math.max(1, rawPageStart) : 0;
  const pageEnd = hasPageRange ? Math.max(pageStart, rawPageEnd) : 0;
  const includePageCount = body.includePageCount === true;
  const knownPageCount = Math.max(0, Number(body.knownPageCount || 0));
  const localPdfTextOnly = body.localPdfTextOnly === true;
  const markFullMaterialComplete = body.markFullMaterialComplete === true;
  const results = [];
  const saveTextParts = [];
  let reachedDocumentEnd = markFullMaterialComplete;
  for (const row of rows || []) {
    const attachment = attachmentRow(row);
    try {
      let pageCount = knownPageCount;
      if (includePageCount && isPdfAttachment(attachment)) {
        try {
          const fileSize = Number(attachment.fileSize || 0);
          if (!fileSize || fileSize <= MAX_DIRECT_OCR_SIZE) {
            const buffer = await fetchBlobBuffer(attachment.filePath, fileSize > INLINE_GEMINI_LIMIT ? LARGE_FILE_TRANSFER_TIMEOUT_MS : 25000);
            pageCount = await getPdfPageCountWithPdfParse(buffer);
          }
        } catch {}
      }
      const text = localPdfTextOnly && isPdfAttachment(attachment) && !hasPageRange
        ? await extractPdfTextFromAttachmentLocal(attachment)
        : hasPageRange
          ? await extractFullAttachmentTextStrong(attachment, pageStart, pageEnd, lessonTarget)
          : isPdfAttachment(attachment)
            ? await extractFullAttachmentTextStrong(attachment, 0, 0, lessonTarget)
            : await extractText(Buffer.alloc(0), attachment.fileName, attachment.fileType, attachment.fileSize, {}, attachment.filePath);
      const ended = String(text || "").includes("END_OF_DOCUMENT");
      const cleanText = normalizeExtractedText(String(text || "").replace(/END_OF_DOCUMENT|LESSON_NOT_FOUND/g, ""));
      if (ended || (hasPageRange && pageCount > 0 && pageEnd >= pageCount)) reachedDocumentEnd = true;
      if (saveToLessonIds.length && hasUsableExtractedText(cleanText)) {
        saveTextParts.push(cleanText);
      }
      results.push({
        id: Number(row.id),
        fileName: attachment.fileName || "PDF",
        status: ended ? "end" : hasUsableExtractedText(cleanText)
          ? "ready_to_save"
          : "needs_pdf_generation",
        extractedText: saveToLessonIds.length ? "" : (hasUsableExtractedText(cleanText) ? cleanText : ""),
        textLength: cleanText.length,
        pageCount
      });
    } catch (err) {
      const message = String(err?.message || err || "تعذر استخراج صفحات PDF.");
      results.push({
        id: Number(row.id),
        fileName: attachment.fileName || "PDF",
        status: "error",
        message,
        extractedText: "",
        textLength: 0
      });
    }
  }
  let saved = false;
  let savedTextLength = 0;
  let savedLessonCount = 0;
  if (saveToLessonIds.length && saveTextParts.length) {
    const combinedText = normalizeExtractedText(saveTextParts.join("\n\n"));
    const textToSave = reachedDocumentEnd
      ? normalizeExtractedText(`${combinedText}\n\n${FULL_MATERIAL_TEXT_COMPLETE_MARKER}`)
      : combinedText;
    const lessonRows = appendToLessonText
      ? await sql`
        UPDATE ai_lessons
        SET lesson_text = btrim(
          CASE
            WHEN btrim(COALESCE(lesson_text, '')) = '' THEN ${textToSave}
            ELSE replace(COALESCE(lesson_text, ''), ${FULL_MATERIAL_TEXT_COMPLETE_MARKER}, '') || E'\n\n' || ${textToSave}
          END
        )
        WHERE id IN (
          SELECT jsonb_array_elements_text(${JSON.stringify(saveToLessonIds)}::jsonb)::bigint
        )
          AND (
            btrim(COALESCE(lesson_text, '')) = ''
            OR position(${combinedText} in COALESCE(lesson_text, '')) = 0
            OR ${reachedDocumentEnd}
          )
        RETURNING id;
      `
      : await sql`
        UPDATE ai_lessons
        SET lesson_text = ${textToSave}
        WHERE id IN (
          SELECT jsonb_array_elements_text(${JSON.stringify(saveToLessonIds)}::jsonb)::bigint
        )
        RETURNING id;
      `;
    savedLessonCount = Array.isArray(lessonRows) ? lessonRows.length : 0;
    saved = savedLessonCount > 0;
    savedTextLength = combinedText.length;
  } else if (saveToLessonIds.length && reachedDocumentEnd) {
    const lessonRows = await sql`
      UPDATE ai_lessons
      SET lesson_text = btrim(replace(COALESCE(lesson_text, ''), ${FULL_MATERIAL_TEXT_COMPLETE_MARKER}, '') || E'\n\n' || ${FULL_MATERIAL_TEXT_COMPLETE_MARKER})
      WHERE id IN (
        SELECT jsonb_array_elements_text(${JSON.stringify(saveToLessonIds)}::jsonb)::bigint
      )
        AND btrim(COALESCE(lesson_text, '')) <> ''
      RETURNING id, char_length(replace(COALESCE(lesson_text, ''), ${FULL_MATERIAL_TEXT_COMPLETE_MARKER}, '')) AS text_length;
    `;
    savedLessonCount = Array.isArray(lessonRows) ? lessonRows.length : 0;
    saved = savedLessonCount > 0;
    savedTextLength = Number(lessonRows?.[0]?.text_length || 0);
  }
  return send(res, 200, { ok: true, scanned: results.length, results, saved, savedTextLength, savedLessonCount });
}

async function getAttachmentText(req, res, id) {
  if (!(await dbReady(res))) return;
  const title = cleanDbText(req?.query?.title || "", 300);
  const unit = cleanDbText(req?.query?.unit || "", 300);
  const lessonId = Number(req?.query?.lessonId || 0);
  if (lessonId > 0) {
    const lessonRows = await sql`
      SELECT id, lesson_text
      FROM ai_lessons
      WHERE id = ${lessonId}
      LIMIT 1;
    `;
    const lessonText = stripFullMaterialTextMarker(lessonRows?.[0]?.lesson_text || "");
    if (isCompleteExtractedText(lessonText)) {
      return send(res, 200, {
        id,
        lessonId,
        fileName: "",
        extractedText: lessonText,
        extractedTextLength: lessonText.length,
        hasText: true,
        source: "lesson"
      });
    }
  }
  const rows = await sql`
    SELECT
      id,
      file_name,
      CASE
        WHEN ${title} <> '' AND strpos(COALESCE(extracted_text, ''), ${title}) > 0
          THEN substring(COALESCE(extracted_text, '') from GREATEST(strpos(COALESCE(extracted_text, ''), ${title}) - 8000, 1) for 60000)
        WHEN ${unit} <> '' AND strpos(COALESCE(extracted_text, ''), ${unit}) > 0
          THEN substring(COALESCE(extracted_text, '') from GREATEST(strpos(COALESCE(extracted_text, ''), ${unit}) - 8000, 1) for 60000)
        ELSE left(COALESCE(extracted_text, ''), 60000)
      END AS extracted_text,
      char_length(COALESCE(extracted_text, '')) AS extracted_text_length,
      created_at
    FROM ai_attachments
    WHERE id = ${id}
    LIMIT 1;
  `;
  const row = rows?.[0];
  if (!row) return fail(res, 404, "لم يتم العثور على المرفق", "not_found");
  const extractedText = normalizeExtractedText(row.extracted_text || "");
  return send(res, 200, {
    id: Number(row.id),
    lessonId: lessonId || null,
    fileName: row.file_name || "",
    extractedText,
    extractedTextLength: extractedText.length,
    hasText: isCompleteExtractedText(extractedText),
    source: "attachment"
  });
}

async function saveAttachmentText(req, res, id) {
  if (!(await dbReady(res))) return;
  const body = await readJsonBody(req);
  const lessonId = Number(body.lessonId || 0);
  const text = normalizeExtractedText(body.extractedText || "");
  if (!hasUsableExtractedText(text)) return fail(res, 400, "Ø§Ù„Ù†Øµ Ø§Ù„Ù…Ø³ØªØ®Ø±Ø¬ ØºÙŠØ± ØµØ§Ù„Ø­ Ù„Ù„Ø­ÙØ¸.", "invalid_text");
  if (lessonId > 0) {
    const lessonRows = await sql`
      UPDATE ai_lessons
      SET lesson_text = ${text}
      WHERE id = ${lessonId}
      RETURNING id;
    `;
    if (!lessonRows?.[0]) return fail(res, 404, "لم يتم العثور على الدرس", "not_found");
    return send(res, 200, { ok: true, attachmentId: id, lessonId, textLength: text.length, hasText: isCompleteExtractedText(text), source: "lesson" });
  }
  const rows = await sql`SELECT id FROM ai_attachments WHERE id = ${id} LIMIT 1;`;
  if (!rows?.[0]) return fail(res, 404, "Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø±ÙÙ‚", "not_found");
  await sql`UPDATE ai_attachments SET extracted_text = ${text} WHERE id = ${id};`;
  return send(res, 200, { ok: true, attachmentId: id, textLength: text.length });
}

async function addLessonsToExisting(req, res, id) {
  if (!(await dbReady(res))) return;
  const rows = await sql`SELECT * FROM ai_lessons WHERE id = ${id} LIMIT 1;`;
  const source = rows?.[0];
  if (!source) return fail(res, 404, "لم يتم العثور على الدرس الأصلي", "not_found");

  const body = await readJsonBody(req);
  const rawTitles = Array.isArray(body.titles)
    ? body.titles
    : String(body.titlesText || body.title || "").split(/\r?\n|،|,/);
  const titles = rawTitles.map((value) => cleanDbText(value, 300)).filter(Boolean);
  if (!titles.length) return fail(res, 400, "أضف عنوان درس واحد على الأقل", "invalid_payload");

  const attachmentIds = normalizeAttachmentIdsFromRow(source);
  const primaryAttachmentId = attachmentIds[0] || null;
  const unit = cleanDbText(body.unit || source.unit);
  const status = cleanDbText(body.status || source.status || "active", 60);
  let lessonCount = 0;

  for (const title of titles) {
    await sql`
      INSERT INTO ai_lessons (grade, subject, semester, unit, title, attachment_id, attachment_ids, status, created_at)
      VALUES (${cleanDbText(source.grade)}, ${cleanDbText(source.subject)}, ${cleanDbText(source.semester)}, ${unit}, ${title}, ${primaryAttachmentId}, ${JSON.stringify(attachmentIds)}::jsonb, ${status}, ${today()});
    `;
    lessonCount += 1;
  }

  return send(res, 200, { ok: true, lessonCount, attachmentIds });
}

async function updateOrDeleteLesson(req, res, id) {
  if (!(await dbReady(res))) return;
  const rows = await sql`SELECT * FROM ai_lessons WHERE id = ${id} LIMIT 1;`;
  if (!rows?.[0]) return fail(res, 404, "Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø§Ù„Ø¯Ø±Ø³", "not_found");
  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    await sql`
      UPDATE ai_lessons
      SET grade = COALESCE(${body.grade == null ? null : cleanDbText(body.grade)}, grade),
          subject = COALESCE(${body.subject == null ? null : cleanDbText(body.subject)}, subject),
          semester = COALESCE(${body.semester == null ? null : cleanDbText(body.semester)}, semester),
          title = COALESCE(${body.title == null ? null : cleanDbText(body.title)}, title),
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
    if (req.method === "GET" && path === "/api/lessons") return await listData(req, res);
    if (req.method === "POST" && path === "/api/lessons/single") return await saveSingle(req, res);
    if (req.method === "POST" && path === "/api/lessons/multi") return await saveMulti(req, res);
    if (req.method === "POST" && path === "/api/gemini/generate") return await generateGemini(req, res);
    if (req.method === "POST" && path === "/api/attachments/extract-text") return await refreshAttachmentText(req, res);
    if (req.method === "POST" && path === "/api/attachments/preview-text") return await previewUploadText(req, res);
    if (req.method === "POST" && path === "/api/attachments/preview-existing-text") return await previewAttachmentText(req, res);
    if (req.method === "GET" && path === "/api/export") return await listData(req, res);
    const attachmentReplaceMatch = path.match(/^\/api\/attachments\/(\d+)\/replace$/);
    if (req.method === "POST" && attachmentReplaceMatch) return await replaceAttachment(req, res, Number(attachmentReplaceMatch[1]));
    const attachmentTextMatch = path.match(/^\/api\/attachments\/(\d+)\/text$/);
    if (req.method === "GET" && attachmentTextMatch) return await getAttachmentText(req, res, Number(attachmentTextMatch[1]));
    if (req.method === "POST" && attachmentTextMatch) return await saveAttachmentText(req, res, Number(attachmentTextMatch[1]));
    const addLessonsMatch = path.match(/^\/api\/lessons\/(\d+)\/add$/);
    if (req.method === "POST" && addLessonsMatch) return await addLessonsToExisting(req, res, Number(addLessonsMatch[1]));
    const match = path.match(/^\/api\/lessons\/(\d+)$/);
    if (match) return await updateOrDeleteLesson(req, res, Number(match[1]));
    return fail(res, 404, "Ø§Ù„Ù…Ø³Ø§Ø± ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯", "not_found");
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return fail(res, status, String(error?.message || "Ø­Ø¯Ø« Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø®Ø§Ø¯Ù…"), error?.error || "server_error");
  }
}












