(() => {
  if (window.__noorPrepAutofillLoaded) return;
  window.__noorPrepAutofillLoaded = true;

  const STORAGE_KEY = "noorLessonPrep";
  const INLINE_TEXT_KEY = "noorLessonPrepInlineText";
  const INLINE_LESSONS_KEY = "noorLessonPrepInlineLessons";
  const INLINE_INDEX_KEY = "noorLessonPrepInlineIndex";

  const fieldProfiles = {
    subject: ["المادة", "اسم المادة", "subject", "course"],
    grade: ["الصف", "المرحلة", "grade", "class"],
    lessonTitle: ["عنوان الدرس", "اسم الدرس", "موضوع الدرس", "lesson", "title"],
    date: ["التاريخ", "تاريخ", "date"],
    classPeriod: ["الحصة", "رقم الحصة", "period"],
    week: ["الأسبوع", "اسبوع", "week"],
    term: ["الفصل", "الفصل الدراسي", "term", "semester"],
    learningOutcome: ["إضافة مخرج تعليمي آخر", "اضافة مخرج تعليمي اخر", "مخرج تعليمي", "المخرج التعليمي", "نواتج التعلم", "learning outcome", "outcome"],
    concepts: ["المفاهيم", "مفاهيم", "المصطلحات", "concepts", "terms"],
    intro: ["التهيئة / التمهيد / التعلم القبلي", "التهيئة", "التمهيد", "التعلم القبلي", "المقدمة", "intro", "warm"],
    lessonProcedures: ["إجراءات سير الدرس / الأنشطة التدريسية", "اجراءات سير الدرس", "الانشطه التدريسيه", "الأنشطة التدريسية", "إجراءات الدرس", "أنشطة الدرس", "activities", "procedures"],
    formativeAssessment: ["التقويم التكويني", "تقويم تكويني", "التقويم البنائي", "formative assessment"],
    summativeAssessment: ["التقويم الختامي", "تقويم ختامي", "summative assessment", "closure assessment"],
    weeklyPlanNotes: ["ملاحظات ضمن خطة الدراسة الأسبوعية (يشاهدها الطالب وولي الأمر)", "ملاحظات خطه الدراسه الاسبوعيه", "خطة الدراسة الأسبوعية", "يشاهدها الطالب وولي الامر", "weekly plan notes", "parent notes"]
  };

  const parseProfiles = {
    lessonTitle: ["عنوان الدرس", "اسم الدرس", "موضوع الدرس", "الدرس"],
    learningOutcome: ["إضافة مخرج تعليمي آخر", "مخرج تعليمي", "المخرج التعليمي", "نواتج التعلم"],
    concepts: ["المفاهيم", "مفاهيم", "المصطلحات"],
    intro: ["التهيئة / التمهيد / التعلم القبلي", "التهيئة", "التمهيد", "التعلم القبلي"],
    lessonProcedures: ["إجراءات سير الدرس / الأنشطة التدريسية", "إجراءات سير الدرس", "الأنشطة التدريسية", "إجراءات الدرس"],
    formativeAssessment: ["التقويم التكويني", "تقويم تكويني"],
    summativeAssessment: ["التقويم الختامي", "تقويم ختامي"],
    weeklyPlanNotes: ["ملاحظات ضمن خطة الدراسة الأسبوعية", "ملاحظات خطة الدراسة الأسبوعية", "ملاحظات"]
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

  function labelFor(control) {
    const parts = [
      control.getAttribute("aria-label"),
      control.getAttribute("placeholder"),
      control.getAttribute("name"),
      control.getAttribute("id"),
      control.getAttribute("title")
    ];

    if (control.id) {
      const explicit = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
      if (explicit) parts.push(explicit.textContent);
    }

    const wrappingLabel = control.closest("label");
    if (wrappingLabel) parts.push(wrappingLabel.textContent);

    const row = control.closest("tr, .row, .form-group, .form-row, div");
    if (row) parts.push(row.textContent);

    return normalize(parts.filter(Boolean).join(" "));
  }

  function getControls() {
    return [...document.querySelectorAll("input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]), textarea, select, [contenteditable='true']")]
      .filter((control) => !control.disabled && !control.readOnly && control.offsetParent !== null);
  }

  function scoreControl(control, keywords) {
    const label = labelFor(control);
    return keywords.reduce((score, keyword) => {
      const normalizedKeyword = normalize(keyword);
      if (!normalizedKeyword) return score;
      if (label === normalizedKeyword) return score + 10;
      if (label.includes(normalizedKeyword)) return score + 4;
      return score;
    }, 0);
  }

  function findBestControl(key, usedControls) {
    const keywords = fieldProfiles[key] || [];
    const candidates = getControls()
      .filter((control) => !usedControls.has(control))
      .map((control) => ({ control, score: scoreControl(control, keywords) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.control || null;
  }

  function setNativeValue(control, value) {
    const tag = control.tagName.toLowerCase();
    const text = String(value || "").trim();
    if (!text) return false;

    if (tag === "select") {
      const options = [...control.options];
      const normalizedText = normalize(text);
      const option = options.find((item) => normalize(item.textContent) === normalizedText)
        || options.find((item) => normalize(item.textContent).includes(normalizedText))
        || options.find((item) => normalize(item.value) === normalizedText);
      if (!option) return false;
      control.value = option.value;
    } else if (control.isContentEditable) {
      control.textContent = text;
    } else {
      control.value = text;
    }

    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    control.classList.add("noor-prep-autofill-highlight");
    setTimeout(() => control.classList.remove("noor-prep-autofill-highlight"), 1800);
    return true;
  }

  function fillPreparation(data) {
    const usedControls = new Set();
    const unmatchedLabels = [];
    let filledCount = 0;

    Object.entries(data).forEach(([key, value]) => {
      if (!String(value || "").trim()) return;

      const control = findBestControl(key, usedControls);
      if (!control) {
        unmatchedLabels.push(key);
        return;
      }

      if (setNativeValue(control, value)) {
        usedControls.add(control);
        filledCount += 1;
      } else {
        unmatchedLabels.push(key);
      }
    });

    showToast(filledCount, unmatchedLabels.length);
    return { filledCount, unmatchedLabels };
  }

  function showMessage(message) {
    const oldToast = document.querySelector(".noor-prep-autofill-toast");
    oldToast?.remove();

    const toast = document.createElement("div");
    toast.className = "noor-prep-autofill-toast";
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function showToast(filledCount, unmatchedCount) {
    const oldToast = document.querySelector(".noor-prep-autofill-toast");
    oldToast?.remove();

    const toast = document.createElement("div");
    toast.className = "noor-prep-autofill-toast";
    toast.textContent = filledCount
      ? `تمت تعبئة ${filledCount} حقلاً${unmatchedCount ? `، وتحتاج ${unmatchedCount} حقول للمراجعة` : ""}.`
      : "لم يتم العثور على حقول مناسبة للتعبئة.";
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function splitLessons(text) {
    const normalized = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!normalized) return [];

    const explicitBlocks = normalized
      .split(/\n\s*(?:-{3,}|={3,}|درس\s+\d+\s*:|التحضير\s+\d+\s*:)\s*\n/gi)
      .map((item) => item.trim())
      .filter(Boolean);

    if (explicitBlocks.length > 1) return explicitBlocks.map(parseLessonBlock);
    return [parseLessonBlock(normalized)];
  }

  function parseLessonBlock(block) {
    const lines = String(block || "").split("\n");
    const lesson = {};
    let activeField = "";

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (activeField) lesson[activeField] += "\n";
        return;
      }

      const found = findFieldForLine(trimmed);
      if (found) {
        activeField = found.field;
        lesson[activeField] = appendValue(lesson[activeField], found.value);
        return;
      }

      if (activeField) {
        lesson[activeField] = appendValue(lesson[activeField], trimmed);
      } else {
        lesson.lessonTitle = appendValue(lesson.lessonTitle, trimmed);
      }
    });

    return lesson;
  }

  function findFieldForLine(line) {
    const separatorMatch = line.match(/^(.{2,80}?)(?:\s*[:：]\s*|\s+-\s+)(.*)$/);
    if (!separatorMatch) return null;

    const label = normalize(separatorMatch[1]);
    const value = separatorMatch[2].trim();

    for (const [field, aliases] of Object.entries(parseProfiles)) {
      if (aliases.some((alias) => label.includes(normalize(alias)))) {
        return { field, value };
      }
    }

    return null;
  }

  function appendValue(current, next) {
    const value = String(next || "").trim();
    if (!value) return current || "";
    return current ? `${current}\n${value}` : value;
  }

  function createField(container, label, key, rows = 2) {
    const wrap = document.createElement("label");
    wrap.className = "noor-prep-panel-field";
    wrap.innerHTML = `<span>${label}</span><textarea data-field="${key}" rows="${rows}"></textarea>`;
    container.append(wrap);
  }

  function collectPanelData(panel) {
    const data = {};
    panel.querySelectorAll("[data-field]").forEach((input) => {
      data[input.dataset.field] = input.value;
    });
    return data;
  }

  function populatePanelData(panel, lesson) {
    panel.querySelectorAll("[data-field]").forEach((input) => {
      input.value = lesson[input.dataset.field] || "";
    });
  }

  async function saveInlineState(text, lessons, index) {
    await chrome.storage.local.set({
      [INLINE_TEXT_KEY]: text,
      [INLINE_LESSONS_KEY]: lessons,
      [INLINE_INDEX_KEY]: index,
      [STORAGE_KEY]: lessons[index] || {}
    });
  }

  async function loadInlineState() {
    const stored = await chrome.storage.local.get([INLINE_TEXT_KEY, INLINE_LESSONS_KEY, INLINE_INDEX_KEY, STORAGE_KEY]);
    return {
      text: stored[INLINE_TEXT_KEY] || "",
      lessons: stored[INLINE_LESSONS_KEY] || [],
      index: stored[INLINE_INDEX_KEY] || 0,
      savedLesson: stored[STORAGE_KEY] || {}
    };
  }

  function ensurePanel() {
    if (document.querySelector(".noor-prep-panel")) return;

    const panel = document.createElement("section");
    panel.className = "noor-prep-panel";
    panel.hidden = true;
    panel.dir = "rtl";
    panel.innerHTML = `
      <header class="noor-prep-panel-head">
        <strong>مساعد تحضير نور</strong>
        <button type="button" class="noor-prep-close" aria-label="إغلاق">×</button>
      </header>
      <label class="noor-prep-panel-field">
        <span>نص التحضير</span>
        <textarea class="noor-prep-raw" rows="7" placeholder="الصق التحضير هنا. يمكن فصل التحاضير المتعددة بسطر يحتوي ---"></textarea>
      </label>
      <div class="noor-prep-panel-actions">
        <button type="button" data-action="parse">تحليل النص</button>
        <button type="button" data-action="previous">السابق</button>
        <button type="button" data-action="next">التالي</button>
      </div>
      <p class="noor-prep-counter">لا توجد تحاضير محللة.</p>
      <div class="noor-prep-fields"></div>
      <button type="button" class="noor-prep-fill" data-action="fill">تعبئة الصفحة</button>
    `;

    const fields = panel.querySelector(".noor-prep-fields");
    createField(fields, "عنوان الدرس", "lessonTitle", 2);
    createField(fields, "إضافة مخرج تعليمي آخر", "learningOutcome", 3);
    createField(fields, "المفاهيم", "concepts", 2);
    createField(fields, "التهيئة / التمهيد / التعلم القبلي", "intro", 3);
    createField(fields, "إجراءات سير الدرس / الأنشطة التدريسية", "lessonProcedures", 4);
    createField(fields, "التقويم التكويني", "formativeAssessment", 3);
    createField(fields, "التقويم الختامي", "summativeAssessment", 3);
    createField(fields, "ملاحظات ضمن خطة الدراسة الأسبوعية", "weeklyPlanNotes", 3);

    const raw = panel.querySelector(".noor-prep-raw");
    const counter = panel.querySelector(".noor-prep-counter");

    function updateCounter(lessons, index) {
      counter.textContent = lessons.length
        ? `التحضير ${index + 1} من ${lessons.length}`
        : "لا توجد تحاضير محللة.";
    }

    async function setCurrent(lessons, index) {
      const safeIndex = Math.max(0, Math.min(index, Math.max(0, lessons.length - 1)));
      populatePanelData(panel, lessons[safeIndex] || {});
      updateCounter(lessons, safeIndex);
      await saveInlineState(raw.value, lessons, safeIndex);
    }

    panel.querySelector(".noor-prep-close").addEventListener("click", () => {
      panel.hidden = true;
    });

    panel.addEventListener("click", async (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;

      const state = await loadInlineState();
      let lessons = state.lessons;
      let index = state.index;

      if (action === "parse") {
        lessons = splitLessons(raw.value);
        index = 0;
        await setCurrent(lessons, index);
        showMessage(lessons.length ? `تم تحليل ${lessons.length} تحضير.` : "لم أجد تحاضير في النص.");
      }

      if (action === "previous" && lessons.length) {
        lessons[index] = collectPanelData(panel);
        await setCurrent(lessons, index - 1);
      }

      if (action === "next" && lessons.length) {
        lessons[index] = collectPanelData(panel);
        await setCurrent(lessons, index + 1);
      }

      if (action === "fill") {
        const data = collectPanelData(panel);
        lessons[index] = data;
        await saveInlineState(raw.value, lessons, index);
        fillPreparation(data);
      }
    });

    document.documentElement.appendChild(panel);

    loadInlineState().then((state) => {
      raw.value = state.text;
      const lessons = state.lessons.length ? state.lessons : [state.savedLesson].filter((item) => Object.keys(item).length);
      populatePanelData(panel, lessons[state.index] || {});
      updateCounter(lessons, state.index);
    });
  }

  function ensureFloatingButton() {
    if (document.querySelector(".noor-prep-autofill-fab")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "noor-prep-autofill-fab";
    button.textContent = "مساعد التحضير";
    button.addEventListener("click", () => {
      ensurePanel();
      const panel = document.querySelector(".noor-prep-panel");
      panel.hidden = !panel.hidden;
    });
    document.documentElement.appendChild(button);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "NOOR_FILL_PREPARATION") return false;

    const result = fillPreparation(message.payload || {});
    sendResponse(result);
    return true;
  });

  ensurePanel();
  ensureFloatingButton();
})();
