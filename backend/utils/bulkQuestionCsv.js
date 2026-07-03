import { QUESTION_STATUS } from './questionStatus.js';

const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
const QUESTION_TYPES = new Set(['Single Correct', 'Multiple Correct']);
const SOURCES = new Set(['Self', 'AI', 'Reference', 'Previous']);

const TEMPLATE_HEADERS = [
  'question_text',
  'difficulty',
  'question_type',
  'source',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'option_e',
  'option_f',
  'correct',
  'explanation',
];

const OPTION_KEYS = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f'];
const CORRECT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function getBulkQuestionCsvTemplate() {
  const header = TEMPLATE_HEADERS.join(',');
  const example1 =
    '"What is 2+2?",Easy,Single Correct,Self,3,4,5,6,,,B,"Basic addition"';
  const example2 =
    '"Select prime numbers",Medium,Multiple Correct,Self,2,4,5,9,,,"A,C","2 and 5 are prime"';
  return `${header}\n${example1}\n${example2}\n`;
}

/** Minimal RFC-style CSV row parser (handles quoted fields). */
export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const normalized = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(field.trim());
      field = '';
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((c) => c.length > 0)) rows.push(row);
  }

  return rows;
}

function parseCorrectMarkers(raw, optionCount) {
  const markers = String(raw || '')
    .toUpperCase()
    .split(/[,;\s|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const indices = new Set();
  for (const m of markers) {
    if (/^[1-6]$/.test(m)) {
      const idx = parseInt(m, 10) - 1;
      if (idx >= 0 && idx < optionCount) indices.add(idx);
      continue;
    }
    const letterIdx = CORRECT_LETTERS.indexOf(m);
    if (letterIdx >= 0 && letterIdx < optionCount) indices.add(letterIdx);
  }
  return indices;
}

function rowIssue(index, code, message) {
  return { index, code, message };
}

/**
 * Parse CSV rows into normalized question payloads + validation errors.
 * Context (exam/subject/topic) is applied from the wizard, not the file.
 */
export function parseBulkQuestionCsv(csvText, context = {}, { maxRows = 200 } = {}) {
  const rows = parseCsvText(csvText);
  if (!rows.length) {
    return { rows: [], errors: [rowIssue(0, 'EMPTY_FILE', 'CSV file is empty')] };
  }

  const header = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const dataRows = rows.slice(1);

  if (dataRows.length > maxRows) {
    return {
      rows: [],
      errors: [rowIssue(0, 'ROW_LIMIT', `Too many rows (max ${maxRows} per upload)`)],
    };
  }

  const col = (record, key) => {
    const idx = header.indexOf(key);
    return idx >= 0 ? (record[idx] || '').trim() : '';
  };

  const parsed = [];
  const errors = [];

  dataRows.forEach((record, offset) => {
    const index = offset + 2; // 1-based, account for header
    const questionText = col(record, 'question_text');
    const difficulty = col(record, 'difficulty') || context.defaultDifficulty || 'Medium';
    const questionType = col(record, 'question_type') || context.defaultQuestionType || 'Single Correct';
    const source = col(record, 'source') || context.defaultSource || 'Self';
    const explanation = col(record, 'explanation') || '';

    const options = OPTION_KEYS.map((key, optIdx) => ({
      optionText: col(record, key),
      isCorrect: false,
      optionNumber: optIdx + 1,
    })).filter((o) => o.optionText);

    const correctRaw = col(record, 'correct');
    const correctSet = parseCorrectMarkers(correctRaw, options.length);
    options.forEach((o, i) => {
      o.isCorrect = correctSet.has(i);
    });

    const rowErrors = [];

    if (!questionText || questionText.length < 10) {
      rowErrors.push('Question text must be at least 10 characters');
    }
    if (!DIFFICULTIES.has(difficulty)) {
      rowErrors.push(`Invalid difficulty "${difficulty}"`);
    }
    if (!QUESTION_TYPES.has(questionType)) {
      rowErrors.push(`Invalid question type "${questionType}"`);
    }
    if (!SOURCES.has(source)) {
      rowErrors.push(`Invalid source "${source}"`);
    }
    if (options.length < 2) {
      rowErrors.push('At least 2 non-empty options required');
    }
    if (options.length > 6) {
      rowErrors.push('Maximum 6 options allowed');
    }

    const texts = options.map((o) => o.optionText.toLowerCase());
    if (new Set(texts).size !== texts.length) {
      rowErrors.push('Duplicate option text is not allowed');
    }

    const correctCount = options.filter((o) => o.isCorrect).length;
    if (correctCount === 0) {
      rowErrors.push('At least one correct answer must be marked in the correct column');
    } else if (questionType === 'Single Correct' && correctCount !== 1) {
      rowErrors.push('Single Correct questions must have exactly one correct answer');
    } else if (questionType === 'Multiple Correct' && correctCount < 2) {
      rowErrors.push('Multiple Correct questions must have at least 2 correct answers');
    }

    if (rowErrors.length) {
      errors.push(rowIssue(index, 'VALIDATION', rowErrors.join('; ')));
      return;
    }

    parsed.push({
      rowIndex: index,
      questionText,
      difficultyLevel: difficulty,
      questionType,
      source,
      explanation,
      options: options.map(({ optionText, isCorrect }) => ({ optionText, isCorrect })),
      topicId: context.topicId || null,
      examId: context.examId || null,
      subjectId: context.subjectId || null,
      chapterId: context.chapterId || null,
    });
  });

  return { rows: parsed, errors };
}

export function resolveBulkCommitStatus(statusInput) {
  const s = String(statusInput || 'Pending').trim();
  if (s === QUESTION_STATUS.DRAFT) return QUESTION_STATUS.DRAFT;
  return QUESTION_STATUS.PENDING;
}
