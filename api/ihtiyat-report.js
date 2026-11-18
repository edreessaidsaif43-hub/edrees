import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { isTeacherSessionOrigin, readTeacherSession } from "../enjazy/server_api/_lib/teacher-session.js";
import { readPreparationSubscription } from "./subscriptions.js";

const maxBodyBytes = 4096;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

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
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function schoolFor(workspace, schoolId) {
  if (workspace?.activated !== true || workspace.demo === true || !Array.isArray(workspace.schools)) return null;
  return workspace.schools.find(school => school?.id === schoolId) || null;
}

export function buildIhtiyatReport(school) {
  const teachers = [];
  const teacherIndexes = new Map();
  for (const teacher of Array.isArray(school.teachers) ? school.teachers : []) {
    const name = typeof teacher?.name === "string" ? teacher.name.trim().slice(0, 160) : "";
    if (!name || !isId(teacher?.id) || teacherIndexes.has(teacher.id)) continue;
    teacherIndexes.set(teacher.id, teachers.length);
    teachers.push(name);
  }
  const approved = isRecord(school.approvedDays) ? school.approvedDays : {};
  const days = new Map();
  for (const [date, isApproved] of Object.entries(approved)) {
    if (isApproved === true && isDate(date)) {
      days.set(date, { date, required: 0, covered: 0, uncovered: 0, manual: 0, teacherCounts: new Map() });
    }
  }

  const assignments = Array.isArray(school.assignments) ? school.assignments : [];
  for (const assignment of assignments) {
    const day = days.get(assignment?.date);
    if (!day) continue;
    const { status } = assignment;
    if (status === "proposed") {
      days.delete(day.date);
      continue;
    }
    if (status === "approved" || status === "done") {
      day.required++;
      if (isId(assignment.subId)) {
        const manual = assignment.manual === true || assignment.mode === "manual";
        day.covered++;
        if (manual) day.manual++;
        const teacher = teacherIndexes.get(assignment.subId);
        if (teacher !== undefined) {
          if (!day.teacherCounts.has(teacher)) day.teacherCounts.set(teacher, { teacher, approved: 0, done: 0, manual: 0 });
          const count = day.teacherCounts.get(teacher);
          count[status]++;
          if (manual) count.manual++;
        }
      } else {
        day.uncovered++;
      }
    } else if (status === "uncovered" || status === "notdone") {
      day.required++;
      day.uncovered++;
    }
  }

  const schoolName = typeof school.settings?.name === "string" ? school.settings.name.trim().slice(0, 160) : "";
  return {
    schoolName: schoolName || "المدرسة",
    teachers,
    days: [...days.values()].filter(day => day.required > 0)
      .sort((first, second) => second.date.localeCompare(first.date))
      .map(day => ({ ...day, teacherCounts: [...day.teacherCounts.values()] })),
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

export function createIhtiyatReportHandler(sql, readSession = readTeacherSession, readSubscription = readPreparationSubscription) {
  let schemaPromise;

  function ensureSchema() {
    if (!sql) throw new Error("Ihtiyat report database unavailable");
    if (!schemaPromise) {
      schemaPromise = sql`
        CREATE TABLE IF NOT EXISTS teacher_ihtiyat_report_links (
          owner_id TEXT NOT NULL REFERENCES teacher_users(id) ON DELETE CASCADE,
          school_id TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          PRIMARY KEY (owner_id, school_id)
        );
      `.catch(error => {
        schemaPromise = undefined;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function manageReport(res, { action, ownerId, schoolId }) {
    if (action === "revoke") {
      await sql`DELETE FROM teacher_ihtiyat_report_links WHERE owner_id = ${ownerId} AND school_id = ${schoolId};`;
      return res.status(200).json({ revoked: true });
    }

    const [source] = await sql`
      SELECT workspace, revision FROM teacher_ihtiyat_workspaces WHERE owner_id = ${ownerId};
    `;
    if (!schoolFor(source?.workspace, schoolId)) return res.status(404).json({ error: "school_not_found" });
    if (action === "get") {
      const [saved] = await sql`
        SELECT token FROM teacher_ihtiyat_report_links WHERE owner_id = ${ownerId} AND school_id = ${schoolId};
      `;
      return res.status(200).json({ token: saved?.token ?? null });
    }

    const [saved] = await sql`
      WITH target AS (
        SELECT owner_id FROM teacher_ihtiyat_workspaces
        WHERE owner_id = ${ownerId} AND revision = ${source.revision}
        FOR UPDATE
      )
      INSERT INTO teacher_ihtiyat_report_links (owner_id, school_id, token)
      SELECT owner_id, ${schoolId}, ${randomBytes(32).toString("base64url")} FROM target
      ON CONFLICT (owner_id, school_id) DO UPDATE SET token = teacher_ihtiyat_report_links.token
      RETURNING token;
    `;
    if (!saved) return res.status(409).json({ error: "workspace_conflict" });
    return res.status(200).json({ token: saved.token });
  }

  async function viewReport(res, token) {
    const missing = () => res.status(404).json({ error: "report_not_found" });
    if (typeof token !== "string" || !tokenPattern.test(token)) return missing();
    await ensureSchema();
    const [candidate] = await sql`SELECT owner_id FROM teacher_ihtiyat_report_links WHERE token = ${token};`;
    if (!candidate) return missing();

    const access = await readSubscription(candidate.owner_id);
    if (access?.status === 401) return missing();
    if (access?.status === 403) return res.status(403).json({ error: "report_unavailable" });
    if (access?.status !== 200) return res.status(503).json({ error: "report_unavailable" });

    const [published] = await sql`
      SELECT link.school_id, workspace.workspace
      FROM teacher_ihtiyat_report_links link
      JOIN teacher_ihtiyat_workspaces workspace ON workspace.owner_id = link.owner_id
      WHERE link.token = ${token} AND link.owner_id = ${candidate.owner_id};
    `;
    if (!published) return missing();
    const school = schoolFor(published.workspace, published.school_id);
    return school ? res.status(200).json(buildIhtiyatReport(school)) : missing();
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
      if (body.action === "view") return await viewReport(res, body.token);
      if (!["get", "create", "revoke"].includes(body.action)) return res.status(400).json({ error: "invalid_request" });
      if (!isTeacherSessionOrigin(req)) return res.status(403).json({ error: "origin_not_allowed" });
      const account = await readSession(req, res);
      if (!isId(account?.userId)) return res.status(401).json({ error: "sign_in_required" });
      if (!isId(body.ownerId) || !isId(body.schoolId)) return res.status(400).json({ error: "invalid_request" });
      if (account.userId !== body.ownerId) return res.status(403).json({ error: "owner_mismatch" });

      const access = await readSubscription(account.userId);
      if (access?.status === 401) return res.status(401).json({ error: "sign_in_required" });
      if (access?.status === 403 && ["subscription_required", "account_stopped"].includes(access.error)) {
        return res.status(403).json({ error: access.error });
      }
      if (access?.status !== 200) return res.status(503).json({ error: "report_unavailable" });
      await ensureSchema();
      return await manageReport(res, body);
    } catch {
      return res.status(503).json({ error: "report_unavailable" });
    }
  };
}

export default createIhtiyatReportHandler(database());
