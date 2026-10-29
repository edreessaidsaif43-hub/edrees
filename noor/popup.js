const STORAGE_KEY = "noorLessonPrep";
const LESSONS_KEY = "noorLessonPrepLessons";
const ACTIVE_INDEX_KEY = "noorLessonPrepActiveIndex";

const form = document.querySelector("#prep-form");
const statusBox = document.querySelector("#status");
const fillButton = document.querySelector("#fill-page");
const exportButton = document.querySelector("#export-data");
const importInput = document.querySelector("#import-data");
const clearButton = document.querySelector("#clear-data");
const lessonPicker = document.querySelector("#lesson-picker");
const lessonSelect = document.querySelector("#lesson-select");
const lessonSummary = document.querySelector("#lesson-summary");

const FIELD_HEADERS = {
  subject: ["المادة", "اسم المادة", "subject", "course"],
  grade: ["الصف", "المرحلة", "الصف الدراسي", "grade", "class"],
  lessonTitle: ["عنوان الدرس", "اسم الدرس", "موضوع الدرس", "الدرس", "lesson", "title"],
  date: ["التاريخ", "تاريخ الدرس", "date"],
  classPeriod: ["الحصة", "رقم الحصة", "period"],
  week: ["الأسبوع", "اسبوع", "week"],
  term: ["الفصل", "الفصل الدراسي", "term", "semester"],
  learningOutcome: ["إضافة مخرج تعليمي آخر", "مخرج تعليمي", "المخرج التعليمي", "نواتج التعلم", "learning outcome", "outcome"],
  concepts: ["المفاهيم", "مفاهيم", "المصطلحات", "concepts", "terms"],
  intro: ["التهيئة / التمهيد / التعلم القبلي", "التهيئة", "التمهيد", "التعلم القبلي", "المقدمة", "intro", "warmup", "prior learning"],
  lessonProcedures: ["إجراءات سير الدرس / الأنشطة التدريسية", "إجراءات سير الدرس", "الأنشطة التدريسية", "إجراءات الدرس", "أنشطة الدرس", "activities", "procedures"],
  formativeAssessment: ["التقويم التكويني", "تقويم تكويني", "التقويم البنائي", "formative assessment"],
  summativeAssessment: ["التقويم الختامي", "تقويم ختامي", "summative assessment", "closure assessment"],
  weeklyPlanNotes: ["ملاحظات ضمن خطة الدراسة الأسبوعية (يشاهدها الطالب وولي الأمر)", "ملاحظات خطة الدراسة الأسبوعية", "خطة الدراسة الأسبوعية", "يشاهدها الطالب وولي الأمر", "weekly plan notes", "parent notes"]
};

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFormData() {
  return Object.fromEntries(new FormData(form).entries());
}

function setFormData(data) {
  [...form.elements].forEach((element) => {
    if (!element.name || element.type === "file") return;
    element.value = data[element.name] || "";
  });
}

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`.trim();
}

function describeLesson(lesson, index) {
  const title = lesson.lessonTitle || lesson.subject || `درس ${index + 1}`;
  const details = [lesson.date, lesson.grade, lesson.classPeriod].filter(Boolean).join(" - ");
  return details ? `${title} (${details})` : title;
}

function renderLessonOptions(lessons, activeIndex = 0) {
  lessonSelect.innerHTML = "";
  lessons.forEach((lesson, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = describeLesson(lesson, index);
    lessonSelect.append(option);
  });

  if (lessons.length) {
    lessonSelect.value = String(Math.min(activeIndex, lessons.length - 1));
    lessonPicker.hidden = false;
    lessonSummary.textContent = `${lessons.length} درس مستورد من الملف.`;
  } else {
    lessonPicker.hidden = true;
    lessonSummary.textContent = "";
  }
}

async function saveData() {
  const data = getFormData();
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
  return data;
}

async function saveLessons(lessons, activeIndex = 0) {
  const safeIndex = Math.max(0, Math.min(activeIndex, lessons.length - 1));
  const activeLesson = lessons[safeIndex] || {};
  await chrome.storage.local.set({
    [LESSONS_KEY]: lessons,
    [ACTIVE_INDEX_KEY]: safeIndex,
    [STORAGE_KEY]: activeLesson
  });
  setFormData(activeLesson);
  renderLessonOptions(lessons, safeIndex);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("لم أستطع الوصول إلى التبويب الحالي.");
  }
  return tab;
}

async function sendFillMessage(tabId, data) {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: "NOOR_FILL_PREPARATION",
      payload: data
    });
  } catch (error) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["styles.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, {
      type: "NOOR_FILL_PREPARATION",
      payload: data
    });
  }
}

function mapRowsToLessons(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map((header) => normalize(header));
  const indexByField = {};

  Object.entries(FIELD_HEADERS).forEach(([field, aliases]) => {
    const normalizedAliases = aliases.map(normalize);
    const exactIndex = headers.findIndex((header) => normalizedAliases.includes(header));
    const fuzzyIndex = headers.findIndex((header) => normalizedAliases.some((alias) => header.includes(alias) || alias.includes(header)));
    const index = exactIndex >= 0 ? exactIndex : fuzzyIndex;
    if (index >= 0) indexByField[field] = index;
  });

  return rows.slice(1)
    .map((row) => {
      const lesson = {};
      Object.entries(indexByField).forEach(([field, index]) => {
        lesson[field] = formatCellValue(row[index], field);
      });
      return lesson;
    })
    .filter((lesson) => Object.values(lesson).some((value) => String(value || "").trim()));
}

function formatCellValue(value, field) {
  if (value == null) return "";
  if (field === "date" && /^\d+(\.\d+)?$/.test(String(value))) {
    const serial = Number(value);
    if (serial > 20000 && serial < 90000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return date.toISOString().slice(0, 10);
    }
  }
  return String(value).trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((item) => item.some((value) => String(value).trim()));
}

function readZipEntries(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let eocdOffset = -1;

  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 66000); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }

  if (eocdOffset < 0) throw new Error("ملف Excel غير صالح.");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let directoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map();

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (view.getUint32(directoryOffset, true) !== 0x02014b50) break;

    const method = view.getUint16(directoryOffset + 10, true);
    const compressedSize = view.getUint32(directoryOffset + 20, true);
    const fileNameLength = view.getUint16(directoryOffset + 28, true);
    const extraLength = view.getUint16(directoryOffset + 30, true);
    const commentLength = view.getUint16(directoryOffset + 32, true);
    const localHeaderOffset = view.getUint32(directoryOffset + 42, true);
    const nameStart = directoryOffset + 46;
    const nameBytes = bytes.slice(nameStart, nameStart + fileNameLength);
    const name = new TextDecoder().decode(nameBytes);

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressedData = bytes.slice(dataStart, dataStart + compressedSize);
    entries.set(name, { method, compressedData });

    directoryOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function unzipText(entries, name) {
  const entry = entries.get(name);
  if (!entry) return "";

  if (entry.method === 0) {
    return new TextDecoder("utf-8").decode(entry.compressedData);
  }

  if (entry.method !== 8 || typeof DecompressionStream === "undefined") {
    throw new Error("هذا النوع من ملف Excel غير مدعوم في هذا المتصفح.");
  }

  const stream = new Blob([entry.compressedData]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
}

function parseXml(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}

function textOf(node) {
  return node ? node.textContent || "" : "";
}

function columnIndexFromCellRef(ref) {
  const letters = String(ref || "").replace(/[0-9]/g, "").toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return Math.max(0, index - 1);
}

async function parseXlsx(arrayBuffer) {
  const entries = readZipEntries(arrayBuffer);
  const workbookXml = await unzipText(entries, "xl/workbook.xml");
  const relsXml = await unzipText(entries, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = await unzipText(entries, "xl/sharedStrings.xml");

  const workbook = parseXml(workbookXml);
  const rels = parseXml(relsXml);
  const firstSheet = workbook.querySelector("sheet");
  if (!firstSheet) throw new Error("لم أجد ورقة عمل داخل ملف Excel.");

  const relId = firstSheet.getAttribute("r:id");
  const rel = [...rels.querySelectorAll("Relationship")].find((item) => item.getAttribute("Id") === relId);
  const target = rel?.getAttribute("Target") || "worksheets/sheet1.xml";
  const sheetPath = target.startsWith("xl/") ? target : `xl/${target.replace(/^\/+/, "")}`;
  const sheetXml = await unzipText(entries, sheetPath);

  const sharedStrings = sharedStringsXml
    ? [...parseXml(sharedStringsXml).querySelectorAll("si")].map((item) => [...item.querySelectorAll("t")].map(textOf).join(""))
    : [];

  return [...parseXml(sheetXml).querySelectorAll("sheetData row")].map((rowNode) => {
    const row = [];
    [...rowNode.querySelectorAll("c")].forEach((cell) => {
      const index = columnIndexFromCellRef(cell.getAttribute("r"));
      const type = cell.getAttribute("t");
      const value = textOf(cell.querySelector("v"));
      const inlineValue = textOf(cell.querySelector("is t"));
      row[index] = type === "s" ? sharedStrings[Number(value)] || "" : inlineValue || value;
    });
    return row;
  });
}

async function parseImportFile(file) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".json")) {
    const json = JSON.parse(await file.text());
    return Array.isArray(json) ? json : [json];
  }

  const rows = lowerName.endsWith(".xlsx")
    ? await parseXlsx(await file.arrayBuffer())
    : parseCsv(await file.text());

  const lessons = mapRowsToLessons(rows);
  if (!lessons.length) {
    throw new Error("لم أجد دروساً قابلة للاستيراد. تأكد أن الصف الأول يحتوي عناوين الأعمدة.");
  }
  return lessons;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveData();
  setStatus("تم حفظ بيانات التحضير.", "success");
});

lessonSelect.addEventListener("change", async () => {
  const stored = await chrome.storage.local.get(LESSONS_KEY);
  const lessons = stored[LESSONS_KEY] || [];
  const index = Number(lessonSelect.value);
  await saveLessons(lessons, index);
  setStatus("تم اختيار الدرس من ملف Excel.", "success");
});

fillButton.addEventListener("click", async () => {
  try {
    const data = await saveData();
    const tab = await getActiveTab();
    const result = await sendFillMessage(tab.id, data);
    const filled = result?.filledCount || 0;
    const unmatched = result?.unmatchedLabels?.length || 0;

    if (filled === 0) {
      setStatus("لم يتم العثور على حقول مناسبة في الصفحة الحالية. افتح صفحة إضافة/تعديل التحضير في نور ثم أعد المحاولة.", "error");
      return;
    }

    setStatus(`تمت تعبئة ${filled} حقلاً. ${unmatched ? `بقي ${unmatched} حقل يحتاج مطابقة يدوية.` : ""}`, "success");
  } catch (error) {
    setStatus(error.message || "حدث خطأ أثناء التعبئة.", "error");
  }
});

exportButton.addEventListener("click", async () => {
  const data = await saveData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "noor-lesson-prep.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("تم تجهيز ملف التصدير.", "success");
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) return;

  try {
    const lessons = await parseImportFile(file);
    await saveLessons(lessons, 0);
    setStatus(`تم استيراد ${lessons.length} درس من الملف.`, "success");
  } catch (error) {
    setStatus(error.message || "ملف الاستيراد غير صالح.", "error");
  } finally {
    importInput.value = "";
  }
});

clearButton.addEventListener("click", async () => {
  form.reset();
  lessonPicker.hidden = true;
  lessonSelect.innerHTML = "";
  await chrome.storage.local.remove([STORAGE_KEY, LESSONS_KEY, ACTIVE_INDEX_KEY]);
  setStatus("تم تفريغ البيانات المحفوظة.");
});

chrome.storage.local.get([STORAGE_KEY, LESSONS_KEY, ACTIVE_INDEX_KEY]).then((stored) => {
  const lessons = stored[LESSONS_KEY] || [];
  const activeIndex = stored[ACTIVE_INDEX_KEY] || 0;
  if (lessons.length) {
    renderLessonOptions(lessons, activeIndex);
  }
  if (stored[STORAGE_KEY]) {
    setFormData(stored[STORAGE_KEY]);
    setStatus(lessons.length ? "تم تحميل ملف الدروس وآخر درس مختار." : "تم تحميل آخر تحضير محفوظ.");
  }
});
