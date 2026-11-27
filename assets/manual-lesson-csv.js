export const MAX_BYTES = 128 * 1024 * 1024;
export const MAX_ROW_BYTES = 128 * 1024;
export class SheetError extends Error {}
const encoder = new TextEncoder();

const headerLabels = [
  ['الصف', 'الصف الدراسي', 'اسم الصف', 'grade', 'class', 'class level'],
  ['المادة', 'المادة الدراسية', 'اسم المادة', 'subject'],
  ['الفصل', 'الفصل الدراسي', 'اسم الفصل', 'semester', 'term'],
  ['الوحدة', 'الوحدة الدراسية', 'اسم الوحدة', 'عنوان الوحدة', 'رقم الوحدة', 'unit'],
  ['الدرس', 'اسم الدرس', 'عنوان الدرس', 'موضوع الدرس', 'lesson', 'lesson title', 'lesson name'],
];

export function isManualLessonHeader(cells) {
  return cells.length >= headerLabels.length && headerLabels.every((labels, index) => {
    const label = cells[index].trim().toLowerCase()
      .replace(/[أإآ]/g, 'ا').replace(/[\u0640\u064B-\u065F\u0670]/g, '')
      .replace(/[\s_-]+/g, ' ');
    return labels.includes(label);
  });
}

export async function* parseManualLessonCsv(chunks) {
  let row = [], cell = '', state = 'plain', first = true, skipLf = false, count = 0, length = 0, record = 0;
  function pushCell() { row.push(cell.trim()); cell = ''; state = 'plain'; }
  function pushRow() {
    pushCell();
    const values = row;
    row = []; length = 0;
    record++;
    if (!values.some(Boolean)) return;
    if (first) {
      first = false;
      if (isManualLessonHeader(values)) return;
    }
    if (values.length < 5 || values.slice(0,5).some(value => !value || value.length > 350)) {
      throw new SheetError('تحقق من أعمدة الصف والمادة والفصل والوحدة والدرس في السجل رقم ' + record + '.');
    }
    const cells = Array.from({length:16}, (_, i) => values[i] || '');
    if (encoder.encode(JSON.stringify(cells)).length > MAX_ROW_BYTES) throw new SheetError('يوجد درس يتجاوز حجم النص المدعوم.');
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
  if (!count) throw new SheetError('الملف لا يحتوي على دروس.');
}

