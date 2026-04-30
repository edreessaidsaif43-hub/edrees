const state = {
  projects: [],
  filteredCategory: "الكل",
  user: JSON.parse(localStorage.getItem('tp_user') || 'null'),
  token: localStorage.getItem('tp_token') || ''
};

const categories = [
  "مشاريع علاجية",
  "مشاريع إثرائية",
  "مشاريع رقمية",
  "مبادرات مدرسية",
  "مشاريع الذكاء الاصطناعي",
  "مشاريع STEM",
  "مشاريع القراءة",
  "مشاريع القيم والمواطنة",
  "مشاريع الانضباط والتحفيز"
];

const qs = (s) => document.querySelector(s);

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'خطأ في الطلب');
  }
  return res.json();
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function projectCard(p) {
  return `
  <article class="project-card">
    <img src="${p.cover}" alt="${p.title}">
    <div class="project-body">
      <h3 class="project-title">${p.title}</h3>
      <p class="meta"><strong>المعلم:</strong> ${p.teacher}</p>
      <p class="meta"><strong>المدرسة:</strong> ${p.school}</p>
      <p class="meta"><strong>النوع:</strong> ${p.category}</p>
      <p class="project-desc">${p.description}</p>
      <div class="project-footer">
        <span class="views">${Number(p.views || 0).toLocaleString('ar-EG')} مشاهدة</span>
        <a class="btn btn-dark" href="project.html?id=${p.id}">عرض المشروع</a>
      </div>
    </div>
  </article>`;
}

function renderCategories() {
  const holder = qs('#categories');
  if (!holder) return;
  holder.innerHTML = ['الكل', ...categories].map(c => `<button class="badge ${c === state.filteredCategory ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('');
  holder.onclick = (e) => {
    const b = e.target.closest('button[data-cat]');
    if (!b) return;
    state.filteredCategory = b.dataset.cat;
    renderCategories();
    renderFeatured();
  };
}

function getPublicApprovedProjects() {
  return state.projects.filter(p => p.publicInMain && p.adminApproved && !p.hidden && !p.deleted);
}

function renderFeatured() {
  const el = qs('#featuredProjects');
  if (!el) return;
  const source = getPublicApprovedProjects().filter(p => p.featured);
  const filtered = state.filteredCategory === 'الكل' ? source : source.filter(p => p.category === state.filteredCategory);
  el.innerHTML = filtered.map(projectCard).join('') || '<p>لا توجد مشاريع حالياً ضمن هذا التصنيف.</p>';
}

function renderLatestAndTop() {
  const latest = qs('#latestProjects');
  const top = qs('#topProjects');
  const list = getPublicApprovedProjects();
  if (latest) latest.innerHTML = list.filter(p => p.latest).map(p => `<li><a href="project.html?id=${p.id}">${p.title}</a></li>`).join('');
  if (top) top.innerHTML = [...list].sort((a,b) => (b.views||0) - (a.views||0)).slice(0,4).map(p => `<li><a href="project.html?id=${p.id}">${p.title}</a></li>`).join('');
}

async function renderProjectDetail() {
  const page = qs('#projectDetailPage');
  if (!page) return;
  const id = getQueryParam('id');
  if (!id) return;

  try {
    const p = await api(`/api/project/${id}`);
    page.innerHTML = `
      <section class="section">
        <div class="container detail-wrap">
          <div>
            <img class="detail-cover" src="${p.cover}" alt="${p.title}">
            <div class="panel" style="margin-top:14px;">
              <h3>فكرة المشروع</h3><p>${p.description || ''}</p>
              <h3>المشكلة التي يعالجها</h3><p>${p.problem || ''}</p>
              <h3>أهداف المشروع</h3><ul>${(p.goals||[]).map(x => `<li>${x}</li>`).join('')}</ul>
              <h3>خطوات التنفيذ</h3><ol>${(p.steps||[]).map(x => `<li>${x}</li>`).join('')}</ol>
              <h3>الشواهد والصور</h3><ul>${(p.evidence||[]).map(x => `<li>${x}</li>`).join('')}</ul>
              <h3>النتائج والأثر</h3><p>${p.results || ''}</p>
              <h3>التوصيات</h3><p>${p.recommendations || ''}</p>
            </div>
          </div>
          <aside class="panel">
            <h2 style="margin-top:0">${p.title}</h2>
            <div class="info-list">
              <div class="info-item"><strong>اسم المعلم:</strong> ${p.teacher}</div>
              <div class="info-item"><strong>المدرسة:</strong> ${p.school}</div>
              <div class="info-item"><strong>المادة:</strong> ${p.subject}</div>
              <div class="info-item"><strong>الصف المستهدف:</strong> ${p.grade}</div>
              <div class="info-item"><strong>نوع المشروع:</strong> ${p.category}</div>
              <div class="info-item"><strong>المشاهدات:</strong> ${Number(p.views||0).toLocaleString('ar-EG')}</div>
            </div>
            <div class="actions" style="margin-top:14px;">
              <a class="btn btn-dark" href="teacher.html?slug=${p.teacherSlug}">رابط موقع المعلم</a>
              <button class="btn" style="background:#f0f9ff;color:#0b4f78;" onclick="navigator.clipboard.writeText(location.href);alert('تم نسخ الرابط')">مشاركة المشروع</button>
            </div>
          </aside>
        </div>
      </section>`;
  } catch {
    page.innerHTML = '<section class="section"><div class="container panel">المشروع غير متاح.</div></section>';
  }
}

function renderTeacherLogin() {
  const loginBox = qs('#teacherLogin');
  const userBox = qs('#teacherUserBox');
  const formBox = qs('#teacherFormWrap');
  const listBox = qs('#teacherProjectsList');
  if (!loginBox) return;

  const isTeacher = state.user && state.user.role === 'teacher';
  loginBox.style.display = isTeacher ? 'none' : 'block';
  userBox.style.display = isTeacher ? 'block' : 'none';
  formBox.style.display = isTeacher ? 'block' : 'none';
  listBox.style.display = isTeacher ? 'block' : 'none';

  if (isTeacher) {
    qs('#teacherWelcome').textContent = `${state.user.name} (${state.user.username})`;
    loadTeacherProjects();
  }
}

async function teacherLogin(ev) {
  ev.preventDefault();
  const username = qs('#teacherUsername').value.trim();
  const password = qs('#teacherPassword').value.trim();
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (data.user.role !== 'teacher') throw new Error('الحساب ليس حساب معلم');
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('tp_token', state.token);
    localStorage.setItem('tp_user', JSON.stringify(state.user));
    renderTeacherLogin();
  } catch (e) {
    alert(e.message);
  }
}

async function loadTeacherProjects() {
  const wrap = qs('#teacherProjects');
  if (!wrap) return;
  try {
    const projects = await api('/api/projects?scope=mine');
    wrap.innerHTML = projects.map(p => `
      <div class="panel" style="margin-bottom:10px;">
        <strong>${p.title}</strong><br>
        <small>اعتماد الإدارة: ${p.adminApproved ? 'معتمد' : 'قيد المراجعة'} | الظهور: ${p.publicInMain ? 'عام' : 'داخل موقعي'}</small>
      </div>`).join('') || '<p>لا توجد مشاريع بعد.</p>';
  } catch {
    wrap.innerHTML = '<p>تعذر تحميل المشاريع.</p>';
  }
}

async function submitProject(ev) {
  ev.preventDefault();
  const payload = {
    title: qs('#title').value,
    school: qs('#school').value,
    category: qs('#category').value,
    subject: qs('#subject').value,
    grade: qs('#grade').value,
    description: qs('#description').value,
    problem: qs('#problem').value,
    results: qs('#results').value,
    recommendations: qs('#recommendations').value,
    publicInMain: qs('#publicYes').checked,
    goals: qs('#goals').value.split('\n').map(s => s.trim()).filter(Boolean),
    steps: qs('#steps').value.split('\n').map(s => s.trim()).filter(Boolean),
    evidence: qs('#evidence').value.split('\n').map(s => s.trim()).filter(Boolean)
  };
  try {
    await api('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
    ev.target.reset();
    alert('تم رفع المشروع وهو الآن بانتظار اعتماد الإدارة');
    loadTeacherProjects();
  } catch (e) {
    alert(e.message);
  }
}

async function teacherLogout() {
  try { if (state.token) await api('/api/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem('tp_token');
  localStorage.removeItem('tp_user');
  state.token = '';
  state.user = null;
  renderTeacherLogin();
  renderAdminLogin();
}

function renderAdminLogin() {
  const loginBox = qs('#adminLogin');
  const panel = qs('#adminPanel');
  if (!loginBox) return;
  const isAdmin = state.user && state.user.role === 'admin';
  loginBox.style.display = isAdmin ? 'none' : 'block';
  panel.style.display = isAdmin ? 'block' : 'none';
  if (isAdmin) loadAdminData();
}

async function adminLogin(ev) {
  ev.preventDefault();
  const username = qs('#adminUsername').value.trim();
  const password = qs('#adminPassword').value.trim();
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (data.user.role !== 'admin') throw new Error('الحساب ليس إدارة');
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('tp_token', state.token);
    localStorage.setItem('tp_user', JSON.stringify(state.user));
    renderAdminLogin();
  } catch (e) {
    alert(e.message);
  }
}

async function loadAdminData() {
  const stats = await api('/api/admin/stats');
  qs('#kTotal').textContent = stats.total;
  qs('#kApproved').textContent = stats.approved;
  qs('#kPending').textContent = stats.pending;
  qs('#kPublic').textContent = stats.publicCount;

  const projects = await api('/api/projects?scope=all');
  const tbody = qs('#adminRows');
  tbody.innerHTML = projects.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${p.title}</td>
      <td>${p.teacher}</td>
      <td>${p.category}</td>
      <td>${p.adminApproved ? 'معتمد' : 'قيد المراجعة'}</td>
      <td>${p.publicInMain ? 'عام' : 'خاص'}</td>
      <td>${Number(p.views||0).toLocaleString('ar-EG')}</td>
      <td>
        <button class="btn" style="padding:6px 10px" onclick="adminAction('${p.id}','approve')">قبول</button>
        <button class="btn" style="padding:6px 10px" onclick="adminAction('${p.id}','reject')">رفض</button>
      </td>
    </tr>
  `).join('');
}

async function adminAction(id, action) {
  try {
    if (action === 'approve') await api(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ adminApproved: true }) });
    if (action === 'reject') await api(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ adminApproved: false, publicInMain: false }) });
    await loadAdminData();
  } catch (e) {
    alert(e.message);
  }
}

async function loadHome() {
  state.projects = await api('/api/projects');
  renderCategories();
  renderFeatured();
  renderLatestAndTop();
  const browseBtn = qs('#browseProjectsBtn');
  if (browseBtn) browseBtn.onclick = () => qs('#featured')?.scrollIntoView({ behavior: 'smooth' });
}

function attachEvents() {
  const tLogin = qs('#teacherLoginForm');
  if (tLogin) tLogin.onsubmit = teacherLogin;
  const tForm = qs('#teacherProjectForm');
  if (tForm) tForm.onsubmit = submitProject;
  const tOut = qs('#teacherLogout');
  if (tOut) tOut.onclick = teacherLogout;

  const aLogin = qs('#adminLoginForm');
  if (aLogin) aLogin.onsubmit = adminLogin;
  const aOut = qs('#adminLogout');
  if (aOut) aOut.onclick = teacherLogout;

  window.adminAction = adminAction;
}

async function init() {
  attachEvents();
  if (qs('#featuredProjects')) await loadHome();
  await renderProjectDetail();
  renderTeacherLogin();
  renderAdminLogin();
}

init();

