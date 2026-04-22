const ACCOUNTS_KEY = "smart_points_accounts_v1";
const SESSION_KEY = "smart_points_session_v1";
const DATA_PREFIX = "smart_points_data_";
const SHARED_CLASSES_KEY = "smart_points_shared_classes_v1";
const UNIFIED_AUTH_URL = "file:///C:/Users/Irfan%20Bashir/Documents/New%20project2/enjazy/auth.html";
const UNIFIED_AUTH_WEB_PATH = "/enjazy/auth.html";
const UNIFIED_BACKEND_SESSION_KEY = "lesson_platform_backend_session_v1";
const UNIFIED_AUTH_SESSION_KEY = "enjazy_session_v1";
const MOTIVATION_API_LOAD = "/api/motivation/load";
const MOTIVATION_API_SAVE = "/api/motivation/save";
const STUDENT_PHOTO_DB = "smart_points_student_photos_v1";
const STUDENT_PHOTO_STORE = "photos";
const MAX_STUDENT_PHOTO_BYTES = 20 * 1024 * 1024; // 20MB

const reasons = {
  participation: { label: "مشاركة ممتازة", delta: 5 },
  quiz_excellence: { label: "تفوق في اختبار قصير", delta: 5 },
  class_leadership: { label: "قيادة ونشاط داخل الصف", delta: 4 },
  creativity: { label: "فكرة إبداعية مميزة", delta: 4 },
  homework_done: { label: "حل الواجب", delta: 3 },
  teamwork: { label: "تعاون ممتاز مع الزملاء", delta: 3 },
  positive_behavior: { label: "سلوك إيجابي", delta: 2 },
  attendance_on_time: { label: "انضباط بالحضور والوقت", delta: 2 },
  helping_others: { label: "مساعدة زملائه", delta: 2 },
  neatness: { label: "ترتيب ونظافة الدفتر", delta: 2 },
  late_arrival: { label: "تأخر عن الحصة", delta: -1 },
  disruption: { label: "إزعاج", delta: -2 },
  unprepared_tools: { label: "عدم إحضار الأدوات", delta: -2 },
  homework_missing: { label: "عدم حل الواجب", delta: -3 },
  disrespect: { label: "عدم الالتزام بالتعليمات", delta: -3 }
};
const LEVEL_STEP_POINTS = 50;

function uid() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function normalizeName(v) {
  return (v || "").trim().replace(/\s+/g, " ");
}

function normalizeEmail(v) {
  return (v || "").trim().toLowerCase();
}

function createDefaultMiniChallenge() {
  return {
    title: "",
    bonusPoints: 10,
    durationSeconds: 300,
    startedAt: "",
    endsAt: "",
    active: false,
    paused: false,
    remainingSecondsOnPause: 0,
    winnerStudentId: "",
    winnerAnnouncedAt: ""
  };
}

function createDefaultGiftStore() {
  return [
    { id: `GF-${uid()}`, requiredPoints: 40, name: "هدية تشجيعية" },
    { id: `GF-${uid()}`, requiredPoints: 80, name: "بطاقة تميز" },
    { id: `GF-${uid()}`, requiredPoints: 120, name: "هدية خاصة" }
  ];
}

function normalizeGift(gift) {
  return {
    id: normalizeName(gift && gift.id ? gift.id : `GF-${uid()}`),
    requiredPoints: Math.max(1, Number(gift && gift.requiredPoints ? gift.requiredPoints : 1)),
    name: normalizeName(gift && gift.name ? gift.name : "هدية")
  };
}

function normalizeMiniChallenge(raw) {
  const base = createDefaultMiniChallenge();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    title: normalizeName(raw.title || ""),
    bonusPoints: Math.max(1, Number(raw.bonusPoints || base.bonusPoints)),
    durationSeconds: Math.max(60, Number(raw.durationSeconds || base.durationSeconds)),
    startedAt: normalizeName(raw.startedAt || ""),
    endsAt: normalizeName(raw.endsAt || ""),
    active: !!raw.active,
    paused: !!raw.paused,
    remainingSecondsOnPause: Math.max(0, Number(raw.remainingSecondsOnPause || 0)),
    winnerStudentId: normalizeName(raw.winnerStudentId || ""),
    winnerAnnouncedAt: normalizeName(raw.winnerAnnouncedAt || "")
  };
}

function getLevelIndex(points) {
  return Math.max(0, Math.floor(Number(points || 0) / LEVEL_STEP_POINTS));
}

function getStudentLevel(points) {
  const idx = getLevelIndex(points);
  const levelNumber = idx + 1;
  if (idx <= 0) {
    return { name: "مبتدئ", emoji: "🌱", levelNumber };
  }
  if (idx === 1) {
    return { name: "متقدم", emoji: "🚀", levelNumber };
  }
  return { name: "قائد", emoji: "👑", levelNumber };
}

function studentInitials(name) {
  const parts = normalizeName(name).split(" ").filter(Boolean);
  if (!parts.length) return "؟";
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

let studentPhotoDbPromise = null;
const studentPhotoCache = new Map();

function getClassPhotoNamespace(cls) {
  if (!cls) return "";
  return normalizeName(cls.sharedId || cls.id || "");
}

function getStudentPhotoKey(classNamespace, studentId) {
  return `${classNamespace}::${studentId}`;
}

function openStudentPhotoDb() {
  if (studentPhotoDbPromise) return studentPhotoDbPromise;
  studentPhotoDbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
    const req = window.indexedDB.open(STUDENT_PHOTO_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STUDENT_PHOTO_STORE)) {
        db.createObjectStore(STUDENT_PHOTO_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Failed to open photos DB"));
  });
  return studentPhotoDbPromise;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

async function setStudentPhotoDataUrl(cls, studentId, dataUrl) {
  const classNamespace = getClassPhotoNamespace(cls);
  if (!classNamespace || !studentId) return;
  const key = getStudentPhotoKey(classNamespace, studentId);
  const db = await openStudentPhotoDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STUDENT_PHOTO_STORE, "readwrite");
    const store = tx.objectStore(STUDENT_PHOTO_STORE);
    const req = store.put({
      key,
      classNamespace,
      studentId,
      dataUrl,
      updatedAt: new Date().toISOString()
    });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("Failed to save student photo"));
  });
  studentPhotoCache.set(key, dataUrl);
}

async function getStudentPhotoDataUrl(cls, studentId) {
  const classNamespace = getClassPhotoNamespace(cls);
  if (!classNamespace || !studentId) return "";
  const key = getStudentPhotoKey(classNamespace, studentId);
  if (studentPhotoCache.has(key)) return studentPhotoCache.get(key) || "";

  const db = await openStudentPhotoDb();
  const row = await new Promise((resolve, reject) => {
    const tx = db.transaction(STUDENT_PHOTO_STORE, "readonly");
    const store = tx.objectStore(STUDENT_PHOTO_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("Failed to load student photo"));
  });
  const dataUrl = row && row.dataUrl ? String(row.dataUrl) : "";
  studentPhotoCache.set(key, dataUrl);
  return dataUrl;
}

async function removeStudentPhotoDataUrl(cls, studentId) {
  const classNamespace = getClassPhotoNamespace(cls);
  if (!classNamespace || !studentId) return;
  const key = getStudentPhotoKey(classNamespace, studentId);
  const db = await openStudentPhotoDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STUDENT_PHOTO_STORE, "readwrite");
    const store = tx.objectStore(STUDENT_PHOTO_STORE);
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("Failed to delete student photo"));
  });
  studentPhotoCache.delete(key);
}

async function removeAllClassStudentPhotos(cls) {
  if (!cls || !Array.isArray(cls.students) || !cls.students.length) return;
  await Promise.all((cls.students || []).map((s) => removeStudentPhotoDataUrl(cls, s.id)));
}

function renderPhotoCellContent(studentName, dataUrl) {
  const rawName = String(studentName || "");
  const safeName = rawName.replace(/"/g, "&quot;");
  if (dataUrl) {
    return `<img src="${dataUrl}" alt="صورة ${safeName}" loading="lazy" />`;
  }
  return `<span>${studentInitials(rawName)}</span>`;
}

function createDefaultChallenge() {
  return {
    title: "",
    startDate: "",
    endDate: "",
    bonusPoints: 10,
    winnerStudentId: "",
    winnerAwardedAt: "",
    announcedByTeacherAt: ""
  };
}

function normalizeChallenge(rawChallenge) {
  const base = createDefaultChallenge();
  if (typeof rawChallenge === "string") {
    return { ...base, title: normalizeName(rawChallenge) };
  }
  if (!rawChallenge || typeof rawChallenge !== "object") {
    return base;
  }
  return {
    ...base,
    ...rawChallenge,
    title: normalizeName(rawChallenge.title || ""),
    startDate: normalizeName(rawChallenge.startDate || ""),
    endDate: normalizeName(rawChallenge.endDate || ""),
    bonusPoints: Math.max(1, Number(rawChallenge.bonusPoints || base.bonusPoints)),
    winnerStudentId: normalizeName(rawChallenge.winnerStudentId || ""),
    winnerAwardedAt: normalizeName(rawChallenge.winnerAwardedAt || ""),
    announcedByTeacherAt: normalizeName(rawChallenge.announcedByTeacherAt || "")
  };
}

function getTodayLocalIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function finalizeChallengeIfNeeded(cls) {
  if (!cls || !cls.challenge) return false;
  const challenge = normalizeChallenge(cls.challenge);
  cls.challenge = challenge;
  if (!challenge.title || !challenge.endDate) return false;
  if (challenge.winnerStudentId) return false;
  if (!cls.students.length) return false;

  const today = getTodayLocalIsoDate();
  if (today < challenge.endDate) return false;

  const ranked = rankStudents(cls);
  if (!ranked.length) return false;
  const winner = ranked[0];
  challenge.winnerStudentId = winner.id;
  challenge.winnerAwardedAt = new Date().toISOString();
  applyPointsChange(winner, Number(challenge.bonusPoints || 0), `فوز التحدي الأسبوعي: ${challenge.title}`);
  return true;
}

function createDefaultClass(name = "صفي الأول", subject = "") {
  return {
    id: `CL-${uid()}${uid()}`,
    name,
    subject,
    sharedId: "",
    inviteCode: "",
    ownerTeacherId: "",
    teacherIds: [],
    students: [],
    rewards: [
      { points: 50, name: "نجمة" },
      { points: 100, name: "شهادة" },
      { points: 200, name: "جائزة" }
    ],
    giftStore: createDefaultGiftStore(),
    challenge: createDefaultChallenge(),
    miniChallenge: createDefaultMiniChallenge(),
    parentMessages: {},
    teams: ["الفريق الأحمر", "الفريق الأزرق", "الفريق الذهبي"]
  };
}

function createDefaultState() {
  const firstClass = createDefaultClass();
  return {
    classes: [firstClass],
    activeClassId: firstClass.id,
    updatedAt: Date.now()
  };
}

function normalizeClass(cls) {
  const base = createDefaultClass();
  return {
    ...base,
    ...(cls || {}),
    id: (cls && cls.id) ? String(cls.id) : `CL-${uid()}${uid()}`,
    name: normalizeName(cls && cls.name ? cls.name : base.name),
    subject: normalizeName(cls && cls.subject ? cls.subject : base.subject),
    sharedId: normalizeName(cls && cls.sharedId ? cls.sharedId : ""),
    inviteCode: normalizeName(cls && cls.inviteCode ? cls.inviteCode : ""),
    ownerTeacherId: normalizeName(cls && cls.ownerTeacherId ? cls.ownerTeacherId : ""),
    teacherIds: Array.isArray(cls && cls.teacherIds) ? Array.from(new Set(cls.teacherIds.map((x) => normalizeName(String(x))).filter(Boolean))) : [],
    students: Array.isArray(cls && cls.students) ? cls.students : [],
    rewards: Array.isArray(cls && cls.rewards) ? cls.rewards : base.rewards,
    giftStore: Array.isArray(cls && cls.giftStore) && cls.giftStore.length ? cls.giftStore.map(normalizeGift) : base.giftStore.map(normalizeGift),
    challenge: normalizeChallenge(cls && cls.challenge ? cls.challenge : base.challenge),
    miniChallenge: normalizeMiniChallenge(cls && cls.miniChallenge ? cls.miniChallenge : base.miniChallenge),
    parentMessages: (cls && typeof cls.parentMessages === "object" && cls.parentMessages !== null) ? cls.parentMessages : {},
    teams: Array.isArray(cls && cls.teams) ? cls.teams : base.teams
  };
}

function loadSharedClassesMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(SHARED_CLASSES_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveSharedClassesMap(map) {
  localStorage.setItem(SHARED_CLASSES_KEY, JSON.stringify(map));
}

function ensureClassShareMeta(cls, teacherId) {
  if (!cls.sharedId) cls.sharedId = `SC-${uid()}${uid()}`;
  if (!cls.inviteCode) cls.inviteCode = generateInviteCode();
  if (!cls.ownerTeacherId) cls.ownerTeacherId = teacherId || "";
  const ids = new Set([...(cls.teacherIds || []), cls.ownerTeacherId, teacherId].filter(Boolean));
  cls.teacherIds = Array.from(ids);
}

function joinSharedClassByCode(inviteCode, teacherId) {
  const cleanCode = normalizeName(inviteCode).toUpperCase();
  if (!cleanCode) return { ok: false, message: "يرجى إدخال كود الصف." };
  const sharedMap = loadSharedClassesMap();
  const found = Object.values(sharedMap)
    .map((c) => normalizeClass(c))
    .find((c) => String(c.inviteCode || "").toUpperCase() === cleanCode);
  if (!found) return { ok: false, message: "كود الصف غير صحيح." };

  const ids = new Set([...(found.teacherIds || []), teacherId].filter(Boolean));
  found.teacherIds = Array.from(ids);
  sharedMap[found.sharedId] = found;
  saveSharedClassesMap(sharedMap);
  return { ok: true, classData: found };
}

function mergeState(raw) {
  if (!raw || typeof raw !== "object") return createDefaultState();

  if (Array.isArray(raw.classes)) {
    const classes = raw.classes.map(normalizeClass);
    if (!classes.length) {
      const fallback = createDefaultState();
      return fallback;
    }
    const activeExists = classes.some((c) => c.id === raw.activeClassId);
    return {
      classes,
      activeClassId: activeExists ? raw.activeClassId : classes[0].id,
      updatedAt: Number(raw.updatedAt || Date.now())
    };
  }

  const legacy = normalizeClass({
    name: raw.teacher && raw.teacher.className ? raw.teacher.className : "صفي الأول",
    subject: raw.teacher && raw.teacher.subject ? raw.teacher.subject : "",
    students: raw.students,
    rewards: raw.rewards,
    giftStore: raw.giftStore,
    challenge: raw.challenge,
    miniChallenge: raw.miniChallenge,
    parentMessages: raw.parentMessages,
    teams: raw.teams
  });

  return {
    classes: [legacy],
    activeClassId: legacy.id,
    updatedAt: Number(raw.updatedAt || Date.now())
  };
}

function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function setSession(accountId) {
  if (!accountId) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, accountId);
}

function getSessionAccountId() {
  return localStorage.getItem(SESSION_KEY);
}

function accountDataKey(accountId) {
  return `${DATA_PREFIX}${accountId}`;
}

function loadTeacherData(accountId) {
  if (!accountId) return createDefaultState();
  const raw = localStorage.getItem(accountDataKey(accountId));
  const sharedMap = loadSharedClassesMap();
  const sharedClasses = Object.values(sharedMap)
    .map((c) => normalizeClass(c))
    .filter((c) => (c.teacherIds || []).includes(accountId));

  let base = createDefaultState();
  if (raw) {
    try {
      base = mergeState(JSON.parse(raw));
    } catch {
      base = createDefaultState();
    }
  }

  if (sharedClasses.length) {
    const activeExists = sharedClasses.some((c) => c.id === base.activeClassId);
    return {
      classes: sharedClasses,
      activeClassId: activeExists ? base.activeClassId : sharedClasses[0].id
    };
  }
  return base;
}

function saveTeacherData() {
  if (!currentTeacher) return;
  state.updatedAt = Date.now();
  const sharedMap = loadSharedClassesMap();
  (state.classes || []).forEach((cls) => {
    ensureClassShareMeta(cls, currentTeacher.id);
    sharedMap[cls.sharedId] = normalizeClass(cls);
  });
  saveSharedClassesMap(sharedMap);
  localStorage.setItem(accountDataKey(currentTeacher.id), JSON.stringify(state));
  scheduleRemoteSave();
}

function getUnifiedUserId() {
  return currentTeacher && currentTeacher.userId ? String(currentTeacher.userId) : "";
}

async function fetchJsonSafe(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body && body.error ? body.error : `http_${res.status}`;
    throw new Error(msg);
  }
  return body;
}

async function loadStateFromRemote(userId) {
  if (!userId) return null;
  try {
    const q = `${MOTIVATION_API_LOAD}?userId=${encodeURIComponent(userId)}`;
    const out = await fetchJsonSafe(q, { method: "GET", cache: "no-store" });
    if (!out || !out.state || typeof out.state !== "object") return null;
    return mergeState(out.state);
  } catch {
    return null;
  }
}

async function saveStateToRemote(userId, payloadState) {
  if (!userId || !payloadState) return false;
  try {
    await fetchJsonSafe(MOTIVATION_API_SAVE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, state: payloadState })
    });
    return true;
  } catch {
    return false;
  }
}

function scheduleRemoteSave() {
  if (!remoteSyncReady) return;
  const userId = getUnifiedUserId();
  if (!userId) return;
  if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(async () => {
    const snapshot = JSON.parse(JSON.stringify(state));
    await saveStateToRemote(userId, snapshot);
  }, 450);
}

function readUnifiedSession() {
  try {
    const raw = localStorage.getItem(UNIFIED_BACKEND_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const userId = normalizeName(parsed && parsed.userId ? parsed.userId : "");
    const email = normalizeEmail(parsed && parsed.email ? parsed.email : "");
    const name = normalizeName(parsed && parsed.full_name ? parsed.full_name : "");
    if (!userId) return null;
    return {
      id: `U-${userId}`,
      userId,
      name: name || email || "معلم",
      email
    };
  } catch {
    return null;
  }
}

function clearUnifiedSession() {
  try { localStorage.removeItem(UNIFIED_BACKEND_SESSION_KEY); } catch {}
  try { localStorage.removeItem(UNIFIED_AUTH_SESSION_KEY); } catch {}
}

function buildUnifiedAuthUrl() {
  try {
    const isWeb = !!(window.location && /^https?:$/i.test(window.location.protocol || ""));
    const baseUrl = isWeb
      ? new URL(UNIFIED_AUTH_WEB_PATH, window.location.origin)
      : new URL(UNIFIED_AUTH_URL);
    const returnPath = `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
    baseUrl.searchParams.set("return", returnPath);
    return baseUrl.toString();
  } catch {
    return UNIFIED_AUTH_WEB_PATH;
  }
}

function getCurrentTeacher() {
  const unified = readUnifiedSession();
  return unified || null;
}

async function pullRemoteStateIfNeeded() {
  const userId = getUnifiedUserId();
  if (!userId) return;
  const remoteState = await loadStateFromRemote(userId);
  if (!remoteState) return;

  const localTs = Number(state && state.updatedAt ? state.updatedAt : 0);
  const remoteTs = Number(remoteState.updatedAt || 0);
  if (remoteTs > localTs) {
    state = remoteState;
    try {
      localStorage.setItem(accountDataKey(currentTeacher.id), JSON.stringify(state));
    } catch {}
    renderAll();
  } else if (localTs > remoteTs) {
    await saveStateToRemote(userId, JSON.parse(JSON.stringify(state)));
  }
}

let currentTeacher = null;
let state = createDefaultState();
let wheelRotation = 0;
let wheelBusy = false;
let wheelTicker = null;
let luckyBusy = false;
let luckyTicker = null;
let countdownInterval = null;
let countdownRemainingSeconds = 300;
let countdownRunning = false;
let activeFullscreenFeature = "";
let celebrationHideTimer = null;
let miniChallengeTicker = null;
let remoteSaveTimer = null;
let remoteSyncReady = false;

function getActiveClass() {
  if (!state.classes.length) return null;
  let cls = state.classes.find((c) => c.id === state.activeClassId);
  if (!cls) {
    state.activeClassId = state.classes[0].id;
    cls = state.classes[0];
  }
  return cls;
}

function refreshClassesFromShared() {
  if (!currentTeacher) return;
  const sharedMap = loadSharedClassesMap();
  const sharedClasses = Object.values(sharedMap)
    .map((c) => normalizeClass(c))
    .filter((c) => (c.teacherIds || []).includes(currentTeacher.id));

  if (sharedClasses.length) {
    const activeExists = sharedClasses.some((c) => c.id === state.activeClassId);
    state.classes = sharedClasses;
    state.activeClassId = activeExists ? state.activeClassId : sharedClasses[0].id;
    return;
  }

  if (!state.classes.length) {
    const fallback = createDefaultClass();
    ensureClassShareMeta(fallback, currentTeacher.id);
    state.classes = [fallback];
    state.activeClassId = fallback.id;
  }
}

function findStudentByCodeInActiveClass(code) {
  const codeUpper = normalizeName(code).toUpperCase();
  if (!codeUpper) return null;
  const cls = getActiveClass();
  if (!cls) return null;
  const student = (cls.students || []).find((s) => String(s.code || "").toUpperCase() === codeUpper);
  if (!student) return null;
  return { student, cls };
}

function ensureAuthOrNotify() {
  if (currentTeacher) return true;
  showAuthMessage("يجب تسجيل الدخول من البوابة الموحدة أولاً.", true);
  return false;
}

function ensureClassOrNotify() {
  const cls = getActiveClass();
  if (cls) return cls;
  showAuthMessage("لا يوجد صف حالي. أنشئ صفًا أولاً.", true);
  return null;
}

function canManageStudents(cls) {
  return !!(currentTeacher && cls && cls.ownerTeacherId === currentTeacher.id);
}

function ensureStudentManagerOrNotify(cls) {
  if (canManageStudents(cls)) return true;
  showAuthMessage("صلاحية إضافة/حذف الطلاب متاحة فقط لمؤسس الصف.", true);
  return false;
}

function showAuthMessage(msg, isError = false) {
  const box = document.getElementById("auth-message");
  box.textContent = msg;
  box.style.color = isError ? "#b91c1c" : "#334e68";
}

function updateSessionUI() {
  const info = document.getElementById("session-info");
  const logoutBtn = document.getElementById("logout-btn");
  const app = document.getElementById("teacher-app");
  const openAuthBtn = document.getElementById("open-unified-auth");

  if (currentTeacher) {
    info.textContent = `المعلم الحالي: ${currentTeacher.name}`;
    logoutBtn.style.display = "inline-block";
    if (openAuthBtn) openAuthBtn.style.display = "none";
    app.style.display = "block";
  } else {
    info.textContent = "غير مسجل";
    logoutBtn.style.display = "none";
    if (openAuthBtn) openAuthBtn.style.display = "inline-block";
    app.style.display = "none";
  }
}

function playCheer() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 740;
  gain.gain.value = 0.001;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
  osc.stop(ctx.currentTime + 0.26);
}

function triggerCelebration(title, message) {
  const overlay = document.getElementById("celebration-overlay");
  const titleEl = document.getElementById("celebration-title");
  const msgEl = document.getElementById("celebration-message");
  const confetti = document.getElementById("celebration-confetti");
  if (!overlay || !titleEl || !msgEl || !confetti) return;

  titleEl.textContent = title || "🎉 إنجاز جديد";
  msgEl.textContent = message || "أحسنت!";
  confetti.innerHTML = "";

  const colors = ["#38bdf8", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#f97316"];
  for (let i = 0; i < 44; i += 1) {
    const piece = document.createElement("span");
    piece.className = "celebration-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.35}s`;
    piece.style.transform = `translateY(-15px) rotate(${Math.random() * 360}deg)`;
    confetti.appendChild(piece);
  }

  overlay.classList.add("show");
  playCheer();
  if (celebrationHideTimer) clearTimeout(celebrationHideTimer);
  celebrationHideTimer = setTimeout(() => {
    overlay.classList.remove("show");
    confetti.innerHTML = "";
  }, 2200);
}

function enterFeatureFullscreen(featureId) {
  const feature = document.getElementById(featureId);
  if (!feature) return;

  if (activeFullscreenFeature) {
    const prev = document.getElementById(activeFullscreenFeature);
    if (prev) prev.classList.remove("fullscreen-feature");
  }
  activeFullscreenFeature = featureId;
  feature.classList.add("fullscreen-feature");
  document.body.classList.add("feature-fullscreen");
}

function exitFeatureFullscreen() {
  if (activeFullscreenFeature) {
    const feature = document.getElementById(activeFullscreenFeature);
    if (feature) feature.classList.remove("fullscreen-feature");
  }
  activeFullscreenFeature = "";
  document.body.classList.remove("feature-fullscreen");
}

function rankStudents(cls) {
  return [...(cls.students || [])].sort((a, b) => Number(b.points || 0) - Number(a.points || 0));
}

function studentBadges(student) {
  const b = [];
  const lvl = getStudentLevel(student.points || 0);
  b.push(`المستوى ${lvl.levelNumber}: ${lvl.name} ${lvl.emoji}`);
  if ((student.points || 0) >= 150) b.push("الطالب المثالي 👑");
  if ((student.points || 0) >= 80) b.push("نجم الأسبوع ⭐");
  const hwCount = (student.history || []).filter((h) => h.reason === reasons.homework_done.label).length;
  if (hwCount >= 5) b.push("بطل الواجبات 📚");
  return b;
}

function buildWheelGradient(count) {
  const angle = 360 / count;
  const slices = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.round(i * angle * 100) / 100;
    const end = Math.round((i + 1) * angle * 100) / 100;
    const hue = Math.round((i / count) * 360);
    slices.push(`hsl(${hue} 78% 68%) ${start}deg ${end}deg`);
  }
  return `conic-gradient(${slices.join(",")})`;
}

function renderClassSelector() {
  const selector = document.getElementById("class-selector");
  const shareInfo = document.getElementById("class-share-info");
  const cls = getActiveClass();

  selector.innerHTML = "";
  state.classes.forEach((c) => {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = `${c.name}${c.subject ? ` - ${c.subject}` : ""}`;
    if (c.id === state.activeClassId) option.selected = true;
    selector.appendChild(option);
  });

  document.getElementById("class-name").value = cls ? cls.name : "";
  document.getElementById("subject-name").value = cls ? cls.subject : "";
  if (!cls || !currentTeacher) {
    shareInfo.textContent = "";
    return;
  }
  const beforeMeta = `${cls.sharedId}|${cls.inviteCode}|${cls.ownerTeacherId}|${(cls.teacherIds || []).join(",")}`;
  ensureClassShareMeta(cls, currentTeacher.id);
  const afterMeta = `${cls.sharedId}|${cls.inviteCode}|${cls.ownerTeacherId}|${(cls.teacherIds || []).join(",")}`;
  if (beforeMeta !== afterMeta) saveTeacherData();
  const teachersCount = (cls.teacherIds || []).length;
  const role = cls.ownerTeacherId === currentTeacher.id ? "مؤسس الصف" : "معلم مشارك";
  shareInfo.textContent = `كود الصف للمشاركة: ${cls.inviteCode} | عدد المعلمين المشاركين: ${teachersCount} | دورك: ${role}`;
}

function renderStudentsTable() {
  const wrap = document.getElementById("students-table");
  const cls = getActiveClass();
  const isManager = canManageStudents(cls);

  if (!currentTeacher) {
    wrap.innerHTML = "<p class='muted'>سجل الدخول لعرض الطلاب.</p>";
    return;
  }
  if (!cls) {
    wrap.innerHTML = "<p class='muted'>أنشئ صفًا أولاً.</p>";
    return;
  }
  if (!cls.students.length) {
    wrap.innerHTML = "<p class='muted'>لا يوجد طلاب في هذا الصف.</p>";
    return;
  }

  const teamOptions = (selectedTeam) => {
    const base = [`<option value="">بدون فريق</option>`];
    const options = (cls.teams && cls.teams.length ? cls.teams : ["الفريق الأحمر", "الفريق الأزرق", "الفريق الذهبي"])
      .map((teamName) => `<option value="${teamName}" ${selectedTeam === teamName ? "selected" : ""}>${teamName}</option>`);
    return [...base, ...options].join("");
  };

  const rows = rankStudents(cls).map((s) => {
    const lvl = getStudentLevel(s.points || 0);
    return `
    <tr>
      <td>
        <div id="photo-${s.id}" class="student-photo-badge">${renderPhotoCellContent(s.name, "")}</div>
      </td>
      <td>${s.name}<span class="level-chip">${lvl.emoji} ${lvl.name}</span>${s.team ? `<span class="team-chip">${s.team}</span>` : ""}</td>
      <td><span class="code-chip">${s.code}</span></td>
      <td>${s.points || 0}</td>
      <td><img src="https://api.qrserver.com/v1/create-qr-code/?size=65x65&data=${encodeURIComponent(s.code)}" alt="QR"/></td>
      <td>
        <div class="action-buttons">
          <input id="photo-input-${s.id}" class="student-photo-input" type="file" accept="image/*" onchange="handleStudentPhotoUpload('${s.id}', event)" />
          <button class="btn secondary" onclick="openStudentPhotoPicker('${s.id}')">إضافة صورة</button>
          <button class="btn danger" onclick="removeStudentPhoto('${s.id}')">حذف الصورة</button>
          <select id="team-${s.id}">
            ${teamOptions(s.team || "")}
          </select>
          <select id="reason-${s.id}">
            <option value="participation">مشاركة ممتازة (+5)</option>
            <option value="quiz_excellence">تفوق في اختبار قصير (+5)</option>
            <option value="class_leadership">قيادة ونشاط داخل الصف (+4)</option>
            <option value="creativity">فكرة إبداعية مميزة (+4)</option>
            <option value="homework_done">حل الواجب (+3)</option>
            <option value="teamwork">تعاون ممتاز مع الزملاء (+3)</option>
            <option value="positive_behavior">سلوك إيجابي (+2)</option>
            <option value="attendance_on_time">انضباط بالحضور والوقت (+2)</option>
            <option value="helping_others">مساعدة زملائه (+2)</option>
            <option value="neatness">ترتيب ونظافة الدفتر (+2)</option>
            <option value="late_arrival">تأخر عن الحصة (-1)</option>
            <option value="disruption">إزعاج (-2)</option>
            <option value="unprepared_tools">عدم إحضار الأدوات (-2)</option>
            <option value="homework_missing">عدم حل الواجب (-3)</option>
            <option value="disrespect">عدم الالتزام بالتعليمات (-3)</option>
          </select>
          <button class="btn secondary" onclick="applySelectedReason('${s.id}')">تطبيق السبب</button>
          ${isManager
            ? `<button class="btn danger" onclick="deleteStudent('${s.id}')">مسح الطالب</button>`
            : `<button class="btn secondary" disabled title="فقط مؤسس الصف يملك هذه الصلاحية">مسح الطالب</button>`}
        </div>
      </td>
    </tr>
  `;
  }).join("");

  wrap.innerHTML = `
    <table>
      <thead><tr><th>الصورة</th><th>الطالب</th><th>الكود</th><th>النقاط</th><th>QR</th><th>إجراء سريع</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  hydrateStudentPhotosInTable(cls);
}

async function hydrateStudentPhotosInTable(cls) {
  if (!cls || !Array.isArray(cls.students)) return;
  for (const student of cls.students) {
    const target = document.getElementById(`photo-${student.id}`);
    if (!target) continue;
    try {
      const dataUrl = await getStudentPhotoDataUrl(cls, student.id);
      target.innerHTML = renderPhotoCellContent(student.name, dataUrl);
    } catch {
      target.innerHTML = renderPhotoCellContent(student.name, "");
    }
  }
}

function renderRewards() {
  const list = document.getElementById("rewards-list");
  const cls = getActiveClass();

  if (!currentTeacher) {
    list.innerHTML = "<p class='muted'>سجل الدخول أولاً.</p>";
    return;
  }
  if (!cls) {
    list.innerHTML = "<p class='muted'>لا يوجد صف نشط.</p>";
    return;
  }

  list.innerHTML = [...cls.rewards]
    .sort((a, b) => Number(a.points) - Number(b.points))
    .map((r, i) => `<p>${r.points} نقطة = ${r.name} <button class="btn danger" onclick="removeReward(${i})">حذف</button></p>`)
    .join("");
}

function renderGiftStoreSettings() {
  const list = document.getElementById("gift-store-list");
  const cls = getActiveClass();
  if (!list) return;

  if (!currentTeacher) {
    list.innerHTML = "<p class='muted'>سجل الدخول أولاً.</p>";
    return;
  }
  if (!cls) {
    list.innerHTML = "<p class='muted'>لا يوجد صف نشط.</p>";
    return;
  }
  const gifts = Array.isArray(cls.giftStore) ? cls.giftStore.map(normalizeGift) : [];
  cls.giftStore = gifts;
  if (!gifts.length) {
    list.innerHTML = "<p class='muted'>لا توجد هدايا متجر حالياً.</p>";
    return;
  }

  list.innerHTML = gifts
    .sort((a, b) => Number(a.requiredPoints) - Number(b.requiredPoints))
    .map((g) => `<p>${g.requiredPoints} نقطة = ${g.name} <button class="btn danger" onclick="removeGift('${g.id}')">حذف</button></p>`)
    .join("");
}

function weeklyInsights(cls) {
  const ranked = rankStudents(cls);
  if (!ranked.length) return ["لا توجد بيانات كافية للتحليل."];

  const top = ranked[0];
  const negative = ranked[ranked.length - 1];
  let improved = ranked[0];
  let maxGain = -Infinity;

  cls.students.forEach((s) => {
    const recent = (s.history || []).slice(-7);
    const gain = recent.reduce((sum, h) => sum + Number(h.delta || 0), 0);
    if (gain > maxGain) {
      maxGain = gain;
      improved = s;
    }
  });

  return [
    `الطالب الأول: ${top.name} (${top.points || 0} نقطة) ⭐`,
    `الأكثر تحسنًا: ${improved.name} (صافي ${maxGain} آخر 7 حركات) 📈`,
    `يحتاج متابعة: ${negative.name} (${negative.points || 0} نقطة) ⚠️`
  ];
}

function renderInsights() {
  const ul = document.getElementById("insights");
  const cls = getActiveClass();

  if (!currentTeacher) {
    ul.innerHTML = "<li>سجل الدخول لعرض التحليلات.</li>";
    return;
  }
  if (!cls) {
    ul.innerHTML = "<li>لا يوجد صف نشط.</li>";
    return;
  }

  ul.innerHTML = weeklyInsights(cls).map((x) => `<li>${x}</li>`).join("");
}

function renderLiveBoard() {
  const box = document.getElementById("live-board");
  const cls = getActiveClass();

  if (!currentTeacher) {
    box.innerHTML = "<p class='muted'>لا يوجد معلم مسجل حاليًا.</p>";
    return;
  }
  if (!cls) {
    box.innerHTML = "<p class='muted'>لا يوجد صف نشط.</p>";
    return;
  }

  const ranked = rankStudents(cls);
  if (!ranked.length) {
    box.innerHTML = "<p class='muted'>لا يوجد طلاب لعرض الترتيب.</p>";
    return;
  }

  box.innerHTML = ranked.map((s, i) => `
    <div class="row">
      <div class="rank">#${i + 1}</div>
      <div>${s.name}</div>
      <div class="points">${s.points || 0}</div>
    </div>
  `).join("");
}

function renderTeams() {
  const box = document.getElementById("teams-view");
  const cls = getActiveClass();

  if (!currentTeacher) {
    box.innerHTML = "سجل الدخول لعرض الفرق.";
    return;
  }
  if (!cls) {
    box.innerHTML = "لا يوجد صف نشط.";
    return;
  }

  const grouped = {};
  cls.students.forEach((s) => {
    if (!s.team) return;
    if (!grouped[s.team]) grouped[s.team] = { count: 0, points: 0 };
    grouped[s.team].count += 1;
    grouped[s.team].points += Number(s.points || 0);
  });

  const entries = Object.entries(grouped).sort((a, b) => b[1].points - a[1].points);
  box.innerHTML = entries.length
    ? entries.map(([team, info]) => `${team}: ${info.count} طلاب | ${info.points} نقطة`).join("<br>")
    : "لا يوجد توزيع فرق بعد.";
}

function renderLiveTeams() {
  const box = document.getElementById("live-teams");
  const cls = getActiveClass();

  if (!currentTeacher) {
    box.innerHTML = "<p class='muted'>لا يوجد معلم مسجل حاليًا.</p>";
    return;
  }
  if (!cls) {
    box.innerHTML = "<p class='muted'>لا يوجد صف نشط.</p>";
    return;
  }

  const grouped = {};
  cls.students.forEach((s) => {
    if (!s.team) return;
    grouped[s.team] = (grouped[s.team] || 0) + Number(s.points || 0);
  });

  const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  box.innerHTML = entries.length
    ? entries.map(([team, points]) => `<div class="team-row"><strong>${team}</strong><span>${points} نقطة</span></div>`).join("")
    : "<p class='muted'>لا يوجد فرق مفعلة.</p>";
}

function renderLiveDetails() {
  const cls = getActiveClass();
  const head = document.getElementById("live-class-head");
  const summary = document.getElementById("live-summary-cards");
  const top3Box = document.getElementById("live-top3");
  const challengeBox = document.getElementById("live-challenge");
  const eventsBox = document.getElementById("live-recent-events");
  const rewardsBox = document.getElementById("live-rewards-progress");
  if (!head || !summary || !top3Box || !challengeBox || !eventsBox || !rewardsBox) return;

  if (!currentTeacher || !cls) {
    head.innerHTML = "<span class='muted'>لا توجد بيانات مباشرة.</span>";
    summary.innerHTML = "";
    top3Box.innerHTML = "<p class='muted'>لا يوجد.</p>";
    challengeBox.innerHTML = "<p class='muted'>لا يوجد.</p>";
    eventsBox.innerHTML = "<p class='muted'>لا يوجد.</p>";
    rewardsBox.innerHTML = "<p class='muted'>لا يوجد.</p>";
    return;
  }

  const now = new Date();
  const nowText = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  head.innerHTML = `الصف: <strong>${cls.name}</strong> | المادة: <strong>${cls.subject || "-"}</strong> | المعلم: <strong>${currentTeacher.name}</strong> | الوقت: <strong>${nowText}</strong>`;

  const allHistory = (cls.students || []).flatMap((s) =>
    (s.history || []).map((h) => ({ ...h, studentName: s.name, at: h.at || "" }))
  );
  const positiveActions = allHistory.filter((h) => Number(h.delta || 0) > 0).length;
  const negativeActions = allHistory.filter((h) => Number(h.delta || 0) < 0).length;
  const totalPoints = (cls.students || []).reduce((sum, s) => sum + Number(s.points || 0), 0);
  const avgPoints = cls.students.length ? Math.round(totalPoints / cls.students.length) : 0;

  summary.innerHTML = [
    { k: "عدد الطلاب", v: cls.students.length },
    { k: "مجموع النقاط", v: totalPoints },
    { k: "متوسط النقاط", v: avgPoints },
    { k: "إيجابيات", v: positiveActions },
    { k: "سلبيات", v: negativeActions }
  ].map((x) => `<div class="live-stat"><div class="k">${x.k}</div><div class="v">${x.v}</div></div>`).join("");

  const ranked = rankStudents(cls);
  top3Box.innerHTML = ranked.slice(0, 3).map((s, i) => `
    <div class="live-item">
      <span>#${i + 1} ${s.name}</span>
      <strong>${s.points || 0} نقطة</strong>
    </div>
  `).join("") || "<p class='muted'>لا يوجد طلاب.</p>";

  const challenge = normalizeChallenge(cls.challenge);
  cls.challenge = challenge;
  const winner = cls.students.find((s) => s.id === challenge.winnerStudentId);
  challengeBox.innerHTML = challenge.title
    ? `
      <div class="live-item"><span>العنوان</span><strong>${challenge.title}</strong></div>
      <div class="live-item"><span>الفترة</span><strong>${challenge.startDate || "-"} → ${challenge.endDate || "-"}</strong></div>
      <div class="live-item"><span>مكافأة الفائز</span><strong>${challenge.bonusPoints} نقطة</strong></div>
      <div class="live-item"><span>الفائز</span><strong>${winner ? winner.name : "لم يعلن بعد"}</strong></div>
    `
    : "<p class='muted'>لا يوجد تحدي نشط.</p>";

  const recent = allHistory
    .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
    .slice(0, 8);
  eventsBox.innerHTML = recent.map((e) => `
    <div class="live-item">
      <span>${e.studentName}</span>
      <span>${e.reason} (${e.delta > 0 ? "+" : ""}${e.delta})</span>
    </div>
  `).join("") || "<p class='muted'>لا توجد أحداث حتى الآن.</p>";

  rewardsBox.innerHTML = (cls.rewards || [])
    .sort((a, b) => Number(a.points || 0) - Number(b.points || 0))
    .map((r) => {
      const reached = cls.students.filter((s) => Number(s.points || 0) >= Number(r.points || 0)).length;
      return `
        <div class="live-item">
          <span>${r.name} (${r.points})</span>
          <span class="live-sub">${reached} طالب محقق</span>
        </div>
      `;
    }).join("") || "<p class='muted'>لا توجد مكافآت.</p>";
}

function renderChallenge() {
  const cls = getActiveClass();
  const el = document.getElementById("challenge-view");
  const titleInput = document.getElementById("challenge-title");
  const startInput = document.getElementById("challenge-start-date");
  const endInput = document.getElementById("challenge-end-date");
  const bonusInput = document.getElementById("challenge-bonus-points");
  const winnerSelect = document.getElementById("challenge-winner-student");
  if (!currentTeacher) {
    el.textContent = "سجل الدخول أولاً.";
    titleInput.value = "";
    startInput.value = "";
    endInput.value = "";
    bonusInput.value = "";
    winnerSelect.innerHTML = "<option value=''>سجل الدخول أولاً</option>";
    return;
  }
  if (!cls) {
    el.textContent = "لا يوجد صف نشط.";
    titleInput.value = "";
    startInput.value = "";
    endInput.value = "";
    bonusInput.value = "";
    winnerSelect.innerHTML = "<option value=''>لا يوجد صف نشط</option>";
    return;
  }
  const challenge = normalizeChallenge(cls.challenge);
  cls.challenge = challenge;

  titleInput.value = challenge.title || "";
  startInput.value = challenge.startDate || "";
  endInput.value = challenge.endDate || "";
  bonusInput.value = challenge.bonusPoints || 10;
  winnerSelect.innerHTML = "";
  if (!cls.students.length) {
    winnerSelect.innerHTML = "<option value=''>لا يوجد طلاب</option>";
  } else {
    winnerSelect.innerHTML = "<option value=''>اختر الطالب الفائز</option>" +
      cls.students.map((s) => `<option value="${s.id}" ${challenge.winnerStudentId === s.id ? "selected" : ""}>${s.name}</option>`).join("");
  }

  if (!challenge.title) {
    el.textContent = "لا يوجد تحدي محفوظ.";
    return;
  }

  const winner = cls.students.find((s) => s.id === challenge.winnerStudentId);
  const winnerText = winner
    ? ` | الفائز: ${winner.name} (+${challenge.bonusPoints} نقطة)`
    : "";
  el.textContent = `التحدي: ${challenge.title} | من ${challenge.startDate || "-"} إلى ${challenge.endDate || "-"}${winnerText}`;
}

function announceChallengeWinner() {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  const challenge = normalizeChallenge(cls.challenge);
  cls.challenge = challenge;

  if (!challenge.title) {
    showAuthMessage("يرجى حفظ التحدي الأسبوعي أولاً.", true);
    return;
  }

  const winnerId = document.getElementById("challenge-winner-student").value;
  if (!winnerId) {
    showAuthMessage("يرجى اختيار الطالب الفائز.", true);
    return;
  }

  if (challenge.winnerStudentId) {
    showAuthMessage("تم إعلان الفائز لهذا التحدي مسبقًا.", true);
    return;
  }

  const winner = cls.students.find((s) => s.id === winnerId);
  if (!winner) {
    showAuthMessage("تعذر العثور على الطالب المختار.", true);
    return;
  }

  applyPointsChange(winner, Number(challenge.bonusPoints || 0), `إعلان فوز التحدي: ${challenge.title}`);

  challenge.winnerStudentId = winner.id;
  challenge.winnerAwardedAt = new Date().toISOString();
  challenge.announcedByTeacherAt = new Date().toISOString();
  saveTeacherData();
  renderAll();
  triggerCelebration("🏆 فائز التحدي الأسبوعي", `${winner.name} فاز بتحدي: ${challenge.title}`);
  showAuthMessage(`تم إعلان ${winner.name} فائزًا بالتحدي وإضافة ${challenge.bonusPoints} نقطة.`);
}

function reopenChallenge() {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  const challenge = normalizeChallenge(cls.challenge);
  cls.challenge = challenge;

  if (!challenge.title) {
    showAuthMessage("لا يوجد تحدي محفوظ لإعادة فتحه.", true);
    return;
  }
  if (!challenge.winnerStudentId) {
    showAuthMessage("التحدي مفتوح بالفعل ولم يتم إعلان فائز بعد.", true);
    return;
  }

  const ok = window.confirm("هل تريد إعادة فتح التحدي؟ سيتم سحب نقاط المكافأة من الفائز الحالي.");
  if (!ok) return;

  const winner = cls.students.find((s) => s.id === challenge.winnerStudentId);
  const bonus = Number(challenge.bonusPoints || 0);
  if (winner && bonus > 0) {
    applyPointsChange(winner, -bonus, `إعادة فتح التحدي: سحب مكافأة ${challenge.title}`, { celebrateLevel: false });
  }

  challenge.winnerStudentId = "";
  challenge.winnerAwardedAt = "";
  challenge.announcedByTeacherAt = "";
  saveTeacherData();
  renderAll();
  showAuthMessage("تمت إعادة فتح التحدي بنجاح.");
}

function getMiniChallenge(cls) {
  if (!cls) return createDefaultMiniChallenge();
  cls.miniChallenge = normalizeMiniChallenge(cls.miniChallenge);
  return cls.miniChallenge;
}

function getMiniRemainingSeconds(mini) {
  if (!mini || !mini.active) return 0;
  if (mini.paused) {
    return Math.max(0, Number(mini.remainingSecondsOnPause || 0));
  }
  if (!mini.endsAt) return 0;
  const end = new Date(mini.endsAt).getTime();
  if (!Number.isFinite(end)) return 0;
  const remaining = Math.ceil((end - Date.now()) / 1000);
  return Math.max(0, remaining);
}

function renderMiniChallenge() {
  const titleInput = document.getElementById("mini-challenge-title");
  const bonusInput = document.getElementById("mini-challenge-bonus");
  const durationInput = document.getElementById("mini-challenge-duration");
  const winnerInput = document.getElementById("mini-challenge-winner");
  const status = document.getElementById("mini-challenge-status");
  const meta = document.getElementById("mini-challenge-meta");
  const progressFill = document.getElementById("mini-challenge-progress-fill");
  const startBtn = document.getElementById("start-mini-challenge");
  const toggleBtn = document.getElementById("toggle-mini-challenge");
  const pickBtn = document.getElementById("pick-mini-winner");
  const resetBtn = document.getElementById("reset-mini-challenge");
  if (!titleInput || !bonusInput || !durationInput || !winnerInput || !status || !meta || !progressFill || !startBtn || !toggleBtn || !pickBtn || !resetBtn) return;

  if (!currentTeacher) {
    status.textContent = "سجل الدخول أولاً.";
    meta.textContent = "";
    progressFill.style.width = "0%";
    startBtn.disabled = true;
    toggleBtn.disabled = true;
    pickBtn.disabled = true;
    resetBtn.disabled = true;
    return;
  }

  const cls = getActiveClass();
  if (!cls) {
    status.textContent = "لا يوجد صف نشط.";
    meta.textContent = "";
    progressFill.style.width = "0%";
    startBtn.disabled = true;
    toggleBtn.disabled = true;
    pickBtn.disabled = true;
    resetBtn.disabled = true;
    return;
  }

  const mini = getMiniChallenge(cls);
  if (document.activeElement !== titleInput) {
    titleInput.value = mini.title || "";
  }
  if (document.activeElement !== bonusInput) {
    bonusInput.value = mini.bonusPoints || 10;
  }
  if (document.activeElement !== durationInput) {
    durationInput.value = String(mini.durationSeconds || 300);
  }
  winnerInput.innerHTML = "<option value=''>اختر الفائز (اختيار المعلم)</option>" +
    cls.students.map((s) => `<option value="${s.id}" ${mini.winnerStudentId === s.id ? "selected" : ""}>${s.name}</option>`).join("");
  const selectedDuration = Math.max(60, Number(durationInput.value || mini.durationSeconds || 300));
  const minsLabel = Math.floor(selectedDuration / 60);
  const secsLabel = selectedDuration % 60;
  startBtn.textContent = mini.active
    ? "التحدي جارٍ"
    : (secsLabel ? `بدء تحدي ${minsLabel}:${String(secsLabel).padStart(2, "0")}` : `بدء تحدي ${minsLabel} دقائق`);

  if (!cls.students.length) {
    status.textContent = "أضف طلابًا أولاً لاستخدام التحدي المصغر.";
    meta.textContent = "";
    progressFill.style.width = "0%";
    startBtn.disabled = true;
    toggleBtn.disabled = true;
    pickBtn.disabled = true;
    resetBtn.disabled = true;
    return;
  }

  const winner = (cls.students || []).find((s) => s.id === mini.winnerStudentId);
  const remaining = getMiniRemainingSeconds(mini);
  const total = Math.max(1, Number(mini.durationSeconds || 300));
  const progressPercent = mini.active ? Math.max(0, Math.min(100, Math.round(((total - remaining) / total) * 100))) : 0;
  progressFill.style.width = `${progressPercent}%`;
  meta.textContent = `المشاركون: ${cls.students.length} | اختيار الفائز: المعلم | نقاط الفائز: ${mini.bonusPoints}`;

  if (mini.active) {
    const pauseText = mini.paused ? " (موقوف مؤقتًا)" : "";
    status.innerHTML = `<span class="mini-challenge-live">⏱️ ${formatSeconds(remaining)}${pauseText} | التحدي: ${mini.title || "تحدي سريع"} | جائزة: ${mini.bonusPoints} نقطة</span>`;
  } else if (winner) {
    status.textContent = `آخر فائز في التحدي المصغر: ${winner.name} (+${mini.bonusPoints} نقطة)`;
  } else {
    status.textContent = "لا يوجد تحدي مصغر نشط.";
  }

  startBtn.disabled = mini.active;
  toggleBtn.disabled = !mini.active;
  toggleBtn.textContent = mini.paused ? "استئناف التحدي" : "إيقاف مؤقت";
  pickBtn.disabled = !mini.active;
  resetBtn.disabled = false;
}

function finishMiniChallengeWithWinner(cls, winner, reasonText) {
  if (!cls || !winner) return false;
  const mini = getMiniChallenge(cls);
  if (!mini.active) return false;

  applyPointsChange(winner, Number(mini.bonusPoints || 0), reasonText);
  mini.active = false;
  mini.winnerStudentId = winner.id;
  mini.winnerAnnouncedAt = new Date().toISOString();
  saveTeacherData();
  renderAll();
  triggerCelebration("🏆 فائز التحدي المصغر", `${winner.name} حصل على ${mini.bonusPoints} نقطة`);
  return true;
}

function startMiniChallenge() {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  if (!cls.students.length) {
    showAuthMessage("أضف طلابًا أولاً.");
    return;
  }

  const mini = getMiniChallenge(cls);
  const title = normalizeName(document.getElementById("mini-challenge-title").value) || "تحدي سريع";
  const bonus = Math.max(1, Number(document.getElementById("mini-challenge-bonus").value || 10));
  const duration = Math.max(60, Number(document.getElementById("mini-challenge-duration").value || 300));
  const now = new Date();
  mini.title = title;
  mini.bonusPoints = bonus;
  mini.durationSeconds = duration;
  mini.startedAt = now.toISOString();
  mini.endsAt = new Date(now.getTime() + duration * 1000).toISOString();
  mini.active = true;
  mini.paused = false;
  mini.remainingSecondsOnPause = 0;
  mini.winnerStudentId = "";
  mini.winnerAnnouncedAt = "";
  saveTeacherData();
  renderAll();
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const durationText = secs ? `${mins} دقيقة و${secs} ثانية` : `${mins} دقيقة`;
  triggerCelebration("⚡ بدأ التحدي المصغر", `${title} لمدة ${durationText} بدأ الآن`);
  showAuthMessage(`تم بدء التحدي المصغر لمدة ${durationText}.`);
}

function pickMiniChallengeWinnerNow() {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  const mini = getMiniChallenge(cls);
  if (!mini.active) {
    showAuthMessage("لا يوجد تحدي مصغر نشط.", true);
    return;
  }
  if (!cls.students.length) {
    showAuthMessage("لا يوجد طلاب لاختيار فائز.", true);
    return;
  }
  const winnerId = normalizeName(document.getElementById("mini-challenge-winner").value);
  if (!winnerId) {
    showAuthMessage("يرجى اختيار الطالب الفائز من القائمة.", true);
    return;
  }
  const winner = cls.students.find((s) => s.id === winnerId);
  if (!winner) {
    showAuthMessage("تعذر العثور على الطالب المختار.", true);
    return;
  }
  const ok = window.confirm(`اختيار ${winner.name} فائزًا فوريًا بالتحدي المصغر؟`);
  if (!ok) return;
  const done = finishMiniChallengeWithWinner(cls, winner, `فوز فوري في تحدي 5 دقائق: ${mini.title || "تحدي سريع"}`);
  if (done) {
    showAuthMessage(`تم اختيار ${winner.name} فائزًا وإضافة ${mini.bonusPoints} نقطة.`);
  }
}

function toggleMiniChallengePause() {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  const mini = getMiniChallenge(cls);
  if (!mini.active) {
    showAuthMessage("لا يوجد تحدي نشط لإيقافه.", true);
    return;
  }

  if (!mini.paused) {
    mini.remainingSecondsOnPause = getMiniRemainingSeconds(mini);
    mini.paused = true;
    saveTeacherData();
    renderMiniChallenge();
    showAuthMessage("تم إيقاف التحدي مؤقتًا.");
    return;
  }

  const remaining = Math.max(1, Number(mini.remainingSecondsOnPause || 0));
  mini.paused = false;
  mini.endsAt = new Date(Date.now() + remaining * 1000).toISOString();
  mini.remainingSecondsOnPause = 0;
  saveTeacherData();
  renderMiniChallenge();
  showAuthMessage("تم استئناف التحدي.");
}

function resetMiniChallenge() {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  const mini = getMiniChallenge(cls);
  const ok = window.confirm("هل تريد إنهاء/إعادة ضبط التحدي المصغر الحالي؟");
  if (!ok) return;
  cls.miniChallenge = createDefaultMiniChallenge();
  saveTeacherData();
  renderAll();
  showAuthMessage("تمت إعادة ضبط التحدي المصغر.");
}

function ensureMiniChallengeTicker() {
  if (miniChallengeTicker) return;
  miniChallengeTicker = setInterval(() => {
    if (!currentTeacher) return;
    const cls = getActiveClass();
    if (!cls) return;
    const mini = getMiniChallenge(cls);
    if (!mini.active) {
      renderMiniChallenge();
      return;
    }
    if (mini.paused) {
      renderMiniChallenge();
      return;
    }

    const remaining = getMiniRemainingSeconds(mini);
    if (remaining <= 0) {
      mini.paused = true;
      mini.remainingSecondsOnPause = 0;
      saveTeacherData();
      renderMiniChallenge();
      showAuthMessage("انتهى الوقت. اختر الفائز من القائمة ثم اضغط اختيار فائز فوري.");
      return;
    }
    renderMiniChallenge();
  }, 1000);
}

function renderWheel() {
  const wheel = document.getElementById("student-wheel");
  const center = document.getElementById("wheel-center-text");
  const result = document.getElementById("wheel-result");
  const cls = getActiveClass();

  if (!wheel || !center || !result) return;
  wheel.style.transform = `rotate(${wheelRotation}deg)`;

  if (!currentTeacher) {
    wheel.style.background = "#e2e8f0";
    center.textContent = "سجل الدخول";
    result.textContent = "ميزة العجلة متاحة بعد تسجيل الدخول.";
    return;
  }

  if (!cls || !cls.students.length) {
    wheel.style.background = "#e2e8f0";
    center.textContent = "لا يوجد طلاب";
    result.textContent = "أضف طلابا أولا ثم ابدأ التدوير.";
    return;
  }

  wheel.style.background = buildWheelGradient(cls.students.length);
  if (!wheelBusy) {
    center.textContent = "تدوير";
    result.textContent = "اضغط تدوير لاختيار طالب عشوائي.";
  }
}

function getLuckyGameStudents(cls) {
  if (!cls || !Array.isArray(cls.students)) return [];
  const seenNames = new Set();
  const unique = [];
  for (const s of cls.students) {
    if (!s || !s.id) continue;
    const cleanName = normalizeName(s.name);
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    unique.push({ id: s.id, name: cleanName });
    if (unique.length >= 40) break;
  }
  return unique;
}

function renderLuckyGame() {
  const grid = document.getElementById("lucky-grid");
  const result = document.getElementById("lucky-result");
  const cls = getActiveClass();
  if (!grid || !result) return;

  if (!currentTeacher) {
    grid.innerHTML = "<div class='lucky-card'>-</div>".repeat(9);
    result.textContent = "ميزة اللعبة متاحة بعد تسجيل الدخول.";
    return;
  }
  if (!cls || !cls.students.length) {
    grid.innerHTML = "<div class='lucky-card'>-</div>".repeat(9);
    result.textContent = "أضف طلابًا أولًا ثم ابدأ اللعبة.";
    return;
  }
  const luckyStudents = getLuckyGameStudents(cls);
  if (!luckyStudents.length) {
    grid.innerHTML = "<div class='lucky-card'>-</div>".repeat(9);
    result.textContent = "لا توجد أسماء صالحة للعبة.";
    return;
  }

  grid.innerHTML = luckyStudents
    .map((student) => `<div class="lucky-card" data-student-id="${student.id}">${student.name}</div>`)
    .join("");

  if (!luckyBusy) {
    const hasMoreThan40 = cls.students.length > 40;
    const suffix = hasMoreThan40 ? " (تم عرض أول 40 اسم بدون تكرار)." : ".";
    result.textContent = `اضغط ابدأ اللعبة لاختيار طالب عشوائي${suffix}`;
  }
}

function formatSeconds(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function renderCountdown() {
  const display = document.getElementById("countdown-display");
  const status = document.getElementById("countdown-status");
  if (!display || !status) return;
  display.textContent = formatSeconds(countdownRemainingSeconds);
  display.classList.toggle("done", countdownRemainingSeconds === 0);

  if (countdownRemainingSeconds === 0) {
    status.textContent = "انتهى الوقت.";
  } else if (countdownRunning) {
    status.textContent = "المؤقت يعمل...";
  } else {
    status.textContent = "المؤقت متوقف.";
  }
}

function getCountdownInputSeconds() {
  const minutesInput = document.getElementById("countdown-minutes");
  const secondsInput = document.getElementById("countdown-seconds");
  const mins = Math.max(0, Number(minutesInput ? minutesInput.value : 0));
  const secs = Math.max(0, Number(secondsInput ? secondsInput.value : 0));
  return (Math.floor(mins) * 60) + Math.min(59, Math.floor(secs));
}

function startCountdown() {
  if (!ensureAuthOrNotify()) return;
  enterFeatureFullscreen("feature-countdown");
  if (countdownRunning) return;

  if (countdownRemainingSeconds <= 0) {
    countdownRemainingSeconds = getCountdownInputSeconds();
  }
  if (countdownRemainingSeconds <= 0) {
    const status = document.getElementById("countdown-status");
    if (status) status.textContent = "حدد وقتًا أكبر من صفر.";
    return;
  }

  countdownRunning = true;
  renderCountdown();

  countdownInterval = setInterval(() => {
    countdownRemainingSeconds -= 1;
    if (countdownRemainingSeconds <= 0) {
      countdownRemainingSeconds = 0;
      countdownRunning = false;
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      playCheer();
    }
    renderCountdown();
  }, 1000);
}

function pauseCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  countdownRunning = false;
  renderCountdown();
}

function resetCountdown() {
  pauseCountdown();
  countdownRemainingSeconds = getCountdownInputSeconds();
  renderCountdown();
  const status = document.getElementById("countdown-status");
  if (status) status.textContent = "تمت إعادة ضبط المؤقت.";
}

function startLuckyGame() {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  enterFeatureFullscreen("feature-lucky");

  const btn = document.getElementById("start-lucky-game");
  const result = document.getElementById("lucky-result");
  const cards = Array.from(document.querySelectorAll(".lucky-card"));
  if (!btn || !result || !cards.length) return;
  if (luckyBusy) return;

  const luckyStudents = getLuckyGameStudents(cls);
  if (!luckyStudents.length) {
    result.textContent = "أضف طلابًا أولًا ثم ابدأ اللعبة.";
    return;
  }
  if (cards.length !== luckyStudents.length) {
    renderLuckyGame();
  }
  const freshCards = Array.from(document.querySelectorAll(".lucky-card"));
  if (!freshCards.length) return;

  luckyBusy = true;
  btn.disabled = true;
  result.textContent = "جاري اختيار الطالب...";

  let activeIndex = 0;
  freshCards.forEach((c) => c.classList.remove("active", "winner"));
  if (luckyTicker) clearInterval(luckyTicker);
  luckyTicker = setInterval(() => {
    freshCards.forEach((c) => c.classList.remove("active"));
    activeIndex = Math.floor(Math.random() * freshCards.length);
    freshCards[activeIndex].classList.add("active");
  }, 110);

  const winnerIndex = Math.floor(Math.random() * luckyStudents.length);
  const winner = luckyStudents[winnerIndex];
  const winnerCard = freshCards.find((c) => c.dataset.studentId === winner.id);

  setTimeout(() => {
    if (luckyTicker) {
      clearInterval(luckyTicker);
      luckyTicker = null;
    }
    freshCards.forEach((c) => c.classList.remove("active", "winner"));
    if (winnerCard) winnerCard.classList.add("winner");
    luckyBusy = false;
    btn.disabled = false;
    result.textContent = `فاز: ${winner.name}`;
    playCheer();
    triggerCelebration("🎲 فائز صندوق الحظ", `الفائز: ${winner.name}`);
  }, 2600);
}

function generateReportText(cls) {
  const ranked = rankStudents(cls);
  const insights = weeklyInsights(cls);
  const lines = [];
  lines.push(`تقرير أسبوعي - المعلم: ${currentTeacher ? currentTeacher.name : "-"}`);
  lines.push(`الصف: ${cls ? cls.name : "-"} | المادة: ${cls ? cls.subject : "-"}`);
  lines.push(`التاريخ: ${new Date().toLocaleDateString("ar-EG")}`);
  lines.push("");
  lines.push("أهم المؤشرات:");
  insights.forEach((x) => lines.push(`- ${x}`));
  lines.push("");
  lines.push("ترتيب الطلاب:");
  ranked.forEach((s, i) => lines.push(`${i + 1}) ${s.name} - ${s.points || 0} نقطة`));
  const challenge = cls ? normalizeChallenge(cls.challenge) : null;
  if (challenge && challenge.title) {
    lines.push("");
    lines.push(`التحدي الأسبوعي: ${challenge.title}`);
    lines.push(`الفترة: ${challenge.startDate || "-"} إلى ${challenge.endDate || "-"}`);
    lines.push(`نقاط مكافأة الفائز: ${challenge.bonusPoints}`);
    const winner = cls.students.find((s) => s.id === challenge.winnerStudentId);
    lines.push(`الفائز: ${winner ? winner.name : "لم يتم الإعلان بعد"}`);
  }
  return lines.join("\n");
}

function openWhatsApp(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

function applyPointsChange(student, delta, reasonLabel, opts = {}) {
  if (!student) return { beforePoints: 0, afterPoints: 0, leveledUp: false };
  const beforePoints = Number(student.points || 0);
  const beforeLevelIndex = getLevelIndex(beforePoints);
  const safeDelta = Number(delta || 0);
  const nextPoints = Math.max(0, beforePoints + safeDelta);
  student.points = nextPoints;
  student.history = student.history || [];
  student.history.push({ delta: safeDelta, reason: reasonLabel, at: new Date().toISOString() });

  const afterLevelIndex = getLevelIndex(nextPoints);
  const leveledUp = afterLevelIndex > beforeLevelIndex;
  if (leveledUp && opts.celebrateLevel !== false) {
    const lvl = getStudentLevel(nextPoints);
    triggerCelebration("🏅 ترقية مستوى", `${student.name} وصل إلى مستوى ${lvl.name} ${lvl.emoji}`);
  }
  return { beforePoints, afterPoints: nextPoints, leveledUp };
}

function updateStudentPoints(studentId, reasonKey) {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;

  const student = cls.students.find((s) => s.id === studentId);
  if (!student) return;

  const r = reasons[reasonKey];
  const before = Number(student.points || 0);
  applyPointsChange(student, r.delta, r.label);

  if (r.delta > 0) {
    playCheer();
    const after = Number(student.points || 0);
    if (after >= 100 && before < 100) {
      triggerCelebration("⭐ إنجاز جديد", `${student.name} تجاوز 100 نقطة!`);
    }
  }
  saveTeacherData();
  renderAll();
}


function applySelectedReason(studentId) {
  if (!ensureAuthOrNotify()) return;
  const select = document.getElementById(`reason-${studentId}`);
  if (!select || !select.value) return;
  updateStudentPoints(studentId, select.value);
}
function openStudentPhotoPicker(studentId) {
  if (!ensureAuthOrNotify()) return;
  const fileInput = document.getElementById(`photo-input-${studentId}`);
  if (!fileInput) return;
  fileInput.click();
}

async function handleStudentPhotoUpload(studentId, event) {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;

  const fileInput = event && event.target ? event.target : null;
  const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
  if (!file) return;

  if (!String(file.type || "").startsWith("image/")) {
    showAuthMessage("الملف يجب أن يكون صورة.", true);
    fileInput.value = "";
    return;
  }
  if (Number(file.size || 0) > MAX_STUDENT_PHOTO_BYTES) {
    showAuthMessage("حجم الصورة يجب ألا يتجاوز 20MB.", true);
    fileInput.value = "";
    return;
  }

  const student = cls.students.find((s) => s.id === studentId);
  if (!student) {
    showAuthMessage("تعذر العثور على الطالب المحدد.", true);
    fileInput.value = "";
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    await setStudentPhotoDataUrl(cls, studentId, dataUrl);
    const cell = document.getElementById(`photo-${studentId}`);
    if (cell) {
      cell.innerHTML = renderPhotoCellContent(student.name, dataUrl);
    }
    showAuthMessage(`تم حفظ صورة الطالب ${student.name}.`);
  } catch {
    showAuthMessage("حدث خطأ أثناء حفظ الصورة.", true);
  } finally {
    fileInput.value = "";
  }
}

async function removeStudentPhoto(studentId) {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  const student = cls.students.find((s) => s.id === studentId);
  if (!student) return;
  const ok = window.confirm(`هل تريد حذف صورة الطالب ${student.name}؟`);
  if (!ok) return;

  try {
    await removeStudentPhotoDataUrl(cls, studentId);
    const cell = document.getElementById(`photo-${studentId}`);
    if (cell) {
      cell.innerHTML = renderPhotoCellContent(student.name, "");
    }
    showAuthMessage(`تم حذف صورة الطالب ${student.name}.`);
  } catch {
    showAuthMessage("تعذر حذف صورة الطالب.", true);
  }
}

async function deleteStudent(studentId) {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  if (!ensureStudentManagerOrNotify(cls)) return;
  const target = cls.students.find((s) => s.id === studentId);
  if (!target) return;
  const ok = window.confirm(`هل تريد حذف الطالب ${target.name} من الصف؟`);
  if (!ok) return;

  try {
    await removeStudentPhotoDataUrl(cls, studentId);
  } catch {}
  cls.students = cls.students.filter((s) => s.id !== studentId);
  saveTeacherData();
  renderAll();
}

function removeReward(idx) {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  const reward = cls.rewards[idx];
  if (!reward) return;
  const ok = window.confirm(`هل تريد حذف المكافأة "${reward.name}" (${reward.points} نقطة)؟`);
  if (!ok) return;

  cls.rewards.splice(idx, 1);
  saveTeacherData();
  renderRewards();
}

function removeGift(giftId) {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  const gifts = Array.isArray(cls.giftStore) ? cls.giftStore.map(normalizeGift) : [];
  const gift = gifts.find((g) => g.id === giftId);
  if (!gift) return;
  const ok = window.confirm(`هل تريد حذف الهدية "${gift.name}" من المتجر؟`);
  if (!ok) return;

  cls.giftStore = gifts.filter((g) => g.id !== giftId);
  saveTeacherData();
  renderGiftStoreSettings();
}

function addStudentsByNames(cls, names) {
  names.map(normalizeName).filter(Boolean).forEach((name) => {
    cls.students.push({ id: uid(), name, code: `ST-${uid()}`, points: 0, history: [], team: "", claimedGiftIds: [] });
  });
}

async function replaceStudentsByNames(cls, names, sourceLabel) {
  const cleanNames = Array.from(new Set((names || []).map(normalizeName).filter(Boolean)));
  if (!cleanNames.length) {
    showAuthMessage(`لم يتم العثور على أسماء صالحة في ملف ${sourceLabel}.`, true);
    return false;
  }

  if (cls.students.length) {
    const ok = window.confirm(`سيتم استبدال جميع طلاب الصف الحالي (${cls.students.length}) بطلاب الملف الجديد (${cleanNames.length}). هل تريد المتابعة؟`);
    if (!ok) return false;
  }

  try {
    await removeAllClassStudentPhotos(cls);
  } catch {}
  cls.students = [];
  cls.parentMessages = {};
  cls.challenge = createDefaultChallenge();
  cls.miniChallenge = createDefaultMiniChallenge();

  addStudentsByNames(cls, cleanNames);
  saveTeacherData();
  renderAll();
  showAuthMessage(`تم استبدال الطلاب بنجاح من ملف ${sourceLabel} (${cleanNames.length} طالب).`);
  return true;
}

function assignTeams() {
  const cls = ensureClassOrNotify();
  if (!cls) return;

  const names = cls.teams && cls.teams.length ? cls.teams : ["الفريق الأحمر", "الفريق الأزرق", "الفريق الذهبي"];
  const shuffled = [...cls.students].sort(() => Math.random() - 0.5);
  shuffled.forEach((s, i) => {
    s.team = names[i % names.length];
  });
}

function applyManualTeams() {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  if (!cls.students.length) {
    showAuthMessage("لا يوجد طلاب لتطبيق التوزيع اليدوي.", true);
    return;
  }

  cls.students.forEach((s) => {
    const select = document.getElementById(`team-${s.id}`);
    if (!select) return;
    s.team = normalizeName(select.value);
  });

  saveTeacherData();
  renderAll();
  showAuthMessage("تم حفظ التوزيع اليدوي للفرق.");
}

function clearTeams() {
  const cls = ensureClassOrNotify();
  if (!cls) return;
  cls.students.forEach((s) => {
    s.team = "";
  });
}

async function clearCurrentClassStudents() {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  if (!ensureStudentManagerOrNotify(cls)) return;

  if (!cls.students.length) {
    showAuthMessage("هذا الصف فارغ بالفعل.", true);
    return;
  }

  const ok = window.confirm(`هل تريد مسح جميع طلاب الصف ${cls.name}؟`);
  if (!ok) return;

  try {
    await removeAllClassStudentPhotos(cls);
  } catch {}
  cls.students = [];
  cls.parentMessages = {};
  cls.challenge = createDefaultChallenge();
  cls.miniChallenge = createDefaultMiniChallenge();
  saveTeacherData();
  renderAll();
  showAuthMessage("تم مسح جميع طلاب الصف الحالي.");
}

function renderStudentAccessControls() {
  const cls = getActiveClass();
  const isManager = canManageStudents(cls);
  const ids = ["student-name", "add-student", "csv-file", "import-csv", "clear-class"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = !isManager;
  });
}

function startWheelSpin() {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  enterFeatureFullscreen("feature-wheel");

  const button = document.getElementById("spin-wheel");
  const wheel = document.getElementById("student-wheel");
  const center = document.getElementById("wheel-center-text");
  const result = document.getElementById("wheel-result");
  if (!button || !wheel || !center || !result) return;
  if (wheelBusy) return;

  if (!cls.students.length) {
    result.textContent = "أضف طلابا أولا ثم ابدأ التدوير.";
    center.textContent = "لا يوجد طلاب";
    return;
  }

  wheelBusy = true;
  button.disabled = true;
  result.textContent = "جاري التدوير...";

  const names = cls.students.map((s) => s.name);
  let idx = 0;
  if (wheelTicker) clearInterval(wheelTicker);
  wheelTicker = setInterval(() => {
    center.textContent = names[idx % names.length];
    idx += 1;
  }, 90);

  const winnerIndex = Math.floor(Math.random() * cls.students.length);
  const winner = cls.students[winnerIndex];
  const segment = 360 / cls.students.length;
  const winnerAngle = winnerIndex * segment + segment / 2;
  const rounds = 6 + Math.floor(Math.random() * 3);
  const settleOffset = (360 - winnerAngle) + (Math.random() * segment * 0.4 - segment * 0.2);
  const finalRotation = wheelRotation + rounds * 360 + settleOffset;

  requestAnimationFrame(() => {
    wheel.style.transform = `rotate(${finalRotation}deg)`;
  });

  setTimeout(() => {
    if (wheelTicker) {
      clearInterval(wheelTicker);
      wheelTicker = null;
    }
    wheelBusy = false;
    wheelRotation = finalRotation % 360;
    center.textContent = winner.name;
    result.textContent = `تم اختيار: ${winner.name}`;
    button.disabled = false;
    playCheer();
    triggerCelebration("🎡 اختيار عشوائي", `تم اختيار الطالب: ${winner.name}`);
  }, 3300);
}

async function hydrateProfilePhotoByElementId(elementId, cls, student) {
  const holder = document.getElementById(elementId);
  if (!holder || !cls || !student) return;
  try {
    const dataUrl = await getStudentPhotoDataUrl(cls, student.id);
    holder.innerHTML = renderPhotoCellContent(student.name, dataUrl);
  } catch {
    holder.innerHTML = renderPhotoCellContent(student.name, "");
  }
}

function renderStudentRewardStore(cls, student) {
  const gifts = (cls.giftStore || [])
    .map((g) => normalizeGift(g))
    .sort((a, b) => Number(a.requiredPoints || 0) - Number(b.requiredPoints || 0));

  if (!gifts.length) {
    return "<p class='muted'>لا توجد هدايا متاحة في المتجر حالياً.</p>";
  }
  const claimed = new Set(Array.isArray(student.claimedGiftIds) ? student.claimedGiftIds : []);

  return `
    <div class="reward-store-list">
      ${gifts.map((gift) => {
        const required = Number(gift.requiredPoints || 0);
        const eligible = Number(student.points || 0) >= required;
        const alreadyClaimed = claimed.has(gift.id);
        const buttonLabel = alreadyClaimed ? "تم الاستلام" : "استلام";
        return `
          <div class="reward-store-item">
            <span>🎁 ${gift.name} - يحتاج ${required} نقطة</span>
            <button class="btn secondary" onclick="claimStudentGiftByCode('${student.code}', '${gift.id}')" ${eligible && !alreadyClaimed ? "" : "disabled"}>${buttonLabel}</button>
          </div>
        `;
      }).join("")}
    </div>
    <small>ملاحظة: استلام الهدية لا يخصم النقاط.</small>
  `;
}

function claimStudentGiftByCode(code, giftId) {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  const codeUpper = normalizeName(code).toUpperCase();
  const student = (cls.students || []).find((s) => normalizeName(s.code).toUpperCase() === codeUpper);
  if (!student) {
    showAuthMessage("تعذر العثور على الطالب لهذا الاستلام.", true);
    return;
  }
  student.claimedGiftIds = Array.isArray(student.claimedGiftIds) ? student.claimedGiftIds : [];

  const gift = (cls.giftStore || []).map(normalizeGift).find((g) => g.id === giftId);
  if (!gift) {
    showAuthMessage("الهدية غير متاحة.", true);
    return;
  }
  const required = Number(gift.requiredPoints || 0);
  if (Number(student.points || 0) < required) {
    showAuthMessage("نقاط الطالب غير كافية لاستلام هذه الهدية.", true);
    return;
  }
  if (student.claimedGiftIds.includes(gift.id)) {
    showAuthMessage("تم استلام هذه الهدية مسبقًا.", true);
    return;
  }
  const ok = window.confirm(`تأكيد استلام ${gift.name} للطالب ${student.name}؟ (لن يتم خصم أي نقاط)`);
  if (!ok) return;

  student.claimedGiftIds.push(gift.id);
  student.history = student.history || [];
  student.history.push({ delta: 0, reason: `استلام هدية من المتجر: ${gift.name}`, at: new Date().toISOString() });
  saveTeacherData();
  renderAll();
  triggerCelebration("🎁 استلام هدية", `${student.name} استلم: ${gift.name}`);
  showAuthMessage(`تم استلام ${gift.name} للطالب ${student.name}. الرصيد بقي ${student.points} نقطة.`);
  renderStudentPanel({ student, cls });
}

function renderStudentPanel(found) {
  const panel = document.getElementById("student-panel");
  if (!currentTeacher) {
    panel.innerHTML = "<p class='muted'>لا يوجد معلم مسجل حاليًا على هذا الجهاز.</p>";
    return;
  }
  if (!found) {
    panel.innerHTML = "<p class='muted'>الكود غير صحيح.</p>";
    return;
  }

  const { student, cls } = found;
  const ranked = rankStudents(cls);
  const rank = ranked.findIndex((s) => s.id === student.id) + 1;
  const badges = studentBadges(student);
  const unlocked = cls.rewards.filter((r) => Number(student.points || 0) >= Number(r.points || 0));
  const level = getStudentLevel(student.points || 0);

  panel.innerHTML = `
    <div id="student-panel-photo" class="profile-photo">${renderPhotoCellContent(student.name, "")}</div>
    <p>الطالب: <strong>${student.name}</strong></p>
    <p>الصف: <strong>${cls.name}</strong></p>
    <p>النقاط الحالية: <strong>${student.points || 0}</strong></p>
    <p>المستوى: <strong>${level.name} ${level.emoji}</strong> (كل 50 نقطة = مستوى جديد)</p>
    <p>ترتيبك في الصف: <strong>#${rank || "-"}</strong></p>
    <div class="badges">${badges.length ? badges.map((b) => `<span class="badge">${b}</span>`).join("") : "لا توجد إنجازات بعد."}</div>
    <h3>المكافآت المتاحة</h3>
    <ul>${unlocked.length ? unlocked.map((r) => `<li>${r.name} (${r.points})</li>`).join("") : "<li>استمر لجمع النقاط.</li>"}</ul>
    <h3>متجر المكافآت</h3>
    <p>الرصيد الحالي: <strong>${student.points || 0}</strong> نقطة</p>
    <p class="muted">يمكنك استلام الهدايا المتاحة حسب نقاطك بدون خصم من الرصيد.</p>
    ${renderStudentRewardStore(cls, student)}
  `;
  hydrateProfilePhotoByElementId("student-panel-photo", cls, student);
}

function getParentMessageEntries(cls, studentCode) {
  if (!cls || !cls.parentMessages) return [];
  const codeKey = normalizeName(studentCode).toUpperCase();
  const raw = cls.parentMessages[codeKey];
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (typeof entry === "string") {
          return { text: normalizeName(entry), at: "" };
        }
        if (!entry || typeof entry !== "object") return null;
        return {
          text: normalizeName(entry.text || entry.message || ""),
          at: normalizeName(entry.at || entry.date || "")
        };
      })
      .filter((x) => x && x.text);
  }

  if (typeof raw === "string") {
    return [{ text: normalizeName(raw), at: "" }].filter((x) => x.text);
  }

  if (raw && typeof raw === "object") {
    const text = normalizeName(raw.text || raw.message || "");
    if (!text) return [];
    return [{ text, at: normalizeName(raw.at || raw.date || "") }];
  }

  return [];
}

function formatMessageDateTime(iso) {
  if (!iso) return "بدون تاريخ";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "بدون تاريخ";
  return d.toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderParentPanel(found) {
  const panel = document.getElementById("parent-panel");
  if (!currentTeacher) {
    panel.innerHTML = "<p class='muted'>لا يوجد معلم مسجل حاليًا على هذا الجهاز.</p>";
    return;
  }
  if (!found) {
    panel.innerHTML = "<p class='muted'>لم يتم العثور على الطالب بهذا الكود.</p>";
    return;
  }

  const { student, cls } = found;
  const messages = getParentMessageEntries(cls, student.code);
  const points = Number(student.points || 0);
  const level = getStudentLevel(points);
  const messagesHtml = messages.length
    ? `<div class="reward-store-list">
        ${[...messages].reverse().map((m) => `
          <div class="reward-store-item">
            <span>${m.text}</span>
            <small class="muted">${formatMessageDateTime(m.at)}</small>
          </div>
        `).join("")}
      </div>`
    : "<p class='muted'>لا توجد رسائل جديدة.</p>";

  panel.innerHTML = `
    <div id="parent-panel-photo" class="profile-photo">${renderPhotoCellContent(student.name, "")}</div>
    <p>الطالب: <strong>${student.name}</strong></p>
    <p>الصف: <strong>${cls.name}</strong></p>
    <p>النقاط: <strong>${points}</strong></p>
    <p>المستوى: <strong>${level.name} ${level.emoji}</strong></p>
    <p>السلوك العام: <strong>${points >= 70 ? "ممتاز" : points >= 30 ? "جيد" : "يحتاج متابعة"}</strong></p>
    <h3>رسائل المعلم</h3>
    ${messagesHtml}
  `;
  hydrateProfilePhotoByElementId("parent-panel-photo", cls, student);
}

function renderAll() {
  refreshClassesFromShared();
  updateSessionUI();
  renderClassSelector();
  renderStudentAccessControls();
  renderStudentsTable();
  renderRewards();
  renderGiftStoreSettings();
  renderInsights();
  renderLiveBoard();
  renderLiveTeams();
  renderLiveDetails();
  renderChallenge();
  renderMiniChallenge();
  renderTeams();
  renderWheel();
  renderLuckyGame();
  renderCountdown();
}

window.updateStudentPoints = updateStudentPoints;
window.applySelectedReason = applySelectedReason;
window.deleteStudent = deleteStudent;
window.openStudentPhotoPicker = openStudentPhotoPicker;
window.handleStudentPhotoUpload = handleStudentPhotoUpload;
window.removeStudentPhoto = removeStudentPhoto;
window.claimStudentGiftByCode = claimStudentGiftByCode;
window.removeReward = removeReward;
window.removeGift = removeGift;

const tabs = document.querySelectorAll(".tab");
const views = document.querySelectorAll(".view");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    views.forEach((v) => v.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

// Auth events

document.getElementById("open-unified-auth").addEventListener("click", () => {
  window.location.href = buildUnifiedAuthUrl();
});

document.getElementById("logout-btn").addEventListener("click", () => {
  clearUnifiedSession();
  setSession("");
  currentTeacher = null;
  state = createDefaultState();
  wheelRotation = 0;
  showAuthMessage("تم تسجيل الخروج.");
  renderAll();
});

// Class events

document.getElementById("class-selector").addEventListener("change", (e) => {
  if (!ensureAuthOrNotify()) return;
  state.activeClassId = e.target.value;
  wheelRotation = 0;
  saveTeacherData();
  renderAll();
  const cls = getActiveClass();
  showAuthMessage(`تم التحويل إلى الصف: ${cls ? cls.name : "-"} (${cls ? cls.students.length : 0} طالب).`);
});

document.getElementById("new-class").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;

  const nameInput = normalizeName(document.getElementById("new-class-name").value);
  const subjectInput = normalizeName(document.getElementById("new-class-subject").value);
  const finalName = nameInput || `صف ${state.classes.length + 1}`;
  const duplicate = state.classes.some((c) => normalizeName(c.name) === finalName);
  if (duplicate) {
    showAuthMessage("اسم الصف موجود مسبقًا. اختر اسمًا مختلفًا.", true);
    return;
  }

  const newClass = createDefaultClass(finalName, subjectInput);
  ensureClassShareMeta(newClass, currentTeacher.id);

  state.classes.push(newClass);
  state.activeClassId = newClass.id;
  wheelRotation = 0;
  document.getElementById("new-class-name").value = "";
  document.getElementById("new-class-subject").value = "";
  saveTeacherData();
  renderAll();
  showAuthMessage(`تم إنشاء الصف ${newClass.name}.`);
});

document.getElementById("join-class").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const codeInput = document.getElementById("join-class-code");
  const code = normalizeName(codeInput.value);
  const joined = joinSharedClassByCode(code, currentTeacher.id);
  if (!joined.ok) {
    showAuthMessage(joined.message, true);
    return;
  }

  const already = state.classes.some((c) => c.id === joined.classData.id);
  if (!already) state.classes.push(normalizeClass(joined.classData));
  state.activeClassId = joined.classData.id;
  codeInput.value = "";
  saveTeacherData();
  renderAll();
  showAuthMessage(`تم الانضمام إلى الصف ${joined.classData.name} بنجاح.`);
});

document.getElementById("delete-class").addEventListener("click", async () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;

  const sharedMap = loadSharedClassesMap();
  const sharedEntry = (cls.sharedId && sharedMap[cls.sharedId]) ? normalizeClass(sharedMap[cls.sharedId]) : null;
  const isOwner = sharedEntry && sharedEntry.ownerTeacherId === currentTeacher.id;
  const hasOthers = sharedEntry && (sharedEntry.teacherIds || []).filter((id) => id !== currentTeacher.id).length > 0;

  if (sharedEntry && !isOwner) {
    const okLeave = window.confirm(`هل تريد مغادرة الصف ${cls.name}؟`);
    if (!okLeave) return;
    sharedEntry.teacherIds = (sharedEntry.teacherIds || []).filter((id) => id !== currentTeacher.id);
    sharedMap[sharedEntry.sharedId] = sharedEntry;
    saveSharedClassesMap(sharedMap);
    state.classes = state.classes.filter((c) => c.id !== cls.id);
    if (!state.classes.length) {
      const fallback = createDefaultClass();
      ensureClassShareMeta(fallback, currentTeacher.id);
      state.classes.push(fallback);
    }
    state.activeClassId = state.classes[0].id;
    wheelRotation = 0;
    saveTeacherData();
    renderAll();
    showAuthMessage("تمت مغادرة الصف.");
    return;
  }

  if (sharedEntry && isOwner && hasOthers) {
    const okDeleteAll = window.confirm(`أنت مالك الصف ${cls.name}. حذفه سيحذفه لجميع المعلمين. هل تريد المتابعة؟`);
    if (!okDeleteAll) return;
  } else {
    const ok = window.confirm(`هل تريد حذف الصف ${cls.name} بالكامل؟`);
    if (!ok) return;
  }

  try {
    await removeAllClassStudentPhotos(cls);
  } catch {}

  if (cls.sharedId && sharedMap[cls.sharedId]) {
    delete sharedMap[cls.sharedId];
    saveSharedClassesMap(sharedMap);
  }
  state.classes = state.classes.filter((c) => c.id !== cls.id);
  if (!state.classes.length) {
    const fallback = createDefaultClass();
    ensureClassShareMeta(fallback, currentTeacher.id);
    state.classes.push(fallback);
  }
  state.activeClassId = state.classes[0].id;
  wheelRotation = 0;
  saveTeacherData();
  renderAll();
  showAuthMessage("تم حذف الصف.");
});

document.getElementById("save-class").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;

  const name = normalizeName(document.getElementById("class-name").value);
  const subject = normalizeName(document.getElementById("subject-name").value);
  if (!name) {
    showAuthMessage("يرجى كتابة اسم الصف.", true);
    return;
  }

  cls.name = name;
  cls.subject = subject;
  saveTeacherData();
  renderAll();
  showAuthMessage("تم حفظ بيانات الصف.");
});

document.getElementById("clear-class").addEventListener("click", () => {
  clearCurrentClassStudents();
});

// Student and scoring events

document.getElementById("add-student").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  if (!ensureStudentManagerOrNotify(cls)) return;

  const name = normalizeName(document.getElementById("student-name").value);
  if (!name) return;

  cls.students.push({ id: uid(), name, code: `ST-${uid()}`, points: 0, history: [], team: "", claimedGiftIds: [] });
  document.getElementById("student-name").value = "";
  saveTeacherData();
  renderAll();
});

document.getElementById("import-csv").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  if (!ensureStudentManagerOrNotify(cls)) return;

  const fileInput = document.getElementById("csv-file");
  const file = fileInput.files[0];
  if (!file) {
    showAuthMessage("يرجى اختيار ملف أولاً.", true);
    return;
  }

  const fileName = (file.name || "").toLowerCase();
  const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

  if (isExcel) {
    if (typeof XLSX === "undefined") {
      showAuthMessage("مكتبة قراءة Excel غير متاحة حاليًا.", true);
      return;
    }

    file.arrayBuffer().then(async (buffer) => {
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false });
      const names = rows.map((r) => Array.isArray(r) ? r[0] : "").map(normalizeName).filter(Boolean);

      if (!names.length) {
        showAuthMessage("لم يتم العثور على أسماء في العمود الأول من ملف Excel.", true);
        return;
      }

      fileInput.value = "";
      await replaceStudentsByNames(cls, names, "Excel");
    }).catch(() => {
      showAuthMessage("حدث خطأ أثناء قراءة ملف Excel.", true);
    });

    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = String(e.target.result || "");
    const names = text.split(/\r?\n/).map(normalizeName).filter(Boolean);

    if (!names.length) {
      showAuthMessage("الملف لا يحتوي أسماء صالحة.", true);
      return;
    }

    fileInput.value = "";
    await replaceStudentsByNames(cls, names, "CSV");
  };
  reader.readAsText(file, "UTF-8");
});

// Rewards, teams, challenge

document.getElementById("add-reward").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;

  const points = Number(document.getElementById("reward-points").value);
  const name = normalizeName(document.getElementById("reward-name").value);
  if (!points || !name) return;

  cls.rewards.push({ points, name });
  document.getElementById("reward-points").value = "";
  document.getElementById("reward-name").value = "";
  saveTeacherData();
  renderRewards();
});

document.getElementById("add-gift").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;

  const requiredPoints = Math.max(1, Number(document.getElementById("gift-points").value || 0));
  const name = normalizeName(document.getElementById("gift-name").value);
  if (!requiredPoints || !name) return;

  cls.giftStore = Array.isArray(cls.giftStore) ? cls.giftStore.map(normalizeGift) : [];
  const duplicate = cls.giftStore.some((g) => normalizeName(g.name) === name && Number(g.requiredPoints) === requiredPoints);
  if (duplicate) {
    showAuthMessage("هذه الهدية موجودة مسبقًا بنفس النقاط.", true);
    return;
  }

  cls.giftStore.push({ id: `GF-${uid()}`, requiredPoints, name });
  document.getElementById("gift-points").value = "";
  document.getElementById("gift-name").value = "";
  saveTeacherData();
  renderGiftStoreSettings();
});

document.getElementById("auto-teams").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  assignTeams();
  saveTeacherData();
  renderAll();
});

document.getElementById("clear-teams").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const ok = window.confirm("هل تريد مسح توزيع الفرق الحالي؟");
  if (!ok) return;
  clearTeams();
  saveTeacherData();
  renderAll();
});

document.getElementById("spin-wheel").addEventListener("click", () => {
  startWheelSpin();
});

document.getElementById("start-lucky-game").addEventListener("click", () => {
  startLuckyGame();
});

document.getElementById("start-countdown").addEventListener("click", () => {
  startCountdown();
});

document.getElementById("pause-countdown").addEventListener("click", () => {
  pauseCountdown();
});

document.getElementById("reset-countdown").addEventListener("click", () => {
  resetCountdown();
});

document.querySelectorAll("[data-feature-exit]").forEach((btn) => {
  btn.addEventListener("click", () => {
    exitFeatureFullscreen();
  });
});

document.getElementById("feature-fullscreen-backdrop").addEventListener("click", () => {
  exitFeatureFullscreen();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    exitFeatureFullscreen();
  }
});

document.getElementById("save-challenge").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  const title = normalizeName(document.getElementById("challenge-title").value);
  const startDate = normalizeName(document.getElementById("challenge-start-date").value);
  const endDate = normalizeName(document.getElementById("challenge-end-date").value);
  const bonusPoints = Number(document.getElementById("challenge-bonus-points").value || 10);

  if (!title) {
    showAuthMessage("يرجى كتابة عنوان التحدي.", true);
    return;
  }
  if (!startDate || !endDate) {
    showAuthMessage("يرجى تحديد تاريخ البداية والنهاية للتحدي.", true);
    return;
  }
  if (endDate < startDate) {
    showAuthMessage("تاريخ النهاية يجب أن يكون بعد أو مساويًا لتاريخ البداية.", true);
    return;
  }

  cls.challenge = {
    title,
    startDate,
    endDate,
    bonusPoints: Math.max(1, bonusPoints),
    winnerStudentId: "",
    winnerAwardedAt: "",
    announcedByTeacherAt: ""
  };
  saveTeacherData();
  renderAll();
  showAuthMessage("تم حفظ التحدي الأسبوعي.");
});

document.getElementById("announce-winner").addEventListener("click", () => {
  announceChallengeWinner();
});

document.getElementById("reopen-challenge").addEventListener("click", () => {
  reopenChallenge();
});

document.getElementById("start-mini-challenge").addEventListener("click", () => {
  startMiniChallenge();
});

document.getElementById("mini-challenge-duration").addEventListener("change", () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;
  const mini = getMiniChallenge(cls);
  mini.durationSeconds = Math.max(60, Number(document.getElementById("mini-challenge-duration").value || mini.durationSeconds || 300));
  saveTeacherData();
  renderMiniChallenge();
});

document.getElementById("toggle-mini-challenge").addEventListener("click", () => {
  toggleMiniChallengePause();
});

document.getElementById("pick-mini-winner").addEventListener("click", () => {
  pickMiniChallengeWinnerNow();
});

document.getElementById("reset-mini-challenge").addEventListener("click", () => {
  resetMiniChallenge();
});

// Student / parent portals

document.getElementById("student-login").addEventListener("click", () => {
  const found = findStudentByCodeInActiveClass(document.getElementById("student-code-input").value);
  renderStudentPanel(found);
});

document.getElementById("parent-login").addEventListener("click", () => {
  const found = findStudentByCodeInActiveClass(document.getElementById("parent-code-input").value);
  renderParentPanel(found);
});

document.getElementById("send-parent-msg").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;

  const code = normalizeName(document.getElementById("parent-code").value).toUpperCase();
  const msg = normalizeName(document.getElementById("parent-message").value);
  if (!code || !msg) return;

  const prev = getParentMessageEntries(cls, code);
  prev.push({ text: msg, at: new Date().toISOString() });
  cls.parentMessages[code] = prev;
  document.getElementById("parent-code").value = "";
  document.getElementById("parent-message").value = "";
  saveTeacherData();
  showAuthMessage("تم حفظ رسالة ولي الأمر مع التاريخ.");
});

// Reports

document.getElementById("generate-report").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;

  document.getElementById("report-output").textContent = generateReportText(cls);
});

document.getElementById("print-report").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;

  const output = document.getElementById("report-output");
  if (!output.textContent.trim()) output.textContent = generateReportText(cls);
  window.print();
});

document.getElementById("share-whatsapp").addEventListener("click", () => {
  if (!ensureAuthOrNotify()) return;
  const cls = ensureClassOrNotify();
  if (!cls) return;

  const text = document.getElementById("report-output").textContent.trim() || generateReportText(cls);
  openWhatsApp(text);
});

// bootstrap
currentTeacher = getCurrentTeacher();
state = currentTeacher ? loadTeacherData(currentTeacher.id) : createDefaultState();
ensureMiniChallengeTicker();
renderAll();
if (currentTeacher && currentTeacher.userId) {
  pullRemoteStateIfNeeded().finally(() => {
    remoteSyncReady = true;
  });
} else {
  remoteSyncReady = true;
}

window.addEventListener("focus", () => {
  const prevId = currentTeacher ? currentTeacher.id : "";
  const nextTeacher = getCurrentTeacher();
  const nextId = nextTeacher ? nextTeacher.id : "";
  if (prevId !== nextId) {
    currentTeacher = nextTeacher;
    state = currentTeacher ? loadTeacherData(currentTeacher.id) : createDefaultState();
    wheelRotation = 0;
    remoteSyncReady = !currentTeacher;
    renderAll();
    if (currentTeacher && currentTeacher.userId) {
      pullRemoteStateIfNeeded().finally(() => {
        remoteSyncReady = true;
      });
    }
    return;
  }
  if (currentTeacher && currentTeacher.userId) {
    pullRemoteStateIfNeeded();
  }
});


