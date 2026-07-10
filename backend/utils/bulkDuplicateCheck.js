import { normalizeQuestionText } from './questionDuplicate.js';

function questionPreview(text, max = 72) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Remove duplicate question texts within a parsed batch (keeps first occurrence).
 */
export function separateInBatchDuplicates(rows = []) {
  const seen = new Map();
  const uniqueRows = [];
  const errors = [];

  for (const row of rows) {
    const normalized = normalizeQuestionText(row.questionText);
    if (!normalized) {
      uniqueRows.push(row);
      continue;
    }

    const firstIndex = seen.get(normalized);
    if (firstIndex != null) {
      errors.push({
        index: row.rowIndex ?? 0,
        code: 'DUPLICATE',
        message: `Duplicate question text in this file (same as question ${firstIndex})`,
        questionPreview: questionPreview(row.questionText),
      });
      continue;
    }

    seen.set(normalized, row.rowIndex);
    uniqueRows.push(row);
  }

  return { rows: uniqueRows, errors };
}

export function batchDuplicateError(rowIndex) {
  return {
    rowIndex,
    code: 'DUPLICATE',
    message: 'Duplicate question text in this upload batch (same text appears more than once).',
  };
}
