const state = {
  projects: [],
  teacherProjects: [],
  filteredCategory: "الكل",
  user: JSON.parse(localStorage.getItem('tp_user') || 'null'),
  token: localStorage.getItem('tp_token') || '',
  editingProjectId: '',
  editingProjectMedia: []
};
const builderAssets = {
  cover: '',
  logo: ''
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

const UNIFIED_SESSION_KEY = 'enjazy_session_v1';
const UNIFIED_PROFILE_KEY = 'lesson_platform_backend_session_v1';
const OWNER_TOKEN_KEY = 'mash_owner_token_v1';

function readUnifiedSession() {
  let userId = '';
  let email = '';
  let name = '';
  try {
    const raw = localStorage.getItem(UNIFIED_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    userId = String(parsed?.userId || '').trim();
  } catch {}
  try {
    const rawProfile = localStorage.getItem(UNIFIED_PROFILE_KEY);
    const profile = rawProfile ? JSON.parse(rawProfile) : null;
    email = String(profile?.email || '').trim();
    name = String(profile?.full_name || '').trim();
    userId = userId || String(profile?.userId || '').trim();
  } catch {}
  if (!userId && !email) return null;
  return {
    username: email || userId,
    role: 'teacher',
    teacherSlug: 'demo-teacher',
    name: name || email || 'مستخدم التحضير الذكي'
  };
}

function ensureUnifiedUser() {
  const unifiedUser = readUnifiedSession();
  if (!unifiedUser) return null;
  state.user = unifiedUser;
  return unifiedUser;
}


function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadProjectFile(file, purpose = 'media') {
  const isVideo = file.type.startsWith('video/');

  // Base64 يزيد الحجم ~33%، وفيرسل يرفض أي body أكبر من 4.5MB.
  // نضع حدًا محافظًا لتفادي 413 قبل وصول الطلب للخادم.
  const maxBinaryBytes = isVideo ? 2 * 1024 * 1024 : 2 * 1024 * 1024;
  if (file.size > maxBinaryBytes) {
    throw new Error(`الملف ${file.name} كبير جدًا للرفع المباشر. الحد الحالي 2MB. للملفات الأكبر استخدم رابطًا في حقل روابط المشروع.`);
  }

  const dataUrl = await readFileAsDataUrl(file);
  const base64Data = String(dataUrl).includes(',') ? String(dataUrl).split(',')[1] : '';
  if (!base64Data) throw new Error(`تعذر قراءة الملف ${file.name}`);

  const approxPayloadBytes = base64Data.length + 2000;
  if (approxPayloadBytes > 4.3 * 1024 * 1024) {
    throw new Error(`الملف ${file.name} سيتجاوز حد الرفع في Vercel. قلل الحجم أو استخدم رابطًا مباشرًا.`);
  }

  const res = await fetch(apiUrl('/api/media/upload'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      base64Data,
      kind: isVideo ? 'video' : 'image'
    })
  });

  const payload = await res.json().catch(async () => ({ message: await res.text().catch(() => '') }));
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(`الملف ${file.name} تجاوز الحد المسموح للرفع (Vercel 4.5MB). استخدم صورة أصغر أو رابط فيديو.`);
    }
    throw new Error(payload.message || payload.error || `تعذر رفع الملف (${res.status})`);
  }

  return {
    url: payload.mediaUrl,
    id: payload.mediaFileId,
    name: payload.mediaName || file.name
  };
}

async function fileToMediaItem(file) {
  const uploaded = await uploadProjectFile(file, file.type.startsWith('video/') ? 'video' : 'image');
  return {
    name: file.name,
    type: file.type.startsWith('video/') ? 'video' : 'image',
    src: uploaded.url
  };
}

function renderMediaGallery(media = []) {
  const items = Array.isArray(media) ? media : [];
  if (!items.length) return '';
  return `
    <h3>معرض الصور والفيديوهات</h3>
    <div class="media-grid">
      ${items.map(item => item.type === 'video'
        ? `<video src="${item.src}" controls preload="metadata"></video>`
        : `<img src="${item.src}" alt="${item.name || 'صورة المشروع'}">`
      ).join('')}
    </div>`;
}

function normalizeUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) return trimmed;
  return `https://${trimmed}`;
}

function parseProjectLinks(value) {
  return String(value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split('|').map(part => part.trim()).filter(Boolean);
      const url = normalizeUrl(parts.length > 1 ? parts.pop() : parts[0]);
      const title = parts.length ? parts.join(' | ') : `رابط ${index + 1}`;
      return url ? { title, url } : null;
    })
    .filter(Boolean);
}

function renderProjectLinks(links = []) {
  const items = Array.isArray(links) ? links : [];
  if (!items.length) return '';
  return `
    <h3>روابط المشروع</h3>
    <div class="links-grid">
      ${items.map(link => `<a class="project-link" href="${normalizeUrl(link.url)}" target="_blank" rel="noopener noreferrer">${link.title || link.url}</a>`).join('')}
    </div>`;
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

function ownerHeaders() {
  const token = localStorage.getItem(OWNER_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toTeacherSlug(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '');
  return raw || 'demo-teacher';
}

function apiUrl(path) {
  if (path.startsWith('/api/mash?action=')) return path;
  if (path === '/api/projects') return '/api/mash?action=projects';
  if (path.startsWith('/api/projects?')) return path.replace('/api/projects?', '/api/mash?action=projects&');
  if (path.startsWith('/api/project/')) return `/api/mash?action=project&id=${encodeURIComponent(path.split('/').pop())}`;
  if (path.startsWith('/api/projects/')) return `/api/mash?action=project&id=${encodeURIComponent(path.split('/').pop())}`;
  if (path === '/api/admin/stats') return '/api/mash?action=stats';
  if (path === '/api/owner/login') return '/api/mash?action=owner-login';
  return path;
}

async function api(path, options = {}) {
  const url = apiUrl(path);
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const e = await res.json().catch(async () => ({ message: await res.text().catch(() => '') }));
    const details = e.message || e.error || 'خطأ في الطلب';
    throw new Error(`${details} (HTTP ${res.status}) [${url}]`);
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
      ${p.logo ? `<img class="project-logo" src="${p.logo}" alt="شعار ${p.title}">` : ''}
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
  const source = getPublicApprovedProjects();
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
    renderProjectPage(page, p);
  } catch {
    page.innerHTML = '<section class="section"><div class="container panel">تعذر تحميل المشروع من قاعدة البيانات. تأكد من إعداد MASH_DATABASE_URL وتشغيل الخادم.</div></section>';
  }
}

function renderProjectPage(page, p) {
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
              ${renderMediaGallery(p.media)}
              ${renderProjectLinks(p.links)}
              <h3>النتائج والأثر</h3><p>${p.results || ''}</p>
              <h3>التوصيات</h3><p>${p.recommendations || ''}</p>
            </div>
          </div>
          <aside class="panel">
            ${p.logo ? `<img class="detail-logo" src="${p.logo}" alt="شعار ${p.title}">` : ''}
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
              <a class="btn btn-dark" href="teacher.html?slug=${encodeURIComponent(p.teacherSlug || '')}">رابط موقع المعلم</a>
              <button class="btn" style="background:#f0f9ff;color:#0b4f78;" onclick="navigator.clipboard.writeText(location.href);alert('تم نسخ الرابط')">مشاركة المشروع</button>
            </div>
          </aside>
        </div>
      </section>`;
}

function isTeacherPublicMode() {
  const pageHasPublicView = !!qs('#teacherPublicView');
  const slug = String(getQueryParam('slug') || '').trim();
  return pageHasPublicView && !!slug;
}

async function renderTeacherPublicSite() {
  const slug = String(getQueryParam('slug') || '').trim();
  const publicView = qs('#teacherPublicView');
  const publicProjects = qs('#teacherPublicProjects');
  const publicName = qs('#teacherPublicName');
  const publicBio = qs('#teacherPublicBio');
  if (!publicView || !publicProjects || !slug) return;

  publicView.style.display = 'block';
  publicProjects.innerHTML = '<p>جار تحميل مشاريع المعلم...</p>';
  try {
    const allProjects = await api('/api/projects?scope=all');
    const visible = (allProjects || []).filter((p) =>
      String(p.teacherSlug || '').trim() === slug &&
      p.adminApproved &&
      p.publicInMain &&
      !p.hidden &&
      !p.deleted
    );

    const teacherName = visible[0]?.teacher || `المعلم ${slug}`;
    const teacherSchool = visible[0]?.school || '';
    if (publicName) publicName.textContent = teacherName;
    if (publicBio) {
      publicBio.textContent = teacherSchool
        ? `صفحة عامة لمشاريع ${teacherName} - ${teacherSchool}`
        : `صفحة عامة لمشاريع ${teacherName}`;
    }
    publicProjects.innerHTML = visible.map(projectCard).join('') || '<p>لا توجد مشاريع عامة لهذا المعلم حاليًا.</p>';
  } catch (error) {
    publicProjects.innerHTML = `<p>تعذر تحميل موقع المعلم: ${error.message || 'خطأ غير معروف'}</p>`;
  }
}

function renderTeacherLogin() {
  const loginBox = qs('#teacherLogin');
  const userBox = qs('#teacherUserBox');
  const formBox = qs('#teacherFormWrap');
  const listBox = qs('#teacherProjectsList');
  const publicView = qs('#teacherPublicView');
  const topProjectsLink = qs('#myProjectsTopLink');
  if (!loginBox) return;

  if (isTeacherPublicMode()) {
    loginBox.style.display = 'none';
    if (userBox) userBox.style.display = 'none';
    if (formBox) formBox.style.display = 'none';
    if (listBox) listBox.style.display = 'none';
    if (publicView) publicView.style.display = 'block';
    if (topProjectsLink) topProjectsLink.style.display = 'none';
    renderTeacherPublicSite();
    return;
  }

  const user = ensureUnifiedUser();
  if (publicView) publicView.style.display = 'none';
  if (topProjectsLink) topProjectsLink.style.display = user ? 'inline-flex' : 'none';
  loginBox.style.display = user ? 'none' : 'block';
  userBox.style.display = user ? 'block' : 'none';
  formBox.style.display = user ? 'block' : 'none';
  listBox.style.display = user ? 'block' : 'none';
  if (!user) return;

  qs('#teacherWelcome').textContent = `${state.user.name} (${state.user.username})`;
  loadTeacherProjects();
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
    state.teacherProjects = Array.isArray(projects) ? projects : [];
    wrap.innerHTML = state.teacherProjects.map(p => `
      <div class="panel" style="margin-bottom:10px;">
        <strong>${p.title}</strong><br>
        <small>اعتماد الإدارة: ${p.adminApproved ? 'معتمد' : 'قيد المراجعة'} | الظهور: ${p.publicInMain ? 'عام' : 'داخل موقعي'}</small>
        <div class="actions" style="margin-top:8px;">
          <button class="btn" style="padding:6px 10px;background:#ecfeff;color:#155e75;" onclick="startEditProject('${p.id}')">تعديل</button>
        </div>
      </div>`).join('') || '<p>لا توجد مشاريع بعد.</p>';
  } catch {
    state.teacherProjects = [];
    wrap.innerHTML = '<p>تعذر تحميل المشاريع.</p>';
  }
}

function setEditMode(project) {
  state.editingProjectId = String(project?.id || '');
  state.editingProjectMedia = Array.isArray(project?.media) ? [...project.media] : [];
  builderAssets.cover = project?.cover || '';
  builderAssets.logo = project?.logo || '';

  qs('#title').value = project?.title || '';
  qs('#school').value = project?.school || '';
  qs('#category').value = project?.category || 'مشاريع علاجية';
  qs('#subject').value = project?.subject || '';
  qs('#grade').value = project?.grade || '';
  qs('#description').value = project?.description || '';
  qs('#problem').value = project?.problem || '';
  qs('#goals').value = Array.isArray(project?.goals) ? project.goals.join('\n') : '';
  qs('#steps').value = Array.isArray(project?.steps) ? project.steps.join('\n') : '';
  qs('#evidence').value = Array.isArray(project?.evidence) ? project.evidence.join('\n') : '';
  qs('#results').value = project?.results || '';
  qs('#recommendations').value = project?.recommendations || '';
  qs('#links').value = Array.isArray(project?.links)
    ? project.links.map((l) => `${l?.title || ''} | ${l?.url || ''}`).join('\n')
    : '';
  if (project?.publicInMain) qs('#publicYes').checked = true;
  else qs('#publicNo').checked = true;

  const submitBtn = qs('#projectSubmitBtn');
  const cancelBtn = qs('#editCancelBtn');
  if (submitBtn) submitBtn.textContent = 'حفظ التعديلات';
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
  updateProjectPreview();
  qs('#teacherFormWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearEditMode(resetForm = false) {
  state.editingProjectId = '';
  state.editingProjectMedia = [];
  const submitBtn = qs('#projectSubmitBtn');
  const cancelBtn = qs('#editCancelBtn');
  if (submitBtn) submitBtn.textContent = 'نشر الصفحة';
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (resetForm) {
    qs('#teacherProjectForm')?.reset();
    builderAssets.cover = '';
    builderAssets.logo = '';
    updateProjectPreview();
  }
}

function startEditProject(projectId) {
  const project = state.teacherProjects.find((p) => String(p.id) === String(projectId));
  if (!project) {
    alert('تعذر العثور على المشروع.');
    return;
  }
  setEditMode(project);
}

async function submitProject(ev) {
  ev.preventDefault();
  const unifiedUser = ensureUnifiedUser();
  if (!unifiedUser) {
    alert('يرجى تسجيل الدخول أولاً من صفحة التسجيل الموحد.');
    return;
  }
  const coverFile = qs('#coverFile')?.files?.[0];
  const logoFile = qs('#logoFile')?.files?.[0];
  const imageFiles = [...(qs('#imageFiles')?.files || [])].slice(0, 6);
  const videoFiles = [...(qs('#videoFiles')?.files || [])].slice(0, 2);
  const mediaFiles = [...imageFiles, ...videoFiles].slice(0, 8);
  let cover = '';
  let logo = '';
  const media = [];
  const uploadWarnings = [];

  if (coverFile) {
    try {
      cover = (await uploadProjectFile(coverFile, 'cover')).url;
    } catch (error) {
      uploadWarnings.push(`تعذر رفع صورة الغلاف: ${error.message || 'خطأ غير معروف'}`);
    }
  }

  if (logoFile) {
    try {
      logo = (await uploadProjectFile(logoFile, 'logo')).url;
    } catch (error) {
      uploadWarnings.push(`تعذر رفع الشعار: ${error.message || 'خطأ غير معروف'}`);
    }
  }

  for (const file of mediaFiles) {
    try {
      media.push(await fileToMediaItem(file));
    } catch (error) {
      uploadWarnings.push(`تعذر رفع ${file.name}: ${error.message || 'خطأ غير معروف'}`);
    }
  }
  const payload = {
    teacher: unifiedUser.name || unifiedUser.username || 'المعلم',
    teacherSlug: toTeacherSlug(unifiedUser.username || unifiedUser.name),
    title: qs('#title').value,
    school: qs('#school').value,
    category: qs('#category').value,
    subject: qs('#subject').value,
    grade: qs('#grade').value,
    description: qs('#description').value,
    cover,
    problem: qs('#problem').value,
    results: qs('#results').value,
    recommendations: qs('#recommendations').value,
    logo,
    media: [...state.editingProjectMedia, ...media],
    links: parseProjectLinks(qs('#links').value),
    publicInMain: qs('#publicYes').checked,
    goals: qs('#goals').value.split('\n').map(s => s.trim()).filter(Boolean),
    steps: qs('#steps').value.split('\n').map(s => s.trim()).filter(Boolean),
    evidence: qs('#evidence').value.split('\n').map(s => s.trim()).filter(Boolean)
  };
  const editingId = state.editingProjectId;
  try {
    if (editingId) {
      await api(`/api/projects/${editingId}`, {
        method: 'PATCH',
        headers: { 'x-teacher-slug': toTeacherSlug(unifiedUser.username || unifiedUser.name) },
        body: JSON.stringify(payload)
      });
    } else {
      await api('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
    }
    clearEditMode(true);
    if (uploadWarnings.length) {
      alert(`تم حفظ المشروع، لكن بعض الوسائط لم تُرفع:\n- ${uploadWarnings.join('\n- ')}`);
    } else {
      alert(editingId ? 'تم حفظ التعديلات بنجاح' : 'تم نشر صفحة المشروع بنجاح');
    }
    loadTeacherProjects();
  } catch (e) {
    alert(e.message);
  }
}

async function teacherLogout() {
  try { if (state.token) await api('/api/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem('tp_token');
  localStorage.removeItem('tp_user');
  localStorage.removeItem(UNIFIED_SESSION_KEY);
  localStorage.removeItem(UNIFIED_PROFILE_KEY);
  state.token = '';
  state.user = null;
  renderTeacherLogin();
  renderAdminLogin();
}

function textLines(selector) {
  return String(qs(selector)?.value || '').split('\n').map(line => line.trim()).filter(Boolean);
}

function updateProjectPreview() {
  const preview = qs('#projectPreview');
  if (!preview) return;
  const title = qs('#title')?.value || 'اسم المشروع';
  const category = qs('#category')?.value || 'مشاريع علاجية';
  const school = qs('#school')?.value || 'المدرسة';
  const subject = qs('#subject')?.value || 'المادة';
  const grade = qs('#grade')?.value || 'الصف';
  const description = qs('#description')?.value || 'اكتب وصفًا مختصرًا ليظهر هنا في معاينة صفحة المشروع.';
  const tone = qs('#pageTone')?.value || 'emerald';
  const goals = textLines('#goals').slice(0, 4);
  const links = parseProjectLinks(qs('#links')?.value || '');
  const imageCount = qs('#imageFiles')?.files?.length || 0;
  const videoCount = qs('#videoFiles')?.files?.length || 0;
  const mediaCount = imageCount + videoCount;

  preview.className = `preview-page tone-${tone}`;
  const cover = preview.querySelector('.preview-cover');
  if (cover) cover.style.background = builderAssets.cover ? `url("${builderAssets.cover}") center/cover` : '';
  const logo = preview.querySelector('.preview-logo');
  if (logo) logo.innerHTML = builderAssets.logo ? `<img src="${builderAssets.logo}" alt="شعار المشروع">` : 'شعار';
  const chip = preview.querySelector('.preview-chip');
  if (chip) chip.textContent = category;
  const heading = preview.querySelector('.preview-content h2');
  if (heading) heading.textContent = title;
  const paragraph = preview.querySelector('.preview-content > p');
  if (paragraph) paragraph.textContent = description;
  const meta = preview.querySelectorAll('.preview-meta span');
  if (meta[0]) meta[0].textContent = school;
  if (meta[1]) meta[1].textContent = subject;
  if (meta[2]) meta[2].textContent = grade;
  const goalsList = preview.querySelector('.preview-section ul');
  if (goalsList) {
    goalsList.innerHTML = (goals.length ? goals : ['سيتم عرض الأهداف هنا أثناء الكتابة.']).map(item => `<li>${item}</li>`).join('');
  }
  const summary = preview.querySelectorAll('.preview-section p')[0];
  if (summary) summary.textContent = `${links.length} رابط منشور، و${mediaCount} ملف وسائط محدد (${imageCount} صورة، ${videoCount} فيديو).`;
}

async function updatePreviewImage(inputId, key) {
  const file = qs(inputId)?.files?.[0];
  builderAssets[key] = file ? await readFileAsDataUrl(file) : '';
  updateProjectPreview();
}

function attachBuilderPreview() {
  const form = qs('#teacherProjectForm');
  if (!form) return;
  form.querySelectorAll('input, textarea, select').forEach((field) => {
    field.addEventListener('input', updateProjectPreview);
    field.addEventListener('change', updateProjectPreview);
  });
  qs('#coverFile')?.addEventListener('change', () => updatePreviewImage('#coverFile', 'cover'));
  qs('#logoFile')?.addEventListener('change', () => updatePreviewImage('#logoFile', 'logo'));
  updateProjectPreview();
}

function renderAdminLogin() {
  const loginBox = qs('#adminLogin');
  const panel = qs('#adminPanel');
  if (!loginBox) return;
  const hasOwnerToken = !!localStorage.getItem(OWNER_TOKEN_KEY);
  loginBox.style.display = hasOwnerToken ? 'none' : 'block';
  panel.style.display = hasOwnerToken ? 'block' : 'none';
  if (!hasOwnerToken) return;
  loadAdminData();
}

async function adminLogin(ev) {
  ev.preventDefault();
  const password = qs('#ownerPassword').value.trim();
  const msg = qs('#ownerLoginMsg');
  if (msg) msg.textContent = 'جار التحقق من كلمة المرور...';
  try {
    const data = await api('/api/owner/login', { method: 'POST', body: JSON.stringify({ password }) });
    localStorage.setItem(OWNER_TOKEN_KEY, data.token);
    if (msg) msg.textContent = '';
    renderAdminLogin();
  } catch (e) {
    if (msg) msg.textContent = location.protocol.startsWith('file')
      ? 'شغّل الخادم أولاً ثم افتح http://localhost:3000/admin.html'
      : (e.message || 'تعذر دخول لوحة الإدارة');
  }
}

async function loadAdminData() {
  try {
    var stats = await api('/api/admin/stats', { headers: ownerHeaders() });
  } catch (error) {
    localStorage.removeItem(OWNER_TOKEN_KEY);
    renderAdminLogin();
    return;
  }
  qs('#kTotal').textContent = stats.total;
  qs('#kApproved').textContent = stats.approved;
  qs('#kPending').textContent = stats.pending;
  qs('#kPublic').textContent = stats.publicCount;

  const projects = await api('/api/projects?scope=all', { headers: ownerHeaders() });
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
    if (action === 'approve') await api(`/api/projects/${id}`, { method: 'PATCH', headers: ownerHeaders(), body: JSON.stringify({ adminApproved: true }) });
    if (action === 'reject') await api(`/api/projects/${id}`, { method: 'PATCH', headers: ownerHeaders(), body: JSON.stringify({ adminApproved: false, publicInMain: false }) });
    await loadAdminData();
  } catch (e) {
    alert(e.message);
  }
}

async function loadHome() {
  let loadError = null;
  try {
    state.projects = await api('/api/projects');
  } catch (error) {
    loadError = error;
    state.projects = [];
  }
  renderCategories();
  renderFeatured();
  renderLatestAndTop();
  if (loadError) {
    const featured = qs('#featuredProjects');
    if (featured) featured.innerHTML = '<p>تعذر تحميل المشاريع من قاعدة البيانات. تأكد من إعداد MASH_DATABASE_URL وتشغيل الخادم.</p>';
  }
  const browseBtn = qs('#browseProjectsBtn');
  if (browseBtn) browseBtn.onclick = () => qs('#featured')?.scrollIntoView({ behavior: 'smooth' });
}

function attachEvents() {
  const tLogin = qs('#teacherLoginForm');
  if (tLogin) tLogin.onsubmit = teacherLogin;
  const tForm = qs('#teacherProjectForm');
  if (tForm) tForm.onsubmit = submitProject;
  const topProjectsLink = qs('#myProjectsTopLink');
  if (topProjectsLink) {
    topProjectsLink.onclick = (ev) => {
      ev.preventDefault();
      qs('#teacherProjectsList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }
  const editCancel = qs('#editCancelBtn');
  if (editCancel) editCancel.onclick = () => clearEditMode(true);
  attachBuilderPreview();
  const tOut = qs('#teacherLogout');
  if (tOut) tOut.onclick = teacherLogout;

  const aLogin = qs('#adminLoginForm');
  if (aLogin) aLogin.onsubmit = adminLogin;
  const ownerLogin = qs('#ownerLoginForm');
  if (ownerLogin) ownerLogin.onsubmit = adminLogin;
  const aOut = qs('#adminLogout');
  if (aOut) aOut.onclick = () => {
    localStorage.removeItem(OWNER_TOKEN_KEY);
    renderAdminLogin();
  };

  window.adminAction = adminAction;
  window.startEditProject = startEditProject;
}

async function init() {
  attachEvents();
  if (qs('#featuredProjects')) await loadHome();
  await renderProjectDetail();
  renderTeacherLogin();
  renderAdminLogin();
}

init();










