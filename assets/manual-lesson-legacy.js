import { isManualLessonHeader } from './manual-lesson-csv.js?v=3';

const spreadsheet = 'https://docs.google.com/spreadsheets/d/1GQ6nGXFPkNOtBdDW2SjkaLA6XcNt5HOvQnzRKvjkUGQ';

export const legacyLessonCsvUrls = [
  spreadsheet + '/export?format=csv&gid=0',
  spreadsheet + '/export?format=csv',
  spreadsheet + '/pub?gid=0&single=true&output=csv'
];

export function parseCSVText(csvText) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;
  let i = 0;

  while (i < csvText.length) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim().replace(/^"|"$/g, ''));
      currentCell = '';
      i++;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentCell.trim() || currentRow.length > 0) {
        currentRow.push(currentCell.trim().replace(/^"|"$/g, ''));
        if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      }
      if (char === '\r' && nextChar === '\n') i += 2;
      else i++;
    } else {
      currentCell += char;
      i++;
    }
  }

  if (currentCell.trim() || currentRow.length > 0) {
    currentRow.push(currentCell.trim().replace(/^"|"$/g, ''));
    if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
  }

  return rows.length && isManualLessonHeader(rows[0]) ? rows.slice(1) : rows;
}
