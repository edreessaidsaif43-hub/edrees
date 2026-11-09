(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const workspacePrefix = 'lawh-studio.workspace.account.v1:';
  const legacyStorageKey = 'lawh-studio.workspace.v1';
  const blankBoardName = 'سبورة فارغة';
  const sessionKeys = new Set(['enjazy_session_v1', 'lesson_platform_backend_session_v1']);
  const subscriptionPage = '/t#subscription-section-title';
  const signInPage = '/enjazy/auth.html?mode=login&reauth=board&return=%2FBoard%2Findex.html';
  const backgrounds = new Set(['grid', 'dots', 'plain', 'dark']);
  const inkTypes = new Set(['pen', 'brush', 'marker', 'eraser']);
  const measuringTools = new Set(['ruler', 'protractor', 'set-square']);
  const objectTypes = new Set(['text', 'line', 'rectangle', 'ellipse', 'arc', 'triangle', ...measuringTools, 'axes', 'plot', 'fraction', 'demo-label', 'demo-box', 'demo-point']);
  const placementTools = new Set(['line', 'rectangle', 'ellipse', 'triangle', ...measuringTools, 'compass', 'compass-arc']);
  const tools = {
    select: 'تحديد وتحريك', pen: 'قلم', brush: 'فرشاة', marker: 'قلم تمييز',
    eraser: 'ممحاة', text: 'نص', line: 'خط مستقيم', rectangle: 'مستطيل',
    ellipse: 'دائرة أو شكل بيضاوي', triangle: 'مثلث', pan: 'تحريك اللوحة',
    ruler: 'مسطرة مدرّجة', protractor: 'منقلة', 'set-square': 'مثلث الرسم',
    compass: 'فرجار', 'compass-arc': 'قوس بالفرجار',
  };
  const symbols = ['π', '√', '∞', '±', '×', '÷', '≠', '≈', '≤', '≥', '∠', '°', '²', '³', '½', '¼', '∑', '∫', 'Δ', 'θ', 'α', 'β', '∈', '∅'];
  const defaultColor = '#21192f';
  const lightInk = '#e9e1ff';
  const number = new Intl.NumberFormat('ar', { maximumFractionDigits: 0 });
  const dates = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short' });
  const desktop = window.matchMedia('(min-width: 1100px)');
  const dialog = byId('app-dialog');
  const canvas = byId('drawing-canvas');
  const app = byId('board-app');
  const accessPanel = byId('board-access');
  let storageFailed = false;
  let loadFailed = false;
  let currentTool = 'pen';
  let edgeGuideActive = false;
  let compassReady = false;
  let color = defaultColor;
  let width = Number(byId('stroke-width').value) || 4;
  let toastTimer;
  let state = null;
  let teacher = null;
  let accessRequest;

  const activeBoard = () => state?.boards.find(({ id }) => id === state.activeBoardId);

  const engine = new BoardCanvas({
    canvas,
    onChange(objects) {
      const board = activeBoard();
      if (!board) return;
      board.objects = objects;
      touchBoard(board);
      updateHistory();
    },
    onView(percent) {
      byId('zoom-value').textContent = `${Math.round(percent)}%`;
    },
    onSelection(object) {
      const supported = measuringTools.has(object?.type);
      byId('ruler-controls').hidden = !supported;
      const label = byId('guide-selection-name');
      if (supported) {
        if (label) label.textContent = tools[object.type];
        byId('guide-selection-icon')?.setAttribute('href', `#i-${object.type}`);
      }
    },
    onGuide(active) {
      edgeGuideActive = active;
      updateToolLabel();
    },
    onCompassPhase(ready) {
      compassReady = ready;
      updateToolLabel();
    },
    getText() {
      return textDialog('إضافة نص', 'اكتب على السبورة، ثم اختر «إضافة».', '', 'إضافة');
    },
  });

  const actions = {
    'new-board': createBoard,
    'rename-board': renameBoard,
    'delete-board': deleteBoard,
    'switch-teacher': showLibraryMenu,
    export: exportImage,
    undo: () => engine.undo(),
    redo: () => engine.redo(),
    clear: clearBoard,
    'zoom-in': () => engine.setZoom(engine.getZoom() + 10),
    'zoom-out': () => engine.setZoom(engine.getZoom() - 10),
    'zoom-reset': () => engine.resetView(),
    'toggle-math': toggleMath,
    'toggle-library': () => togglePanel('library'),
    'rotate-ruler-left': () => engine.rotateSelection(-15),
    'rotate-ruler-right': () => engine.rotateSelection(15),
    'ruler-pen': () => setTool('pen'),
    fullscreen: toggleFullscreen,
    shortcuts: showShortcuts,
    axes: () => addMath('axes'),
    'graph-template': () => addMath('axes'),
    plot: showPlot,
    symbols: showSymbols,
    fraction: showFraction,
  };

  function uid() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function makeBoard(name, objects = []) {
    return { id: uid(), name, background: 'grid', updatedAt: Date.now(), objects };
  }

  function showAccess(title, message, href, label, retry = false) {
    app.hidden = true;
    accessPanel.hidden = false;
    byId('board-access-title').textContent = title;
    byId('board-access-message').textContent = message;
    const link = byId('board-access-link');
    link.href = href;
    link.textContent = label;
    byId('board-access-retry').hidden = !retry;
    document.title = 'لوح | التحضير الذكي';
  }

  function lockWorkspace() {
    if (!teacher) return;
    app.hidden = true;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    if (dialog.open) dialog.close();
    teacher = null;
    state = null;
    engine.setScene([], 'grid');
    canvas.width = 1;
    canvas.height = 1;
    byId('board-list').replaceChildren();
    byId('teacher-name').textContent = '';
    byId('teacher-avatar').textContent = '';
    byId('board-title').textContent = '';
    clearTimeout(toastTimer);
    byId('toast').hidden = true;
  }

  function showSignIn() {
    showAccess('سجّل الدخول إلى التحضير الذكي', 'استخدم حساب المعلّم المسجّل لفتح السبورة المشمولة في اشتراكك.', signInPage, 'تسجيل الدخول');
  }

  async function verifyAccess() {
    accessRequest?.abort();
    const request = new AbortController();
    accessRequest = request;
    const timeout = setTimeout(() => request.abort('timeout'), 9000);
    if (!teacher) showAccess('جارٍ فتح السبورة', 'جارٍ التحقق من حسابك واشتراكك في التحضير الذكي.', '/m', 'العودة إلى التحضير الذكي');
    try {
      const response = await fetch('/api/subscriptions?action=board_access', {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: request.signal,
      });
      if (accessRequest !== request) return;
      if (response.status === 401) {
        lockWorkspace();
        showSignIn();
        return;
      }
      const data = await response.json();
      if (accessRequest !== request) return;
      if (response.status === 403 && ['account_stopped', 'subscription_required'].includes(data.error)) {
        lockWorkspace();
        if (data.error === 'account_stopped') {
          showAccess('الحساب موقوف', 'راجع حالة حسابك في التحضير الذكي لتتمكن من فتح السبورة.', subscriptionPage, 'عرض حالة الحساب');
        } else {
          showAccess('السبورة مشمولة في الاشتراك', 'فعّل اشتراك التحضير الذكي لتفتح السبورة باسمك دون رسوم إضافية.', subscriptionPage, 'إدارة الاشتراك', true);
        }
        return;
      }
      const identity = data.teacher;
      if (!response.ok || typeof identity?.id !== 'string' || !identity.id || typeof identity.name !== 'string' || !identity.name.trim()) throw Error();
      if (teacher?.id === identity.id) {
        if (teacher.name !== identity.name) {
          teacher = identity;
          showWorkspace();
        }
        return;
      }
      lockWorkspace();
      teacher = identity;
      storageFailed = false;
      loadFailed = false;
      state = loadWorkspace();
      accessPanel.hidden = true;
      app.hidden = false;
      openBoard();
      if (loadFailed && !storageFailed) showToast('تعذّر قراءة اللوحات المحفوظة.', true);
    } catch {
      if (accessRequest !== request) return;
      lockWorkspace();
      showAccess('تعذّر التحقق من الاشتراك', 'تأكد من الاتصال ثم حاول فتح السبورة مجددًا.', '/m', 'العودة إلى التحضير الذكي', true);
    } finally {
      clearTimeout(timeout);
      if (accessRequest === request) accessRequest = undefined;
    }
  }

  function openLocalNotice() {
    showAccess('افتح السبورة من التحضير الذكي', 'يتحقق الموقع من اسم المعلّم والاشتراك قبل فتح السبورة.', 'https://altahdir.app/Board/index.html', 'فتح السبورة على الموقع');
    try {
      const old = JSON.parse(localStorage.getItem(legacyStorageKey));
      const boards = old?.version === 1 && Array.isArray(old.teachers)
        ? old.teachers.flatMap((profile) => Array.isArray(profile?.boards) ? profile.boards : []) : [];
      if (!boards.length) return;
      const backup = element('button', 'button', 'تنزيل اللوحات المحفوظة سابقًا');
      backup.type = 'button';
      backup.addEventListener('click', () => downloadJson({ format: 'lawh-board-local-v1', boards }, 'لوح - اللوحات المحلية السابقة.json'));
      byId('board-access-link').parentElement.append(backup);
    } catch {}
  }

  function loadWorkspace() {
    let boards = [];
    try {
      const saved = localStorage.getItem(workspacePrefix + teacher.id);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.version !== 1 || !Array.isArray(data.boards) || !data.boards.length) throw Error();
        for (const board of data.boards) {
          if (typeof board?.id !== 'string' || !board.id) throw Error();
          validateBoard(board);
        }
        boards = data.boards;
      }
    } catch {
      loadFailed = true;
    }

    let blankBoard = boards.find((board) => board.name === blankBoardName && board.background === 'grid' && board.objects.length === 0);
    if (!blankBoard) {
      blankBoard = makeBoard(blankBoardName);
      boards.unshift(blankBoard);
    }
    return { version: 1, boards, activeBoardId: blankBoard.id };
  }

  function saveWorkspace() {
    if (!teacher || !state) return;
    try {
      localStorage.setItem(workspacePrefix + teacher.id, JSON.stringify(state));
      storageFailed = false;
    } catch {
      if (!storageFailed) showToast('تعذّر الحفظ في المتصفح. احفظ نسخة من قائمة المعلّم.', true);
      storageFailed = true;
    }
    const status = byId('save-status');
    status.textContent = storageFailed ? 'تعذّر الحفظ' : 'تم الحفظ محليًا';
    status.dataset.status = storageFailed ? 'error' : 'saved';
  }

  function touchBoard(board) {
    board.updatedAt = Date.now();
    saveWorkspace();
    const row = [...byId('board-list').children].find((item) => item.dataset.boardId === board.id);
    if (row) row.querySelector('.board-item-meta').textContent = boardDate(board);
  }

  function boardDate(board) {
    const updated = new Date(board.updatedAt);
    return updated.toDateString() === new Date().toDateString() ? 'آخر تعديل اليوم' : dates.format(updated);
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 24 24');
    const use = document.createElementNS(svg.namespaceURI, 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }

  function showWorkspace() {
    const board = activeBoard();
    byId('teacher-name').textContent = teacher.name;
    if (byId('teacher-avatar')) byId('teacher-avatar').textContent = Array.from(teacher.name.trim().replace(/^ال(?=.)/u, ''))[0] || 'م';
    if (byId('board-count')) byId('board-count').textContent = number.format(state.boards.length);
    byId('board-title').textContent = board.name;
    document.title = `${board.name} | لوح · التحضير الذكي`;
    const list = byId('board-list');
    list.replaceChildren(...state.boards.map((item) => {
      const button = element('button', 'board-item');
      button.type = 'button';
      button.dataset.boardId = item.id;
      if (item.id === board.id) button.setAttribute('aria-current', 'true');
      const thumbnail = element('span', 'board-item-icon');
      thumbnail.append(icon('file'));
      const copy = element('span', 'board-item-copy');
      copy.append(element('span', 'board-item-name', item.name), element('span', 'board-item-meta', boardDate(item)));
      button.append(thumbnail, copy);
      if (item.id === board.id) button.append(element('span', 'board-item-dot'));
      return button;
    }));
  }

  function openBoard() {
    const board = activeBoard();
    engine.setScene(board.objects, board.background);
    byId('background-select').value = board.background;
    byId('canvas-wrap').dataset.background = board.background;
    adjustInk(board.background);
    showWorkspace();
    updateHistory();
    saveWorkspace();
  }

  function updateHistory() {
    document.querySelectorAll('[data-action="undo"]').forEach((button) => { button.disabled = !engine.canUndo(); });
    document.querySelectorAll('[data-action="redo"]').forEach((button) => { button.disabled = !engine.canRedo(); });
  }

  function updateToolLabel() {
    const label = byId('tool-label');
    const compassHint = currentTool === 'compass' ? 'اسحب من المركز لرسم دائرة'
      : currentTool === 'compass-arc' ? (compassReady ? 'اسحب رأس القلم لرسم القوس' : 'اسحب من المركز لضبط الفرجار') : '';
    label.textContent = edgeGuideActive ? 'القلم يتبع حافة الأداة' : compassHint || tools[currentTool];
    label.classList.toggle('is-guided', edgeGuideActive);
    label.classList.toggle('is-compass', Boolean(compassHint));
  }

  function setTool(tool) {
    if (!(tool in tools)) return;
    currentTool = tool;
    engine.setTool(tool);
    document.querySelectorAll('[data-tool]').forEach((button) => {
      const active = button.dataset.tool === tool;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    });
    updateToolLabel();
    if (placementTools.has(tool)) revealCanvas();
  }

  function setColor(next) {
    color = next.toLowerCase();
    byId('custom-color').value = color;
    engine.setStyle({ color, width });
    document.querySelectorAll('[data-color]').forEach((button) => {
      const active = button.dataset.color.toLowerCase() === color;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    });
  }

  function adjustInk(background) {
    if (background === 'dark' && color === defaultColor) setColor(lightInk);
    if (background !== 'dark' && color === lightInk) setColor(defaultColor);
  }

  function setWidth(next) {
    width = next;
    byId('stroke-width-value').textContent = number.format(next);
    engine.setStyle({ color, width });
  }

  function togglePanel(panel, force) {
    const opened = force ?? !document.body.classList.contains(`${panel}-open`);
    if (opened && !desktop.matches) document.body.classList.remove(panel === 'math' ? 'library-open' : 'math-open');
    document.body.classList.toggle(`${panel}-open`, opened);
    for (const name of ['math', 'library']) {
      const expanded = document.body.classList.contains(`${name}-open`);
      document.querySelectorAll(`[data-action="toggle-${name}"]`).forEach((button) => button.setAttribute('aria-expanded', String(expanded)));
    }
  }

  function revealCanvas() {
    if (desktop.matches) return;
    togglePanel('math', false);
    canvas.closest('.studio-card').scrollIntoView({ block: 'start' });
  }

  function toggleMath() {
    togglePanel('math');
    if (!desktop.matches && document.body.classList.contains('math-open')) {
      byId('math-panel').scrollIntoView({ block: 'nearest' });
    }
  }

  function showToast(message, error = false) {
    const toast = byId('toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.dataset.kind = error ? 'error' : 'success';
    toast.hidden = false;
    toast.classList.add('is-visible');
    toastTimer = setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove('is-visible');
    }, 3400);
  }

  function showDialog({ title, description, controls = [], accept, validate, danger = false }) {
    const form = element('form', 'dialog-inner');
    const header = element('div', 'dialog-head');
    const copy = element('div');
    const heading = element('h2', '', title);
    heading.id = 'active-dialog-title';
    copy.append(heading);
    if (description) copy.append(element('p', '', description));
    const close = element('button', 'dialog-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'إغلاق');
    close.append(icon('x'));
    close.addEventListener('click', () => dialog.close());
    header.append(copy, close);
    const fields = element('div', 'dialog-fields');
    fields.append(...controls);
    const error = element('p', 'dialog-error');
    error.hidden = true;
    error.setAttribute('role', 'alert');
    form.append(header, fields, error);
    if (accept) {
      const footer = element('div', 'dialog-actions');
      const submit = element('button', `dialog-button ${danger ? 'danger' : 'primary'}`, accept);
      submit.type = 'submit';
      const cancel = element('button', 'dialog-button secondary', 'إلغاء');
      cancel.type = 'button';
      cancel.addEventListener('click', () => dialog.close());
      footer.append(submit, cancel);
      form.append(footer);
    }
    dialog.setAttribute('aria-labelledby', heading.id);
    dialog.replaceChildren(form);
    dialog.showModal();
    const input = fields.querySelector('input, textarea, button');
    (input || close).focus();
    if (input?.select && input.value) input.select();

    return new Promise((resolve) => {
      let result = null;
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        try {
          result = validate ? validate() : true;
          dialog.close();
        } catch (failure) {
          error.textContent = failure.message;
          error.hidden = false;
        }
      });
      dialog.addEventListener('close', () => resolve(result), { once: true });
    });
  }

  function field(label, value = '', { multiline = false, max = 64, dir, placeholder } = {}) {
    const wrapper = element('label', 'dialog-field');
    const input = element(multiline ? 'textarea' : 'input');
    input.value = value;
    input.maxLength = max;
    input.dir = dir || 'auto';
    if (multiline) input.rows = 4;
    if (placeholder) input.placeholder = placeholder;
    wrapper.append(element('span', '', label), input);
    return { wrapper, input };
  }

  function required(input) {
    const value = input.value.trim();
    if (!value) throw Error('أدخل قيمة للمتابعة.');
    return value;
  }

  function textDialog(title, description, value, accept, math = false) {
    const { wrapper, input } = field('النص', value, { multiline: true, max: 600, dir: math ? 'ltr' : 'auto', placeholder: 'اكتب هنا…' });
    const controls = math ? [wrapper, symbolPicker(input)] : [wrapper];
    return showDialog({ title, description, controls, accept, validate: () => required(input) });
  }

  async function createBoard() {
    const workspace = state;
    const { wrapper, input } = field('اسم اللوحة', '', { placeholder: 'مثال: مراجعة الوحدة الأولى' });
    const name = await showDialog({ title: 'لوحة جديدة', description: 'ستجدها في مكتبة هذا المعلّم.', controls: [wrapper], accept: 'إنشاء لوحة', validate: () => required(input) });
    if (!name || state !== workspace) return;
    const board = makeBoard(name);
    state.boards.unshift(board);
    state.activeBoardId = board.id;
    openBoard();
    if (!desktop.matches) togglePanel('library', false);
    showToast('تم إنشاء اللوحة');
  }

  async function renameBoard() {
    const board = activeBoard();
    const { wrapper, input } = field('اسم اللوحة', board.name);
    const name = await showDialog({ title: 'تسمية اللوحة', controls: [wrapper], accept: 'حفظ الاسم', validate: () => required(input) });
    if (!name || activeBoard() !== board) return;
    board.name = name;
    touchBoard(board);
    showWorkspace();
  }

  async function deleteBoard() {
    const board = activeBoard();
    const confirmed = await showDialog({ title: 'حذف اللوحة', description: `سيُحذف محتوى «${board.name}» من مكتبة المعلّم.`, accept: 'حذف اللوحة', danger: true });
    if (!confirmed || activeBoard() !== board) return;
    state.boards = state.boards.filter(({ id }) => id !== board.id);
    if (!state.boards.length) state.boards.push(makeBoard('سبورتي الأولى'));
    state.activeBoardId = state.boards[0].id;
    openBoard();
    showToast('تم حذف اللوحة');
  }

  async function clearBoard() {
    const board = activeBoard();
    if (!board.objects.length) return;
    const confirmed = await showDialog({ title: 'مسح محتوى اللوحة', description: 'يمكنك استعادة المحتوى باستخدام زر التراجع.', accept: 'مسح المحتوى', danger: true });
    if (confirmed && activeBoard() === board) engine.clear();
  }

  function libraryOption(title, detail, handler) {
    const option = element('button', 'dialog-option');
    option.type = 'button';
    const copy = element('span', 'dialog-option-copy');
    copy.append(element('strong', '', title), element('small', '', detail));
    option.append(icon('file'), copy);
    option.addEventListener('click', () => {
      const workspace = state;
      dialog.addEventListener('close', () => { if (state === workspace) handler(); }, { once: true });
      dialog.close();
    });
    return option;
  }

  function showLibraryMenu() {
    const controls = [
      libraryOption('نسخة احتياطية', 'تنزيل لوحات مكتبتك بصيغة JSON', backupTeacher),
      libraryOption('استيراد نسخة', 'إضافة اللوحات من ملف محفوظ إلى مكتبتك', chooseBackup),
    ];
    return showDialog({ title: teacher.name, description: 'مكتبة لوحاتك في التحضير الذكي. يُحفظ عملك في هذا المتصفح.', controls });
  }

  function download(url, filename) {
    const link = element('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  }

  function safeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, '-');
  }

  function downloadJson(content, filename) {
    const data = new Blob([JSON.stringify(content)], { type: 'application/json' });
    const url = URL.createObjectURL(data);
    download(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function backupTeacher() {
    downloadJson({ format: 'lawh-board-local-v1', boards: state.boards }, `لوح - ${safeFilename(teacher.name)}.json`);
    showToast('تم تنزيل النسخة الاحتياطية');
  }

  function chooseBackup() {
    const workspace = state;
    const picker = element('input');
    picker.type = 'file';
    picker.accept = '.json,application/json';
    picker.addEventListener('change', async () => {
      const file = picker.files[0];
      if (!file) return;
      try {
        if (file.size > 12_000_000) throw Error();
        const data = JSON.parse(await file.text());
        if (state !== workspace) return;
        const source = data.format === 'lawh-teacher-v1' ? data.teacher?.boards
          : data.format === 'lawh-board-local-v1' ? data.boards : null;
        if (!Array.isArray(source) || !source.length) throw Error();
        const boards = source.map(readBackupBoard);
        state.boards.unshift(...boards);
        state.activeBoardId = boards[0].id;
        openBoard();
        if (!storageFailed) showToast('تم استيراد لوحات المعلّم');
      } catch {
        if (state === workspace) showToast('تعذّر فتح النسخة. اختر ملف JSON صادرًا من «لوح».', true);
      }
    });
    picker.click();
  }

  function readBackupBoard(source) {
    validateBoard(source);
    const board = makeBoard(source.name.trim().slice(0, 64), source.objects);
    board.background = source.background;
    board.updatedAt = source.updatedAt;
    return board;
  }

  function validateBoard(board) {
    if (typeof board?.name !== 'string' || !board.name.trim() || !backgrounds.has(board.background) || !Array.isArray(board.objects)) throw Error();
    if (!Number.isFinite(board.updatedAt) || Math.abs(board.updatedAt) > 8.64e15) throw Error();
    for (const object of board.objects) {
      if (!object) throw Error();
      if (inkTypes.has(object.type)) {
        if (!Array.isArray(object.points) || !object.points.length || !object.points.every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))) throw Error();
      } else {
        if (!objectTypes.has(object.type) || !Number.isFinite(object.x) || !Number.isFinite(object.y)) throw Error();
        if (object.type === 'text' ? typeof object.text !== 'string' : ![object.w, object.h].every(Number.isFinite)) throw Error();
        if (object.type === 'arc' && (![object.angle, object.sweep].every(Number.isFinite) || object.w <= 0 || object.h <= 0 || Math.abs(object.sweep) > Math.PI * 2 + 1e-8)) throw Error();
      }
    }
  }

  async function exportImage() {
    const board = activeBoard();
    try {
      const result = await engine.exportPng();
      if (activeBoard() !== board) return;
      const url = typeof result === 'string' ? result : URL.createObjectURL(result);
      download(url, `${safeFilename(board.name)}.png`);
      if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast('تم تنزيل صورة اللوحة');
    } catch {
      showToast('تعذّر تصدير صورة اللوحة.', true);
    }
  }

  function addMath(type, expression) {
    engine.add({ type, x: 190, y: 120, w: 620, h: 405, color: color === defaultColor ? '#7145e6' : color, expression });
    setTool('select');
    revealCanvas();
  }

  async function showPlot() {
    const board = activeBoard();
    const { wrapper, input } = field('ص = f(x)', 'x^2', { dir: 'ltr', max: 120, placeholder: 'x^2 - 4' });
    const expression = await showDialog({
      title: 'رسم دالة',
      description: 'اكتب دالة في المتغيّر x. يمكنك استخدام ^ للأسس و sqrt(x) للجذر و sin(x) للجيب.',
      controls: [wrapper], accept: 'رسم على اللوحة',
      validate() {
        const expression = required(input);
        BoardMath.compile(expression);
        return expression;
      },
    });
    if (expression && activeBoard() === board) addMath('plot', expression);
  }

  function symbolPicker(input) {
    const row = element('div', 'symbol-picker');
    for (const symbol of symbols) {
      const button = element('button', 'symbol-button', symbol);
      button.type = 'button';
      button.addEventListener('click', () => {
        input.setRangeText(symbol, input.selectionStart, input.selectionEnd, 'end');
        input.focus();
      });
      row.append(button);
    }
    return row;
  }

  function addMathText(text) {
    engine.add({ type: 'text', text, x: 365, y: 274, color, width, fontSize: 34, direction: 'ltr', align: 'left' });
    setTool('select');
    revealCanvas();
  }

  async function showSymbols() {
    const board = activeBoard();
    const text = await textDialog('رموز رياضية', 'اختر رمزًا أو اكتب معادلة لإضافتها إلى السبورة.', '', 'إضافة للوحة', true);
    if (text && activeBoard() === board) addMathText(text);
  }

  async function showFraction() {
    const board = activeBoard();
    const top = field('البسط', '', { dir: 'ltr', max: 24 });
    const bottom = field('المقام', '', { dir: 'ltr', max: 24 });
    const values = await showDialog({ title: 'إضافة كسر', controls: [top.wrapper, bottom.wrapper], accept: 'إضافة للوحة', validate: () => ({ numerator: required(top.input), denominator: required(bottom.input) }) });
    if (!values || activeBoard() !== board) return;
    const w = Math.max(70, Math.min(330, Math.max(values.numerator.length, values.denominator.length) * 18 + 24));
    engine.add({ type: 'fraction', x: (1000 - w) / 2, y: 280, w, h: 90, color, ...values });
    setTool('select');
    revealCanvas();
  }

  function showShortcuts() {
    const shortcuts = [ ['قلم', 'P'], ['فرشاة', 'B'], ['تمييز', 'M'], ['ممحاة', 'E'], ['تحديد', 'V'], ['نص', 'T'], ['تحريك', 'H'], ['تثبيت نسب الشكل أثناء الرسم', 'Shift'], ['تراجع', 'Ctrl / ⌘ + Z'], ['إعادة', 'Ctrl / ⌘ + Shift + Z'], ['حذف العنصر المحدد', 'Delete'] ];
    const list = element('dl', 'shortcuts-list');
    for (const [name, key] of shortcuts) {
      const row = element('div');
      row.append(element('dt', '', name), element('dd', '', key));
      list.append(row);
    }
    return showDialog({ title: 'اختصارات لوحة المفاتيح', controls: [list] });
  }

  async function toggleFullscreen() {
    try {
      const card = canvas.closest('.studio-card');
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (card.requestFullscreen) await card.requestFullscreen();
      else throw Error();
    } catch {
      showToast('وضع ملء الشاشة غير متاح هنا.', true);
    }
  }

  document.addEventListener('click', (event) => {
    if (!state) return;
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.boardId) {
      if (state.activeBoardId !== button.dataset.boardId && state.boards.some(({ id }) => id === button.dataset.boardId)) {
        state.activeBoardId = button.dataset.boardId;
        openBoard();
      }
      if (!desktop.matches) togglePanel('library', false);
    } else if (button.dataset.action) {
      actions[button.dataset.action]?.();
    } else if (button.dataset.tool) {
      setTool(button.dataset.tool);
    } else if (button.dataset.color) {
      setColor(button.dataset.color);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!state || dialog.open || event.target.matches?.('input, textarea, select, [contenteditable]') || event.altKey) return;
    if (event.key === 'Escape' && !desktop.matches) {
      togglePanel('math', false);
      togglePanel('library', false);
    }
    if (event.ctrlKey || event.metaKey) {
      if (event.code === 'KeyZ' || event.code === 'KeyY') {
        event.preventDefault();
        if (event.shiftKey || event.code === 'KeyY') engine.redo();
        else engine.undo();
      }
      return;
    }
    if (event.key === 'Delete' && currentTool === 'select') {
      engine.deleteSelection?.();
      return;
    }
    const shortcuts = { KeyP: 'pen', KeyB: 'brush', KeyM: 'marker', KeyE: 'eraser', KeyV: 'select', KeyT: 'text', KeyH: 'pan' };
    if (shortcuts[event.code]) setTool(shortcuts[event.code]);
  });

  byId('custom-color').addEventListener('input', (event) => setColor(event.target.value));
  byId('stroke-width').addEventListener('input', (event) => setWidth(Number(event.target.value)));
  byId('background-select').addEventListener('change', (event) => {
    const background = event.target.value;
    const board = activeBoard();
    if (!board || !backgrounds.has(background)) return;
    board.background = background;
    engine.setBackground(background);
    byId('canvas-wrap').dataset.background = background;
    adjustInk(background);
    touchBoard(board);
  });

  desktop.addEventListener('change', ({ matches }) => {
    togglePanel('library', false);
    togglePanel('math', matches);
  });

  setWidth(width);
  setColor(color);
  setTool(currentTool);
  togglePanel('math', desktop.matches);

  if (location.protocol === 'file:') {
    openLocalNotice();
  } else {
    byId('board-access-retry').addEventListener('click', verifyAccess);
    window.addEventListener('storage', (event) => {
      if (event.key !== null && !sessionKeys.has(event.key)) return;
      accessRequest?.abort();
      accessRequest = undefined;
      lockWorkspace();
      if (event.newValue === null) showSignIn();
      else verifyAccess();
    });
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      lockWorkspace();
      verifyAccess();
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifyAccess(); });
    verifyAccess();
  }
})();
