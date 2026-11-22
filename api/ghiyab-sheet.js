import { isTeacherSessionOrigin, readTeacherSession } from "../enjazy/server_api/_lib/teacher-session.js";
import { readPreparationSubscription } from "./subscriptions.js";
import { googleExportUrl, attendanceBinding, linkedSpreadsheet, checkGoogleAttendanceAccess, readPrivateRoster, saveGoogleAttendance } from "./_lib/ghiyab-attendance-google.js";

const maxBytes = 2 * 1024 * 1024;

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

  let ownerId;
  try {
    const session = await readTeacherSession(req, res);
    if (!session) return fail(401, "sign_in_required");
    const access = await readPreparationSubscription(session.userId);
    if (access.status !== 200) return fail(access.status, access.error);
    ownerId = session.userId;
  } catch {
    return fail(503, "subscription_check_unavailable");
  }

  const maxBodyBytes = 2 * 1024 * 1024;
  if (Number(req.headers?.["content-length"]) > maxBodyBytes) return fail(413, "attendance_invalid");
  let body = req.body;
  try {
    if (body === undefined && req[Symbol.asyncIterator]) {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > maxBodyBytes) return fail(413, "attendance_invalid");
        chunks.push(buffer);
      }
      body = Buffer.concat(chunks);
    }
    if (typeof body === "string" || Buffer.isBuffer(body)) {
      if (Buffer.byteLength(body) > maxBodyBytes) return fail(413, "attendance_invalid");
      body = JSON.parse(String(body));
    }
  } catch { return fail(400, "invalid_request"); }
  const action = body?.action || "read";
  if (!["read", "attendance_status", "attendance_save"].includes(action) || typeof body?.url !== "string") {
    return fail(400, "invalid_request");
  }
  const url = googleExportUrl(body.url);
  if (action !== "read") {
    const configuration = attendanceBinding(ownerId, url);
    const linkedId = configuration.spreadsheetId;
    const binding = linkedId ? {accountId:ownerId, spreadsheetId:linkedId} : undefined;
    const details = action === "attendance_status" ? {binding} : {};
    const reason = configuration.reason || (!process.env.GHIYAB_SHEETS_SERVICE_ACCOUNT?.trim() ? "attendance_credentials_unconfigured" : "");
    if (reason) return res.status(200).json({enabled:false, reason, ...details});
    if (action === "attendance_status") {
      try {
        const access = await checkGoogleAttendanceAccess(linkedId);
        return res.status(200).json({enabled:true, ...details, ...access});
      } catch (failure) {
        return res.status(200).json({enabled:false, reason:failure?.code || "attendance_google_unavailable", ...details});
      }
    }
    try {
      return res.status(200).json(await saveGoogleAttendance(linkedId, body.entries));
    } catch (failure) {
      const status = {
        attendance_invalid:400, attendance_sheet_permission:403,
        attendance_tab_conflict:409, attendance_sheet_busy:409
      }[failure?.code] || 503;
      return fail(status, failure?.code || "attendance_google_unavailable");
    }
  }
  if (!url) return fail(400, "invalid_sheet_url");

  const linkedId = linkedSpreadsheet(ownerId, url);
  if (linkedId && process.env.GHIYAB_SHEETS_SERVICE_ACCOUNT) {
    try {
      const csv = await readPrivateRoster(linkedId, url);
      if (Buffer.byteLength(csv) > maxBytes) return fail(413, "sheet_too_large");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      return res.status(200).send(csv);
    } catch (failure) {
      if (failure?.code === "attendance_sheet_permission") return fail(422, "sheet_permission_required");
      if (["empty_sheet", "sheet_or_tab_not_found", "sheet_too_large"].includes(failure?.code)) return fail(422, failure.code);
      return fail(503, "sheet_fetch_unavailable");
    }
  }

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
