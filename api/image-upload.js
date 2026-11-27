import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import { isTeacherSessionOrigin, readTeacherSession } from '../enjazy/server_api/_lib/teacher-session.js';

export const config = { api: { bodyParser: false } };

const maxBytes = 4 * 1024 * 1024;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const formats = new Map([
  ['image/jpeg', { extension: 'jpg', valid: data => data.length >= 4 && data.readUIntBE(0, 3) === 0xffd8ff }],
  ['image/png', { extension: 'png', valid: data => data.length >= 24 && data.subarray(0, 8).equals(pngSignature) && data.toString('ascii', 12, 16) === 'IHDR' }],
  ['image/gif', { extension: 'gif', valid: data => data.length >= 13 && /^GIF8[79]a$/.test(data.toString('ascii', 0, 6)) }],
  ['image/webp', { extension: 'webp', valid: data => data.length >= 20 && data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(data.toString('ascii', 12, 16)) }]
]);

export function createImageUploadHandler({ readSession = readTeacherSession, store = put } = {}) {
  return async (req, res) => {
    const fail = (status, message) => res.status(status).json({ message });
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return fail(405, 'العملية غير متاحة.');
    }
    if (!isTeacherSessionOrigin(req)) return fail(403, 'افتح صفحة رفع الصور من التحضير الذكي.');
    try {
      if (!await readSession(req, res)) return fail(401, 'سجّل الدخول للرفع.');
    } catch {
      return fail(503, 'تعذّر التحقق من تسجيل الدخول. حاول مجددًا.');
    }
    if (req.method === 'GET') return res.status(200).json({ signedIn: true });

    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const format = formats.get(type);
    if (!format) return fail(415, 'صيغة الصورة غير مدعومة.');
    const tooLarge = () => fail(413, 'الحد الأقصى لكل صورة 4 ميغابايت.');
    if (Number(req.headers['content-length']) > maxBytes) return tooLarge();

    const chunks = [];
    let bytes = 0;
    try {
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        bytes += chunk.length;
        if (bytes > maxBytes) return tooLarge();
        chunks.push(chunk);
      }
    } catch {
      return fail(400, 'تعذّرت قراءة الصورة المرسلة.');
    }
    const content = Buffer.concat(chunks, bytes);
    if (!format.valid(content)) return fail(415, 'تعذّر التحقق من نوع الصورة.');

    try {
      const blob = await store('img/' + randomUUID() + '.' + format.extension, content, {
        access: 'public',
        contentType: type
      });
      return res.status(201).json({ url: blob.url });
    } catch {
      return fail(503, 'خدمة تخزين الصور غير متاحة الآن. حاول مجددًا.');
    }
  };
}

export default createImageUploadHandler();
