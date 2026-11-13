// استوديو شهادات التقدير الذكي — منطق الخادم.
// يُستدعى فقط بعد أن يتحقق api/subscriptions.js من جلسة المعلّم ومن وجود اشتراك فعّال،
// لذلك لا تصل القوالب ولا العبارات ولا المشاريع ولا إذن التصدير إلى غير المشتركين.
import { randomUUID } from "node:crypto";

const maximumBodyBytes = 1536 * 1024;
const maximumLogoLength = 420 * 1024;
const maximumRecipients = 300;
const projectIdPattern = /^[A-Za-z0-9_-]{8,64}$/;
const colorPattern = /^#[0-9a-fA-F]{6}$/;
const invalidText = /[\u0000\uD800-\uDFFF]/u;
const fonts = new Set(["Amiri", "Cairo", "Tajawal", "Reem Kufi", "Noto Naskh Arabic", "Aref Ruqaa", "El Messiri", "Changa"]);

export const CERTIFICATE_TEMPLATES = [
  // خلفيات صممها ChatGPT لكل مرحلة دراسية؛ المحتوى يُرسم داخل المساحة الآمنة safe.
  { id: "kids-rainbow", stage: "1-4", name: "قوس قزح المرح", category: "الصفوف الأولى", style: "image", image: "/certificates/backgrounds/kids-rainbow.jpg",
    safe: [0.15, 0.1, 0.85, 0.9], seal: "fun-star", fonts: { heading: "Changa", name: "Changa", body: "Tajawal" },
    palette: { bg: "#fffbf0", bg2: "#fff4d9", primary: "#1f6fb2", accent: "#f4a300", accentText: "#e07b00", text: "#2d2f45", muted: "#5e6a7d" } },
  { id: "kids-space", stage: "1-4", name: "رحلة الفضاء", category: "الصفوف الأولى", style: "image", image: "/certificates/backgrounds/kids-space.jpg",
    safe: [0.09, 0.12, 0.91, 0.88], seal: "fun-star", fonts: { heading: "Changa", name: "Changa", body: "Tajawal" },
    palette: { bg: "#fffdf7", bg2: "#efe9ff", primary: "#4b2e9e", accent: "#e6a817", accentText: "#c98a00", text: "#2a2440", muted: "#6a6385" } },
  { id: "middle-achievement", stage: "5-8", name: "منصة الإنجاز", category: "عصري", style: "image", image: "/certificates/backgrounds/middle-achievement.jpg",
    safe: [0.12, 0.08, 0.92, 0.84], seal: "none", fonts: { heading: "El Messiri", name: "El Messiri", body: "Cairo" },
    palette: { bg: "#ffffff", bg2: "#f4f0ff", primary: "#4a1f8f", accent: "#c9971f", text: "#22163a", muted: "#625a7a" } },
  { id: "middle-learning", stage: "5-8", name: "شغف التعلّم", category: "عصري", style: "image", image: "/certificates/backgrounds/middle-learning.jpg",
    safe: [0.14, 0.12, 0.86, 0.86], seal: "medal", fonts: { heading: "El Messiri", name: "El Messiri", body: "Cairo" },
    palette: { bg: "#ffffff", bg2: "#eef7f8", primary: "#0d4f7a", accent: "#e08a1a", text: "#14263d", muted: "#55708f" } },
  { id: "high-marble", stage: "9-12", name: "الرخام الزمردي", category: "فاخر", style: "image", image: "/certificates/backgrounds/high-marble.jpg",
    safe: [0.12, 0.1, 0.88, 0.9], seal: "rosette", fonts: { heading: "Aref Ruqaa", name: "Aref Ruqaa", body: "Cairo" },
    palette: { bg: "#ffffff", bg2: "#f2f2ee", primary: "#0f5541", accent: "#b98a2c", text: "#14281f", muted: "#55695f" } },
  { id: "high-royal", stage: "9-12", name: "الإطار الملكي الإسلامي", category: "فاخر", style: "image", image: "/certificates/backgrounds/high-royal.jpg",
    safe: [0.14, 0.16, 0.86, 0.86], seal: "rosette", fonts: { heading: "Aref Ruqaa", name: "Aref Ruqaa", body: "Cairo" },
    palette: { bg: "#fffaf0", bg2: "#f3ead6", primary: "#0d2a4d", accent: "#b98a2c", text: "#1d2a3a", muted: "#5d6a7a" } },
  { id: "royal-gold", stage: "9-12", name: "الذهبي الفاخر", category: "فاخر", style: "luxe-dark", seal: "rosette", metalText: true,
    fonts: { heading: "Aref Ruqaa", name: "Aref Ruqaa", body: "Cairo" },
    palette: { bg: "#0b2340", bg2: "#071829", primary: "#0d2a4d", accent: "#d4a94a", accentText: "#e6c477", text: "#eef2f7", muted: "#b9c6d6" } },
  { id: "classic-blue", stage: "5-8", name: "الهندسي العصري", category: "عصري", style: "geo-modern", seal: "rosette",
    fonts: { heading: "El Messiri", name: "El Messiri", body: "Cairo" },
    palette: { bg: "#ffffff", bg2: "#f2f6fb", primary: "#123d7a", secondary: "#3d8bfd", accent: "#c9a13b", text: "#1b2a40", muted: "#5d6f88" } },
  { id: "royal-purple", stage: "9-12", name: "الشريط الملكي", category: "فاخر", style: "side-band", layout: "side", seal: "rosette",
    fonts: { heading: "Aref Ruqaa", name: "Aref Ruqaa", body: "Cairo" },
    palette: { bg: "#fdfcff", bg2: "#f1ebfa", primary: "#3f1f73", accent: "#d1a646", text: "#24163b", muted: "#6c5a87" } },
  { id: "islamic-emerald", stage: "9-12", name: "المحراب الإسلامي", category: "قرآن وقيم", style: "islamic", seal: "rosette",
    fonts: { heading: "Aref Ruqaa", name: "Amiri", body: "Noto Naskh Arabic" },
    palette: { bg: "#fbfaf3", bg2: "#efeadb", primary: "#0f5541", accent: "#c4993a", text: "#14281f", muted: "#55695f" } },
  { id: "science-teal", stage: "5-8", name: "التميّز العلمي", category: "عصري", style: "hex-tech", seal: "medal", metalText: true,
    fonts: { heading: "Changa", name: "El Messiri", body: "Cairo" },
    palette: { bg: "#0b3a44", bg2: "#06232a", primary: "#0d4652", accent: "#f2b84b", accentText: "#ffd27a", text: "#e8f6f7", muted: "#a9cbd0" } },
  { id: "sky-modern", stage: "5-8", name: "الموجات العصرية", category: "عصري", style: "waves", seal: "medal",
    fonts: { heading: "El Messiri", name: "El Messiri", body: "Cairo" },
    palette: { bg: "#ffffff", bg2: "#eef6ff", primary: "#0f4c9c", secondary: "#29b6f6", accent: "#e0a526", text: "#14263d", muted: "#5a6f8c" } },
  { id: "kids-fun", stage: "1-4", name: "نجوم صغار", category: "الصفوف الأولى", style: "playful", seal: "fun-star",
    fonts: { heading: "Changa", name: "Changa", body: "Tajawal" },
    palette: { bg: "#ffffff", bg2: "#fff4d9", primary: "#ff6b3d", accent: "#2bb3a3", text: "#2d2f45", muted: "#69708a",
      fun: ["#ff6b3d", "#2bb3a3", "#ffc83d", "#7c5cff", "#ff7aa2"] } },
  { id: "rose-girls", stage: "5-8", name: "الأزهار الناعمة", category: "للطالبات", style: "floral", seal: "rosette",
    fonts: { heading: "Aref Ruqaa", name: "Aref Ruqaa", body: "Tajawal" },
    palette: { bg: "#fffafb", bg2: "#fbdde7", primary: "#9b2c5f", secondary: "#f6c9a8", accent: "#c99a45", text: "#3a1a2a", muted: "#8a5d70" } },
  { id: "minimal-black", stage: "9-12", name: "البساطة الأنيقة", category: "فاخر", style: "minimal-lux", seal: "emblem",
    fonts: { heading: "Amiri", name: "Aref Ruqaa", body: "Noto Naskh Arabic" },
    palette: { bg: "#fffefb", bg2: "#f3efe4", primary: "#1c1c1c", accent: "#b8912f", text: "#1c1c1c", muted: "#6d6a63" } },
  { id: "thanks-burgundy", stage: "9-12", name: "الشكر والعرفان", category: "شكر", style: "ribbon-corner", seal: "rosette",
    fonts: { heading: "Aref Ruqaa", name: "Amiri", body: "Cairo" },
    palette: { bg: "#fffcf8", bg2: "#f5ebe3", primary: "#6e1726", accent: "#cfa245", text: "#2e1518", muted: "#7a5a5e" } },
  { id: "oman-green", stage: "5-8", name: "الوطني العُماني", category: "رسمي", style: "guilloche", seal: "rosette",
    fonts: { heading: "El Messiri", name: "Aref Ruqaa", body: "Cairo" },
    palette: { bg: "#fdfefc", bg2: "#eef6f0", primary: "#0d6b3a", secondary: "#c8102e", accent: "#c79a2e", text: "#13261b", muted: "#4d6b59" } },
  { id: "sand-heritage", stage: "9-12", name: "التراث العُماني", category: "رسمي", style: "heritage", seal: "rosette",
    fonts: { heading: "Reem Kufi", name: "Aref Ruqaa", body: "Noto Naskh Arabic" },
    palette: { bg: "#fbf3e2", bg2: "#ecd9b4", primary: "#6b3f17", accent: "#b8862b", text: "#2f2112", muted: "#7a6243" } },
];

// العبارات تحمل صيغة المذكر والمؤنث. {subject} و{grade} تُستبدل تلقائيًا في الواجهة.
export const CERTIFICATE_PHRASES = [
  { id: "excellence", label: "تفوق دراسي", items: [
    { m: "تقديرًا لتفوقه الدراسي وتميّزه في مادة {subject}، متمنين له دوام النجاح والتألق.", f: "تقديرًا لتفوقها الدراسي وتميّزها في مادة {subject}، متمنين لها دوام النجاح والتألق." },
    { m: "لحصوله على مستوى متقدم في مادة {subject}، فهو مثال للطالب المجتهد الطموح.", f: "لحصولها على مستوى متقدم في مادة {subject}، فهي مثال للطالبة المجتهدة الطموحة." },
    { m: "اعتزازًا بتميّزه العلمي في {grade}، سائلين الله له مزيدًا من التوفيق والسداد.", f: "اعتزازًا بتميّزها العلمي في {grade}، سائلين الله لها مزيدًا من التوفيق والسداد." },
  ] },
  { id: "improvement", label: "تحسّن ملحوظ", items: [
    { m: "تقديرًا لتحسّن مستواه الملحوظ في مادة {subject}، وما بذله من جهد ومثابرة.", f: "تقديرًا لتحسّن مستواها الملحوظ في مادة {subject}، وما بذلته من جهد ومثابرة." },
    { m: "لإصراره وعزيمته التي صنعت فرقًا واضحًا في أدائه، فالقادم أجمل بإذن الله.", f: "لإصرارها وعزيمتها التي صنعت فرقًا واضحًا في أدائها، فالقادم أجمل بإذن الله." },
  ] },
  { id: "behavior", label: "سلوك متميّز", items: [
    { m: "تقديرًا لأخلاقه الرفيعة وسلوكه المتميّز، فهو قدوة حسنة لزملائه.", f: "تقديرًا لأخلاقها الرفيعة وسلوكها المتميّز، فهي قدوة حسنة لزميلاتها." },
    { m: "لانضباطه والتزامه واحترامه لمعلميه وزملائه، بارك الله فيه.", f: "لانضباطها والتزامها واحترامها لمعلماتها وزميلاتها، بارك الله فيها." },
  ] },
  { id: "participation", label: "مشاركة فاعلة", items: [
    { m: "تقديرًا لمشاركته الفاعلة وتفاعله الإيجابي في حصص مادة {subject}.", f: "تقديرًا لمشاركتها الفاعلة وتفاعلها الإيجابي في حصص مادة {subject}." },
    { m: "لروحه المبادرة وحضوره المتميّز في الأنشطة الصفية واللاصفية.", f: "لروحها المبادرة وحضورها المتميّز في الأنشطة الصفية واللاصفية." },
  ] },
  { id: "quran", label: "حفظ القرآن الكريم", items: [
    { m: "تقديرًا لحفظه أجزاءً من كتاب الله، جعله الله من أهل القرآن وخاصته.", f: "تقديرًا لحفظها أجزاءً من كتاب الله، جعلها الله من أهل القرآن وخاصته." },
  ] },
  { id: "competition", label: "مسابقة وإنجاز", items: [
    { m: "لتحقيقه مركزًا متقدمًا في المسابقة، رافعًا اسم مدرسته عاليًا.", f: "لتحقيقها مركزًا متقدمًا في المسابقة، رافعةً اسم مدرستها عاليًا." },
    { m: "تقديرًا لإبداعه وتميّزه في مشروعه المقدَّم، متمنين له مستقبلًا مشرقًا.", f: "تقديرًا لإبداعها وتميّزها في مشروعها المقدَّم، متمنين لها مستقبلًا مشرقًا." },
  ] },
  { id: "reading", label: "القراءة والإبداع", items: [
    { m: "تقديرًا لشغفه بالقراءة وإبداعه في التعبير، دمت قارئًا مبدعًا.", f: "تقديرًا لشغفها بالقراءة وإبداعها في التعبير، دمتِ قارئة مبدعة." },
  ] },
  { id: "attendance", label: "الانتظام والمواظبة", items: [
    { m: "لانتظامه ومواظبته على الحضور طوال الفصل الدراسي، فالانضباط طريق النجاح.", f: "لانتظامها ومواظبتها على الحضور طوال الفصل الدراسي، فالانضباط طريق النجاح." },
  ] },
  { id: "thanks", label: "شكر وعرفان", items: [
    { m: "تقديرًا لجهوده المخلصة وعطائه المتميّز، وإسهامه في نجاح العملية التعليمية.", f: "تقديرًا لجهودها المخلصة وعطائها المتميّز، وإسهامها في نجاح العملية التعليمية." },
  ] },
];

export const CERTIFICATE_SUBJECTS = [
  "التربية الإسلامية", "اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "العلوم", "الفيزياء", "الكيمياء",
  "الأحياء", "علوم الأرض والبيئة", "الدراسات الاجتماعية", "هذا وطني", "التاريخ", "الجغرافيا",
  "تقنية المعلومات", "المهارات الحياتية", "الفنون التشكيلية", "المهارات الموسيقية", "الرياضة المدرسية",
  "ريادة الأعمال", "الاقتصاد", "الحاسوب", "القرآن الكريم",
];

const templateIds = new Set(CERTIFICATE_TEMPLATES.map((template) => template.id));
const phraseIds = new Set(CERTIFICATE_PHRASES.map((group) => group.id));
const fieldLimits = {
  heading: 60, subtitle: 60, intro: 220, schoolName: 120, phrase: 420, subject: 80, grade: 60,
  teacherName: 80, principalName: 80, teacherTitle: 40, principalTitle: 40, date: 40, extra: 160,
};

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const cleanText = (value, max) => (typeof value === "string" && !invalidText.test(value) ? value.trim().slice(0, max) : "");

function send(res, status, payload) {
  return res.status(status).json(payload);
}

function isLogo(value) {
  if (typeof value !== "string" || value.length > maximumLogoLength) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  const bytes = Buffer.from(match[2], "base64");
  if (match[1] === "png") return bytes[0] === 0x89 && bytes.toString("latin1", 1, 4) === "PNG";
  if (match[1] === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP";
}

export function normalizeCertificateProject(input) {
  if (!isRecord(input) || input.version !== 1 || !templateIds.has(input.templateId)) return null;
  const fieldsInput = isRecord(input.fields) ? input.fields : {};
  const fields = {};
  for (const [key, max] of Object.entries(fieldLimits)) fields[key] = cleanText(fieldsInput[key], max);
  if (!Array.isArray(input.recipients) || !input.recipients.length || input.recipients.length > maximumRecipients) return null;
  const recipients = [];
  for (const recipient of input.recipients) {
    if (!isRecord(recipient)) return null;
    const name = cleanText(recipient.name, 90);
    if (!name) continue;
    recipients.push({ name, gender: recipient.gender === "f" ? "f" : "m", note: cleanText(recipient.note, 80) });
  }
  if (!recipients.length) return null;
  const colors = isRecord(input.colors) ? input.colors : {};
  const project = {
    version: 1,
    templateId: input.templateId,
    title: cleanText(input.title, 90) || "شهادة تقدير",
    gender: input.gender === "f" ? "f" : "m",
    occasion: phraseIds.has(input.occasion) ? input.occasion : "excellence",
    phraseIndex: Number.isInteger(input.phraseIndex) && input.phraseIndex >= -1 && input.phraseIndex < 50 ? input.phraseIndex : -1,
    font: fonts.has(input.font) ? input.font : "",
    colors: {
      primary: colorPattern.test(colors.primary || "") ? colors.primary : "",
      accent: colorPattern.test(colors.accent || "") ? colors.accent : "",
    },
    fields,
    recipients,
    logo: input.logo == null || input.logo === "" ? "" : (isLogo(input.logo) ? input.logo : null),
  };
  return project.logo === null ? null : project;
}

export function createCertificateStudioHandler(sql, readBodyBuffer) {
  let schemaPromise;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        // ON DELETE CASCADE يخص حذف حساب المعلّم نفسه فقط؛ انتهاء الاشتراك لا يحذف أي مشروع.
        await sql`
          CREATE TABLE IF NOT EXISTS teacher_certificate_projects (
            id TEXT PRIMARY KEY,
            teacher_id TEXT NOT NULL REFERENCES teacher_users(id) ON DELETE CASCADE,
            title TEXT NOT NULL DEFAULT '',
            template_id TEXT NOT NULL DEFAULT '',
            project JSONB NOT NULL,
            recipient_count INTEGER NOT NULL DEFAULT 0,
            export_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `;
        await sql`
          CREATE INDEX IF NOT EXISTS idx_teacher_certificate_projects_teacher
          ON teacher_certificate_projects (teacher_id, updated_at DESC);
        `;
      })().catch((error) => { schemaPromise = undefined; throw error; });
    }
    return schemaPromise;
  }

  async function listProjects(teacherId) {
    await ensureSchema();
    const rows = await sql`
      SELECT id, title, template_id, recipient_count, export_count, created_at, updated_at
      FROM teacher_certificate_projects WHERE teacher_id = ${teacherId}
      ORDER BY updated_at DESC LIMIT 500;
    `;
    return rows.map((row) => ({
      id: row.id, title: row.title, templateId: row.template_id, recipientCount: Number(row.recipient_count || 0),
      exportCount: Number(row.export_count || 0), createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }

  // يُستخدم لغير المشتركين: عدد المشاريع المحفوظة فقط ليعرف المعلّم أنها باقية، دون أي محتوى.
  async function savedProjectCount(teacherId) {
    try {
      await ensureSchema();
      const [row] = await sql`SELECT COUNT(*)::int AS total FROM teacher_certificate_projects WHERE teacher_id = ${teacherId};`;
      return Number(row?.total || 0);
    } catch {
      return 0;
    }
  }

  async function readJson(req, res) {
    if (!/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers?.["content-type"] || ""))) {
      send(res, 415, { error: "invalid_content_type" });
      return undefined;
    }
    if (Number(req.headers?.["content-length"]) > maximumBodyBytes) {
      send(res, 413, { error: "project_too_large", maxBytes: maximumBodyBytes });
      return undefined;
    }
    try {
      const buffer = await readBodyBuffer(req, maximumBodyBytes);
      return JSON.parse(buffer.toString("utf8"));
    } catch (error) {
      if (error?.statusCode === 413) send(res, 413, { error: "project_too_large", maxBytes: maximumBodyBytes });
      else send(res, 400, { error: "invalid_project" });
      return undefined;
    }
  }

  async function access(req, res, teacher) {
    const projects = await listProjects(teacher.id);
    return send(res, 200, {
      teacher,
      templates: CERTIFICATE_TEMPLATES,
      phrases: CERTIFICATE_PHRASES,
      subjects: CERTIFICATE_SUBJECTS,
      projects,
    });
  }

  async function project(req, res, teacher) {
    await ensureSchema();
    if (req.method === "GET") {
      const id = String(req.query?.id || "");
      if (!projectIdPattern.test(id)) return send(res, 400, { error: "invalid_project_id" });
      const [row] = await sql`
        SELECT id, project, updated_at FROM teacher_certificate_projects WHERE id = ${id} AND teacher_id = ${teacher.id};
      `;
      if (!row) return send(res, 404, { error: "project_not_found" });
      return send(res, 200, { id: row.id, project: row.project, updatedAt: row.updated_at });
    }
    if (req.method === "DELETE") {
      const id = String(req.query?.id || "");
      if (!projectIdPattern.test(id)) return send(res, 400, { error: "invalid_project_id" });
      const [row] = await sql`
        DELETE FROM teacher_certificate_projects WHERE id = ${id} AND teacher_id = ${teacher.id} RETURNING id;
      `;
      return row ? send(res, 200, { ok: true }) : send(res, 404, { error: "project_not_found" });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, DELETE");
      return send(res, 405, { error: "method_not_allowed" });
    }
    const payload = await readJson(req, res);
    if (payload === undefined) return undefined;
    if (!isRecord(payload)) return send(res, 400, { error: "invalid_project" });
    const normalized = normalizeCertificateProject(payload.project);
    if (!normalized) return send(res, 400, { error: "invalid_project" });
    const serialized = JSON.stringify(normalized);
    if (Buffer.byteLength(serialized, "utf8") > maximumBodyBytes) return send(res, 413, { error: "project_too_large" });

    const requestedId = payload.id == null || payload.id === "" ? "" : String(payload.id);
    if (requestedId && !projectIdPattern.test(requestedId)) return send(res, 400, { error: "invalid_project_id" });
    if (requestedId) {
      const [updated] = await sql`
        UPDATE teacher_certificate_projects
        SET title = ${normalized.title}, template_id = ${normalized.templateId}, project = ${serialized}::jsonb,
            recipient_count = ${normalized.recipients.length}, updated_at = NOW()
        WHERE id = ${requestedId} AND teacher_id = ${teacher.id}
        RETURNING id, updated_at;
      `;
      if (!updated) return send(res, 404, { error: "project_not_found" });
      return send(res, 200, { id: updated.id, updatedAt: updated.updated_at });
    }
    const id = randomUUID().replace(/-/g, "");
    const [created] = await sql`
      INSERT INTO teacher_certificate_projects (id, teacher_id, title, template_id, project, recipient_count)
      VALUES (${id}, ${teacher.id}, ${normalized.title}, ${normalized.templateId}, ${serialized}::jsonb, ${normalized.recipients.length})
      RETURNING id, updated_at;
    `;
    return send(res, 201, { id: created.id, updatedAt: created.updated_at });
  }

  // إذن التصدير يصدر من الخادم بعد التحقق من الاشتراك؛ الواجهة لا تُصدّر دونه.
  async function exportPermit(req, res, teacher) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(res, 405, { error: "method_not_allowed" });
    }
    const payload = await readJson(req, res);
    if (payload === undefined) return undefined;
    const count = Number(payload?.count);
    if (!Number.isInteger(count) || count < 1 || count > maximumRecipients) return send(res, 400, { error: "invalid_export" });
    const projectId = typeof payload?.projectId === "string" && projectIdPattern.test(payload.projectId) ? payload.projectId : "";
    if (projectId) {
      await ensureSchema();
      await sql`
        UPDATE teacher_certificate_projects SET export_count = export_count + ${count}
        WHERE id = ${projectId} AND teacher_id = ${teacher.id};
      `;
    }
    return send(res, 200, { ok: true, count, issuedAt: new Date().toISOString() });
  }

  return {
    savedProjectCount,
    async handle(action, req, res, teacher) {
      try {
        if (action === "certificates_access") return await access(req, res, teacher);
        if (action === "certificates_project") return await project(req, res, teacher);
        if (action === "certificates_export") return await exportPermit(req, res, teacher);
        return send(res, 404, { error: "unknown_action" });
      } catch {
        return send(res, 503, { error: "certificates_unavailable" });
      }
    },
  };
}
