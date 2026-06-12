const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_UPLOAD_SIZE = 600 * 1024 * 1024;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'database.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function defaultDb() {
  return { nextLessonId: 1, nextAttachmentId: 1, lessons: [], attachments: [] };
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) return defaultDb();
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { ...defaultDb(), ...db, lessons: db.lessons || [], attachments: db.attachments || [] };
  } catch {
    return defaultDb();
  }
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-File-Name,X-File-Type'
  });
  res.end(body);
}

function bad(res, status, error) {
  sendJson(res, status, { error });
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('حجم الطلب كبير جدًا'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function decodeMeta(url) {
  const raw = url.searchParams.get('meta') || '';
  if (!raw) return {};
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - raw.length % 4) % 4);
  return JSON.parse(decodeURIComponent(Buffer.from(padded, 'base64').toString('utf8')));
}

function safeFileName(name) {
  return String(name || 'upload.bin').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 180);
}

function todayArabic() {
  return new Date().toLocaleDateString('ar-SA');
}

function readExtractedText(filePath, fileName, fileType, fileSize, fields) {
  const manualText = String(fields.extractedText || '').trim();
  if (manualText) return manualText;
  const ext = path.extname(fileName).toLowerCase();
  if ((ext === '.txt' || String(fileType).startsWith('text/')) && fileSize <= 2 * 1024 * 1024) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return [
    '[محتوى المرفق: ' + fileName + ']',
    'تم حفظ الملف في قاعدة البيانات بنجاح.',
    'حجم الملف: ' + (fileSize / 1048576).toFixed(1) + ' MB',
    'الوحدة: ' + (fields.unit || ''),
    'المادة: ' + (fields.subject || ''),
    'الصف: ' + (fields.grade || ''),
    '',
    'ملاحظة: لاستخراج نصوص PDF/DOCX كبيرة بدقة يمكن إضافة خدمة استخراج نصوص لاحقًا.'
  ].join('\\n');
}

function receiveUpload(req, meta) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > MAX_UPLOAD_SIZE) {
      reject(new Error('حجم الملف أكبر من 600 MB'));
      req.resume();
      return;
    }

    const originalName = safeFileName(decodeURIComponent(req.headers['x-file-name'] || 'upload.bin'));
    const fileType = decodeURIComponent(req.headers['x-file-type'] || 'application/octet-stream');
    const storedName = Date.now() + '-' + Math.round(Math.random() * 1e9) + '-' + originalName;
    const absolutePath = path.join(UPLOAD_DIR, storedName);
    const relativePath = path.relative(ROOT, absolutePath);
    const out = fs.createWriteStream(absolutePath);
    let size = 0;
    let failed = false;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_UPLOAD_SIZE) {
        failed = true;
        out.destroy();
        fs.rm(absolutePath, { force: true }, () => {});
        reject(new Error('حجم الملف أكبر من 600 MB'));
        req.destroy();
        return;
      }
      out.write(chunk);
    });

    req.on('end', () => {
      if (failed) return;
      out.end(() => {
        resolve({
          fileName: originalName,
          fileType,
          fileSize: size,
          filePath: relativePath,
          extractedText: readExtractedText(absolutePath, originalName, fileType, size, meta)
        });
      });
    });
    req.on('error', err => {
      fs.rm(absolutePath, { force: true }, () => {});
      reject(err);
    });
  });
}

function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const requested = path.normalize(path.join(ROOT, pathname));
  if (!requested.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(requested, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(requested).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.pdf': 'application/pdf'
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

async function handleApi(req, res, url) {
  const db = loadDb();

  if (req.method === 'GET' && url.pathname === '/api/lessons') {
    sendJson(res, 200, { lessons: db.lessons.slice().reverse(), attachments: db.attachments.slice().reverse() });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/lessons/single') {
    const meta = decodeMeta(url);
    const { grade, subject, semester, unit, title, status = 'active' } = meta;
    if (!grade || !subject || !semester || !unit || !title) return bad(res, 400, 'يرجى تعبئة جميع الحقول المطلوبة');
    const upload = await receiveUpload(req, meta);
    const attachmentId = db.nextAttachmentId++;
    db.attachments.push({
      id: attachmentId,
      title: unit + ' - ' + title,
      fileName: upload.fileName,
      fileType: upload.fileType,
      fileSize: upload.fileSize,
      filePath: upload.filePath,
      extractedText: upload.extractedText,
      createdAt: new Date().toISOString()
    });
    db.lessons.push({
      id: db.nextLessonId++,
      grade, subject, semester, unit, title,
      attachmentId,
      status,
      createdAt: todayArabic()
    });
    saveDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/lessons/multi') {
    const meta = decodeMeta(url);
    const { grade, subject, semester, unit } = meta;
    const titles = Array.isArray(meta.titles) ? meta.titles.map(t => String(t).trim()).filter(Boolean) : [];
    if (!grade || !subject || !semester || !unit || titles.length === 0) return bad(res, 400, 'يرجى تعبئة البيانات وإضافة درس واحد على الأقل');
    const upload = await receiveUpload(req, meta);
    const attachmentId = db.nextAttachmentId++;
    db.attachments.push({
      id: attachmentId,
      title: unit,
      fileName: upload.fileName,
      fileType: upload.fileType,
      fileSize: upload.fileSize,
      filePath: upload.filePath,
      extractedText: upload.extractedText,
      createdAt: new Date().toISOString()
    });
    titles.forEach(title => db.lessons.push({
      id: db.nextLessonId++,
      grade, subject, semester, unit, title,
      attachmentId,
      status: 'active',
      createdAt: todayArabic()
    }));
    saveDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  const lessonMatch = url.pathname.match(/^\/api\/lessons\/(\d+)$/);
  if (lessonMatch && req.method === 'PUT') {
    const id = Number(lessonMatch[1]);
    const lesson = db.lessons.find(l => l.id === id);
    if (!lesson) return bad(res, 404, 'لم يتم العثور على الدرس');
    const body = JSON.parse(await readBody(req) || '{}');
    if (typeof body.title === 'string') lesson.title = body.title;
    if (typeof body.unit === 'string') lesson.unit = body.unit;
    if (typeof body.status === 'string') lesson.status = body.status;
    saveDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (lessonMatch && req.method === 'DELETE') {
    const id = Number(lessonMatch[1]);
    const lesson = db.lessons.find(l => l.id === id);
    if (!lesson) return bad(res, 404, 'لم يتم العثور على الدرس');
    db.lessons = db.lessons.filter(l => l.id !== id);
    const stillUsed = db.lessons.some(l => l.attachmentId === lesson.attachmentId);
    if (!stillUsed) {
      const attachment = db.attachments.find(a => a.id === lesson.attachmentId);
      if (attachment) {
        const filePath = path.join(ROOT, attachment.filePath);
        if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
      }
      db.attachments = db.attachments.filter(a => a.id !== lesson.attachmentId);
    }
    saveDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/export') {
    sendJson(res, 200, { lessons: db.lessons, attachments: db.attachments, exportedAt: new Date().toISOString() });
    return;
  }

  bad(res, 404, 'المسار غير موجود');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    bad(res, err.message.includes('600 MB') ? 413 : 500, err.message || 'حدث خطأ في الخادم');
  }
});

server.listen(PORT, HOST, () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter(info => info.family === 'IPv4' && !info.internal)
    .map(info => 'http://' + info.address + ':' + PORT);
  console.log('AI lesson system running at http://localhost:' + PORT);
  if (addresses.length) console.log('Network access: ' + addresses.join(' | '));
});
