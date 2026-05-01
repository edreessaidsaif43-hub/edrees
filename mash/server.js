const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = ROOT;
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, oldHash] = String(stored || '').split(':');
  if (!salt || !oldHash) return false;
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(oldHash, 'hex'));
}

function send(res, code, data, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(type.includes('json') ? JSON.stringify(data) : data);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (error) { reject(error); }
    });
  });
}

function makeId(prefix = 'p') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeProject(p) {
  return {
    id: p.id,
    title: p.title || '',
    teacher: p.teacher || '',
    teacherSlug: p.teacherSlug || p.teacher_slug || '',
    school: p.school || '',
    category: p.category || '',
    subject: p.subject || '',
    grade: p.grade || '',
    description: p.description || '',
    views: Number(p.views || 0),
    featured: !!p.featured,
    latest: !!p.latest,
    weeklyTop: !!(p.weeklyTop || p.weekly_top),
    publicInMain: !!(p.publicInMain || p.public_in_main),
    adminApproved: !!(p.adminApproved || p.admin_approved),
    hidden: !!p.hidden,
    deleted: !!p.deleted,
    cover: p.cover || '',
    logo: p.logo || '',
    media: Array.isArray(p.media) ? p.media : [],
    links: Array.isArray(p.links) ? p.links : [],
    problem: p.problem || '',
    goals: Array.isArray(p.goals) ? p.goals : [],
    steps: Array.isArray(p.steps) ? p.steps : [],
    evidence: Array.isArray(p.evidence) ? p.evidence : [],
    results: p.results || '',
    recommendations: p.recommendations || '',
    createdAt: p.createdAt || p.created_at || new Date().toISOString()
  };
}

function getProjects() {
  return readJson(PROJECTS_FILE, []).map(normalizeProject);
}

function saveProjects(projects) {
  const normalized = projects.map(normalizeProject);
  writeJson(PROJECTS_FILE, normalized);
  fs.writeFileSync(path.join(DATA_DIR, 'projects-data.js'), `window.LOCAL_PROJECTS = ${JSON.stringify(normalized, null, 2)};`, 'utf8');
}

function ensureUsers() {
  const users = readJson(USERS_FILE, []);
  const hasDemo = users.some(user => user.username === 'demo.teacher');
  if (!hasDemo) {
    users.push({
      id: makeId('u'),
      username: 'demo.teacher',
      password_hash: hashPassword('demo12345'),
      password: 'demo12345',
      role: 'teacher',
      teacherSlug: 'demo-teacher',
      name: 'أ. سارة المنصوري'
    });
  }
  writeJson(USERS_FILE, users);
  return users;
}

function findUserByUsername(username) {
  return ensureUsers().find(user => String(user.username || '').toLowerCase() === String(username || '').toLowerCase());
}

function userMatchesPassword(user, password) {
  if (!user) return false;
  if (user.password_hash) return verifyPassword(password, user.password_hash);
  return String(user.password || '') === String(password || '');
}

function publicUser(user) {
  return {
    username: user.username,
    role: user.role || 'teacher',
    teacherSlug: user.teacherSlug || user.teacher_slug || 'demo-teacher',
    name: user.name || user.username
  };
}

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (reqPath === '/') reqPath = '/index.html';
  let file;
  if (reqPath.startsWith('/mash/')) {
    file = path.join(PUBLIC_DIR, reqPath.replace(/^\/mash\//, ''));
  } else if (reqPath.startsWith('/enjazy/')) {
    file = path.join(ROOT, '..', reqPath.replace(/^\//, ''));
  } else {
    file = path.join(PUBLIC_DIR, reqPath);
  }
  const allowedRoots = [PUBLIC_DIR, path.join(ROOT, '..', 'enjazy')];
  if (!allowedRoots.some(root => file.startsWith(root))) return send(res, 403, { error: 'Forbidden' });

  fs.readFile(file, (err, content) => {
    if (err) return send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  try {
    if ((url.pathname === '/api/auth/login' || url.pathname === '/enjazy/api/auth/login') && req.method === 'POST') {
      const body = await parseBody(req);
      const user = findUserByUsername(body.contact);
      if (!userMatchesPassword(user, body.password)) return send(res, 401, { error: 'invalid_credentials' });
      return send(res, 200, { userId: String(user.id || user.username), profile: { name: user.name, contact: user.username } });
    }

    if ((url.pathname === '/api/auth/register' || url.pathname === '/enjazy/api/auth/register') && req.method === 'POST') {
      const body = await parseBody(req);
      const users = ensureUsers();
      const username = String(body.contact || '').trim().toLowerCase();
      const name = String(body.name || '').trim();
      const password = String(body.password || body.newPassword || '');
      if (!username || !name) return send(res, 400, { error: 'invalid_payload' });
      if (users.some(user => String(user.username).toLowerCase() === username)) return send(res, 409, { error: 'user_exists' });
      const user = {
        id: makeId('u'),
        username,
        password_hash: hashPassword(password || '123456'),
        role: 'teacher',
        teacherSlug: username.replace(/[^a-z0-9_-]/g, '-') || makeId('teacher-'),
        name
      };
      users.push(user);
      writeJson(USERS_FILE, users);
      return send(res, 201, { userId: String(user.id), profile: { name: user.name, contact: user.username } });
    }

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const user = findUserByUsername(body.username);
      if (!userMatchesPassword(user, body.password)) return send(res, 401, { error: 'بيانات الدخول غير صحيحة' });
      const token = crypto.randomBytes(24).toString('hex');
      const sessions = readJson(SESSIONS_FILE, []);
      sessions.push({ token, username: user.username, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
      writeJson(SESSIONS_FILE, sessions);
      return send(res, 200, { token, user: publicUser(user) });
    }

    if (url.pathname === '/api/projects' && req.method === 'GET') {
      const scope = url.searchParams.get('scope') || '';
      const projects = getProjects().filter(project => !project.deleted);
      if (scope === 'mine') return send(res, 200, projects.filter(project => project.teacherSlug === 'demo-teacher'));
      if (scope === 'all') return send(res, 200, projects);
      return send(res, 200, projects.filter(project => project.publicInMain && project.adminApproved && !project.hidden));
    }

    if (url.pathname === '/api/projects' && req.method === 'POST') {
      const body = await parseBody(req);
      const projects = getProjects();
      const project = normalizeProject({
        id: makeId('p'),
        title: body.title || 'مشروع جديد',
        teacher: 'أ. سارة المنصوري',
        teacherSlug: 'demo-teacher',
        school: body.school || '',
        category: body.category || 'مشاريع إثرائية',
        subject: body.subject || '',
        grade: body.grade || '',
        description: body.description || '',
        views: 0,
        featured: false,
        latest: true,
        weeklyTop: false,
        publicInMain: !!body.publicInMain,
        adminApproved: true,
        hidden: false,
        deleted: false,
        cover: body.cover || 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80',
        logo: body.logo || '',
        media: Array.isArray(body.media) ? body.media : [],
        links: Array.isArray(body.links) ? body.links : [],
        problem: body.problem || '',
        goals: body.goals || [],
        steps: body.steps || [],
        evidence: body.evidence || [],
        results: body.results || '',
        recommendations: body.recommendations || ''
      });
      projects.unshift(project);
      saveProjects(projects);
      return send(res, 201, project);
    }

    if (url.pathname.startsWith('/api/projects/') && req.method === 'PATCH') {
      const id = url.pathname.split('/').pop();
      const body = await parseBody(req);
      const projects = getProjects();
      const index = projects.findIndex(project => project.id === id);
      if (index < 0) return send(res, 404, { error: 'المشروع غير موجود' });
      projects[index] = normalizeProject({ ...projects[index], ...body });
      saveProjects(projects);
      return send(res, 200, projects[index]);
    }

    if (url.pathname.startsWith('/api/project/') && req.method === 'GET') {
      const id = url.pathname.split('/').pop();
      const projects = getProjects();
      const index = projects.findIndex(project => project.id === id && !project.deleted);
      if (index < 0) return send(res, 404, { error: 'المشروع غير موجود' });
      projects[index].views = Number(projects[index].views || 0) + 1;
      saveProjects(projects);
      return send(res, 200, normalizeProject(projects[index]));
    }

    if (url.pathname === '/api/admin/stats' && req.method === 'GET') {
      const projects = getProjects().filter(project => !project.deleted);
      return send(res, 200, {
        total: projects.length,
        approved: projects.filter(project => project.adminApproved).length,
        pending: projects.filter(project => !project.adminApproved).length,
        publicCount: projects.filter(project => project.adminApproved && project.publicInMain && !project.hidden).length,
        featured: projects.filter(project => project.featured).length
      });
    }

    if (url.pathname === '/api/logout' && req.method === 'POST') {
      return send(res, 200, { ok: true });
    }

    serveStatic(req, res);
  } catch (error) {
    send(res, 500, { error: 'Server Error', details: error.message });
  }
});

ensureUsers();
const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});
