let subscriptionState = { loaded: false, activeGrades: [], activeSubjects: [], pending: [], subscriptions: [], paymentNumber: '91470590' };
let subscriptionSubjectSelections = [];
let subscriptionGradeOptions = [];

function subscriptionApiUrl(path) {
  const base = window.location.protocol === 'file:' ? 'https://altahdir.app' : '';
  return base + path;
}

function splitSubscriptionGrades(value) {
  if (Array.isArray(value)) return value.flatMap(splitSubscriptionGrades);
  const text = String(value || '').trim();
  if (!text) return [];
  const normalized = normalizeSubscriptionGrade(text);
  const found = [];
  const definitions = subscriptionGradeDefinitions();
  definitions.forEach((item) => {
    item.aliases.forEach((alias) => {
      const pattern = alias.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
      const matches = normalized.match(new RegExp('(^|\\s)' + pattern + '(?=\\s|$)', 'g'));
      if (matches) matches.forEach(() => found.push(item.display));
    });
  });
  if (found.length) return found;
  return text.split(/[،,]/).map(part => part.trim()).filter(Boolean);
}

function subscriptionGradeDefinitions() {
  return [
    { key: 'الحادي عشر', display: 'الحادي عشر', aliases: ['الحادي عشر', '11', '١١'] },
    { key: 'الثاني عشر', display: 'الثاني عشر', aliases: ['الثاني عشر', '12', '١٢'] },
    { key: 'الاول', display: 'الأول', aliases: ['الاول', '1', '١'] },
    { key: 'الثاني', display: 'الثاني', aliases: ['الثاني', '2', '٢'] },
    { key: 'الثالث', display: 'الثالث', aliases: ['الثالث', '3', '٣'] },
    { key: 'الرابع', display: 'الرابع', aliases: ['الرابع', '4', '٤'] },
    { key: 'الخامس', display: 'الخامس', aliases: ['الخامس', '5', '٥'] },
    { key: 'السادس', display: 'السادس', aliases: ['السادس', '6', '٦'] },
    { key: 'السابع', display: 'السابع', aliases: ['السابع', '7', '٧'] },
    { key: 'الثامن', display: 'الثامن', aliases: ['الثامن', '8', '٨'] },
    { key: 'التاسع', display: 'التاسع', aliases: ['التاسع', '9', '٩'] },
    { key: 'العاشر', display: 'العاشر', aliases: ['العاشر', '10', '١٠'] }
  ];
}

function displaySubscriptionGrade(value) {
  const normalized = normalizeSubscriptionGrade(value);
  const found = subscriptionGradeDefinitions().find(item => item.key === normalized || item.aliases.includes(normalized));
  return found ? 'الصف ' + found.display : String(value || '').trim();
}

function uniqueSubscriptionGrades(values) {
  const seen = new Set();
  const out = [];
  splitSubscriptionGrades(values).forEach((value) => {
    const key = normalizeSubscriptionGrade(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(displaySubscriptionGrade(value));
  });
  return out;
}

function normalizeSubscriptionGrade(value) {
  return String(value || '')
    .replace(/\bgrade\b/gi, '')
    .replace(/الصف/g, '')
    .replace(/صف/g, '')
    .replace(/أ/g, 'ا')
    .replace(/إ/g, 'ا')
    .replace(/آ/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[،,؛;|/\\_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGradeSubscribed(grade) {
  const wanted = normalizeSubscriptionGrade(grade);
  return uniqueSubscriptionGrades(subscriptionState.activeGrades).some(g => normalizeSubscriptionGrade(g) === wanted);
}

function getSubscriptionUserId() {
  const session = typeof getUnifiedSession === 'function'
    ? getUnifiedSession()
    : (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
  if (session?.userId) return String(session.userId).trim();
  const keys = ['lesson_platform_backend_session_v1', 'enjazy_session_v1', 'lesson_platform_current_user_v1'];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.userId) return String(parsed.userId).trim();
    } catch (e) {}
  }
  return '';
}

function updateSubscriptionPanel() {
  const card = document.getElementById('subscription-card');
  const badge = document.getElementById('subscription-badge');
  const text = document.getElementById('subscription-text');
  const status = document.getElementById('subscription-status');
  if (!card || !badge || !text || !status) return;
  const activeSubjects = getActiveSubscriptionSubjects();
  const active = uniqueSubscriptionGrades(subscriptionState.activeGrades || []);
  const pending = subscriptionState.pending || [];
  const blocked = (subscriptionState.subscriptions || []).filter(item => ['rejected', 'stopped'].includes(item.status));
  const latestBlocked = blocked[0] || null;
  const hasActive = activeSubjects.length > 0 || active.length > 0;
  card.classList.toggle('active', hasActive && !latestBlocked);
  card.classList.toggle('pending', !hasActive && (pending.length > 0 || !!latestBlocked));
  if (latestBlocked) {
    const stopped = latestBlocked.status === 'stopped';
    badge.textContent = stopped ? 'تم إيقاف الاشتراك' : 'تم رفض الإيصال';
    text.innerHTML = stopped
      ? 'لإعادة التفعيل: اختر المادة وحوّل إلى <span class="transfer-number" title="رقم التحويل المفعل">91470590</span> ثم ارفع إيصالًا صحيحًا.'
      : 'تم رفض الإيصال. اختر المادة وحوّل إلى <span class="transfer-number" title="رقم التحويل المفعل">91470590</span> ثم ارفع إيصالًا صحيحًا.';
    status.textContent = 'الطلب: ' + (latestBlocked.subjects?.map(formatSubscriptionSubject).join('، ') || latestBlocked.grade || '') + (latestBlocked.adminNote ? ' - ملاحظة الإدارة: ' + latestBlocked.adminNote : '');
  } else if (activeSubjects.length) {
    badge.textContent = 'مفعل: ' + activeSubjects.length + ' مادة';
    text.innerHTML = 'اشتراكك مفعل للمواد المحددة. لإضافة مادة: حوّل إلى <span class="transfer-number" title="رقم التحويل المفعل">91470590</span> ثم ارفع الإيصال.';
    status.textContent = 'المواد المتاحة: ' + activeSubjects.map(formatSubscriptionSubject).join('، ') + ' - ينتهي الاشتراك في ' + formatSubscriptionExpiry(activeSubjects[0]?.expiresAt);
  } else if (active.length) {
    badge.textContent = 'مفعل: ' + active.join('، ');
    text.innerHTML = 'اشتراكك القديم مفعل حسب الصف. الاشتراكات الجديدة تكون حسب المادة الواحدة.';
    status.textContent = 'الصفوف المتاحة الآن: ' + active.join('، ');
  } else if (pending.length) {
    badge.textContent = 'بانتظار المراجعة';
    text.innerHTML = 'تم استلام الإيصال، وسيتم التحقق من التحويل إلى <span class="transfer-number" title="رقم التحويل المفعل">91470590</span>.';
    status.textContent = 'طلبات قيد المراجعة: ' + pending.map(p => p.subjects?.map(formatSubscriptionSubject).join('، ') || p.grade).join('، ');
  } else {
    badge.textContent = '2 ريال لكل مادة';
    text.innerHTML = 'اختر الصف ثم المادة، حوّل إلى <span class="transfer-number" title="رقم التحويل المفعل">91470590</span> ثم ارفع الإيصال. الاشتراك ينتهي في 10/06 من كل سنة.';
    status.textContent = getSubscriptionUserId() ? 'اختر الصف والمادة وارفع الإيصال.' : 'سجل الدخول ثم أرسل الإيصال ليتم تفعيل المادة.';
  }
}

function normalizeSubscriptionSubject(value) {
  const normalized = String(value || '')
    .replace(/أ/g, 'ا')
    .replace(/إ/g, 'ا')
    .replace(/آ/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = normalized.replace(/\s+/g, '');
  if (
    compact.includes('عربي') ||
    compact.includes('اللغهالعربيه') ||
    compact.includes('لغهعربيه') ||
    compact.includes('احبلغتي') ||
    compact.includes('لغتيالجميله')
  ) {
    return 'arabic-language';
  }
  if (
    compact.includes('انجليزي') ||
    compact.includes('الانجليزي') ||
    compact.includes('اللغهالانجليزيه') ||
    compact.includes('لغهانجليزيه') ||
    compact.toLowerCase().includes('english')
  ) {
    return 'english';
  }
  if (
    compact.includes('التربيهالبدنيهوالصحيه') ||
    compact.includes('تربيهبدنيهصحيه') ||
    compact.includes('الرياضهالمدرسيه') ||
    compact.includes('رياضهمدرسيه')
  ) {
    return 'physical-education';
  }
  if (
    compact.includes('حاسوب') ||
    compact.includes('الحاسوب') ||
    compact.includes('تقنيهالمعلومات') ||
    compact.includes('تقنيهمعلومات') ||
    compact.includes('تقانةالمعلومات') ||
    compact.includes('عالميالرقمي') ||
    compact.includes('عالميرقمي')
  ) {
    return 'computer-science';
  }
  if (
    compact.includes('دراسات') ||
    compact.includes('الدراساتالاجتماعيه') ||
    compact.includes('الجغرافيا') ||
    compact.includes('جغرافيا')
  ) {
    return 'social-studies';
  }
  return normalized
    .split(' ')
    .map(word => word.replace(/^ال(?=.)/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function subscriptionSubjectKey(grade, subject) {
  return normalizeSubscriptionGrade(grade) + '::' + normalizeSubscriptionSubject(subject);
}

function isSameSubscriptionGrade(a, b) {
  return normalizeSubscriptionGrade(a) === normalizeSubscriptionGrade(b);
}

function isSameSubscriptionSubject(a, b) {
  return normalizeSubscriptionSubject(a) === normalizeSubscriptionSubject(b);
}

function getActiveSubscriptionSubjects() {
  const direct = Array.isArray(subscriptionState.activeSubjects) ? subscriptionState.activeSubjects : [];
  const fromSubscriptions = (subscriptionState.subscriptions || [])
    .filter(item => item.status === 'active')
    .flatMap(item => Array.isArray(item.subjects) ? item.subjects : []);
  const seen = new Set();
  const out = [];
  [...direct, ...fromSubscriptions].forEach((item) => {
    const grade = displaySubscriptionGrade(item?.grade || '');
    const subject = String(item?.subject || '').trim();
    const expiresAt = item?.expiresAt || item?.expires_at || '';
    if (!grade || !subject || isSubscriptionExpired(expiresAt)) return;
    const key = subscriptionSubjectKey(grade, subject);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ grade, subject, expiresAt });
  });
  return out;
}

function isSubscriptionExpired(expiresAt) {
  if (!expiresAt) return false;
  const end = new Date(String(expiresAt).slice(0, 10) + 'T23:59:59');
  return Number.isFinite(end.getTime()) && end < new Date();
}

function formatSubscriptionExpiry(expiresAt) {
  const value = String(expiresAt || '').slice(0, 10);
  const parts = value.split('-');
  return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : '10/06';
}

function formatSubscriptionSubject(item) {
  return (item?.grade || '') + ' - ' + (item?.subject || '');
}

function isSubjectSubscribed(grade, subject) {
  const wanted = subscriptionSubjectKey(grade, subject);
  const activeSubjects = getActiveSubscriptionSubjects();
  if (activeSubjects.length) {
    return activeSubjects.some(item => subscriptionSubjectKey(item.grade, item.subject) === wanted);
  }
  return isGradeSubscribed(grade);
}

function getSelectedSubscriptionGrade() {
  const select = document.getElementById('subscription-grade');
  return select ? select.value : '';
}

function getSelectedSubscriptionSubjects() {
  return Array.isArray(subscriptionSubjectSelections) ? [...subscriptionSubjectSelections] : [];
}

function updateSubscriptionAmount() {
  const box = document.getElementById('subscription-amount');
  if (!box) return;
  const count = getSelectedSubscriptionSubjects().length;
  const total = count * 2;
  box.textContent = count
    ? 'قيمة الاشتراك: ' + count + ' مادة × 2 ريال عماني = ' + total + ' ريال عماني'
    : 'قيمة الاشتراك: 2 ريال عماني لكل مادة';
}

function getSubscriptionSubjectsForGrade(grade) {
  if (!grade) return [];
  const rows = typeof activeLessons === 'function'
    ? activeLessons().map(item => ({ grade: item.grade, subject: item.subject }))
    : (Array.isArray(D) ? D.map(row => ({ grade: row["1"], subject: row["2"] })) : []);
  const activeKeys = new Set(getActiveSubscriptionSubjects().map(item => subscriptionSubjectKey(item.grade, item.subject)));
  const seen = new Set();
  const subjects = [];
  rows.forEach((item) => {
    const subject = String(item.subject || '').trim();
    if (!subject || !isSameSubscriptionGrade(item.grade, grade)) return;
    const key = normalizeSubscriptionSubject(subject);
    if (!key || seen.has(key) || activeKeys.has(subscriptionSubjectKey(grade, subject))) return;
    seen.add(key);
    subjects.push(subject);
  });
  return subjects.sort();
}

function fillSubscriptionGradeOptions(values = subscriptionGradeOptions) {
  const select = document.getElementById('subscription-grade');
  if (!select) return;
  const previous = getSelectedSubscriptionGrade();
  const list = values.length ? values : ['الصف الأول','الصف الثاني','الصف الثالث','الصف الرابع','الصف الخامس','الصف السادس','الصف السابع','الصف الثامن','الصف التاسع','الصف العاشر','الصف الحادي عشر','الصف الثاني عشر'];
  select.innerHTML = '<option value="">اختر الصف...</option>';
  list.forEach((grade) => {
    const option = document.createElement('option');
    option.value = grade;
    option.textContent = grade;
    select.appendChild(option);
  });
  select.value = list.includes(previous) ? previous : '';
  fillSubscriptionSubjectOptions();
}

function ensureSubscriptionSubjectPicker(select) {
  let picker = document.getElementById('subscription-subject-picker');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'subscription-subject-picker';
    picker.className = 'subscription-subject-picker';
    select.insertAdjacentElement('afterend', picker);
  }
  let summary = document.getElementById('subscription-subject-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'subscription-subject-summary';
    summary.className = 'subscription-subject-summary';
    picker.insertAdjacentElement('afterend', summary);
  }
  return { picker, summary };
}

function fillSubscriptionSubjectOptions() {
  const select = document.getElementById('subscription-subject');
  if (!select) return;
  const grade = getSelectedSubscriptionGrade();
  const subjects = getSubscriptionSubjectsForGrade(grade);
  const { picker } = ensureSubscriptionSubjectPicker(select);
  select.innerHTML = '';
  picker.innerHTML = '';

  if (!subjects.length) {
    const empty = document.createElement('div');
    empty.className = 'subscription-subject-empty';
    empty.textContent = grade ? 'كل مواد هذا الصف مشتركة أو غير متاحة' : 'اختر الصف أولًا';
    picker.appendChild(empty);
  } else {
    subjects.forEach((subject) => {
      const option = document.createElement('option');
      option.value = subject;
      option.textContent = subject;
      option.selected = subscriptionSubjectSelections.some(item => subscriptionSubjectKey(item.grade, item.subject) === subscriptionSubjectKey(grade, subject));
      select.appendChild(option);

      const label = document.createElement('label');
      label.className = 'subscription-subject-choice';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = option.selected;
      checkbox.addEventListener('change', () => toggleSubscriptionSubject(grade, subject, checkbox.checked));
      const text = document.createElement('span');
      text.textContent = subject;
      label.appendChild(checkbox);
      label.appendChild(text);
      picker.appendChild(label);
    });
  }
  renderSelectedSubscriptionSubjects();
  updateSubscriptionAmount();
}

function toggleSubscriptionSubject(grade, subject, checked) {
  const normalizedGrade = displaySubscriptionGrade(grade);
  const key = subscriptionSubjectKey(normalizedGrade, subject);
  subscriptionSubjectSelections = subscriptionSubjectSelections.filter(item => subscriptionSubjectKey(item.grade, item.subject) !== key);
  if (checked) subscriptionSubjectSelections.push({ grade: normalizedGrade, subject });
  syncSubscriptionSubjectNativeSelect();
  renderSelectedSubscriptionSubjects();
  updateSubscriptionAmount();
}

function syncSubscriptionSubjectNativeSelect() {
  const select = document.getElementById('subscription-subject');
  const grade = getSelectedSubscriptionGrade();
  if (!select) return;
  Array.from(select.options).forEach(option => {
    option.selected = subscriptionSubjectSelections.some(item => subscriptionSubjectKey(item.grade, item.subject) === subscriptionSubjectKey(grade, option.value));
  });
}

function removeSelectedSubscriptionSubject(key) {
  subscriptionSubjectSelections = subscriptionSubjectSelections.filter(item => subscriptionSubjectKey(item.grade, item.subject) !== key);
  fillSubscriptionSubjectOptions();
}

function renderSelectedSubscriptionSubjects() {
  const summary = document.getElementById('subscription-subject-summary');
  if (!summary) return;
  summary.innerHTML = '';
  if (!subscriptionSubjectSelections.length) {
    summary.textContent = 'لم يتم اختيار مواد بعد.';
    return;
  }
  subscriptionSubjectSelections.forEach((item) => {
    const key = subscriptionSubjectKey(item.grade, item.subject);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'subscription-subject-chip';
    chip.textContent = formatSubscriptionSubject(item) + ' ×';
    chip.addEventListener('click', () => removeSelectedSubscriptionSubject(key));
    summary.appendChild(chip);
  });
}

async function refreshSubscriptionStatus() {
  const userId = getSubscriptionUserId();
  if (!userId) {
    subscriptionState = { loaded: true, activeGrades: [], activeSubjects: [], pending: [], subscriptions: [], paymentNumber: '91470590' };
    updateSubscriptionPanel();
    return subscriptionState;
  }
  try {
    const response = await fetch(subscriptionApiUrl('/api/subscriptions?action=status&userId=' + encodeURIComponent(userId)));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'تعذر جلب حالة الاشتراك.');
    subscriptionState = {
      loaded: true,
      activeGrades: uniqueSubscriptionGrades(Array.isArray(data.activeGrades) ? data.activeGrades : []),
      activeSubjects: Array.isArray(data.activeSubjects) ? data.activeSubjects : [],
      pending: Array.isArray(data.pending) ? data.pending : [],
      subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : [],
      paymentNumber: data.paymentNumber || '91470590'
    };
  } catch (error) {
    subscriptionState = { loaded: true, activeGrades: [], activeSubjects: [], pending: [], subscriptions: [], paymentNumber: '91470590' };
    console.warn('subscription status failed', error);
  }
  updateSubscriptionPanel();
  return subscriptionState;
}

async function submitSubscriptionRequest() {
  const userId = getSubscriptionUserId();
  if (!userId) {
    if (typeof showMessage === 'function') showMessage('يرجى تسجيل الدخول أولًا لإرسال الإيصال.', 'error');
    else if (typeof showToast === 'function') showToast('يرجى تسجيل الدخول أولًا لإرسال الإيصال.', true);
    if (typeof goToUnifiedLogin === 'function') setTimeout(goToUnifiedLogin, 700);
    else if (typeof goUnifiedAuth === 'function') setTimeout(() => goUnifiedAuth('login'), 700);
    return;
  }
  const selectedSubjects = getSelectedSubscriptionSubjects();
  const selectedGrade = selectedSubjects[0]?.grade || getSelectedSubscriptionGrade();
  const file = document.getElementById('subscription-receipt')?.files?.[0] || null;
  if (!selectedSubjects.length || !file) {
    if (typeof showMessage === 'function') showMessage('اختر الصف والمادة وارفع الإيصال.', 'error');
    else if (typeof showToast === 'function') showToast('اختر الصف والمادة وارفع الإيصال.', true);
    return;
  }
  if (!String(file.type || '').startsWith('image/')) {
    if (typeof showMessage === 'function') showMessage('يجب رفع صورة للإيصال فقط. ملفات PDF غير مقبولة.', 'error');
    else if (typeof showToast === 'function') showToast('يجب رفع صورة للإيصال فقط. ملفات PDF غير مقبولة.', true);
    return;
  }
  const btn = document.getElementById('subscription-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الإرسال...'; }
  try {
    const form = new FormData();
    form.append('userId', userId);
    form.append('grade', selectedGrade);
    form.append('grades', JSON.stringify([...new Set(selectedSubjects.map(item => item.grade))]));
    form.append('subjects', JSON.stringify(selectedSubjects));
    form.append('receipt', file);
    const response = await fetch(subscriptionApiUrl('/api/subscriptions?action=request'), { method: 'POST', body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'تعذر إرسال الإيصال.');
    if (typeof showMessage === 'function') showMessage(data.message || 'تم إرسال الإيصال للمراجعة.', 'success');
    else if (typeof showToast === 'function') showToast(data.message || 'تم إرسال الإيصال للمراجعة.');
    const input = document.getElementById('subscription-receipt');
    if (input) input.value = '';
    subscriptionSubjectSelections = [];
    const subjectSelect = document.getElementById('subscription-subject');
    if (subjectSelect) Array.from(subjectSelect.options).forEach(option => { option.selected = false; });
    await refreshSubscriptionStatus();
    fillSubscriptionSubjectOptions();
    if (typeof applySubscriptionToGrades === 'function') applySubscriptionToGrades();
    if (typeof populateTeacherFilters === 'function') populateTeacherFilters();
  } catch (error) {
    if (typeof showMessage === 'function') showMessage(error.message, 'error');
    else if (typeof showToast === 'function') showToast(error.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'إرسال الإيصال'; }
  }
}

