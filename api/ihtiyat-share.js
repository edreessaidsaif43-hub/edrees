import { createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { isTeacherSessionOrigin, readTeacherSession } from "../enjazy/server_api/_lib/teacher-session.js";
import { readPreparationSubscription } from "./subscriptions.js";

const maxBodyBytes = 4096;
const modeExplanations = Object.freeze({
  smart: "إسناد تلقائي وفق ترتيب الأهلية ورصيد الاحتياط وفرص التوفر والنصاب والمهام.",
  least: "إسناد تلقائي بحسب رصيد حصص الاحتياط لدى المعلمين المؤهلين.",
  load: "إسناد تلقائي يراعي النصاب التدريسي لدى المعلمين المؤهلين.",
  subject: "إسناد تلقائي يراعي التخصص ضمن المعلمين المؤهلين.",
  custom: "إسناد تلقائي وفق المعايير التي ضبطتها المدرسة للمعلمين المؤهلين.",
});

function database() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
  try {
    return url.trim() ? neon(url.trim()) : null;
  } catch {
    return null;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isId(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

function isDate(value) {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && !value.startsWith("0000-");
}

function hashToken(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanLabel(value, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function schoolFor(workspace, schoolId) {
  if (workspace?.activated === false || workspace?.demo === true || !Array.isArray(workspace?.schools)) return null;
  return workspace.schools.find(candidate => candidate?.id === schoolId) || null;
}

function approvedSchedule(school, date) {
  if (school?.approvedDays?.[date] !== true || !Array.isArray(school.assignments)) return null;
  const day = school.assignments.filter(lesson => lesson?.date === date);
  if (day.some(lesson => lesson.status === "proposed")) return null;
  const assignments = day.filter(lesson => ["approved", "done", "uncovered"].includes(lesson.status));
  return assignments.length ? { school, assignments } : null;
}

function knownMode(value) {
  return typeof value === "string" && Object.hasOwn(modeExplanations, value);
}

function projectSchedule({ school, assignments }, date) {
  const teachers = new Map();
  for (const teacher of Array.isArray(school.teachers) ? school.teachers : []) {
    if (isId(teacher?.id)) teachers.set(teacher.id, cleanLabel(teacher.name));
  }
  const appliedModes = new Set();
  let hasManual = false;
  let hasAutomatic = false;
  const lessons = [];
  for (const assignment of assignments) {
    if (!Number.isInteger(assignment.period) || assignment.period < 1 || assignment.period > 10) continue;
    const teacherName = assignment.status === "uncovered" ? "" : teachers.get(assignment.subId) || "";
    const manual = assignment.manual === true || assignment.mode === "manual";
    const selection = teacherName ? (manual ? "manual" : "automatic") : "uncovered";
    let explanation = "تحتاج هذه الحصة إلى تغطية.";
    if (selection === "manual") {
      hasManual = true;
      explanation = "أُسندت الحصة يدويًا من إدارة المدرسة.";
    } else if (selection === "automatic") {
      hasAutomatic = true;
      if (knownMode(assignment.mode)) appliedModes.add(assignment.mode);
      explanation = knownMode(assignment.mode)
        ? modeExplanations[assignment.mode]
        : "أُسندت الحصة وفق ترتيب المعلمين المؤهلين.";
      if (Number.isInteger(assignment.priority) && assignment.priority >= 0 && assignment.priority <= 100) {
        explanation += " أولوية الإسناد " + assignment.priority + "٪.";
      }
    }
    lessons.push({
      period: assignment.period,
      className: cleanLabel(assignment.cls, 80),
      subject: cleanLabel(assignment.subj),
      teacherName,
      selection,
      explanation,
    });
  }
  lessons.sort((first, second) => first.period - second.period || first.className.localeCompare(second.className, "ar", { numeric: true }));
  let distributionMode = null;
  if (appliedModes.size > 1) distributionMode = "mixed";
  else if (appliedModes.size === 1) distributionMode = appliedModes.values().next().value;
  else if (hasManual && !hasAutomatic) distributionMode = "manual";
  const covered = lessons.filter(lesson => lesson.selection !== "uncovered").length;
  return {
    schoolName: cleanLabel(school.settings?.name) || "المدرسة",
    date,
    distributionMode,
    lessons,
    fairness: { label: "تغطية الجدول المعتمد", indicator: null, covered, total: lessons.length },
  };
}

async function readPayload(req) {
  if (Number(req.headers?.["content-length"]) > maxBodyBytes) return null;
  try {
    if (req.body !== undefined) {
      const raw = typeof req.body === "string" || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
      return Buffer.byteLength(raw) <= maxBodyBytes ? JSON.parse(raw) : null;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBodyBytes) return null;
      chunks.push(bytes);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

export function createIhtiyatShareHandler(sql, readSession = readTeacherSession, readSubscription = readPreparationSubscription) {
  let schemaPromise;

  function ensureSchema() {
    if (!sql) throw new Error("Ihtiyat share database unavailable");
    if (!schemaPromise) {
      schemaPromise = sql`
        CREATE TABLE IF NOT EXISTS teacher_ihtiyat_shares (
          owner_id TEXT NOT NULL REFERENCES teacher_users(id) ON DELETE CASCADE,
          school_id TEXT NOT NULL,
          schedule_date DATE NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (owner_id, school_id, schedule_date)
        );
      `.catch(error => {
        schemaPromise = undefined;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function createShare(res, { ownerId, schoolId, date, expectedRevision }) {
    const [source] = await sql`
      SELECT workspace, revision FROM teacher_ihtiyat_workspaces WHERE owner_id = ${ownerId};
    `;
    if (!source || Number(source.revision) !== expectedRevision) return res.status(409).json({ error: "workspace_conflict" });
    const approved = approvedSchedule(schoolFor(source.workspace, schoolId), date);
    if (!approved || !projectSchedule(approved, date).lessons.length) {
      return res.status(409).json({ error: "schedule_not_approved" });
    }

    const token = randomBytes(32).toString("base64url");
    const [saved] = await sql`
      WITH target AS (
        SELECT owner_id FROM teacher_ihtiyat_workspaces
        WHERE owner_id = ${ownerId} AND revision = ${expectedRevision}
        FOR UPDATE
      )
      INSERT INTO teacher_ihtiyat_shares (owner_id, school_id, schedule_date, token_hash, expires_at)
      SELECT owner_id, ${schoolId}, ${date}::date, ${hashToken(token)}, NOW() + INTERVAL '7 days'
      FROM target
      ON CONFLICT (owner_id, school_id, schedule_date) DO UPDATE
        SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at
      RETURNING expires_at;
    `;
    if (!saved) return res.status(409).json({ error: "workspace_conflict" });
    return res.status(200).json({ token, expiresAt: new Date(saved.expires_at).toISOString() });
  }

  async function revokeShare(res, { ownerId, schoolId, date }) {
    await sql`
      DELETE FROM teacher_ihtiyat_shares
      WHERE owner_id = ${ownerId} AND school_id = ${schoolId} AND schedule_date = ${date}::date;
    `;
    return res.status(200).json({ revoked: true });
  }

  async function viewShare(res, token) {
    const unavailable = () => res.status(404).json({ error: "share_not_found" });
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return unavailable();
    await ensureSchema();
    const hash = hashToken(token);
    const [candidate] = await sql`
      SELECT owner_id FROM teacher_ihtiyat_shares
      WHERE token_hash = ${hash} AND expires_at > NOW();
    `;
    if (!candidate) return unavailable();
    const access = await readSubscription(candidate.owner_id);
    if (access?.status === 401) return unavailable();
    if (access?.status === 403) return res.status(403).json({ error: "share_unavailable" });
    if (access?.status !== 200) return res.status(503).json({ error: "share_unavailable" });

    const [share] = await sql`
      SELECT share.owner_id, share.school_id, share.schedule_date::text AS date, workspace.workspace
      FROM teacher_ihtiyat_shares share
      JOIN teacher_ihtiyat_workspaces workspace ON workspace.owner_id = share.owner_id
      WHERE share.token_hash = ${hash} AND share.expires_at > NOW();
    `;
    if (!share || share.owner_id !== candidate.owner_id) return unavailable();
    const school = schoolFor(share.workspace, share.school_id);
    if (!school) return unavailable();
    const approved = approvedSchedule(school, share.date);
    if (!approved) return res.status(409).json({ error: "schedule_not_approved" });
    const published = projectSchedule(approved, share.date);
    return published.lessons.length
      ? res.status(200).json(published)
      : res.status(409).json({ error: "schedule_not_approved" });
  }

  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    if (!/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers?.["content-type"] || ""))) {
      return res.status(415).json({ error: "invalid_content_type" });
    }
    const body = await readPayload(req);
    if (!isRecord(body)) return res.status(400).json({ error: "invalid_request" });
    try {
      if (body.action === "view") return await viewShare(res, body.token);
      if (body.action !== "create" && body.action !== "revoke") return res.status(400).json({ error: "invalid_request" });
      if (!isTeacherSessionOrigin(req)) return res.status(403).json({ error: "origin_not_allowed" });
      const account = await readSession(req, res);
      if (!isId(account?.userId)) return res.status(401).json({ error: "sign_in_required" });
      if (!isId(body.ownerId) || !isId(body.schoolId) || !isDate(body.date) ||
          (body.action === "create" && (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision <= 0))) {
        return res.status(400).json({ error: "invalid_request" });
      }
      if (account.userId !== body.ownerId) return res.status(403).json({ error: "owner_mismatch" });
      const access = await readSubscription(account.userId);
      if (access?.status === 401) return res.status(401).json({ error: "sign_in_required" });
      if (access?.status === 403 && ["subscription_required", "account_stopped"].includes(access.error)) {
        return res.status(403).json({ error: access.error });
      }
      if (access?.status !== 200) return res.status(503).json({ error: "share_unavailable" });
      await ensureSchema();
      return body.action === "create" ? await createShare(res, body) : await revokeShare(res, body);
    } catch {
      return res.status(503).json({ error: "share_unavailable" });
    }
  };
}

export default createIhtiyatShareHandler(database());
