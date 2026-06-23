import { neon } from "@neondatabase/serverless";

const DATABASE_URL =
  process.env.EDU_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.MASH_DATABASE_URL ||
  "";
const DEFAULT_LEGACY_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzdBOQwSbIIjJI18MH1Nd3sxrSWBiVYLDBoIswbOJ9BhdzVICH8Fd5KKJJJdAB61ZJM/exec";
const LEGACY_APPS_SCRIPT_URLS = [
  ...(process.env.LEGACY_APPS_SCRIPT_URLS || process.env.LEGACY_APPS_SCRIPT_URL || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
  DEFAULT_LEGACY_APPS_SCRIPT_URL,
];
const MIGRATION_TOKEN = process.env.EDU_MIGRATION_TOKEN || "";

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;
let schemaPromise = null;

function send(res, status, payload) {
  res.status(status).json(payload);
}

function dbUnavailable(res) {
  return send(res, 500, {
    success: false,
    error: "db_not_configured",
    message: "Vercel database is not configured. Add EDU_DATABASE_URL or POSTGRES_URL in Vercel Environment Variables, then redeploy.",
  });
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function stringifyArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch {}
    }
    return text.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [String(value)];
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function normalizeContent(input = {}) {
  const createdAt = input.created_at || input.createdAt || new Date().toISOString();
  return {
    id: String(input.id || randomId()),
    teacher_name: String(input.teacher_name || "").trim(),
    teacher_email: String(input.teacher_email || "").trim().toLowerCase(),
    teacher_key: String(input.teacher_key || "").trim(),
    grade: stringifyArray(input.grade),
    subject: stringifyArray(input.subject),
    lesson_name: String(input.lesson_name || "").trim(),
    game_link: String(input.game_link || "").trim(),
    status: String(input.status || "pending").trim(),
    content_type: String(input.content_type || "game").trim(),
    created_at: createdAt,
    reviewed_at: input.reviewed_at || "",
  };
}

function defaultStorage() {
  return {
    version: 1,
    users: [],
    contentMetrics: {},
    contentComments: {},
  };
}

function tokenAllowed(req) {
  if (!MIGRATION_TOKEN) return true;
  const header = String(req.headers.authorization || "");
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const queryToken = String(req.query?.token || "");
  return bearer === MIGRATION_TOKEN || queryToken === MIGRATION_TOKEN;
}

function normalizeStorage(storage = {}) {
  return {
    version: Number(storage.version) || 1,
    users: Array.isArray(storage.users) ? storage.users : [],
    contentMetrics:
      storage.contentMetrics && typeof storage.contentMetrics === "object"
        ? storage.contentMetrics
        : {},
    contentComments:
      storage.contentComments && typeof storage.contentComments === "object"
        ? storage.contentComments
        : {},
  };
}

async function ensureSchema() {
  if (!sql) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS edu_contents (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_edu_contents_updated_at
        ON edu_contents (updated_at DESC);
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS edu_storage (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await sql`
        INSERT INTO edu_storage (id, data, updated_at)
        VALUES ('main', ${JSON.stringify(defaultStorage())}::jsonb, NOW())
        ON CONFLICT (id) DO NOTHING;
      `;
    })();
  }
  await schemaPromise;
}

async function getContents(includeAll = false) {
  await ensureSchema();
  const rows = await sql`
    SELECT data
    FROM edu_contents
    ORDER BY updated_at DESC;
  `;
  const items = (rows || []).map((row) => normalizeContent(row.data || {}));
  return includeAll ? items : items.filter((item) => String(item.status).toLowerCase() === "approved");
}

async function getStorage() {
  await ensureSchema();
  const rows = await sql`
    SELECT data
    FROM edu_storage
    WHERE id = 'main'
    LIMIT 1;
  `;
  return normalizeStorage(rows?.[0]?.data || defaultStorage());
}

async function saveStorage(storage) {
  await ensureSchema();
  const safe = normalizeStorage(storage);
  await sql`
    INSERT INTO edu_storage (id, data, updated_at)
    VALUES ('main', ${JSON.stringify(safe)}::jsonb, NOW())
    ON CONFLICT (id)
    DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
  `;
  return safe;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchLegacy(action) {
  const errors = [];
  const uniqueUrls = [...new Set(LEGACY_APPS_SCRIPT_URLS)];

  for (const baseUrl of uniqueUrls) {
    const cleanBase = String(baseUrl || "").split("?")[0].replace(/\/+$/, "");
    const url = `${cleanBase}?action=${encodeURIComponent(action)}`;
    try {
      const response = await fetch(url, { method: "GET", cache: "no-store" });
      if (!response.ok) {
        errors.push(`${cleanBase} -> HTTP ${response.status}`);
        continue;
      }
      const payload = await response.json();
      if (!payload || payload.success !== true) {
        errors.push(`${cleanBase} -> success=false`);
        continue;
      }
      return payload;
    } catch (error) {
      errors.push(`${cleanBase} -> ${String(error?.message || error)}`);
    }
  }

  if (action === "getAllGames") {
    try {
      const fallback = await fetchLegacy("getGames");
      return {
        ...fallback,
        usedFallbackAction: "getGames",
      };
    } catch (fallbackError) {
      errors.push(`getGames fallback -> ${String(fallbackError?.message || fallbackError)}`);
    }
  }

  throw new Error(`Legacy ${action} failed. Tried: ${errors.join(" | ")}`);
}

function mergeUsers(legacyUsers = [], currentUsers = []) {
  const byEmail = new Map();
  for (const user of legacyUsers) {
    const email = String(user?.email || user?.username || "").trim().toLowerCase();
    if (email) byEmail.set(email, user);
  }
  for (const user of currentUsers) {
    const email = String(user?.email || user?.username || "").trim().toLowerCase();
    if (email) byEmail.set(email, user);
  }
  return [...byEmail.values()];
}

async function migrateLegacyData() {
  await ensureSchema();
  const beforeRows = await sql`
    SELECT COUNT(*)::int AS count
    FROM edu_contents;
  `;
  const beforeCount = Number(beforeRows?.[0]?.count || 0);

  const [legacyGamesPayload, legacyStoragePayload] = await Promise.all([
    fetchLegacy("getAllGames"),
    fetchLegacy("getStorage").catch(() => ({ storage: defaultStorage() })),
  ]);

  const legacyGames = Array.isArray(legacyGamesPayload.data)
    ? legacyGamesPayload.data.map(normalizeContent)
    : [];

  for (const chunk of chunkArray(legacyGames, 150)) {
    const rowsJson = JSON.stringify(chunk.map((content) => ({ id: content.id, data: content })));
    await sql`
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset(${rowsJson}::jsonb)
        AS x(id TEXT, data JSONB)
      )
      INSERT INTO edu_contents (id, data, created_at, updated_at)
      SELECT id, data, NOW(), NOW()
      FROM incoming
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
    `;
  }

  const currentStorage = await getStorage();
  const legacyStorage = normalizeStorage(legacyStoragePayload.storage || {});
  const mergedStorage = normalizeStorage({
    version: Math.max(Number(currentStorage.version) || 1, Number(legacyStorage.version) || 1),
    users: mergeUsers(legacyStorage.users, currentStorage.users),
    contentMetrics: {
      ...(legacyStorage.contentMetrics || {}),
      ...(currentStorage.contentMetrics || {}),
    },
    contentComments: {
      ...(legacyStorage.contentComments || {}),
      ...(currentStorage.contentComments || {}),
    },
  });

  await saveStorage(mergedStorage);
  const afterRows = await sql`
    SELECT COUNT(*)::int AS count
    FROM edu_contents;
  `;
  const afterCount = Number(afterRows?.[0]?.count || 0);

  return {
    legacyContents: legacyGames.length,
    legacyFallbackAction: legacyGamesPayload.usedFallbackAction || "",
    beforeContents: beforeCount,
    afterContents: afterCount,
    changedContents: Math.max(0, afterCount - beforeCount),
    users: mergedStorage.users.length,
    metricKeys: Object.keys(mergedStorage.contentMetrics || {}).length,
    commentKeys: Object.keys(mergedStorage.contentComments || {}).length,
  };
}

export default async function handler(req, res) {
  try {
    if (!sql) return dbUnavailable(res);

    const body = parseBody(req);
    const action = String(req.query?.action || body.action || "");

    if (req.method === "GET") {
      if (action === "getGames") {
        return send(res, 200, { success: true, data: await getContents(false) });
      }
      if (action === "getAllGames") {
        return send(res, 200, { success: true, data: await getContents(true) });
      }
      if (action === "getStorage") {
        return send(res, 200, { success: true, storage: await getStorage() });
      }
      if (action === "migrateLegacy") {
        if (!tokenAllowed(req)) return send(res, 403, { success: false, error: "forbidden" });
        const result = await migrateLegacyData();
        return send(res, 200, { success: true, migration: result });
      }
      return send(res, 404, { success: false, error: "unknown_action" });
    }

    if (req.method === "POST") {
      if (action === "addGame") {
        const content = normalizeContent(body.game || {});
        await ensureSchema();
        await sql`
          INSERT INTO edu_contents (id, data, created_at, updated_at)
          VALUES (${content.id}, ${JSON.stringify(content)}::jsonb, NOW(), NOW())
          ON CONFLICT (id)
          DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
        `;
        return send(res, 200, { success: true, id: content.id, data: content });
      }

      if (action === "updateGame") {
        const gameId = String(body.gameId || body.id || "").trim();
        if (!gameId) return send(res, 400, { success: false, error: "missing_game_id" });
        await ensureSchema();
        const rows = await sql`
          SELECT data
          FROM edu_contents
          WHERE id = ${gameId}
          LIMIT 1;
        `;
        if (!rows?.[0]) return send(res, 404, { success: false, error: "not_found" });
        const current = normalizeContent(rows[0].data || {});
        const updated = normalizeContent({
          ...current,
          ...(body.game || {}),
          status: body.status ?? body.game?.status ?? current.status,
          game_link: body.gameLink ?? body.game?.game_link ?? current.game_link,
          reviewed_at: body.reviewed_at ?? body.game?.reviewed_at ?? current.reviewed_at,
        });
        await sql`
          UPDATE edu_contents
          SET data = ${JSON.stringify(updated)}::jsonb, updated_at = NOW()
          WHERE id = ${gameId};
        `;
        return send(res, 200, { success: true, data: updated });
      }

      if (action === "deleteGame") {
        const gameId = String(body.gameId || body.id || "").trim();
        if (!gameId) return send(res, 400, { success: false, error: "missing_game_id" });
        await ensureSchema();
        await sql`DELETE FROM edu_contents WHERE id = ${gameId};`;
        return send(res, 200, { success: true });
      }

      if (action === "saveStorage") {
        return send(res, 200, { success: true, storage: await saveStorage(body.storage || {}) });
      }

      if (action === "migrateLegacy") {
        if (!tokenAllowed(req)) return send(res, 403, { success: false, error: "forbidden" });
        const result = await migrateLegacyData();
        return send(res, 200, { success: true, migration: result });
      }

      return send(res, 404, { success: false, error: "unknown_action" });
    }

    return send(res, 405, { success: false, error: "method_not_allowed" });
  } catch (error) {
    return send(res, 500, {
      success: false,
      error: "vercel_db_error",
      message: String(error?.message || error),
    });
  }
}
