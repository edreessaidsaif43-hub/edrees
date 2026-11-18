import { neon } from "@neondatabase/serverless";
import { isTeacherSessionOrigin, readTeacherSession } from "../enjazy/server_api/_lib/teacher-session.js";
import { readPreparationSubscription } from "./subscriptions.js";

const maxBodyBytes = 4 * 1024 * 1024;
const invalidJsonText = /[\u0000\uD800-\uDFFF]/u;

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

function supportsJsonb(value, depth = 0) {
  if (depth > 32) return false;
  if (typeof value === "string") return !invalidJsonText.test(value);
  if (typeof value === "number") return Number.isFinite(value);
  if (value === null || typeof value === "boolean") return true;
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return value.every(child => supportsJsonb(child, depth + 1));
  return Object.entries(value).every(([key, child]) =>
    key !== "__proto__" && !invalidJsonText.test(key) && supportsJsonb(child, depth + 1));
}

function hasUniqueIds(records, validRecord) {
  const ids = new Set();
  return records.every(record => {
    if (!isRecord(record) || !isId(record.id) || ids.has(record.id) || !validRecord(record)) return false;
    ids.add(record.id);
    return true;
  });
}

function normalize(workspace) {
  if (!isRecord(workspace) || !Array.isArray(workspace.schools) || workspace.schools.length === 0 ||
      !Array.isArray(workspace.users) || (workspace.demo !== undefined && workspace.demo !== false) ||
      (workspace.activated !== undefined && typeof workspace.activated !== "boolean") ||
      (workspace.version !== undefined && (!Number.isSafeInteger(workspace.version) || workspace.version < 1)) ||
      !hasUniqueIds(workspace.schools, school => isRecord(school.settings)) ||
      !hasUniqueIds(workspace.users, () => true)) {
    return null;
  }
  const cloud = { ...workspace };
  delete cloud.session;
  delete cloud.currentSchoolId;
  return supportsJsonb(cloud) ? cloud : null;
}

async function readPayload(req) {
  if (req.body !== undefined) {
    const body = typeof req.body === "string" || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(body) > maxBodyBytes) return { tooLarge: true };
    return { payload: JSON.parse(body) };
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBodyBytes) return { tooLarge: true };
    chunks.push(bytes);
  }
  return { payload: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
}

export function createIhtiyatHandler(sql, readSession = readTeacherSession, readSubscription = readPreparationSubscription) {
  let schemaPromise;

  function ensureSchema() {
    if (!sql) throw new Error("Ihtiyat database is unavailable");
    if (!schemaPromise) {
      schemaPromise = sql`
        CREATE TABLE IF NOT EXISTS teacher_ihtiyat_workspaces (
          owner_id TEXT PRIMARY KEY REFERENCES teacher_users(id) ON DELETE CASCADE,
          workspace JSONB NOT NULL,
          revision BIGINT NOT NULL CHECK (revision > 0),
          last_write_id TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `.catch(error => {
        schemaPromise = undefined;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function loadWorkspace(res, ownerId) {
    await ensureSchema();
    const [row] = await sql`
      SELECT workspace, revision, last_write_id FROM teacher_ihtiyat_workspaces WHERE owner_id = ${ownerId};
    `;
    return res.status(200).json({
      ownerId,
      workspace: row?.workspace ?? null,
      revision: Number(row?.revision ?? 0),
      lastWriteId: row?.last_write_id ?? null,
    });
  }

  async function saveWorkspace(req, res, ownerId) {
    if (!/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers?.["content-type"] || ""))) {
      return res.status(415).json({ error: "invalid_content_type" });
    }
    const tooLarge = () => res.status(413).json({ error: "workspace_too_large", maxBytes: maxBodyBytes });
    if (Number(req.headers?.["content-length"]) > maxBodyBytes) return tooLarge();

    let body;
    try {
      body = await readPayload(req);
    } catch {
      return res.status(400).json({ error: "invalid_workspace" });
    }
    if (body.tooLarge) return tooLarge();
    const { payload } = body;
    if (!isRecord(payload) || !isId(payload.ownerId)) return res.status(400).json({ error: "invalid_workspace" });
    if (payload.ownerId !== ownerId) return res.status(409).json({ error: "account_changed" });

    const { expectedRevision, writeId } = payload;
    const workspace = normalize(payload.workspace);
    if (!workspace || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
        expectedRevision >= Number.MAX_SAFE_INTEGER || typeof writeId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(writeId)) {
      return res.status(400).json({ error: "invalid_workspace" });
    }
    const serialized = JSON.stringify(workspace);

    await ensureSchema();
    const [saved] = expectedRevision === 0 ? await sql`
      INSERT INTO teacher_ihtiyat_workspaces (owner_id, workspace, revision, last_write_id)
      VALUES (${ownerId}, ${serialized}::jsonb, 1, ${writeId})
      ON CONFLICT (owner_id) DO NOTHING RETURNING revision;
    ` : await sql`
      UPDATE teacher_ihtiyat_workspaces SET workspace = ${serialized}::jsonb,
        revision = revision + 1, last_write_id = ${writeId}, updated_at = NOW()
      WHERE owner_id = ${ownerId} AND revision = ${expectedRevision} AND last_write_id <> ${writeId}
      RETURNING revision;
    `;
    if (saved) return res.status(200).json({ revision: Number(saved.revision) });

    const [current] = await sql`
      SELECT revision, (last_write_id = ${writeId} AND workspace = ${serialized}::jsonb) AS same_write
      FROM teacher_ihtiyat_workspaces WHERE owner_id = ${ownerId};
    `;
    const revision = Number(current?.revision ?? 0);
    if (current?.same_write && revision === expectedRevision + 1) return res.status(200).json({ revision });
    return res.status(409).json({ error: "workspace_conflict", revision });
  }

  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method !== "GET" && req.method !== "PUT") {
      res.setHeader("Allow", "GET, PUT");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    if (!isTeacherSessionOrigin(req)) return res.status(403).json({ error: "origin_not_allowed" });
    try {
      const account = await readSession(req, res);
      if (!isId(account?.userId)) return res.status(401).json({ error: "sign_in_required" });

      let access;
      try {
        access = await readSubscription(account.userId);
      } catch {
        return res.status(503).json({ error: "subscription_check_unavailable" });
      }
      if (access?.status === 401) return res.status(401).json({ error: "sign_in_required" });
      if (access?.status === 403 && ["subscription_required", "account_stopped"].includes(access.error)) {
        return res.status(403).json({ error: access.error });
      }
      if (access?.status !== 200) return res.status(503).json({ error: "subscription_check_unavailable" });

      return req.method === "GET"
        ? await loadWorkspace(res, account.userId)
        : await saveWorkspace(req, res, account.userId);
    } catch {
      return res.status(503).json({ error: "workspace_unavailable" });
    }
  };
}

export default createIhtiyatHandler(database());
