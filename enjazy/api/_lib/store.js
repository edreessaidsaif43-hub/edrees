import { neon } from "@neondatabase/serverless";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";
const MOTIVATION_DATABASE_URL =
  process.env.MOTIVATION_DATABASE_URL ||
  process.env.MOTIVATION_POSTGRES_URL ||
  DATABASE_URL;

function safeNeonClient(url) {
  const normalized = String(url || "").trim();
  if (!normalized) return null;
  try {
    return neon(normalized);
  } catch {
    return null;
  }
}

const sql = safeNeonClient(DATABASE_URL);
const motivationSql = safeNeonClient(MOTIVATION_DATABASE_URL);
const hasDbEnv = !!sql;
const hasMotivationDbEnv = !!motivationSql;
let schemaInitPromise = null;
let motivationSchemaInitPromise = null;

function dbUnavailable() {
  return { error: "db_not_configured" };
}

function randomId(length = 10) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function normalizeContact(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeInviteCode(value) {
  return String(value || "").trim().toUpperCase();
}

function extractUserIdFromTeacherKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("U-") ? raw.slice(2) : raw;
}

function toTeacherKey(userId) {
  const raw = String(userId || "").trim();
  if (!raw) return "";
  return raw.startsWith("U-") ? raw : `U-${raw}`;
}

function classTeacherUserIds(classData, ownerUserId = "") {
  const set = new Set();
  if (ownerUserId) set.add(String(ownerUserId).trim());
  const ownerTeacherKey = String(classData?.ownerTeacherId || "").trim();
  if (ownerTeacherKey) set.add(extractUserIdFromTeacherKey(ownerTeacherKey));
  const ids = Array.isArray(classData?.teacherIds) ? classData.teacherIds : [];
  ids.forEach((id) => {
    const u = extractUserIdFromTeacherKey(id);
    if (u) set.add(u);
  });
  return Array.from(set).filter(Boolean);
}

function sanitizeProfile(profile = {}) {
  const out = { ...profile };
  delete out.password;
  delete out.contactNorm;
  return out;
}

function sanitizeSharePayload(payload) {
  return {
    profile: sanitizeProfile(payload?.profile || {}),
    entries: Array.isArray(payload?.entries) ? payload.entries : [],
    generatedAt: payload?.generatedAt || new Date().toISOString(),
  };
}

async function ensureSchema() {
  if (!hasDbEnv) return;
  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS teacher_users (
          id TEXT PRIMARY KEY,
          contact_norm TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          profile JSONB NOT NULL DEFAULT '{}'::jsonb,
          entries JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS portfolio_shares (
          id TEXT PRIMARY KEY,
          owner_user_id TEXT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NULL
        );
      `;
      await sql`
        ALTER TABLE portfolio_shares
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT NULL;
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_teacher_users_contact_norm
        ON teacher_users (contact_norm);
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_portfolio_shares_expires_at
        ON portfolio_shares (expires_at);
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_shares_owner_user_id_unique
        ON portfolio_shares (owner_user_id)
        WHERE owner_user_id IS NOT NULL;
      `;
    })();
  }
  await schemaInitPromise;
}

async function ensureMotivationSchema() {
  if (!hasMotivationDbEnv) return;
  if (!motivationSchemaInitPromise) {
    motivationSchemaInitPromise = (async () => {
      await motivationSql`
        CREATE TABLE IF NOT EXISTS motivation_teacher_states (
          user_id TEXT PRIMARY KEY,
          state JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await motivationSql`
        CREATE INDEX IF NOT EXISTS idx_motivation_teacher_states_updated_at
        ON motivation_teacher_states (updated_at DESC);
      `;
      await motivationSql`
        CREATE TABLE IF NOT EXISTS motivation_shared_classes (
          shared_id TEXT PRIMARY KEY,
          invite_code TEXT UNIQUE NOT NULL,
          owner_user_id TEXT NOT NULL,
          class_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          teacher_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await motivationSql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_motivation_shared_classes_invite_code
        ON motivation_shared_classes (invite_code);
      `;
      await motivationSql`
        CREATE INDEX IF NOT EXISTS idx_motivation_shared_classes_updated_at
        ON motivation_shared_classes (updated_at DESC);
      `;
    })();
  }
  await motivationSchemaInitPromise;
}

async function getUserByContact(contactNorm) {
  await ensureSchema();
  const rows = await sql`
    SELECT id, contact_norm, password, profile, entries
    FROM teacher_users
    WHERE contact_norm = ${contactNorm}
    LIMIT 1;
  `;
  return rows?.[0] || null;
}

async function getUserById(userId) {
  await ensureSchema();
  const rows = await sql`
    SELECT id, contact_norm, password, profile, entries
    FROM teacher_users
    WHERE id = ${userId}
    LIMIT 1;
  `;
  return rows?.[0] || null;
}

export async function registerTeacher(payload) {
  if (!hasDbEnv) return dbUnavailable();
  try {
    const contactNorm = normalizeContact(payload?.contact);
    const password = String(payload?.password || "");
    if (!contactNorm || !password) {
      return { error: "invalid_payload", message: "Missing contact or password." };
    }

    const existing = await getUserByContact(contactNorm);
    if (existing) return { error: "user_exists", message: "Account already exists." };

    const userId = randomId(10);
    const profile = {
      name: String(payload?.name || ""),
      contact: String(payload?.contact || ""),
      school: String(payload?.school || ""),
      subject: String(payload?.subject || ""),
      grades: String(payload?.grades || ""),
      shareTheme: String(payload?.shareTheme || "classic"),
    };

    await sql`
      INSERT INTO teacher_users (id, contact_norm, password, profile, entries, created_at, updated_at)
      VALUES (
        ${userId},
        ${contactNorm},
        ${password},
        ${JSON.stringify(profile)}::jsonb,
        ${JSON.stringify([])}::jsonb,
        NOW(),
        NOW()
      );
    `;

    return {
      data: {
        userId,
        profile: sanitizeProfile(profile),
        entries: [],
      },
    };
  } catch (error) {
    if (String(error?.message || "").includes("duplicate")) {
      return { error: "user_exists", message: "Account already exists." };
    }
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function loginTeacher(payload) {
  if (!hasDbEnv) return dbUnavailable();
  try {
    const contactNorm = normalizeContact(payload?.contact);
    const password = String(payload?.password || "");
    if (!contactNorm || !password) {
      return { error: "invalid_credentials", message: "Missing credentials." };
    }

    const user = await getUserByContact(contactNorm);
    if (!user) return { error: "not_found", message: "Account not found." };
    if (String(user.password || "") !== password) {
      return { error: "invalid_credentials", message: "Password mismatch." };
    }

    return {
      data: {
        userId: user.id,
        profile: sanitizeProfile(user.profile || {}),
        entries: Array.isArray(user.entries) ? user.entries : [],
      },
    };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function resetTeacherPassword(payload) {
  if (!hasDbEnv) return dbUnavailable();
  try {
    const contactNorm = normalizeContact(payload?.contact);
    const newPassword = String(payload?.newPassword || "");
    const name = String(payload?.name || "").trim();
    if (!contactNorm || !newPassword) {
      return { error: "invalid_payload", message: "Missing reset fields." };
    }

    const user = await getUserByContact(contactNorm);
    if (!user) return { error: "not_found", message: "Account not found." };
    if (name) {
      const currentName = String(user?.profile?.name || "").trim();
      if (currentName !== name) {
        return { error: "name_mismatch", message: "Teacher name does not match." };
      }
    }

    await sql`
      UPDATE teacher_users
      SET password = ${newPassword}, updated_at = NOW()
      WHERE id = ${user.id};
    `;
    return { data: { ok: true } };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function saveTeacherPortfolio(payload) {
  if (!hasDbEnv) return dbUnavailable();
  try {
    const userId = String(payload?.userId || "");
    if (!userId) return { error: "invalid_payload", message: "Missing userId." };

    const user = await getUserById(userId);
    if (!user) return { error: "not_found", message: "User not found." };

    const incomingProfile = payload?.profile || {};
    const profile = {
      name: String(incomingProfile.name || user?.profile?.name || ""),
      contact: String(incomingProfile.contact || user?.profile?.contact || ""),
      school: String(incomingProfile.school || user?.profile?.school || ""),
      subject: String(incomingProfile.subject || user?.profile?.subject || ""),
      grades: String(incomingProfile.grades || user?.profile?.grades || ""),
      shareTheme: String(incomingProfile.shareTheme || user?.profile?.shareTheme || "classic"),
    };
    const contactNorm = normalizeContact(profile.contact);
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];

    await sql`
      UPDATE teacher_users
      SET
        contact_norm = ${contactNorm},
        profile = ${JSON.stringify(profile)}::jsonb,
        entries = ${JSON.stringify(entries)}::jsonb,
        updated_at = NOW()
      WHERE id = ${user.id};
    `;
    return { data: { ok: true } };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function loadTeacherPortfolio(userId) {
  if (!hasDbEnv) return dbUnavailable();
  try {
    const user = await getUserById(String(userId || ""));
    if (!user) return { error: "not_found", message: "User not found." };
    return {
      data: {
        userId: user.id,
        profile: sanitizeProfile(user.profile || {}),
        entries: Array.isArray(user.entries) ? user.entries : [],
      },
    };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function loadTeacherMotivation(userId) {
  if (!hasMotivationDbEnv) return dbUnavailable();
  try {
    await ensureMotivationSchema();
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return { error: "invalid_payload", message: "Missing userId." };
    const rows = await motivationSql`
      SELECT state
      FROM motivation_teacher_states
      WHERE user_id = ${normalizedUserId}
      LIMIT 1;
    `;
    const row = rows?.[0] || null;
    const sharedRows = await motivationSql`
      SELECT class_data
      FROM motivation_shared_classes
      WHERE teacher_user_ids @> ${JSON.stringify([normalizedUserId])}::jsonb;
    `;
    const sharedClasses = (sharedRows || [])
      .map((r) => (r?.class_data && typeof r.class_data === "object" ? r.class_data : null))
      .filter(Boolean);
    let state = row?.state && typeof row.state === "object" ? row.state : null;
    if (sharedClasses.length) {
      const classes = Array.isArray(state?.classes) ? [...state.classes] : [];
      const byShared = new Map();
      classes.forEach((cls) => {
        const key = String(cls?.sharedId || cls?.id || "");
        if (key) byShared.set(key, cls);
      });
      sharedClasses.forEach((cls) => {
        const key = String(cls?.sharedId || cls?.id || "");
        if (!key) return;
        byShared.set(key, cls);
      });
      const mergedClasses = Array.from(byShared.values());
      state = {
        ...(state && typeof state === "object" ? state : {}),
        classes: mergedClasses,
        activeClassId:
          (state && mergedClasses.some((c) => c?.id === state.activeClassId))
            ? state.activeClassId
            : (mergedClasses[0]?.id || ""),
        updatedAt: Number(state?.updatedAt || Date.now()),
      };
    }
    return {
      data: {
        userId: normalizedUserId,
        state: state && typeof state === "object" ? state : null,
      },
    };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function saveTeacherMotivation(payload) {
  if (!hasMotivationDbEnv) return dbUnavailable();
  try {
    const userId = String(payload?.userId || "");
    const state = payload?.state;
    if (!userId || !state || typeof state !== "object") {
      return { error: "invalid_payload", message: "Missing userId or state." };
    }
    await ensureMotivationSchema();
    const normalizedUserId = userId.trim();
    await motivationSql`
      INSERT INTO motivation_teacher_states (user_id, state, created_at, updated_at)
      VALUES (
        ${normalizedUserId},
        ${JSON.stringify(state)}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        state = EXCLUDED.state,
        updated_at = NOW();
    `;

    const classes = Array.isArray(state?.classes) ? state.classes : [];
    for (const cls of classes) {
      const sharedId = String(cls?.sharedId || "").trim();
      const inviteCode = normalizeInviteCode(cls?.inviteCode || "");
      if (!sharedId || !inviteCode) continue;
      const ownerUserId = extractUserIdFromTeacherKey(cls?.ownerTeacherId || normalizedUserId) || normalizedUserId;
      const teacherUserIds = classTeacherUserIds(cls, normalizedUserId);
      await motivationSql`
        INSERT INTO motivation_shared_classes (
          shared_id, invite_code, owner_user_id, class_data, teacher_user_ids, created_at, updated_at
        )
        VALUES (
          ${sharedId},
          ${inviteCode},
          ${ownerUserId},
          ${JSON.stringify(cls)}::jsonb,
          ${JSON.stringify(teacherUserIds)}::jsonb,
          NOW(),
          NOW()
        )
        ON CONFLICT (shared_id)
        DO UPDATE SET
          invite_code = EXCLUDED.invite_code,
          owner_user_id = EXCLUDED.owner_user_id,
          class_data = EXCLUDED.class_data,
          teacher_user_ids = EXCLUDED.teacher_user_ids,
          updated_at = NOW();
      `;
    }

    return { data: { ok: true } };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function joinTeacherMotivationClassByCode(payload) {
  if (!hasMotivationDbEnv) return dbUnavailable();
  try {
    await ensureMotivationSchema();
    const userId = String(payload?.userId || "").trim();
    const inviteCode = normalizeInviteCode(payload?.inviteCode || "");
    if (!userId || !inviteCode) {
      return { error: "invalid_payload", message: "Missing userId or inviteCode." };
    }

    const rows = await motivationSql`
      SELECT shared_id, class_data, teacher_user_ids
      FROM motivation_shared_classes
      WHERE invite_code = ${inviteCode}
      LIMIT 1;
    `;
    let row = rows?.[0] || null;
    let classData = row?.class_data && typeof row.class_data === "object" ? row.class_data : null;
    let sharedId = String(row?.shared_id || "").trim();
    let teacherUserIdsRow = row?.teacher_user_ids;

    // Backfill path: old data may exist only inside teacher state and not yet in motivation_shared_classes.
    if (!row || !classData) {
      const backfillRows = await motivationSql`
        SELECT
          mts.user_id AS owner_user_id,
          cls.value AS class_data
        FROM motivation_teacher_states AS mts,
        LATERAL jsonb_array_elements(COALESCE(mts.state->'classes', '[]'::jsonb)) AS cls(value)
        WHERE UPPER(COALESCE(cls.value->>'inviteCode', '')) = ${inviteCode}
        LIMIT 1;
      `;
      const backfill = backfillRows?.[0] || null;
      const candidate = backfill?.class_data && typeof backfill.class_data === "object" ? backfill.class_data : null;
      if (!candidate) return { error: "not_found", message: "Class code not found." };
      classData = candidate;
      sharedId = String(classData?.sharedId || "").trim() || randomId(16);
      teacherUserIdsRow = classTeacherUserIds(classData, String(backfill?.owner_user_id || "").trim());
    }

    const teacherUserIds = new Set(
      Array.isArray(teacherUserIdsRow) ? teacherUserIdsRow.map((x) => String(x || "").trim()).filter(Boolean) : []
    );
    teacherUserIds.add(userId);

    const teacherKey = toTeacherKey(userId);
    const teacherKeys = new Set(
      Array.isArray(classData.teacherIds) ? classData.teacherIds.map((x) => String(x || "").trim()).filter(Boolean) : []
    );
    if (teacherKey) teacherKeys.add(teacherKey);

    const nextClassData = {
      ...classData,
      sharedId: sharedId || String(classData?.sharedId || "").trim() || randomId(16),
      inviteCode: inviteCode,
      teacherIds: Array.from(teacherKeys),
    };

    const ownerUserId =
      extractUserIdFromTeacherKey(nextClassData?.ownerTeacherId || "") ||
      Array.from(teacherUserIds)[0] ||
      userId;
    await motivationSql`
      INSERT INTO motivation_shared_classes (
        shared_id, invite_code, owner_user_id, class_data, teacher_user_ids, created_at, updated_at
      )
      VALUES (
        ${nextClassData.sharedId},
        ${inviteCode},
        ${ownerUserId},
        ${JSON.stringify(nextClassData)}::jsonb,
        ${JSON.stringify(Array.from(teacherUserIds))}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (shared_id)
      DO UPDATE SET
        invite_code = EXCLUDED.invite_code,
        owner_user_id = EXCLUDED.owner_user_id,
        class_data = EXCLUDED.class_data,
        teacher_user_ids = EXCLUDED.teacher_user_ids,
        updated_at = NOW();
    `;

    return { data: { classData: nextClassData } };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function clearTeacherPortfolio(userId) {
  if (!hasDbEnv) return dbUnavailable();
  try {
    const user = await getUserById(String(userId || ""));
    if (!user) return { error: "not_found", message: "User not found." };
    await sql`
      UPDATE teacher_users
      SET entries = ${JSON.stringify([])}::jsonb, updated_at = NOW()
      WHERE id = ${user.id};
    `;
    return { data: { ok: true } };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function createPortfolio(payload, options = {}) {
  if (!hasDbEnv) return dbUnavailable();
  try {
    await ensureSchema();
    const data = sanitizeSharePayload(payload);
    const userId = String(payload?.userId || "").trim();
    const forceNew = !!options?.forceNew;

    if (!userId) {
      return { error: "invalid_payload", message: "Missing userId for portfolio share link." };
    }

    if (!forceNew) {
      const existingRows = await sql`
        SELECT id
        FROM portfolio_shares
        WHERE owner_user_id = ${userId}
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1;
      `;
      const existing = existingRows?.[0];
      if (existing?.id) {
        await sql`
          UPDATE portfolio_shares
          SET data = ${JSON.stringify(data)}::jsonb,
              created_at = NOW(),
              expires_at = NOW() + INTERVAL '90 days'
          WHERE id = ${existing.id};
        `;
        return { id: existing.id, data, reused: true };
      }
    } else {
      await sql`
        DELETE FROM portfolio_shares
        WHERE owner_user_id = ${userId};
      `;
    }

    const id = randomId(8);
    await sql`
      INSERT INTO portfolio_shares (id, owner_user_id, data, created_at, expires_at)
      VALUES (
        ${id},
        ${userId},
        ${JSON.stringify(data)}::jsonb,
        NOW(),
        NOW() + INTERVAL '90 days'
      );
    `;
    return { id, data, reused: false };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function readPortfolio(id) {
  if (!hasDbEnv) return dbUnavailable();
  try {
    await ensureSchema();
    const rows = await sql`
      SELECT data
      FROM portfolio_shares
      WHERE id = ${String(id || "")}
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1;
    `;
    const row = rows?.[0];
    if (!row) return { error: "not_found" };
    return { data: row.data };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function listTeacherAccounts() {
  if (!hasDbEnv) return dbUnavailable();
  try {
    await ensureSchema();
    const rows = await sql`
      SELECT id, profile, created_at, updated_at, entries
      FROM teacher_users
      ORDER BY updated_at DESC;
    `;
    const accounts = (rows || []).map((r) => {
      const profile = sanitizeProfile(r.profile || {});
      const entries = Array.isArray(r.entries) ? r.entries : [];
      return {
        userId: r.id,
        profile,
        entriesCount: entries.length,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
    return { data: accounts };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function loadTeacherAccountByAdmin(userId) {
  if (!hasDbEnv) return dbUnavailable();
  try {
    const user = await getUserById(String(userId || ""));
    if (!user) return { error: "not_found", message: "User not found." };
    return {
      data: {
        userId: user.id,
        profile: sanitizeProfile(user.profile || {}),
        entries: Array.isArray(user.entries) ? user.entries : [],
      },
    };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function updateTeacherAccountByAdmin(payload) {
  if (!hasDbEnv) return dbUnavailable();
  try {
    const userId = String(payload?.userId || "");
    if (!userId) return { error: "invalid_payload", message: "Missing userId." };

    const user = await getUserById(userId);
    if (!user) return { error: "not_found", message: "User not found." };

    const incomingProfile = payload?.profile || {};
    const profile = {
      name: String(incomingProfile.name || user?.profile?.name || ""),
      contact: String(incomingProfile.contact || user?.profile?.contact || ""),
      school: String(incomingProfile.school || user?.profile?.school || ""),
      subject: String(incomingProfile.subject || user?.profile?.subject || ""),
      grades: String(incomingProfile.grades || user?.profile?.grades || ""),
      shareTheme: String(incomingProfile.shareTheme || user?.profile?.shareTheme || "classic"),
    };
    const entries = Array.isArray(payload?.entries) ? payload.entries : (Array.isArray(user.entries) ? user.entries : []);
    const contactNorm = normalizeContact(profile.contact);
    const newPassword = String(payload?.newPassword || "");

    if (!profile.contact) {
      return { error: "invalid_payload", message: "Contact is required." };
    }

    if (newPassword) {
      await sql`
        UPDATE teacher_users
        SET
          contact_norm = ${contactNorm},
          password = ${newPassword},
          profile = ${JSON.stringify(profile)}::jsonb,
          entries = ${JSON.stringify(entries)}::jsonb,
          updated_at = NOW()
        WHERE id = ${userId};
      `;
    } else {
      await sql`
        UPDATE teacher_users
        SET
          contact_norm = ${contactNorm},
          profile = ${JSON.stringify(profile)}::jsonb,
          entries = ${JSON.stringify(entries)}::jsonb,
          updated_at = NOW()
        WHERE id = ${userId};
      `;
    }

    return {
      data: {
        ok: true,
        userId,
        profile: sanitizeProfile(profile),
        entries,
      },
    };
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("duplicate")) {
      return { error: "contact_exists", message: "Another account already uses this contact." };
    }
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function deleteTeacherAccountByAdmin(userId) {
  if (!hasDbEnv) return dbUnavailable();
  try {
    const id = String(userId || "");
    if (!id) return { error: "invalid_payload", message: "Missing userId." };
    await ensureSchema();
    await sql`DELETE FROM portfolio_shares WHERE owner_user_id = ${id};`;
    const deleted = await sql`
      DELETE FROM teacher_users
      WHERE id = ${id}
      RETURNING id;
    `;
    if (!Array.isArray(deleted) || deleted.length < 1) {
      return { error: "not_found", message: "User not found." };
    }
    return { data: { ok: true } };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}
