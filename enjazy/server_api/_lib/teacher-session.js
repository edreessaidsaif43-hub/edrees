import { createHmac, timingSafeEqual } from "node:crypto";

const cookieName = "altahdir_teacher_session_v1";
const maxAge = 8 * 60 * 60;
const purpose = "altahdir.app:teacher-session:v1";
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
const configuredSecret = process.env.TEACHER_SESSION_SECRET || databaseUrl;
const signingKey = configuredSecret
  ? createHmac("sha256", configuredSecret).update(`${purpose}:key`).digest()
  : null;

export function isTeacherSessionOrigin(req) {
  if (req.headers?.["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return /^https?:$/.test(url.protocol) && url.host.toLowerCase() === String(req.headers?.host || "").toLowerCase();
  } catch {
    return false;
  }
}

function writeCookie(req, res, value, age) {
  const secure = req.headers?.["x-forwarded-proto"] === "https" || req.socket?.encrypted
    || process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? "; Secure" : ""}`);
}

function sign(value) {
  return createHmac("sha256", signingKey).update(`${purpose}:${value}`).digest("base64url");
}

function validId(id) {
  return typeof id === "string" && id.length > 0 && id.length <= 200 && !/[\x00-\x1f\x7f]/.test(id);
}

export function setTeacherSession(req, res, userId) {
  if (!signingKey || !validId(userId) || !isTeacherSessionOrigin(req)) return;
  const iat = Math.floor(Date.now() / 1000);
  const value = Buffer.from(JSON.stringify({ v: 1, id: userId, iat, exp: iat + maxAge })).toString("base64url");
  writeCookie(req, res, `${value}.${sign(value)}`, maxAge);
}

export function clearTeacherSession(req, res) {
  writeCookie(req, res, "", 0);
}

export function readTeacherSession(req) {
  if (!signingKey || !isTeacherSessionOrigin(req)) return null;
  const prefix = `${cookieName}=`;
  const cookie = String(req.headers?.cookie || "").split(";").map(part => part.trim())
    .find(part => part.startsWith(prefix));
  if (!cookie || cookie.length > 1600) return null;
  const match = /^([\w-]+)\.([\w-]{43})$/.exec(cookie.slice(prefix.length));
  if (!match) return null;
  const [, value, signature] = match;
  if (!timingSafeEqual(Buffer.from(sign(value)), Buffer.from(signature))) return null;
  try {
    const { v, id, iat, exp } = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (v !== 1 || !validId(id) || !Number.isInteger(iat) || !Number.isInteger(exp)) return null;
    if (iat > now + 60 || exp <= now || exp - iat !== maxAge) return null;
    return id;
  } catch {
    return null;
  }
}
