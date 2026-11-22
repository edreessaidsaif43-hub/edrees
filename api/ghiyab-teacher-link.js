import { createHash, randomBytes, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { isTeacherSessionOrigin, readTeacherSession } from "../enjazy/server_api/_lib/teacher-session.js";
import { readPreparationSubscription } from "./subscriptions.js";

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const idPattern = /^[^\u0000-\u001f\u007f/]{1,200}$/;
const uuidPattern = /^[a-f0-9-]{36}$/;
const maxRequestBytes = 192 * 1024;
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const label = (value, size = 160) => typeof value === "string" ? value.trim().slice(0, size) : "";
const hash = value => createHash("sha256").update(value).digest("hex");
const validId = value => typeof value === "string" && idPattern.test(value);

function dateIsValid(value) {
  if(typeof value !== "string" || !/^20\d\d-\d\d-\d\d$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseRoster(body) {
  const roster = body.roster;
  if(!isObject(roster) || !validId(body.workspace) || !validId(body.classId) || !dateIsValid(body.date) ||
    !Array.isArray(roster.students) || roster.students.length < 1 || roster.students.length > 250 ||
    !Number.isInteger(roster.periods) || roster.periods < 0 || roster.periods > 12) return null;
  const school = label(roster.school), className = label(roster.className), grade = label(roster.grade);
  if(!school || !className) return null;
  const seen = new Set();
  const students = [];
  for(const entry of roster.students){
    if(!isObject(entry) || !validId(entry.id) || seen.has(entry.id) || !label(entry.name)) return null;
    seen.add(entry.id);
    students.push({id: entry.id, name: label(entry.name)});
  }
  return {school, className, grade, periods: roster.periods, students};
}

function makeRecord(body, invite) {
  const roster = invite.roster;
  const teacher = label(body.teacher, 100);
  const period = body.period;
  if(!teacher || teacher.length < 3 || !Number.isInteger(period) ||
    (roster.periods ? period < 1 || period > roster.periods : period !== 0) ||
    !Array.isArray(body.marks) || body.marks.length > roster.students.length) return null;

  const used = new Set();
  const categories = {a: [], e: [], l: []};
  for(const mark of body.marks){
    if(!isObject(mark) || !Number.isInteger(mark.key) || mark.key < 0 || mark.key >= roster.students.length ||
      used.has(mark.key) || !Object.hasOwn(categories, mark.status)) return null;
    used.add(mark.key);
    const student = roster.students[mark.key];
    categories[mark.status].push({id: student.id, n: student.name});
  }
  return {
    date: invite.date, classId: invite.class_id, className: roster.className, grade: roster.grade,
    periods: {[period]: {teacher, absent: categories.a, excused: categories.e, late: categories.l, total: roster.students.length}}
  };
}

function requestBody(req) {
  const body = req.body;
  if(Number(req.headers?.["content-length"]) > maxRequestBytes || body == null) return null;
  try {
    const raw = Buffer.isBuffer(body) || typeof body === "string" ? String(body) : JSON.stringify(body);
    if(Buffer.byteLength(raw) > maxRequestBytes) return null;
    const decoded = JSON.parse(raw);
    return isObject(decoded) ? decoded : null;
  } catch { return null; }
}

export function createTeacherLinkHandler(sql, readSession = readTeacherSession, readSubscription = readPreparationSubscription) {
  let schema;
  function ensureSchema() {
    if(!sql) throw Error("Database unavailable");
    if(!schema){
      schema = (async () => {
        await sql`
          CREATE TABLE IF NOT EXISTS ghiyab_teacher_links (
            owner_id TEXT NOT NULL REFERENCES teacher_users(id) ON DELETE CASCADE,
            workspace_id TEXT NOT NULL,
            class_id TEXT NOT NULL,
            attendance_date DATE NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            roster JSONB NOT NULL,
            PRIMARY KEY (owner_id, workspace_id, class_id, attendance_date)
          );`;
        await sql`
          CREATE TABLE IF NOT EXISTS ghiyab_teacher_receipts (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL REFERENCES teacher_users(id) ON DELETE CASCADE,
            workspace_id TEXT NOT NULL,
            class_id TEXT NOT NULL,
            attendance_date DATE NOT NULL,
            period SMALLINT NOT NULL,
            record JSONB,
            submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (owner_id, workspace_id, class_id, attendance_date, period)
          );`;
      })().catch(error => { schema = undefined; throw error; });
    }
    return schema;
  }

  async function resolveInvite(token) {
    if(typeof token !== "string" || !tokenPattern.test(token)) return null;
    await ensureSchema();
    const tokenHash = hash(token);
    const [match] = await sql`
      SELECT owner_id, workspace_id, class_id, attendance_date::text AS date, roster
      FROM ghiyab_teacher_links WHERE token_hash = ${tokenHash} AND expires_at > NOW();`;
    if(!match) return null;
    const access = await readSubscription(match.owner_id);
    if(access?.status === 401 || access?.status === 403) return null;
    if(access?.status !== 200) throw Error("Subscription unavailable");
    return {...match, tokenHash};
  }

  async function handleTeacher(body, res, fail) {
    const invite = await resolveInvite(body.token);
    if(!invite) return fail(404, "link_unavailable");
    if(body.action === "view"){
      const captured = await sql`
        SELECT period FROM ghiyab_teacher_receipts WHERE owner_id = ${invite.owner_id}
        AND workspace_id = ${invite.workspace_id}
        AND class_id = ${invite.class_id} AND attendance_date = ${invite.date}::date;`;
      const {school, className, periods, students} = invite.roster;
      return res.status(200).json({
        school, className, date: invite.date, periods,
        students: students.map(({name}, key) => ({name, key})),
        captured: captured.map(row => Number(row.period))
      });
    }

    const record = makeRecord(body, invite);
    if(!record) return fail(400, "invalid_attendance");
    const [written] = await sql`
      WITH eligible AS (
        SELECT owner_id, workspace_id, class_id, attendance_date FROM ghiyab_teacher_links
        WHERE token_hash = ${invite.tokenHash} AND expires_at > NOW()
        FOR UPDATE
      ), receipt AS (
        INSERT INTO ghiyab_teacher_receipts (id, owner_id, workspace_id, class_id, attendance_date, period, record)
        SELECT ${randomUUID()}, owner_id, workspace_id, class_id, attendance_date, ${body.period}, ${JSON.stringify(record)}::jsonb FROM eligible
        ON CONFLICT (owner_id, workspace_id, class_id, attendance_date, period) DO NOTHING
        RETURNING id
      )
      SELECT EXISTS (SELECT 1 FROM eligible) AS active, EXISTS (SELECT 1 FROM receipt) AS saved;`;
    if(!written?.active) return fail(404, "link_unavailable");
    if(!written.saved) return fail(409, "already_submitted");
    return res.status(200).json({saved: true});
  }

  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const fail = (status, error) => res.status(status).json({error});
    if(req.method !== "POST"){
      res.setHeader("Allow", "POST");
      return fail(405, "method_not_allowed");
    }
    if(!isTeacherSessionOrigin(req)) return fail(403, "origin_not_allowed");
    if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"] || ""))) return fail(415, "invalid_request");
    const body = requestBody(req);
    if(!body) return fail(400, "invalid_request");
    try {
      if(body.action === "view" || body.action === "submit") return await handleTeacher(body, res, fail);
      if(!["create", "links", "revoke", "pending", "ack"].includes(body.action)) return fail(400, "invalid_request");
      const session = await readSession(req, res);
      if(!session) return fail(401, "sign_in_required");
      const access = await readSubscription(session.userId);
      if(access?.status !== 200) return fail([401, 403].includes(access?.status) ? access.status : 503, access?.error || "service_unavailable");
      const ownerId = session.userId;
      if(!validId(body.workspace)) return fail(400, "invalid_request");
      const workspace = body.workspace;
      await ensureSchema();
      if(body.action === "pending"){
        const receipts = await sql`
          SELECT id, period, record, submitted_at AS "submittedAt" FROM ghiyab_teacher_receipts
          WHERE owner_id = ${ownerId} AND workspace_id = ${workspace} AND record IS NOT NULL
          ORDER BY submitted_at, id LIMIT 10;`;
        return res.status(200).json({receipts});
      }
      if(body.action === "ack"){
        if(!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 30 ||
          body.ids.some(id => typeof id !== "string" || !uuidPattern.test(id))) return fail(400, "invalid_request");
        await sql`
          UPDATE ghiyab_teacher_receipts SET record = NULL
          WHERE owner_id = ${ownerId} AND workspace_id = ${workspace} AND id = ANY(${body.ids}::text[]);`;
        return res.status(200).json({ok: true});
      }
      if(body.action === "links"){
        if(!dateIsValid(body.date)) return fail(400, "invalid_request");
        const links = await sql`
          SELECT class_id AS id, roster->>'className' AS name FROM ghiyab_teacher_links
          WHERE owner_id = ${ownerId} AND workspace_id = ${workspace}
          AND attendance_date = ${body.date}::date AND expires_at > NOW()
          ORDER BY roster->>'className';`;
        return res.status(200).json({links});
      }
      if(!validId(body.classId) || !dateIsValid(body.date)) return fail(400, "invalid_request");
      if(body.action === "revoke"){
        await sql`
          DELETE FROM ghiyab_teacher_links WHERE owner_id = ${ownerId} AND workspace_id = ${workspace}
          AND class_id = ${body.classId} AND attendance_date = ${body.date}::date;`;
        return res.status(200).json({revoked: true});
      }
      const roster = parseRoster(body);
      if(!roster) return fail(400, "invalid_roster");
      const token = randomBytes(32).toString("base64url");
      const [saved] = await sql`
        WITH expired AS (
          DELETE FROM ghiyab_teacher_links WHERE owner_id = ${ownerId} AND expires_at <= NOW()
          AND (workspace_id <> ${workspace} OR class_id <> ${body.classId} OR attendance_date <> ${body.date}::date)
        )
        INSERT INTO ghiyab_teacher_links (owner_id, workspace_id, class_id, attendance_date, token_hash, expires_at, roster)
        VALUES (${ownerId}, ${workspace}, ${body.classId}, ${body.date}::date, ${hash(token)}, NOW() + INTERVAL '24 hours', ${JSON.stringify(roster)}::jsonb)
        ON CONFLICT (owner_id, workspace_id, class_id, attendance_date) DO UPDATE
        SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, roster = EXCLUDED.roster
        RETURNING expires_at AS "expiresAt";`;
      return res.status(200).json({token, expiresAt: saved.expiresAt});
    } catch {
      return fail(503, "service_unavailable");
    }
  };
}

export default createTeacherLinkHandler(databaseUrl.trim() ? neon(databaseUrl.trim()) : null);
