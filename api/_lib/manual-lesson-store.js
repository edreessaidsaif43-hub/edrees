import { randomUUID } from 'node:crypto';

import { MAX_BYTES, MAX_ROW_BYTES, SheetError, parseManualLessonCsv } from '../../assets/manual-lesson-csv.js';

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
      await sql`CREATE TABLE IF NOT EXISTS manual_lesson_uploads (
        version UUID PRIMARY KEY, received INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0
      )`;
    })().catch(error => { schema = null; throw error; });
  }
  return async (req, res, action, body, isAdmin) => {
    const fail = (status, message) => res.status(status).json({ success: false, message });
    res.setHeader('Cache-Control', 'no-store');
    const upload = ['manualUploadBegin','manualUploadBatch','manualUploadCommit','manualUploadCancel'].includes(action);
    if (!upload && !['manualLessonImport','manualLessonInfo','manualLessonCatalog','manualLessonRows'].includes(action)) return fail(404, 'العملية غير متاحة.');
    if ((upload || action === 'manualLessonImport' || action === 'manualLessonInfo') && !isAdmin) return fail(401, 'سجّل الدخول إلى لوحة الإدارة أولًا.');
    if (req.method !== (upload || action === 'manualLessonImport' ? 'POST' : 'GET')) return fail(405, 'العملية غير متاحة.');
    await ensure();
    if (action === 'manualUploadBegin') {
      const version = randomUUID();
      await sql`INSERT INTO manual_lesson_uploads (version) VALUES (${version}::uuid)`;
      return res.status(201).json({ success: true, version });
    }
    if (action.startsWith('manualUpload')) {
      const version = String(body.version || '');
      if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(version)) return fail(400, 'معرّف الرفع غير صحيح.');
      if (action === 'manualUploadBatch') {
        const { offset, rows } = body;
        if (!Number.isInteger(offset) || offset < 0 || !Array.isArray(rows) || !rows.length || rows.length > 250 || offset + rows.length > 20000) return fail(400, 'دفعة الدروس غير صحيحة.');
        if (rows.some(row => !Array.isArray(row) || row.length !== 16 || row.some(cell => typeof cell !== 'string') ||
          row.slice(0, 5).some(cell => !cell.trim() || cell.length > 350) || Buffer.byteLength(JSON.stringify(row)) > MAX_ROW_BYTES)) {
          return fail(400, 'تحقق من أعمدة الصف والمادة والفصل والوحدة والدرس وحجم النص.');
        }
        const payload = JSON.stringify(rows);
        const bytes = Buffer.byteLength(payload);
        if (bytes > 750000) return fail(413, 'تجاوزت دفعة الدروس الحجم المدعوم.');
        // Advancing the cursor and inserting its rows must succeed together.
        const [result] = await sql`WITH claimed AS (
          UPDATE manual_lesson_uploads SET received = received + ${rows.length}, bytes = bytes + ${bytes}
          WHERE version = ${version}::uuid AND received = ${offset} AND bytes + ${bytes} <= ${MAX_BYTES}
          RETURNING version
        ), saved AS (
          INSERT INTO manual_lesson_rows (version, position, cells)
          SELECT claimed.version, (${offset}::integer + item.ordinality - 1)::integer, item.cells
          FROM claimed CROSS JOIN jsonb_array_elements(${payload}::jsonb) WITH ORDINALITY AS item(cells, ordinality)
          RETURNING position
        ) SELECT count(*) AS count FROM saved`;
        if (Number(result.count) !== rows.length) return fail(409, 'تعذّر اعتماد الدفعة أو تجاوز الملف الحد. أعد رفع الملف.');
        return res.status(200).json({ success: true });
      }
      if (action === 'manualUploadCancel') {
        await sql`WITH cancelled AS (
          DELETE FROM manual_lesson_uploads WHERE version = ${version}::uuid RETURNING version
        ) DELETE FROM manual_lesson_rows WHERE version IN (SELECT version FROM cancelled)`;
        return res.status(200).json({ success: true });
      }
      const total = body.total;
      if (!Number.isInteger(total) || total < 1 || total > 20000) return fail(400, 'عدد الدروس غير صحيح.');
      const [published] = await sql`WITH ready AS (
        DELETE FROM manual_lesson_uploads WHERE version = ${version}::uuid AND received = ${total}
        RETURNING version, received
      )
      INSERT INTO manual_lesson_source (singleton, version, total)
      SELECT true, version, received FROM ready
      ON CONFLICT (singleton) DO UPDATE SET version = EXCLUDED.version, total = EXCLUDED.total, published_at = NOW()
      RETURNING total`;
      if (!published) return fail(409, 'لم يكتمل رفع الدروس. النسخة الحالية لم تتغير.');
      return res.status(200).json({ success: true, total: published.total });
    }
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
