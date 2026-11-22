import { isTeacherSessionOrigin, readTeacherSession } from "../enjazy/server_api/_lib/teacher-session.js";
import { readPreparationSubscription } from "./subscriptions.js";

const maxBytes = 2 * 1024 * 1024;

function googleExportUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  let input;
  try { input = new URL(value); } catch { return null; }
  if (input.origin !== "https://docs.google.com" || input.username || input.password) return null;

  const normal = /^\/spreadsheets(?:\/u\/\d+)?\/d\/([\w-]+)(?:\/|$)/.exec(input.pathname);
  const published = /^\/spreadsheets\/d\/e\/([\w-]+)(?:\/|$)/.exec(input.pathname);
  if (!published && (!normal || normal[1] === "e")) return null;
  const output = published
    ? new URL(`https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv&single=true`)
    : new URL(`https://docs.google.com/spreadsheets/d/${normal[1]}/export?format=csv`);
  const gid = input.searchParams.get("gid") ?? new URLSearchParams(input.hash.slice(1)).get("gid");
  if (/^\d{1,12}$/.test(gid ?? "")) output.searchParams.set("gid", gid);
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
  try { if (typeof body === "string" || Buffer.isBuffer(body)) body = JSON.parse(String(body)); }
  catch { return fail(400, "invalid_sheet_url"); }
  const url = googleExportUrl(body?.url);
  if (!url) return fail(400, "invalid_sheet_url");

  try {
    const response = await fetchGoogleCsv(url);
    const contentType = response?.headers.get("content-type")?.split(";")[0].trim();
    if (!response?.ok || !response.body || !["text/csv", "application/csv", "application/octet-stream"].includes(contentType)) {
      await response?.body?.cancel();
      return fail(422, "sheet_not_accessible");
    }

    const bytes = await readCsvBytes(response);
    if (!bytes) return fail(413, "sheet_too_large");
    const csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!csv.trim() || /^\s*</.test(csv) || csv.includes("\0")) return fail(422, "sheet_not_accessible");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send(csv);
  } catch {
    return fail(502, "sheet_fetch_unavailable");
  }
}
