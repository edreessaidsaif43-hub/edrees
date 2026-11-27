import { randomUUID } from 'node:crypto';

import { MAX_BYTES, MAX_ROW_BYTES, SheetError, parseManualLessonCsv } from '../../assets/manual-lesson-csv.js';

const manualDeletionDepth = new Map([['subject', 2], ['unit', 4], ['lesson', 5]]);
const versionPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const maxPosition = 2147483647;

function validLessonPath(path, size) {
  return Array.isArray(path) && path.length === size &&
    path.every(value => typeof value === 'string' && value.trim() && value.length <= 350 && !value.includes('\0'));
}

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
      await sql`ALTER TABLE manual_lesson_rows ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
      await sql`ALTER TABLE manual_lesson_source ADD COLUMN IF NOT EXISTS next_position INTEGER`;
      await sql`UPDATE manual_lesson_source SET next_position = total WHERE next_position IS NULL`;
    })().catch(error => { schema = null; throw error; });
  }
  return async (req, res, action, body, isAdmin) => {
    const fail = (status, message) => res.status(status).json({ success: false, message });
    res.setHeader('Cache-Control', 'no-store');
    const manageDeletion = ['manualLessonDeleteOptions','manualLessonDeletePreview','manualLessonDelete'].includes(action);
    const add = action === 'manualLessonAdd';
    const upload = ['manualUploadBegin','manualUploadBatch','manualUploadCommit','manualUploadAppend','manualUploadCancel'].includes(action);
    if (!upload && !add && !manageDeletion && !['manualLessonImport','manualLessonInfo','manualLessonCatalog','manualLessonRows','manualLessonSubjects'].includes(action)) return fail(404, 'العملية غير متاحة.');
    if ((upload || add || manageDeletion || action === 'manualLessonImport' || action === 'manualLessonInfo') && !isAdmin) return fail(401, 'سجّل الدخول إلى لوحة الإدارة أولًا.');
    if (req.method !== (upload || add || manageDeletion || action === 'manualLessonImport' ? 'POST' : 'GET')) return fail(405, 'العملية غير متاحة.');
    await ensure();
    if (action === 'manualLessonDeleteOptions') {
      const path = body.path;
      if (!Array.isArray(path) || path.length > 4 || !validLessonPath(path, path.length)) {
        return fail(400, 'اختيار بيانات التحضير غير صحيح.');
      }
      const depth = path.length;
      const options = await sql`
        SELECT rows.cells->>${depth}::integer AS label,
          CASE WHEN ${depth}::integer = 4 THEN rows.position ELSE NULL END AS position
        FROM manual_lesson_rows rows JOIN manual_lesson_source source ON rows.version = source.version
        WHERE source.singleton AND rows.deleted_at IS NULL AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${JSON.stringify(path)}::jsonb) WITH ORDINALITY AS key(value, index)
          WHERE rows.cells->>((key.index - 1)::integer) IS DISTINCT FROM key.value
        )
        GROUP BY 1, 2 ORDER BY MIN(rows.position)`;
      return res.status(200).json({ success: true, options });
    }
    if (action === 'manualLessonDeletePreview' || action === 'manualLessonDelete') {
      const {scope, path, position = null} = body;
      const depth = manualDeletionDepth.get(scope);
      if (!depth || !validLessonPath(path, depth) ||
          (scope === 'lesson' ? !Number.isInteger(position) || position < 0 || position > maxPosition : position !== null)) {
        return fail(400, 'حدّد الدرس أو الوحدة أو المادة المطلوب حذفها.');
      }
      const encodedPath = JSON.stringify(path);
      if (action === 'manualLessonDeletePreview') {
        const [preview] = await sql`
          SELECT source.version, source.published_at::text AS revision, count(rows.position)::integer AS count
          FROM manual_lesson_source source
          LEFT JOIN manual_lesson_rows rows ON rows.version = source.version AND rows.deleted_at IS NULL
            AND (${position}::integer IS NULL OR rows.position = ${position}::integer) AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(${encodedPath}::jsonb) WITH ORDINALITY AS key(value, index)
              WHERE rows.cells->>((key.index - 1)::integer) IS DISTINCT FROM key.value
            )
          WHERE source.singleton GROUP BY source.version, source.published_at`;
        if (!preview?.count) return fail(404, 'لا توجد دروس مطابقة للاختيار في البنك المنشور.');
        return res.status(200).json({ success: true, ...preview });
      }
      const {version, revision, count} = body;
      if (typeof version !== 'string' || !versionPattern.test(version) ||
          typeof revision !== 'string' || !revision || revision.length > 64 ||
          !Number.isInteger(count) || count < 1 || count > 20000 || (scope === 'lesson' && count !== 1)) {
        return fail(400, 'أعد معاينة الحذف والتأكد من عدد الدروس.');
      }
      const [result] = await sql`
        WITH targets AS MATERIALIZED (
          SELECT rows.position
          FROM manual_lesson_rows rows
          WHERE rows.version = ${version}::uuid AND rows.deleted_at IS NULL
            AND (${position}::integer IS NULL OR rows.position = ${position}::integer) AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(${encodedPath}::jsonb) WITH ORDINALITY AS key(value, index)
              WHERE rows.cells->>((key.index - 1)::integer) IS DISTINCT FROM key.value
            )
        ), claimed AS (
          UPDATE manual_lesson_source source
          SET total = source.total - ${count}, published_at = NOW()
          WHERE source.singleton AND source.version = ${version}::uuid AND source.published_at::text = ${revision}
            AND source.total >= ${count} AND (SELECT count(*) FROM targets) = ${count}
          RETURNING source.version, source.total
        ), removed AS (
          UPDATE manual_lesson_rows rows SET deleted_at = NOW()
          FROM claimed
          WHERE rows.version = claimed.version AND rows.deleted_at IS NULL
            AND rows.position IN (SELECT position FROM targets)
          RETURNING rows.position
        )
        SELECT (SELECT total FROM claimed) AS total, count(*)::integer AS deleted FROM removed`;
      if (Number(result?.deleted) !== count) return fail(409, 'تغيّر بنك الدروس بعد المعاينة. أعد تحديد المطلوب ومعاينته.');
      return res.status(200).json({ success: true, deleted: result.deleted, total: result.total });
    }
    if (action === 'manualLessonAdd') {
      if (!Array.isArray(body.cells) || body.cells.length !== 16 || body.cells.some(cell => typeof cell !== 'string')) {
        return fail(400, 'بيانات الدرس غير صحيحة.');
      }
      const cells = body.cells.map(cell => cell.trim());
      const payload = JSON.stringify(cells);
      if (cells.slice(0, 5).some(cell => !cell || cell.length > 350 || /^[-–—−]+$/.test(cell))) {
        return fail(400, 'أكمل الصف والمادة والفصل والوحدة واسم الدرس.');
      }
      if (Buffer.byteLength(payload) > MAX_ROW_BYTES || cells.some(cell => cell.includes('\0'))) {
        return fail(400, 'يتجاوز محتوى الدرس الحد المدعوم أو يحتوي على محرف غير صالح.');
      }
      const key = JSON.stringify(cells.slice(0, 5));
      const [row] = await sql`WITH next_row AS (
        UPDATE manual_lesson_source AS source
        SET total = total + 1, next_position = next_position + 1, published_at = NOW()
        WHERE singleton AND total < 20000 AND NOT EXISTS (
          SELECT 1 FROM manual_lesson_rows AS existing WHERE existing.version = source.version AND existing.deleted_at IS NULL
            AND jsonb_build_array(cells->0, cells->1, cells->2, cells->3, cells->4) = ${key}::jsonb
        )
        RETURNING version, next_position
      )
      INSERT INTO manual_lesson_rows (version, position, cells)
      SELECT version, next_position - 1, ${payload}::jsonb FROM next_row RETURNING position`;
      if (!row) {
        const [source] = await sql`SELECT total FROM manual_lesson_source WHERE singleton`;
        if (!source) return fail(409, 'استورد بنك الدروس الحالي أولًا ثم أضف الدرس.');
        if (Number(source.total) >= 20000) return fail(409, 'بلغ بنك الدروس الحد الأقصى: 20 ألف درس.');
        return fail(409, 'يوجد درس بالاسم نفسه في هذا الصف والمادة والفصل والوحدة.');
      }
      return res.status(201).json({ success: true });
    }
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
      if (action === 'manualUploadAppend') {
        const [result] = await sql`WITH bank AS (
          SELECT version, total, next_position, published_at FROM manual_lesson_source WHERE singleton
        ), incoming AS (
          SELECT rows.position, rows.cells,
            jsonb_build_array(rows.cells->0,rows.cells->1,rows.cells->2,rows.cells->3,rows.cells->4) AS lesson_key
          FROM manual_lesson_rows rows JOIN manual_lesson_uploads draft ON draft.version = rows.version
          WHERE draft.version = ${version}::uuid AND draft.received = ${total}
        ), unique_rows AS (
          SELECT DISTINCT ON (lesson_key) position, cells, lesson_key FROM incoming ORDER BY lesson_key, position
        ), candidates AS (
          SELECT candidate.position, candidate.cells FROM unique_rows candidate
          WHERE NOT EXISTS (
            SELECT 1 FROM manual_lesson_rows existing JOIN bank ON existing.version = bank.version
            WHERE jsonb_build_array(existing.cells->0,existing.cells->1,existing.cells->2,existing.cells->3,existing.cells->4) = candidate.lesson_key
              AND existing.deleted_at IS NULL
          )
        ), counts AS (
          SELECT (SELECT count(*)::integer FROM incoming) AS received,
                 (SELECT count(*)::integer FROM candidates) AS added
        ), updated AS (
          UPDATE manual_lesson_source source
          SET total = source.total + counts.added, next_position = source.next_position + counts.added, published_at = NOW()
          FROM bank, counts
          WHERE source.singleton AND source.version = bank.version AND source.total = bank.total
            AND source.next_position = bank.next_position AND source.published_at = bank.published_at
            AND counts.received = ${total} AND source.total + counts.added <= 20000
          RETURNING source.version, bank.next_position AS first_position
        ), inserted AS (
          INSERT INTO manual_lesson_rows (version, position, cells)
          SELECT updated.version, (updated.first_position + row_number() OVER (ORDER BY candidates.position) - 1)::integer, candidates.cells
          FROM updated CROSS JOIN candidates RETURNING position
        ), finished AS (
          DELETE FROM manual_lesson_uploads WHERE version = ${version}::uuid AND EXISTS (SELECT 1 FROM updated)
          RETURNING version
        ), cleaned AS (
          DELETE FROM manual_lesson_rows WHERE version IN (SELECT version FROM finished)
        )
        SELECT EXISTS (SELECT 1 FROM updated) AS ok, (SELECT count(*)::integer FROM inserted) AS added`;
        if (!result?.ok) {
          const [source] = await sql`SELECT total FROM manual_lesson_source WHERE singleton`;
          if (!source) return fail(409, 'استورد بنك الدروس الحالي أولًا قبل إضافة ملف جديد.');
          return fail(409, 'تعذّرت إضافة الدفعة: تحقق من اكتمال الرفع أو من حد 20 ألف درس، ثم أعد المحاولة.');
        }
        return res.status(200).json({ success: true, added: result.added, skipped: total - result.added });
      }
      const [published] = await sql`WITH ready AS (
        DELETE FROM manual_lesson_uploads WHERE version = ${version}::uuid AND received = ${total}
        RETURNING version, received
      )
      INSERT INTO manual_lesson_source (singleton, version, total, next_position)
      SELECT true, version, received, received FROM ready
      ON CONFLICT (singleton) DO UPDATE SET version = EXCLUDED.version, total = EXCLUDED.total,
        next_position = EXCLUDED.next_position, published_at = NOW()
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
      await sql`INSERT INTO manual_lesson_source (singleton, version, total, next_position)
        VALUES (true, ${version}::uuid, ${total}, ${total})
        ON CONFLICT (singleton) DO UPDATE SET version = EXCLUDED.version, total = EXCLUDED.total,
          next_position = EXCLUDED.next_position, published_at = NOW()`;
      return res.status(200).json({ success: true, total });
    }
    if (action === 'manualLessonInfo') {
      const [source] = await sql`SELECT total, published_at FROM manual_lesson_source WHERE singleton`;
      return res.status(200).json({ success: true, source: source || null });
    }
    if (action === 'manualLessonSubjects') {
      const subjects = await sql`
        SELECT BTRIM(rows.cells->>0) AS grade, BTRIM(rows.cells->>1) AS subject
        FROM manual_lesson_source AS source
        JOIN manual_lesson_rows AS rows ON rows.version = source.version
        WHERE source.singleton AND rows.deleted_at IS NULL AND BTRIM(rows.cells->>0) <> '' AND BTRIM(rows.cells->>1) <> ''
        GROUP BY 1, 2
        ORDER BY MIN(rows.position)`;
      const published = subjects.length > 0 || (await sql`SELECT 1 FROM manual_lesson_source WHERE singleton`).length > 0;
      return res.status(200).json({ success: true, published, subjects });
    }
    const requested = String(req.query?.version || '');
    if (requested && !versionPattern.test(requested)) return fail(400, 'إصدار البيانات غير صحيح.');
    if (action === 'manualLessonRows') {
      const ids = String(req.query?.ids || '').split(',');
      if (!requested || ids.length > 25 || ids.some(id => !/^\d{1,10}$/.test(id) || Number(id) > maxPosition)) return fail(400, 'معرفات الدروس غير صحيحة.');
      const rows = await sql`SELECT position, cells FROM manual_lesson_rows WHERE version = ${requested}::uuid AND deleted_at IS NULL
        AND position IN (SELECT value::integer FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)) ORDER BY position`;
      return res.status(200).json({ success: true, rows });
    }
    const [source] = requested ? [{ version: requested }] : await sql`SELECT version FROM manual_lesson_source WHERE singleton`;
    if (!source) return res.status(200).json({ success: true, version: null, rows: [], next: null });
    const offset = Number(req.query?.offset || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > maxPosition) return fail(400, 'صفحة البيانات غير صحيحة.');
    const rows = await sql`SELECT position, jsonb_build_array(cells->0,cells->1,cells->2,cells->3,cells->4) AS cells
      FROM manual_lesson_rows WHERE version = ${source.version}::uuid AND deleted_at IS NULL
        AND position >= ${offset} ORDER BY position LIMIT 501`;
    return res.status(200).json({ success: true, version: source.version, rows: rows.slice(0, 500), next: rows[500]?.position ?? null });
  };
}
