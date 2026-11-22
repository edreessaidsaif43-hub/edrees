import { isTeacherSessionOrigin, readTeacherSession } from "../enjazy/server_api/_lib/teacher-session.js";
import { readPreparationSubscription } from "./subscriptions.js";

const maxBytes = 2 * 1024 * 1024;

function googleExportUrl(value) {
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

function isGoogleDownload(url) {
  return url.protocol === "https:" && !url.port && !url.username && !url.password &&
    (url.hostname === "docs.google.com" || url.hostname === "docs.googleusercontent.com" ||
      /^doc-[a-z0-9-]+-sheets\.googleusercontent\.com$/.test(url.hostname));
}

async function fetchGoogleCsv(url) {
  const signal = AbortSignal.timeout(10000);
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { redirect: "manual", signal, headers: { Accept: "text/csv" } });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) return null;
    url = new URL(location, url);
    if (url.origin === "https://accounts.google.com") return { blocked: true };
    if (!isGoogleDownload(url)) return null;
  }
  return null;
}

async function readCsvBytes(response) {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const fail = (status, error) => res.status(status).json({ error });
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(405, "method_not_allowed");
  }
  if (!isTeacherSessionOrigin(req)) return fail(403, "origin_not_allowed");

  try {
    const session = await readTeacherSession(req, res);
    if (!session) return fail(401, "sign_in_required");
    const access = await readPreparationSubscription(session.userId);
    if (access.status !== 200) return fail(access.status, access.error);
  } catch {
    return fail(503, "subscription_check_unavailable");
  }

  let body = req.body;
  try {
    if (body === undefined && req[Symbol.asyncIterator]) {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > 8192) return fail(400, "invalid_request");
        chunks.push(buffer);
      }
      body = Buffer.concat(chunks);
    }
    if (typeof body === "string" || Buffer.isBuffer(body)) {
      if (Buffer.byteLength(body) > 8192) return fail(400, "invalid_request");
      body = JSON.parse(String(body));
    }
  } catch { return fail(400, "invalid_request"); }
  if (typeof body?.url !== "string") return fail(400, "invalid_request");
  const url = googleExportUrl(body?.url);
  if (!url) return fail(400, "invalid_sheet_url");

  try {
    const response = await fetchGoogleCsv(url);
    if (response?.blocked || [401, 403].includes(response?.status)) {
      await response?.body?.cancel();
      return fail(422, "sheet_permission_required");
    }
    if (response?.status === 404 || response?.status === 410) {
      await response.body?.cancel();
      return fail(422, "sheet_or_tab_not_found");
    }
    if (response?.status === 429 || response?.status >= 500) {
      await response.body?.cancel();
      return fail(502, "sheet_fetch_unavailable");
    }
    const contentType = response?.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!response?.ok || !response.body || !["text/csv", "application/csv", "application/octet-stream"].includes(contentType)) {
      await response?.body?.cancel();
      return fail(422, "sheet_not_accessible");
    }

    const bytes = await readCsvBytes(response);
    if (!bytes) return fail(413, "sheet_too_large");
    const csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!csv.trim()) return fail(422, "empty_sheet");
    if (/^\s*</.test(csv) || csv.includes("\0")) return fail(422, "sheet_not_accessible");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send(csv);
  } catch {
    return fail(502, "sheet_fetch_unavailable");
  }
}
