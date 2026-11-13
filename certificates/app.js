(() => {
  'use strict';

  const api = '/api/subscriptions';
  const subscriptionPage = '/t#subscription-section-title';
  const signInPage = '/enjazy/auth.html?mode=login&return=%2Fcertificates%2F';
  const pdfChunk = 60;
  const maximumRecipients = 300;
  const byId = (id) => document.getElementById(id);
  const R = window.CertificateRenderer;

  const grades = ['الصف الأول', 'الصف الثاني', 'الصف الثالث', 'الصف الرابع', 'الصف الخامس', 'الصف السادس',
    'الصف السابع', 'الصف الثامن', 'الصف التاسع', 'الصف العاشر', 'الصف الحادي عشر', 'الصف الثاني عشر'];

  let catalog = null;      // { templates, phrases, subjects } — يأتي من الخادم للمشتركين فقط
  let teacher = null;
  let projects = [];
  let projectId = null;
  let projectCreateId = null;
  let project = null;
  let current = 0;
  let dirty = false;
  let editRevision = 0;
  let logoImage = null;
  let filter = 'all';
  const backgrounds = new Map();
  const stages = [['all', 'كل المراحل'], ['1-4', 'الصفوف 1–4'], ['5-8', 'الصفوف 5–8'], ['9-12', 'الصفوف 9–12']];
  let renderQueued = false;
  let busy = false;
  let gameRosters = new Map();

  // ---------- طلبات الخادم ----------
  async function request(action, { method = 'GET', body, query = '' } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${api}?action=${action}${query}`, {
        method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        lockStudio(response.status, data);
        return { ok: false, denied: true, status: response.status, data };
      }
      if (response.status === 409 && data.error === 'account_changed') {
        toast('تغيّر الحساب. ارجع إلى الحساب الذي بدأت فيه المشروع قبل محاولة الحفظ مرة أخرى.', true);
        return { ok: false, denied: true, status: response.status, data };
      }
      return { ok: response.ok, status: response.status, data };
    } catch {
      return { ok: false, status: 0, data: { error: 'network' } };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---------- بوابة الوصول ----------
  function gate({ title = 'استوديو شهادات التقدير الذكي', html, link, linkLabel, retry = false, note = '' }) {
    byId('studio').hidden = true;
    byId('gate').hidden = false;
    byId('gate-title').textContent = title;
    byId('gate-body').innerHTML = html;
    const anchor = byId('gate-link');
    anchor.hidden = !link;
    if (link) { anchor.href = link; anchor.textContent = linkLabel; }
    byId('gate-retry').hidden = !retry;
    const noteBox = byId('gate-note');
    noteBox.hidden = !note;
    noteBox.textContent = note;
    document.title = 'استوديو شهادات التقدير الذكي | التحضير الذكي';
  }

  function showSubscribe(savedProjects = 0) {
    gate({
      html: `
        <p>صمّم شهادات تقدير احترافية لطلابك وطالباتك باستخدام أحدث القوالب والتصاميم.</p>
        <p class="strong">هذه الخدمة متاحة حصريًا للمعلمين المشتركين في منصة التحضير الذكي للمعلم العُماني.</p>
        <p class="strong">اشترك الآن واستمتع بجميع المميزات!</p>
        <ul class="gate-features">
          <li>✔ جميع قوالب الشهادات</li><li>✔ عدد غير محدود من الشهادات</li>
          <li>✔ شهادات جماعية</li><li>✔ تحميل بجودة عالية</li>
          <li>✔ عبارات تكريم ذكية</li><li>✔ حفظ التصاميم وتعديلها</li>
        </ul>`,
      link: subscriptionPage,
      linkLabel: 'اشترك الآن',
      note: savedProjects > 0
        ? `مشاريعك المحفوظة (${savedProjects}) باقية كما هي ولن تُحذف، وستعود إليها فور تجديد اشتراكك.`
        : 'الاستوديو مشمول في اشتراك المنصة الحالي — يكفي اشتراك فعّال في أي مادة، دون أي رسوم إضافية.',
    });
  }

  function lockStudio(status, data = {}) {
    teacher = null;
    catalog = null;
    project = null;
    dirty = false;
    byId('preview').getContext('2d').clearRect(0, 0, 1754, 1240);
    if (status === 401) {
      gate({ html: '<p>سجّل الدخول بحساب المعلّم في منصة التحضير الذكي للوصول إلى الاستوديو.</p>',
        link: signInPage, linkLabel: 'تسجيل الدخول' });
    } else if (data.error === 'account_stopped') {
      gate({ html: '<p>حسابك موقوف حاليًا. راجع حالة حسابك في المنصة أو تواصل مع الإدارة.</p>',
        link: subscriptionPage, linkLabel: 'عرض حالة الحساب' });
    } else {
      showSubscribe(Number(data.savedProjects) || 0);
    }
  }

  async function verifyAccess() {
    gate({ html: '<p>جارٍ التحقق من حسابك واشتراكك…</p>' });
    const result = await request('certificates_access');
    if (result.denied) return;
    const data = result.data;
    if (!result.ok || !Array.isArray(data?.templates) || !data.templates.length || !data.teacher?.id) {
      gate({ html: '<p>تعذّر الاتصال بالخادم. تأكد من الاتصال ثم أعد المحاولة.</p>', retry: true });
      return;
    }
    teacher = data.teacher;
    catalog = { templates: data.templates, phrases: data.phrases || [], subjects: data.subjects || [] };
    projects = Array.isArray(data.projects) ? data.projects : [];
    await openStudio();
  }

  // ---------- المشروع ----------
  function today() {
    try {
      return new Intl.DateTimeFormat('ar-OM', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    } catch { return new Date().toISOString().slice(0, 10); }
  }

  function newProject() {
    return {
      version: 1,
      templateId: catalog.templates[0].id,
      title: 'شهادة تقدير',
      gender: 'm',
      occasion: catalog.phrases[0]?.id || 'excellence',
      phraseIndex: 0,
      font: '',
      colors: { primary: '', accent: '' },
      fields: {
        heading: 'شهادة تقدير', subtitle: 'CERTIFICATE OF APPRECIATION', intro: 'يسرّ {المدرسة} أن تتقدم بخالص الشكر والتقدير إلى {اللقب}',
        schoolName: '', phrase: '', subject: '', grade: '', extra: '',
        teacherTitle: 'معلم المادة', teacherName: teacher?.name || '',
        principalTitle: 'مدير المدرسة', principalName: '', date: today(),
      },
      recipients: [{ name: 'اسم الطالب', gender: 'm', note: '' }],
      logo: '',
    };
  }

  const fontsOf = (t) => [t.fonts?.heading, t.fonts?.name, t.fonts?.body, t.font].filter(Boolean);
  const templateById = (id) => catalog.templates.find((t) => t.id === id) || catalog.templates[0];
  const phraseGroup = () => catalog.phrases.find((g) => g.id === project.occasion) || catalog.phrases[0];

  function fillTokens(textValue, recipient) {
    const f = project.fields;
    const female = recipient.gender === 'f';
    let out = String(textValue || '');
    if (!f.subject) {
      out = out.replace(/حصص مادة \{subject\}/g, 'الحصص الدراسية')
        .replace(/مادة \{subject\}/g, female ? 'دراستها' : 'دراسته');
    }
    if (!f.grade) out = out.replace(/\{grade\}/g, female ? 'صفها' : 'صفه');
    return out
      .replace(/\{subject\}|\{المادة\}/g, f.subject)
      .replace(/\{grade\}|\{الصف\}/g, f.grade)
      .replace(/\{name\}|\{الاسم\}/g, recipient.name)
      .replace(/\{school\}|\{المدرسة\}/g, f.schoolName || 'إدارة المدرسة')
      .replace(/\{title\}|\{اللقب\}/g, female ? 'الطالبة' : 'الطالب')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function phraseFor(recipient) {
    if (project.phraseIndex >= 0) {
      const group = phraseGroup();
      const items = group?.items || [];
      if (items.length) {
        const item = items[project.phraseIndex % items.length];
        return fillTokens(recipient.gender === 'f' ? item.f : item.m, recipient);
      }
    }
    return fillTokens(project.fields.phrase, recipient);
  }

  function certificateData(recipient) {
    const f = project.fields;
    return {
      heading: f.heading,
      subtitle: f.subtitle,
      intro: fillTokens(f.intro, recipient),
      name: recipient.name,
      note: [recipient.note, f.grade && !recipient.note ? f.grade : ''].filter(Boolean).join(' — '),
      phrase: phraseFor(recipient),
      extra: fillTokens(f.extra, recipient),
      teacherTitle: f.teacherTitle, teacherName: f.teacherName,
      principalTitle: f.principalTitle, principalName: f.principalName,
      date: f.date,
    };
  }

  function drawOptions() {
    return { font: project.font, colors: project.colors, logo: logoImage, seed: 11, background: backgrounds.get(project.templateId) };
  }

  function loadBackgrounds() {
    return Promise.all(catalog.templates.filter((t) => t.image && !backgrounds.has(t.id)).map((t) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => { backgrounds.set(t.id, image); resolve(); };
      image.onerror = resolve;
      image.src = t.image;
    })));
  }

  // ---------- الرسم ----------
  async function ensureFonts(names) {
    if (!document.fonts?.load) return;
    await Promise.all(names.filter(Boolean).flatMap((name) => [
      document.fonts.load(`700 40px "${name}"`, 'شهادة'), document.fonts.load(`500 40px "${name}"`, 'شهادة'),
    ])).catch(() => {});
  }

  function scheduleRender() {
    if (renderQueued || !project) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (!project) return;
      const canvas = byId('preview');
      const recipient = project.recipients[current] || project.recipients[0];
      R.draw(canvas.getContext('2d'), canvas.width, canvas.height, templateById(project.templateId), certificateData(recipient), drawOptions());
      byId('rec-index').textContent = `${current + 1} من ${project.recipients.length}`;
    });
  }

  function markDirty() {
    editRevision++;
    dirty = true;
    const state = byId('save-state');
    state.textContent = 'تغييرات غير محفوظة';
    state.className = 'save-state dirty';
    scheduleRender();
  }

  function markSaved(label = 'محفوظ') {
    dirty = false;
    const state = byId('save-state');
    state.textContent = label;
    state.className = 'save-state saved';
  }

  // ---------- واجهة القوالب ----------
  function renderTemplates() {
    const filters = byId('template-filters');
    filters.replaceChildren(...stages.map(([key, label]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip${key === filter ? ' active' : ''}`;
      chip.textContent = label;
      chip.onclick = () => { filter = key; renderTemplates(); };
      return chip;
    }));
    const grid = byId('template-grid');
    const sample = { heading: 'شهادة تقدير', subtitle: 'CERTIFICATE OF APPRECIATION', intro: 'تتقدم المدرسة بالشكر إلى الطالب', name: 'اسم الطالب', note: '',
      phrase: 'تقديرًا لتفوقه وتميّزه، متمنين له دوام النجاح.', extra: '', teacherTitle: 'المعلم', teacherName: '',
      principalTitle: 'المدير', principalName: '', date: '' };
    grid.replaceChildren(...catalog.templates.filter((t) => filter === 'all' || t.stage === filter).map((template) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tpl${template.id === project.templateId ? ' active' : ''}`;
      const canvas = document.createElement('canvas');
      canvas.width = 360; canvas.height = 255;
      R.draw(canvas.getContext('2d'), 360, 255, template, sample, { seed: 11, background: backgrounds.get(template.id) });
      const label = document.createElement('span');
      label.textContent = template.name;
      button.append(canvas, label);
      button.onclick = async () => {
        project.templateId = template.id;
        project.colors = { primary: '', accent: '' };
        await ensureFonts(fontsOf(template));
        syncColorInputs();
        renderTemplates();
        markDirty();
      };
      return button;
    }));
  }

  function syncColorInputs() {
    const template = templateById(project.templateId);
    byId('color-primary').value = project.colors.primary || template.palette.primary;
    byId('color-accent').value = project.colors.accent || template.palette.accent;
    byId('font-select').value = project.font || '';
    byId('logo-remove').hidden = !project.logo;
  }

  // ---------- النصوص ----------
  const fieldIds = ['heading', 'subtitle', 'intro', 'schoolName', 'subject', 'grade', 'extra', 'teacherTitle', 'teacherName', 'principalTitle', 'principalName', 'date'];

  function syncTexts() {
    byId('f-title').value = project.title;
    fieldIds.forEach((key) => { byId(`f-${key}`).value = project.fields[key] || ''; });
    byId('occasion-select').value = project.occasion;
    byId('default-gender').value = project.gender;
    syncPhraseBox();
  }

  function syncPhraseBox() {
    const recipient = project.recipients[current] || project.recipients[0];
    const box = byId('f-phrase');
    if (project.phraseIndex >= 0) {
      box.value = phraseFor(recipient);
      byId('phrase-mode').textContent = '✨ عبارة ذكية: تتكيّف تلقائيًا مع الطالب أو الطالبة والمادة والصف في كل شهادة.';
      byId('phrase-auto').hidden = true;
    } else {
      box.value = project.fields.phrase;
      byId('phrase-mode').textContent = 'عبارة مخصّصة: تُطبَّق على جميع الشهادات. يمكنك استخدام {الاسم} {اللقب} {المادة} {الصف}.';
      byId('phrase-auto').hidden = false;
    }
  }

  // ---------- الطلبة ----------
  const recipientName = (value) => value.trim().slice(0, 90).replace(/[\uD800-\uDBFF]$/, '');

  function addRecipients(names) {
    const [first] = project.recipients;
    const placeholder = project.recipients.length === 1 && ['اسم الطالب', ''].includes(first.name.trim());
    const room = maximumRecipients - (placeholder ? 0 : project.recipients.length);
    const added = names.slice(0, room);
    if (added.length) {
      if (placeholder) project.recipients = [];
      for (const name of added) project.recipients.push({ name, gender: project.gender, note: '' });
      selectRecipient(0);
      markDirty();
    }
    if (names.length > room) toast('الحد الأقصى 300 شهادة في المشروع الواحد.', true);
    return added.length;
  }

  function refreshGameRosters() {
    if (!teacher) return;
    const select = byId('game-roster');
    const previous = select.value;
    const rosters = window.GameRosters?.list(teacher.id) || [];
    const bank = window.__BANK?.index || [];
    gameRosters = new Map(rosters.map((roster) => {
      const { gradeId, subject, section } = roster;
      const grade = bank.find((item) => item.id === gradeId);
      const gradeName = grades[Number(gradeId.slice(1))] || grade?.n || gradeId;
      const subjects = [...(grade?.subjects || []), ...catalog.subjects];
      const subjectName = subjects.find((name) => typeof normalizeSubscriptionSubject === 'function' && normalizeSubscriptionSubject(name) === subject) || subject;
      const key = JSON.stringify([gradeId, subject, section]);
      return [key, { label: `${gradeName} · ${subjectName} · الشعبة ${section}`, names: [...new Set(roster.names.map(recipientName).filter(Boolean))] }];
    }));
    select.replaceChildren(new Option('اختر الصف والمادة والشعبة', ''),
      ...Array.from(gameRosters, ([key, roster]) => new Option(roster.label, key)));
    select.disabled = !gameRosters.size;
    if (gameRosters.has(previous)) select.value = previous;
    renderGameStudents();
  }

  function renderGameStudents() {
    const roster = gameRosters.get(byId('game-roster').value);
    const names = roster?.names || [];
    const select = byId('game-student');
    const previous = select.value;
    select.replaceChildren(new Option('كل الأسماء', ''), ...names.map((name) => new Option(name, name)));
    if (names.includes(previous)) select.value = previous;
    select.disabled = !names.length;
    byId('game-student-field').hidden = !names.length;
    byId('game-roster-add').disabled = !names.length;
    byId('game-roster-status').textContent = !gameRosters.size ? 'لا توجد قوائم ألعاب محفوظة لهذا الحساب في هذا المتصفح.'
      : roster && !names.length ? 'هذه الشعبة لا تحتوي على أسماء.' : '';
  }

  function importGameRecipients() {
    const roster = gameRosters.get(byId('game-roster').value);
    if (!roster?.names.length) return;
    const chosen = byId('game-student').value;
    const existing = new Set(project.recipients.map(({ name }) => recipientName(name)));
    if (project.recipients.length === 1) existing.delete('اسم الطالب');
    const names = roster.names.filter((name) => (!chosen || name === chosen) && !existing.has(name));
    if (!names.length) { toast('الأسماء المحددة مضافة إلى المشروع بالفعل.'); return; }
    const added = addRecipients(names);
    if (added === names.length) toast(`تمت إضافة ${added} من أسماء الطلبة.`);
  }

  function renderRecipients() {
    const list = byId('recipients');
    byId('recipient-count').textContent = `${project.recipients.length} شهادة`;
    list.replaceChildren(...project.recipients.map((recipient, index) => {
      const row = document.createElement('div');
      row.className = `rec${index === current ? ' current' : ''}`;
      const num = document.createElement('span');
      num.className = 'num'; num.textContent = index + 1; num.title = 'معاينة';
      num.onclick = () => selectRecipient(index);
      const name = document.createElement('input');
      name.value = recipient.name; name.maxLength = 90; name.placeholder = 'الاسم';
      name.oninput = () => { recipient.name = name.value; markDirty(); };
      name.onfocus = () => selectRecipient(index, false);
      const gender = document.createElement('select');
      gender.innerHTML = '<option value="m">طالب</option><option value="f">طالبة</option>';
      gender.value = recipient.gender;
      gender.onchange = () => { recipient.gender = gender.value; if (index === current) syncPhraseBox(); markDirty(); };
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = '✕'; remove.title = 'حذف';
      remove.onclick = () => {
        if (project.recipients.length === 1) { toast('يجب أن تحتوي الشهادة على اسم واحد على الأقل.', true); return; }
        project.recipients.splice(index, 1);
        current = Math.min(current, project.recipients.length - 1);
        renderRecipients(); syncPhraseBox(); markDirty();
      };
      const note = document.createElement('input');
      note.className = 'note'; note.value = recipient.note || ''; note.maxLength = 80;
      note.placeholder = 'ملاحظة تحت الاسم (مثال: المركز الأول) — اختياري';
      note.oninput = () => { recipient.note = note.value; markDirty(); };
      note.onfocus = () => selectRecipient(index, false);
      row.append(num, name, gender, remove, note);
      return row;
    }));
  }

  function selectRecipient(index, rerenderList = true) {
    current = Math.max(0, Math.min(index, project.recipients.length - 1));
    if (rerenderList) renderRecipients();
    else document.querySelectorAll('.rec').forEach((row, i) => row.classList.toggle('current', i === current));
    syncPhraseBox();
    scheduleRender();
  }

  // ---------- المشاريع ----------
  function renderProjects() {
    const list = byId('projects');
    if (!projects.length) {
      list.innerHTML = '<p class="empty">لا توجد مشاريع محفوظة بعد. احفظ تصميمك ليظهر هنا.</p>';
      return;
    }
    list.replaceChildren(...projects.map((item) => {
      const row = document.createElement('div');
      row.className = `project${item.id === projectId ? ' current' : ''}`;
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = item.title;
      const meta = document.createElement('small');
      const date = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('ar-OM') : '';
      meta.textContent = `${item.recipientCount} شهادة · ${templateById(item.templateId).name} · ${date}`;
      info.append(title, meta);
      const actions = document.createElement('div');
      const open = document.createElement('button');
      open.className = 'btn small'; open.type = 'button'; open.textContent = 'فتح';
      open.onclick = () => loadProject(item.id);
      const del = document.createElement('button');
      del.className = 'btn small ghost danger'; del.type = 'button'; del.textContent = 'حذف';
      del.onclick = () => deleteProject(item);
      actions.append(open, del);
      row.append(info, actions);
      return row;
    }));
  }

  async function loadLogo() {
    logoImage = null;
    if (!project.logo) return;
    await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => { logoImage = image; resolve(); };
      image.onerror = resolve;
      image.src = project.logo;
    });
  }

  async function applyProject(next, id) {
    project = next;
    projectId = id;
    projectCreateId = null;
    current = 0;
    await Promise.all([loadLogo(), ensureFonts([...fontsOf(templateById(project.templateId)), project.font])]);
    renderTemplates();
    syncColorInputs();
    syncTexts();
    renderRecipients();
    renderProjects();
    scheduleRender();
  }

  async function loadProject(id) {
    if (busy) return;
    if (dirty && !confirm('لديك تغييرات غير محفوظة. هل تريد فتح المشروع دون حفظها؟')) return;
    busy = true;
    try {
      const result = await request('certificates_project', { query: `&id=${encodeURIComponent(id)}` });
      if (result.denied) return;
      if (!result.ok || !result.data?.project) { toast('تعذّر فتح المشروع.', true); return; }
      await applyProject(result.data.project, result.data.id);
      markSaved();
      toast('تم فتح المشروع.');
    } finally {
      busy = false;
    }
  }

  async function deleteProject(item) {
    if (busy) return;
    if (!confirm(`حذف مشروع «${item.title}» نهائيًا؟`)) return;
    busy = true;
    try {
      const query = `&id=${encodeURIComponent(item.id)}&teacherId=${encodeURIComponent(teacher.id)}`;
      const result = await request('certificates_project', { method: 'DELETE', query });
      if (result.denied) return;
      if (!result.ok && result.status !== 404) { toast('تعذّر حذف المشروع.', true); return; }
      projects = projects.filter((p) => p.id !== item.id);
      if (projectId === item.id) { projectId = null; projectCreateId = null; markDirty(); }
      renderProjects();
      toast('تم حذف المشروع.');
    } finally {
      busy = false;
    }
  }

  async function saveProject() {
    if (busy || !project) return false;
    busy = true;
    const button = byId('save-btn');
    const buttonLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'جارٍ الحفظ…';
    try {
      const revision = editRevision;
      const snapshot = structuredClone(project);
      snapshot.title = snapshot.title.trim() || 'شهادة تقدير';
      const save = (id) => {
        if (!id) projectCreateId ??= window.crypto?.randomUUID?.() ?? null;
        return request('certificates_project', {
          method: 'POST', body: { id, createId: id ? null : projectCreateId, teacherId: teacher.id, project: snapshot },
        });
      };
      let result = await save(projectId);
      if (result.denied) return false;
      if (projectId && result.status === 404 && result.data.error === 'project_not_found') {
        projectId = null;
        projectCreateId = null;
        result = await save(null);
      }
      if (projectCreateId && result.status === 409 && result.data.error === 'project_already_created' && result.data.id === projectCreateId) {
        projectId = result.data.id;
        result = await save(projectId);
      }
      if (result.denied) return false;
      if (result.data.error === 'project_id_conflict') projectCreateId = null;
      if (!result.ok || !result.data.id) {
        const message = result.data?.error === 'project_too_large' ? 'حجم المشروع كبير — جرّب شعارًا أصغر.'
          : result.data?.error === 'invalid_project' ? 'تحقّق من وجود اسم واحد على الأقل وصحة البيانات.'
          : 'تعذّر الحفظ. تأكد من الاتصال ثم حاول مرة أخرى.';
        toast(message, true);
        return false;
      }
      projectId = result.data.id;
      projectCreateId = null;
      const meta = { id: projectId, title: snapshot.title, templateId: snapshot.templateId,
        recipientCount: snapshot.recipients.filter((r) => r.name.trim()).length, updatedAt: result.data.updatedAt };
      projects = [meta, ...projects.filter((p) => p.id !== projectId)];
      renderProjects();
      if (revision === editRevision) {
        markSaved();
        toast('تم حفظ التصميم في حسابك.');
      } else {
        toast('تم حفظ التصميم. لديك تغييرات أحدث تحتاج إلى حفظ.');
      }
      return true;
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = buttonLabel;
    }
  }

  // ---------- التصدير (يتطلب إذنًا من الخادم في كل مرة) ----------
  async function exportPermit(count) {
    const result = await request('certificates_export', { method: 'POST', body: { projectId, count, teacherId: teacher.id } });
    if (result.denied) return false;
    if (!result.ok) { toast('تعذّر التحقق من الاشتراك قبل التصدير. حاول مرة أخرى.', true); return false; }
    return true;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const safeName = (value) => String(value || 'شهادة').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'شهادة';
  const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

  function setBusy(textValue) {
    byId('busy').hidden = !textValue;
    if (textValue) byId('busy-text').textContent = textValue;
  }

  async function exportPng() {
    if (busy) return;
    const recipient = project.recipients[current];
    if (!recipient?.name.trim()) { toast('أدخل اسم الطالب أولًا.', true); return; }
    busy = true;
    try {
      setBusy('جارٍ التحقق من الاشتراك…');
      if (!(await exportPermit(1))) return;
      setBusy('جارٍ تجهيز الصورة بدقة عالية…');
      await pause();
      const canvas = document.createElement('canvas');
      canvas.width = 3508; canvas.height = 2480;
      R.draw(canvas.getContext('2d'), canvas.width, canvas.height, templateById(project.templateId), certificateData(recipient), drawOptions());
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) download(blob, `شهادة تقدير - ${safeName(recipient.name)}.png`);
      toast('تم تنزيل الشهادة.');
    } finally {
      setBusy('');
      busy = false;
    }
  }

  async function exportPdf() {
    if (busy) return;
    const recipients = project.recipients.filter((r) => r.name.trim());
    if (!recipients.length) { toast('أضف اسمًا واحدًا على الأقل.', true); return; }
    busy = true;
    try {
      setBusy('جارٍ التحقق من الاشتراك…');
      if (!(await exportPermit(recipients.length))) return;
      const canvas = document.createElement('canvas');
      canvas.width = 2339; canvas.height = 1654;
      const ctx = canvas.getContext('2d');
      const template = templateById(project.templateId);
      const files = Math.ceil(recipients.length / pdfChunk);
      for (let part = 0; part < files; part++) {
        const pages = [];
        const slice = recipients.slice(part * pdfChunk, (part + 1) * pdfChunk);
        for (let i = 0; i < slice.length; i++) {
          setBusy(`جارٍ إنشاء الشهادة ${part * pdfChunk + i + 1} من ${recipients.length}…`);
          await pause();
          R.draw(ctx, canvas.width, canvas.height, template, certificateData(slice[i]), drawOptions());
          pages.push({ width: canvas.width, height: canvas.height, bytes: R.dataUrlBytes(canvas.toDataURL('image/jpeg', 0.92)) });
        }
        const suffix = files > 1 ? ` (${part + 1} من ${files})` : '';
        download(R.buildPdf(pages), `${safeName(project.title)}${suffix}.pdf`);
        await pause();
      }
      toast(files > 1 ? `تم تنزيل ${files} ملفات PDF.` : 'تم تنزيل ملف PDF.');
    } finally {
      setBusy('');
      busy = false;
    }
  }

  // ---------- أدوات عامة ----------
  let toastTimer;
  function toast(message, error = false) {
    const box = byId('toast');
    box.textContent = message;
    box.className = `toast${error ? ' error' : ''}`;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 3200);
  }

  async function readLogo(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('اختر صورة PNG أو JPG أو WEBP.', true); return; }
    if (file.size > 12 * 1024 * 1024) { toast('حجم الصورة كبير جدًا.', true); return; }
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img); img.onerror = reject; img.src = url;
      });
      const scale = Math.min(1, 520 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL('image/png');
      if (data.length > 400 * 1024) data = canvas.toDataURL('image/webp', 0.85);
      if (!data.startsWith('data:image/webp') && data.length > 400 * 1024) data = canvas.toDataURL('image/jpeg', 0.85);
      if (data.length > 400 * 1024) { toast('تعذّر تصغير الشعار بما يكفي، جرّب صورة أبسط.', true); return; }
      project.logo = data;
      await loadLogo();
      syncColorInputs();
      markDirty();
    } catch {
      toast('تعذّر قراءة الصورة.', true);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------- تهيئة الاستوديو ----------
  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
        if (tab.dataset.tab === 'students') refreshGameRosters();
      };
    });
    byId('font-select').onchange = async (event) => {
      project.font = event.target.value;
      await ensureFonts([project.font]);
      markDirty();
    };
    byId('color-primary').oninput = (event) => { project.colors.primary = event.target.value; markDirty(); };
    byId('color-accent').oninput = (event) => { project.colors.accent = event.target.value; markDirty(); };
    byId('reset-colors').onclick = () => { project.colors = { primary: '', accent: '' }; syncColorInputs(); markDirty(); };
    byId('logo-input').onchange = (event) => { readLogo(event.target.files?.[0]); event.target.value = ''; };
    byId('logo-remove').onclick = () => { project.logo = ''; logoImage = null; syncColorInputs(); markDirty(); };

    byId('f-title').oninput = (event) => { project.title = event.target.value; markDirty(); };
    fieldIds.forEach((key) => {
      byId(`f-${key}`).oninput = (event) => {
        project.fields[key] = event.target.value;
        if (['subject', 'grade', 'schoolName'].includes(key) && project.phraseIndex >= 0) syncPhraseBox();
        markDirty();
      };
    });
    byId('occasion-select').onchange = (event) => {
      project.occasion = event.target.value; project.phraseIndex = 0; syncPhraseBox(); markDirty();
    };
    byId('phrase-next').onclick = () => {
      const count = phraseGroup()?.items.length || 1;
      project.phraseIndex = project.phraseIndex < 0 ? 0 : (project.phraseIndex + 1) % count;
      syncPhraseBox(); markDirty();
    };
    byId('phrase-auto').onclick = () => { project.phraseIndex = 0; syncPhraseBox(); markDirty(); };
    byId('f-phrase').oninput = (event) => {
      project.phraseIndex = -1;
      project.fields.phrase = event.target.value;
      byId('phrase-mode').textContent = 'عبارة مخصّصة: تُطبَّق على جميع الشهادات. يمكنك استخدام {الاسم} {اللقب} {المادة} {الصف}.';
      byId('phrase-auto').hidden = false;
      markDirty();
    };

    byId('default-gender').onchange = (event) => { project.gender = event.target.value; markDirty(); };
    byId('game-roster').onchange = () => {
      byId('game-student').value = '';
      renderGameStudents();
    };
    byId('game-roster-add').onclick = importGameRecipients;
    window.addEventListener('storage', (event) => {
      if (!event.key || /^games-rosters?:/.test(event.key)) refreshGameRosters();
    });
    byId('bulk-add').onclick = () => {
      const names = byId('bulk-names').value.split(/\r?\n/).map(recipientName).filter(Boolean);
      if (!names.length) { toast('اكتب الأسماء أولًا، اسمًا في كل سطر.', true); return; }
      addRecipients(names);
      byId('bulk-names').value = '';
    };
    byId('add-row').onclick = () => {
      if (project.recipients.length >= maximumRecipients) { toast('الحد الأقصى 300 شهادة في المشروع الواحد.', true); return; }
      project.recipients.push({ name: '', gender: project.gender, note: '' });
      selectRecipient(project.recipients.length - 1);
      markDirty();
    };
    byId('clear-rows').onclick = () => {
      if (!confirm('مسح جميع الأسماء؟')) return;
      project.recipients = [{ name: 'اسم الطالب', gender: project.gender, note: '' }];
      current = 0; renderRecipients(); syncPhraseBox(); markDirty();
    };
    byId('new-project').onclick = async () => {
      if (busy) return;
      if (dirty && !confirm('لديك تغييرات غير محفوظة. هل تريد بدء مشروع جديد دون حفظها؟')) return;
      busy = true;
      try {
        await applyProject(newProject(), null);
        dirty = false;
        byId('save-state').textContent = 'مشروع جديد';
        byId('save-state').className = 'save-state';
      } finally {
        busy = false;
      }
    };
    byId('rec-prev').onclick = () => selectRecipient((current - 1 + project.recipients.length) % project.recipients.length);
    byId('rec-next').onclick = () => selectRecipient((current + 1) % project.recipients.length);
    byId('save-btn').onclick = saveProject;
    byId('export-png').onclick = exportPng;
    byId('export-pdf').onclick = exportPdf;
    window.addEventListener('beforeunload', (event) => { if (dirty && project) { event.preventDefault(); event.returnValue = ''; } });
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && project) { event.preventDefault(); saveProject(); }
    });
  }

  async function openStudio() {
    wire();
    byId('teacher-label').textContent = teacher.name ? `مرحبًا، ${teacher.name}` : '';
    byId('subjects-list').replaceChildren(...catalog.subjects.map((s) => Object.assign(document.createElement('option'), { value: s })));
    byId('grades-list').replaceChildren(...grades.map((g) => Object.assign(document.createElement('option'), { value: g })));
    byId('occasion-select').replaceChildren(...catalog.phrases.map((g) => Object.assign(document.createElement('option'), { value: g.id, textContent: g.label })));
    await Promise.all([ensureFonts([...new Set(catalog.templates.flatMap(fontsOf))]), loadBackgrounds()]);
    refreshGameRosters();
    byId('gate').hidden = true;
    byId('studio').hidden = false;
    await applyProject(newProject(), null);
    byId('save-state').textContent = projects.length ? `${projects.length} مشروع محفوظ` : 'جاهز';
  }

  byId('gate-retry').onclick = verifyAccess;
  verifyAccess();
})();
