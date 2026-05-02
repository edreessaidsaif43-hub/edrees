import { neon } from "@neondatabase/serverless";

const MASH_DATABASE_URL =
  process.env.MASH_DATABASE_URL ||
  process.env.MASH_POSTGRES_URL ||
  "";

function safeNeonClient(url) {
  const normalized = String(url || "").trim();
  if (!normalized) return null;
  try {
    return neon(normalized);
  } catch {
    return null;
  }
}

const mashSql = safeNeonClient(MASH_DATABASE_URL);
const hasMashDbEnv = !!mashSql;
let mashSchemaInitPromise = null;

function dbUnavailable() {
  return { error: "db_not_configured" };
}

function randomId(length = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function mashSeedCover(label, from, to) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="1200" height="720" fill="url(#g)"/><circle cx="1020" cy="120" r="180" fill="rgba(255,255,255,.16)"/><circle cx="160" cy="610" r="220" fill="rgba(255,255,255,.12)"/><text x="600" y="350" text-anchor="middle" fill="white" font-family="Arial" font-size="54" font-weight="700">${label}</text><text x="600" y="420" text-anchor="middle" fill="rgba(255,255,255,.85)" font-family="Arial" font-size="28">منصة مشاريع المعلمين</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const DEFAULT_MASH_PROJECTS = [
  {
    id: "support-struggling-students",
    title: "مشروع دعم الطلبة المتعثرين",
    teacher: "أ. إدريس الذيابي",
    teacherSlug: "idrees",
    school: "مدرسة ابن دريد",
    category: "مشاريع علاجية",
    subject: "اللغة العربية",
    grade: "الصفوف العليا",
    description: "برنامج علاجي منظم يساعد الطلبة على تجاوز فجوات القراءة والكتابة من خلال خطط قصيرة وقياس أسبوعي.",
    views: 1860,
    featured: true,
    latest: true,
    weeklyTop: true,
    publicInMain: true,
    adminApproved: true,
    cover: mashSeedCover("دعم الطلبة", "#0f766e", "#14b8a6"),
  },
  {
    id: "virtual-science-lab",
    title: "مختبر العلوم الافتراضي",
    teacher: "أ. أحمد",
    teacherSlug: "ahmad",
    school: "مدرسة المستقبل",
    category: "مشاريع رقمية",
    subject: "العلوم",
    grade: "الصف السابع",
    description: "بيئة رقمية تعرض تجارب علمية مصورة ومحاكاة تفاعلية قبل تنفيذ التجربة في المختبر المدرسي.",
    views: 1430,
    featured: true,
    latest: true,
    weeklyTop: false,
    publicInMain: true,
    adminApproved: true,
    cover: mashSeedCover("مختبر العلوم", "#075985", "#38bdf8"),
  },
];

function normalizeMashProject(project = {}) {
  return {
    id: String(project.id || randomId(12)),
    title: String(project.title || ""),
    teacher: String(project.teacher || "مستخدم التحضير الذكي"),
    teacherSlug: String(project.teacherSlug || "demo-teacher"),
    school: String(project.school || ""),
    category: String(project.category || ""),
    subject: String(project.subject || ""),
    grade: String(project.grade || ""),
    description: String(project.description || ""),
    views: Number(project.views || 0),
    featured: !!project.featured,
    latest: project.latest !== false,
    weeklyTop: !!project.weeklyTop,
    publicInMain: project.publicInMain !== false,
    adminApproved: project.adminApproved !== false,
    hidden: !!project.hidden,
    deleted: !!project.deleted,
    cover: String(project.cover || ""),
    logo: String(project.logo || ""),
    media: Array.isArray(project.media) ? project.media : [],
    links: Array.isArray(project.links) ? project.links : [],
    problem: String(project.problem || ""),
    goals: Array.isArray(project.goals) ? project.goals : [],
    steps: Array.isArray(project.steps) ? project.steps : [],
    evidence: Array.isArray(project.evidence) ? project.evidence : [],
    results: String(project.results || ""),
    recommendations: String(project.recommendations || ""),
    createdAt: project.createdAt || new Date().toISOString(),
  };
}

async function ensureMashSchema() {
  if (!hasMashDbEnv) return;
  if (!mashSchemaInitPromise) {
    mashSchemaInitPromise = (async () => {
      await mashSql`
        CREATE TABLE IF NOT EXISTS mash_projects (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await mashSql`
        CREATE INDEX IF NOT EXISTS idx_mash_projects_updated_at
        ON mash_projects (updated_at DESC);
      `;
      const countRows = await mashSql`
        SELECT COUNT(*)::int AS count
        FROM mash_projects;
      `;
      if (Number(countRows?.[0]?.count || 0) === 0) {
        for (const seedProject of DEFAULT_MASH_PROJECTS) {
          const project = normalizeMashProject(seedProject);
          await mashSql`
            INSERT INTO mash_projects (id, data, created_at, updated_at)
            VALUES (${project.id}, ${JSON.stringify(project)}::jsonb, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
          `;
        }
      }
    })();
  }
  await mashSchemaInitPromise;
}

export async function listMashProjects(scope = "") {
  if (!hasMashDbEnv) return dbUnavailable();
  try {
    await ensureMashSchema();
    const rows = await mashSql`
      SELECT data
      FROM mash_projects
      ORDER BY updated_at DESC;
    `;
    const projects = (rows || [])
      .map((row) => normalizeMashProject(row.data || {}))
      .filter((project) => !project.deleted);
    if (scope === "all") return { data: projects };
    if (scope === "mine") return { data: projects.filter((project) => project.teacherSlug === "demo-teacher") };
    return { data: projects.filter((project) => project.publicInMain && project.adminApproved && !project.hidden) };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function createMashProject(payload = {}) {
  if (!hasMashDbEnv) return dbUnavailable();
  try {
    await ensureMashSchema();
    const project = normalizeMashProject({
      ...payload,
      id: randomId(12),
      teacher: payload.teacher || "مستخدم التحضير الذكي",
      teacherSlug: payload.teacherSlug || "demo-teacher",
      views: 0,
      adminApproved: true,
      latest: true,
      createdAt: new Date().toISOString(),
    });
    await mashSql`
      INSERT INTO mash_projects (id, data, created_at, updated_at)
      VALUES (${project.id}, ${JSON.stringify(project)}::jsonb, NOW(), NOW());
    `;
    return { data: project };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function readMashProject(id) {
  if (!hasMashDbEnv) return dbUnavailable();
  try {
    await ensureMashSchema();
    const rows = await mashSql`
      SELECT data
      FROM mash_projects
      WHERE id = ${String(id || "")}
      LIMIT 1;
    `;
    const row = rows?.[0];
    if (!row) return { error: "not_found" };
    const project = normalizeMashProject(row.data || {});
    project.views = Number(project.views || 0) + 1;
    await mashSql`
      UPDATE mash_projects
      SET data = ${JSON.stringify(project)}::jsonb,
          updated_at = NOW()
      WHERE id = ${project.id};
    `;
    return { data: project };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function updateMashProject(id, patch = {}) {
  if (!hasMashDbEnv) return dbUnavailable();
  try {
    await ensureMashSchema();
    const rows = await mashSql`
      SELECT data
      FROM mash_projects
      WHERE id = ${String(id || "")}
      LIMIT 1;
    `;
    const row = rows?.[0];
    if (!row) return { error: "not_found" };
    const project = normalizeMashProject({ ...(row.data || {}), ...patch });
    await mashSql`
      UPDATE mash_projects
      SET data = ${JSON.stringify(project)}::jsonb,
          updated_at = NOW()
      WHERE id = ${project.id};
    `;
    return { data: project };
  } catch (error) {
    return { error: "upstream_failed", message: String(error?.message || error) };
  }
}

export async function getMashStats() {
  const out = await listMashProjects("all");
  if (out.error) return out;
  const projects = out.data || [];
  return {
    data: {
      total: projects.length,
      approved: projects.filter((project) => project.adminApproved).length,
      pending: projects.filter((project) => !project.adminApproved).length,
      publicCount: projects.filter((project) => project.adminApproved && project.publicInMain && !project.hidden).length,
      featured: projects.filter((project) => project.featured).length,
    },
  };
}
