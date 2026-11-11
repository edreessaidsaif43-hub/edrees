import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const cookieName = "altahdir_teacher_session_v1";
const legacyMaxAge = 8 * 60 * 60;
const days = 365;
const maxAge = days * 24 * 60 * 60;
const renewWithinDays = days - 30;
const persistentToken = /^v2\.[\w-]{43}$/;
const purpose = "altahdir.app:teacher-session:v1";
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
const configuredSecret = process.env.TEACHER_SESSION_SECRET || databaseUrl;
const signingKey = configuredSecret
  ? createHmac("sha256", configuredSecret).update(`${purpose}:key`).digest()
  : null;
function sessionSql() {
  try { return databaseUrl.trim() ? neon(databaseUrl.trim()) : null; }
  catch { return null; }
}

const sql = sessionSql();
let schemaPromise;

function ensureSessionSchema() {
  if (!sql) throw new Error("Teacher session database is unavailable");
  if (!schemaPromise) {
    schemaPromise = sql`
      CREATE TABLE IF NOT EXISTS teacher_login_sessions (
        token_hash TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL REFERENCES teacher_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        credential BYTEA
      );
    `.catch(error => { schemaPromise = undefined; throw error; });
  }
  return schemaPromise;
}

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

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function getCookie(req) {
  const prefix = `${cookieName}=`;
  const cookie = String(req.headers?.cookie || "").split(";").map(part => part.trim())
    .find(part => part.startsWith(prefix));
  return cookie && cookie.length <= 1600 ? cookie.slice(prefix.length) : "";
}

function readLegacy(cookie) {
  if (!signingKey) return null;
  const match = /^([\w-]+)\.([\w-]{43})$/.exec(cookie);
  if (!match) return null;
  const [, value, signature] = match;
  if (!timingSafeEqual(Buffer.from(sign(value)), Buffer.from(signature))) return null;
  try {
    const { v, id, iat, exp } = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (v !== 1 || !validId(id) || !Number.isInteger(iat) || !Number.isInteger(exp)) return null;
    if (iat > now + 60 || exp <= now || exp - iat !== legacyMaxAge) return null;
    const token = `v2.${createHmac("sha256", signingKey).update(`${purpose}:upgrade:${cookie}`).digest("base64url")}`;
    return { id, iat, exp, token };
  } catch {
    return null;
  }
}

export async function setTeacherSession(req, res, userId, password) {
  if (!validId(userId) || !isTeacherSessionOrigin(req)) throw new Error("Invalid teacher session request");
  await ensureSessionSchema();
  const token = `v2.${randomBytes(32).toString("base64url")}`;
  const hash = tokenHash(token);
  const oldCookie = getCookie(req);
  const oldToken = persistentToken.test(oldCookie) ? oldCookie : readLegacy(oldCookie)?.token;
  const oldHash = oldToken ? tokenHash(oldToken) : null;
  const [created] = await sql`
    WITH issued AS (
      INSERT INTO teacher_login_sessions (token_hash, teacher_id, expires_at, credential)
      SELECT ${hash}, id, NOW() + make_interval(days => ${days}),
        sha256(convert_to(password || ${hash}, 'UTF8'))
      FROM teacher_users WHERE id = ${userId} AND password = ${password}
      RETURNING teacher_id
    ), retired AS (
      UPDATE teacher_login_sessions SET credential = NULL
      WHERE token_hash = ${oldHash} AND EXISTS (SELECT 1 FROM issued)
    )
    SELECT teacher_id FROM issued;
  `;
  if (!created) throw new Error("Teacher credentials changed before session issuance");
  writeCookie(req, res, token, maxAge);
}

export async function clearTeacherSession(req, res) {
  const cookie = getCookie(req);
  const legacy = readLegacy(cookie);
  if (persistentToken.test(cookie)) {
    await ensureSessionSchema();
    await sql`UPDATE teacher_login_sessions SET credential = NULL WHERE token_hash = ${tokenHash(cookie)};`;
  } else if (legacy) {
    await ensureSessionSchema();
    await sql`
      INSERT INTO teacher_login_sessions (token_hash, teacher_id, expires_at, credential)
      SELECT ${tokenHash(legacy.token)}, id, to_timestamp(${legacy.exp}), NULL FROM teacher_users WHERE id = ${legacy.id}
      ON CONFLICT (token_hash) DO UPDATE SET credential = NULL;
    `;
  }
  writeCookie(req, res, "", 0);
}

async function upgradeLegacy(legacy, hash) {
  // A legacy cookie predating an account change keeps its original expiry.
  await sql`
    INSERT INTO teacher_login_sessions (token_hash, teacher_id, expires_at, credential)
    SELECT ${hash}, id, NOW() + make_interval(days => ${days}),
      sha256(convert_to(password || ${hash}, 'UTF8'))
    FROM teacher_users WHERE id = ${legacy.id} AND updated_at < to_timestamp(${legacy.iat + 1})
    ON CONFLICT (token_hash) DO NOTHING;
  `;
}

export async function readTeacherSession(req, res) {
  if (!isTeacherSessionOrigin(req)) return null;
  const cookie = getCookie(req);
  const legacy = persistentToken.test(cookie) ? null : readLegacy(cookie);
  if (!legacy && !persistentToken.test(cookie)) return null;
  await ensureSessionSchema();
  const token = legacy?.token ?? cookie;
  const hash = tokenHash(token);
  const canRefresh = req.method === "GET";
  if (legacy && canRefresh) await upgradeLegacy(legacy, hash);

  const [session] = await sql`
    SELECT u.id AS user_id, u.contact_norm AS contact,
      COALESCE(NULLIF(u.profile->>'name', ''), NULLIF(u.profile->>'full_name', ''), u.profile->>'fullName', '') AS name,
      s.expires_at > NOW() AND s.credential = sha256(convert_to(u.password || ${hash}, 'UTF8')) AS valid,
      s.expires_at < NOW() + make_interval(days => ${renewWithinDays}) AS should_renew
    FROM teacher_login_sessions s JOIN teacher_users u ON u.id = s.teacher_id
    WHERE s.token_hash = ${hash};
  `;
  if (!session) {
    if (!legacy) return null;
    const [teacher] = await sql`SELECT id FROM teacher_users WHERE id = ${legacy.id};`;
    return teacher ? { userId: teacher.id } : null;
  }
  if (!session.valid) return null;

  if (canRefresh && session.should_renew) {
    const [renewed] = await sql`
      UPDATE teacher_login_sessions SET expires_at = NOW() + make_interval(days => ${days})
      WHERE token_hash = ${hash} AND expires_at > NOW() AND credential IS NOT NULL
      RETURNING token_hash;
    `;
    if (!renewed) return null;
    writeCookie(req, res, token, maxAge);
  } else if (canRefresh && legacy) {
    writeCookie(req, res, token, maxAge);
  }
  return { userId: session.user_id, profile: { name: session.name, contact: session.contact } };
}
