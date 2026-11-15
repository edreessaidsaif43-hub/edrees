import { randomUUID } from 'node:crypto';

const MAX_BYTES = 128 * 1024 * 1024;
class SheetError extends Error {}
const MAX_ROW_BYTES = 48 * 1024;

export function sheetCsvUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw Error('أدخل رابط Google Sheets صحيحًا.'); }
  const sheet = url.pathname.match(/^\/spreadsheets\/d\/(e\/)?([\w-]+)(?:\/|$)/);
  if (url.origin !== 'https://docs.google.com' || !sheet) throw Error('أدخل رابط Google Sheets صحيحًا.');
  const gid = url.searchParams.get('gid') || new URLSearchParams(url.hash.slice(1)).get('gid') || '0';
  if (!/^\d{1,12}$/.test(gid)) throw Error('معرّف ورقة العمل غير صحيح.');
  return 'https://docs.google.com/spreadsheets/d/' + (sheet[1] || '') + sheet[2] +
    (sheet[1] ? '/pub?single=true&output=csv&gid=' : '/export?format=csv&gid=') + gid;
}

async function* sheetChunks(url, fetcher) {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(48000) });
    if (!response.ok || !response.body || /text\/html/i.test(response.headers.get('content-type') || '')) {
      throw new SheetError('تعذر تنزيل الورقة. تحقق من الرابط وصلاحية العرض.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let started = false;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new SheetError('حجم الورقة أكبر من 128 ميغابايت.');
        let chunk = decoder.decode(value, { stream: true });
        if (!started) {
          chunk = chunk.trimStart();
          if (!chunk) continue;
          if (chunk.startsWith('<')) throw new SheetError('الرابط لم يُرجع بيانات CSV. تحقق من إتاحة العرض.');
          started = true;
        }
        yield chunk;
      }
      yield decoder.decode();
    } finally { await reader.cancel().catch(() => {}); }
  } catch (error) {
    if (error instanceof SheetError) throw error;
    throw new SheetError(error.name === 'TimeoutError' || error.name === 'AbortError' ? 'انتهت مهلة تنزيل الورقة.' : 'انقطع تنزيل الورقة. أعد المحاولة.');
  }
}

export async function* parseManualLessonCsv(chunks) {
  let row = [], cell = '', state = 'plain', first = true, skipLf = false, count = 0, length = 0;
  function pushCell() { row.push(cell.trim()); cell = ''; state = 'plain'; }
  function pushRow() {
    pushCell();
    const values = row;
    row = []; length = 0;
    if (!values.some(Boolean)) return;
    if (first) { first = false; return; }
    if (values.length < 5 || values.slice(0,5).some(value => !value || value.length > 350)) {
      throw new SheetError('تحقق من أعمدة الصف والمادة والفصل والوحدة والدرس في السجل رقم ' + (count + 2) + '.');
    }
    const cells = Array.from({length:16}, (_, i) => values[i] || '');
    if (Buffer.byteLength(JSON.stringify(cells)) > MAX_ROW_BYTES) throw new SheetError('يوجد درس يتجاوز حجم النص المدعوم.');
    if (++count > 20000) throw new SheetError('الحد الأقصى للملف 20 ألف درس.');
    return cells;
  }
  for await (const chunk of chunks) {
    for (const char of chunk) {
      if (skipLf) { skipLf = false; if (char === '\n') continue; }
      if (++length > 256 * 1024) throw new SheetError('يوجد صف يتجاوز الحجم المدعوم.');
      if (state === 'quoted') {
        if (char === '"') state = 'quote'; else cell += char;
        continue;
      }
      if (state === 'quote' && char === '"') { cell += char; state = 'quoted'; continue; }
      if (state === 'quote') state = 'closed';
      if (char === ',') pushCell();
      else if (char === '\r' || char === '\n') {
        skipLf = char === '\r';
        const cells = pushRow();
        if (cells) yield cells;
      } else if (char === '"' && !cell && state === 'plain') state = 'quoted';
      else if (state === 'plain') cell += char;
      else if (!/\s/.test(char)) throw new SheetError('تنسيق CSV غير صحيح.');
    }
  }
  if (state === 'quoted') throw new SheetError('لم يكتمل نص إحدى خلايا الملف.');
  if (cell || row.length || state !== 'plain') {
    const cells = pushRow();
    if (cells) yield cells;
  }
  if (!count) throw new SheetError('الورقة لا تحتوي على دروس بعد صف العناوين.');
}

export function createManualLessonHandler(sql, fetcher = fetch) {
  let schema;
  function ensure() {
    return schema ||= (async () => {
      await sql`CREATE TABLE IF NOT EXISTS manual_lesson_rows (
        version UUID NOT NULL, position INTEGER NOT NULL, cells JSONB NOT NULL,
        PRIMARY KEY (version, position)
      )`;
      await sql`CREATE TABLE IF NOT EXISTS manual_lesson_source (
        singleton BOOLEAN PRIMARY KEY CHECK (singleton), version UUID NOT NULL,
        total INTEGER NOT NULL, published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
    })().catch(error => { schema = null; throw error; });
  }
  return async (req, res, action, body, isAdmin) => {
    const fail = (status, message) => res.status(status).json({ success: false, message });
    res.setHeader('Cache-Control', 'no-store');
    if (!['manualLessonImport','manualLessonInfo','manualLessonCatalog','manualLessonRows'].includes(action)) return fail(404, 'العملية غير متاحة.');
    if ((action === 'manualLessonImport' || action === 'manualLessonInfo') && !isAdmin) return fail(401, 'سجّل الدخول إلى لوحة الإدارة أولًا.');
    if (req.method !== (action === 'manualLessonImport' ? 'POST' : 'GET')) return fail(405, 'العملية غير متاحة.');
    await ensure();
    if (action === 'manualLessonImport') {
      let url;
      try { url = sheetCsvUrl(body.url); }
      catch (error) { return fail(400, error.message); }
      let total = 0;
      const version = randomUUID();
      try {
        let batch = [], bytes = 0;
        async function save() {
          if (!batch.length) return;
          await sql`INSERT INTO manual_lesson_rows (version, position, cells)
            SELECT ${version}::uuid, position, cells
            FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS data(position integer, cells jsonb)`;
          batch = []; bytes = 0;
        }
        for await (const cells of parseManualLessonCsv(sheetChunks(url, fetcher))) {
          const record = { position: total++, cells };
          const length = Buffer.byteLength(JSON.stringify(record));
          if (bytes + length > 750000) await save();
          batch.push(record); bytes += length;
        }
        await save();
      } catch (error) {
        await sql`DELETE FROM manual_lesson_rows WHERE version = ${version}::uuid`.catch(() => {});
        if (error instanceof SheetError) return fail(400, error.message);
        throw error;
      }
      // Readers switch to the new version only after every row has been saved.
      await sql`INSERT INTO manual_lesson_source (singleton, version, total)
        VALUES (true, ${version}::uuid, ${total})
        ON CONFLICT (singleton) DO UPDATE SET version = EXCLUDED.version, total = EXCLUDED.total, published_at = NOW()`;
      return res.status(200).json({ success: true, total });
    }
    if (action === 'manualLessonInfo') {
      const [source] = await sql`SELECT total, published_at FROM manual_lesson_source WHERE singleton`;
      return res.status(200).json({ success: true, source: source || null });
    }
    const requested = String(req.query?.version || '');
    if (requested && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(requested)) return fail(400, 'إصدار البيانات غير صحيح.');
    if (action === 'manualLessonRows') {
      const ids = String(req.query?.ids || '').split(',');
      if (!requested || ids.length > 25 || ids.some(id => !/^\d{1,5}$/.test(id))) return fail(400, 'معرفات الدروس غير صحيحة.');
      const rows = await sql`SELECT position, cells FROM manual_lesson_rows WHERE version = ${requested}::uuid
        AND position IN (SELECT value::integer FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)) ORDER BY position`;
      return res.status(200).json({ success: true, rows });
    }
    const [source] = requested ? [{ version: requested }] : await sql`SELECT version FROM manual_lesson_source WHERE singleton`;
    if (!source) return res.status(200).json({ success: true, version: null, rows: [], next: null });
    const offset = Number(req.query?.offset || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 20000) return fail(400, 'صفحة البيانات غير صحيحة.');
    const rows = await sql`SELECT position, jsonb_build_array(cells->0,cells->1,cells->2,cells->3,cells->4) AS cells
      FROM manual_lesson_rows WHERE version = ${source.version}::uuid AND position >= ${offset} ORDER BY position LIMIT 501`;
    return res.status(200).json({ success: true, version: source.version, rows: rows.slice(0, 500), next: rows[500]?.position ?? null });
  };
}
