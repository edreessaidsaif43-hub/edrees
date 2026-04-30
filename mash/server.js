const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = ROOT;
const DB_FILE = path.join(DATA_DIR, 'platform.db');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(DB_FILE);

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

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
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
      catch (e) { reject(e); }
    });
  });
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

async function auth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const row = await get(
    `SELECT s.token, u.username, u.role, u.teacher_slug AS teacherSlug, u.name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`,
    [token]
  );
  return row || null;
}

async function requireAuth(req, res) {
  const user = await auth(req);
  if (!user) {
    send(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return user;
}

function makeId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function toBool(v) {
  return v === 1 || v === true;
}

function normalizeProjectRow(p) {
  return {
    id: p.id,
    title: p.title,
    teacher: p.teacher,
    teacherSlug: p.teacher_slug,
    school: p.school,
    category: p.category,
    subject: p.subject,
    grade: p.grade,
    description: p.description,
    views: p.views,
    featured: toBool(p.featured),
    latest: toBool(p.latest),
    weeklyTop: toBool(p.weekly_top),
    publicInMain: toBool(p.public_in_main),
    adminApproved: toBool(p.admin_approved),
    hidden: toBool(p.hidden),
    deleted: toBool(p.deleted),
    cover: p.cover,
    problem: p.problem,
    goals: JSON.parse(p.goals || '[]'),
    steps: JSON.parse(p.steps || '[]'),
    evidence: JSON.parse(p.evidence || '[]'),
    results: p.results,
    recommendations: p.recommendations,
    createdAt: p.created_at
  };
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    teacher_slug TEXT,
    name TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT,
    teacher TEXT,
    teacher_slug TEXT,
    school TEXT,
    category TEXT,
    subject TEXT,
    grade TEXT,
    description TEXT,
    views INTEGER DEFAULT 0,
    featured INTEGER DEFAULT 0,
    latest INTEGER DEFAULT 1,
    weekly_top INTEGER DEFAULT 0,
    public_in_main INTEGER DEFAULT 0,
    admin_approved INTEGER DEFAULT 0,
    hidden INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    cover TEXT,
    problem TEXT,
    goals TEXT,
    steps TEXT,
    evidence TEXT,
    results TEXT,
    recommendations TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  const userCount = await get('SELECT COUNT(*) AS c FROM users');
  if (!userCount || userCount.c === 0) {
    await run(
      `INSERT INTO users (username, password_hash, role, teacher_slug, name) VALUES (?, ?, 'admin', NULL, ?)` ,
      ['admin', hashPassword('admin123'), 'إدارة المنصة']
    );
    await run(
      `INSERT INTO users (username, password_hash, role, teacher_slug, name) VALUES (?, ?, 'teacher', ?, ?)` ,
      ['idrees', hashPassword('teacher123'), 'idrees', 'أ. إدريس الذيابي']
    );
    await run(
      `INSERT INTO users (username, password_hash, role, teacher_slug, name) VALUES (?, ?, 'teacher', ?, ?)` ,
      ['ahmed', hashPassword('teacher123'), 'ahmed', 'أ. أحمد سالم']
    );
  }

  const projectCount = await get('SELECT COUNT(*) AS c FROM projects');
  if ((!projectCount || projectCount.c === 0) && fs.existsSync(PROJECTS_FILE)) {
    const rawProjects = fs.readFileSync(PROJECTS_FILE, 'utf8').replace(/^\uFEFF/, '');
    const items = JSON.parse(rawProjects);
    for (const p of items) {
      await run(
        `INSERT INTO projects (
          id,title,teacher,teacher_slug,school,category,subject,grade,description,views,featured,latest,weekly_top,
          public_in_main,admin_approved,hidden,deleted,cover,problem,goals,steps,evidence,results,recommendations
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          p.id, p.title, p.teacher, p.teacherSlug, p.school, p.category, p.subject, p.grade, p.description,
          Number(p.views || 0), p.featured ? 1 : 0, p.latest ? 1 : 0, p.weeklyTop ? 1 : 0,
          p.publicInMain ? 1 : 0, p.adminApproved ? 1 : 0, p.hidden ? 1 : 0, p.deleted ? 1 : 0,
          p.cover || '', p.problem || '', JSON.stringify(p.goals || []), JSON.stringify(p.steps || []),
          JSON.stringify(p.evidence || []), p.results || '', p.recommendations || ''
        ]
      );
    }
  }

  await run(`DELETE FROM sessions WHERE expires_at <= datetime('now')`);
}

async function listProjectsFor(user, scope) {
  if (!user) {
    const rows = await all(`SELECT * FROM projects WHERE public_in_main=1 AND admin_approved=1 AND hidden=0 AND deleted=0 ORDER BY created_at DESC`);
    return rows.map(normalizeProjectRow);
  }
  if (scope === 'mine' && user.role === 'teacher') {
    const rows = await all(`SELECT * FROM projects WHERE teacher_slug=? AND deleted=0 ORDER BY created_at DESC`, [user.teacherSlug]);
    return rows.map(normalizeProjectRow);
  }
  if (scope === 'all' && user.role === 'admin') {
    const rows = await all(`SELECT * FROM projects WHERE deleted=0 ORDER BY created_at DESC`);
    return rows.map(normalizeProjectRow);
  }
  const rows = await all(`SELECT * FROM projects WHERE public_in_main=1 AND admin_approved=1 AND hidden=0 AND deleted=0 ORDER BY created_at DESC`);
  return rows.map(normalizeProjectRow);
}

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (reqPath === '/') reqPath = '/index.html';
  const file = path.join(PUBLIC_DIR, reqPath);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });

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
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { username, password } = await parseBody(req);
      const user = await get(`SELECT * FROM users WHERE username=?`, [username]);
      if (!user || !verifyPassword(password, user.password_hash)) {
        return send(res, 401, { error: 'بيانات الدخول غير صحيحة' });
      }

      const token = crypto.randomBytes(24).toString('hex');
      await run(`INSERT OR REPLACE INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))`, [token, user.id]);

      return send(res, 200, {
        token,
        user: {
          username: user.username,
          role: user.role,
          teacherSlug: user.teacher_slug,
          name: user.name
        }
      });
    }

    if (url.pathname === '/api/projects' && req.method === 'GET') {
      const user = await auth(req);
      const data = await listProjectsFor(user, url.searchParams.get('scope') || '');
      return send(res, 200, data);
    }

    if (url.pathname === '/api/projects' && req.method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'teacher') return send(res, 403, { error: 'للمعلمين فقط' });

      const body = await parseBody(req);
      const project = {
        id: makeId(),
        title: body.title || 'مشروع جديد',
        teacher: user.name,
        teacherSlug: user.teacherSlug,
        school: body.school || '',
        category: body.category || 'مشاريع إثرائية',
        subject: body.subject || '',
        grade: body.grade || '',
        description: body.description || '',
        views: 0,
        featured: 0,
        latest: 1,
        weeklyTop: 0,
        publicInMain: body.publicInMain ? 1 : 0,
        adminApproved: 0,
        hidden: 0,
        deleted: 0,
        cover: body.cover || 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80',
        problem: body.problem || '',
        goals: JSON.stringify(body.goals || []),
        steps: JSON.stringify(body.steps || []),
        evidence: JSON.stringify(body.evidence || []),
        results: body.results || '',
        recommendations: body.recommendations || ''
      };

      await run(
        `INSERT INTO projects (
          id,title,teacher,teacher_slug,school,category,subject,grade,description,views,featured,latest,weekly_top,
          public_in_main,admin_approved,hidden,deleted,cover,problem,goals,steps,evidence,results,recommendations
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          project.id, project.title, project.teacher, project.teacherSlug, project.school, project.category,
          project.subject, project.grade, project.description, project.views, project.featured, project.latest,
          project.weeklyTop, project.publicInMain, project.adminApproved, project.hidden, project.deleted,
          project.cover, project.problem, project.goals, project.steps, project.evidence, project.results, project.recommendations
        ]
      );

      const row = await get(`SELECT * FROM projects WHERE id=?`, [project.id]);
      return send(res, 201, normalizeProjectRow(row));
    }

    if (url.pathname.startsWith('/api/projects/') && req.method === 'PATCH') {
      const user = await requireAuth(req, res);
      if (!user) return;

      const id = url.pathname.split('/').pop();
      const row = await get(`SELECT * FROM projects WHERE id=?`, [id]);
      if (!row) return send(res, 404, { error: 'المشروع غير موجود' });

      const body = await parseBody(req);
      if (user.role === 'teacher') {
        if (row.teacher_slug !== user.teacherSlug) return send(res, 403, { error: 'غير مسموح' });
        await run(
          `UPDATE projects SET
            title = COALESCE(?, title),
            description = COALESCE(?, description),
            public_in_main = COALESCE(?, public_in_main)
           WHERE id=?`,
          [body.title || null, body.description || null, typeof body.publicInMain === 'boolean' ? (body.publicInMain ? 1 : 0) : null, id]
        );
      } else if (user.role === 'admin') {
        await run(
          `UPDATE projects SET
            admin_approved = COALESCE(?, admin_approved),
            featured = COALESCE(?, featured),
            hidden = COALESCE(?, hidden),
            deleted = COALESCE(?, deleted),
            public_in_main = COALESCE(?, public_in_main)
           WHERE id=?`,
          [
            typeof body.adminApproved === 'boolean' ? (body.adminApproved ? 1 : 0) : null,
            typeof body.featured === 'boolean' ? (body.featured ? 1 : 0) : null,
            typeof body.hidden === 'boolean' ? (body.hidden ? 1 : 0) : null,
            typeof body.deleted === 'boolean' ? (body.deleted ? 1 : 0) : null,
            typeof body.publicInMain === 'boolean' ? (body.publicInMain ? 1 : 0) : null,
            id
          ]
        );
      }

      const updated = await get(`SELECT * FROM projects WHERE id=?`, [id]);
      return send(res, 200, normalizeProjectRow(updated));
    }

    if (url.pathname.startsWith('/api/project/') && req.method === 'GET') {
      const id = url.pathname.split('/').pop();
      const row = await get(`SELECT * FROM projects WHERE id=? AND deleted=0`, [id]);
      if (!row) return send(res, 404, { error: 'المشروع غير موجود' });

      await run(`UPDATE projects SET views = views + 1 WHERE id=?`, [id]);
      const fresh = await get(`SELECT * FROM projects WHERE id=?`, [id]);
      return send(res, 200, normalizeProjectRow(fresh));
    }

    if (url.pathname === '/api/admin/stats' && req.method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') return send(res, 403, { error: 'غير مسموح' });

      const stats = {
        total: (await get(`SELECT COUNT(*) AS c FROM projects WHERE deleted=0`)).c,
        approved: (await get(`SELECT COUNT(*) AS c FROM projects WHERE deleted=0 AND admin_approved=1`)).c,
        pending: (await get(`SELECT COUNT(*) AS c FROM projects WHERE deleted=0 AND admin_approved=0`)).c,
        publicCount: (await get(`SELECT COUNT(*) AS c FROM projects WHERE deleted=0 AND admin_approved=1 AND public_in_main=1 AND hidden=0`)).c,
        featured: (await get(`SELECT COUNT(*) AS c FROM projects WHERE deleted=0 AND featured=1`)).c
      };
      return send(res, 200, stats);
    }

    if (url.pathname === '/api/logout' && req.method === 'POST') {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (token) await run(`DELETE FROM sessions WHERE token=?`, [token]);
      return send(res, 200, { ok: true });
    }

    serveStatic(req, res);
  } catch (err) {
    send(res, 500, { error: 'Server Error', details: err.message });
  }
});

initDb().then(() => {
  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, () => {
    console.log('Server running on http://localhost:' + PORT);
  });
}).catch((err) => {
  console.error('DB init failed:', err);
  process.exit(1);
});




