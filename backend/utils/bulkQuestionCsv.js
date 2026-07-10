import { QUESTION_STATUS } from './questionStatus.js';
import { BULK_TEMPLATE_MODES } from './bulkTemplateMode.js';
import {
  buildCsvGuidanceComments,
  QUESTION_ENTRY_CSV_EXAMPLE,
} from './bulkTemplateGuidance.js';
const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
const QUESTION_TYPES = new Set(['Single Correct', 'Multiple Correct']);
const SOURCES = new Set(['Self', 'AI', 'Reference', 'Previous']);

export const BULK_QUESTION_ENTRY_HEADERS = [
  'question_text',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'option_e',
  'option_f',
  'correct',
  'explanation',
];

/** @deprecated Use BULK_QUESTION_ENTRY_HEADERS */
export const BULK_QUESTION_TEMPLATE_HEADERS = [
  ...BULK_QUESTION_ENTRY_HEADERS.slice(0, 1),
  'question_type',
  ...BULK_QUESTION_ENTRY_HEADERS.slice(1),
];

const OPTION_KEYS = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f'];
const CORRECT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const OUTLINE_UPLOAD_MESSAGE =
  'This file is a planning outline, not a question-entry file. Select a topic and download a question template (Mode Q), then upload that file.';

function escapeCsvField(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(values) {
  return values.map(escapeCsvField).join(',');
}

export function detectBulkCsvFileKind(tableRows) {
  if (!tableRows?.length) return 'empty';
  const header = tableRows[0].map((h) => String(h || '').toLowerCase().replace(/\s+/g, '_'));
  if (
    header.includes('question_text') ||
    header.includes('question') ||
    header.includes('questiontext')
  ) {
    return 'question-entry';
  }
  if (header.includes('chapter_number') && header.includes('topic_name')) {
    return 'subject-outline';
  }
  if (header.includes('topic_name') && header.includes('_topic_id')) {
    return 'chapter-outline';
  }
  return 'unknown';
}

export function buildBulkTemplateCsv(templateContext, mode, uiContext = {}) {
  if (mode !== BULK_TEMPLATE_MODES.QUESTION_ENTRY) {
    throw new Error('Only topic question-entry template is enabled');
  }
  const comments = buildCsvGuidanceComments(mode, templateContext, uiContext);
  const header = BULK_QUESTION_ENTRY_HEADERS.join(',');
  const exampleComment = `# ${csvRow(QUESTION_ENTRY_CSV_EXAMPLE)}`;
  const blankRow = BULK_QUESTION_ENTRY_HEADERS.map(() => '').join(',');
  return `${comments.join('\n')}\n${exampleComment}\n#\n# YOUR QUESTIONS — fill the blank rows below:\n${header}\n${blankRow}\n${blankRow}\n${blankRow}\n`;
}

/** @deprecated Use buildBulkTemplateCsv with context */
export function getBulkQuestionCsvTemplate() {
  return buildBulkTemplateCsv(
    {
      exam: { name: 'Your Exam' },
      subject: { name: 'Your Subject' },
      chapter: { name: 'Your Chapter' },
      topic: { name: 'Your Topic' },
      chapterGroups: [],
      chapterTopics: [],
      generatedAt: new Date().toISOString().slice(0, 10),
    },
    BULK_TEMPLATE_MODES.QUESTION_ENTRY
  );
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

function rowIssue(index, code, message, extra = {}) {
  return { index, code, message, ...extra };
}

function questionPreview(text, max = 72) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function isEmptyDraft(draft) {
  const questionText = String(draft.questionText || '').trim();
  const optionTexts = Array.isArray(draft.optionTexts)
    ? draft.optionTexts.map((t) => String(t || '').trim()).filter(Boolean)
    : [];
  const correctRaw = String(draft.correctRaw || '').trim();
  const explanation = String(draft.explanation || '').trim();
  return !questionText && !optionTexts.length && !correctRaw && !explanation;
}

function resolveCorrectIndices(correctRaw, options) {
  const indices = parseCorrectMarkers(correctRaw, options.length);
  if (indices.size > 0) return indices;

  const raw = String(correctRaw || '').trim();
  if (!raw || !options.length) return indices;

  const parts = raw
    .split(/[,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    const exactIdx = options.findIndex(
      (o) => o.optionText.toLowerCase() === part.toLowerCase()
    );
    if (exactIdx >= 0) {
      indices.add(exactIdx);
      continue;
    }

    const letterIdx = CORRECT_LETTERS.indexOf(part.toUpperCase());
    if (letterIdx >= 0 && letterIdx < options.length) {
      indices.add(letterIdx);
    }
  }

  return indices;
}

function getColumnValue(record, header, aliases) {
  for (const alias of aliases) {
    const idx = header.indexOf(alias);
    if (idx >= 0) return (record[idx] || '').trim();
  }
  return '';
}

function validateAndBuildQuestionRow(index, draft, context) {
  const questionText = String(draft.questionText || '').trim();
  const difficulty = String(context.defaultDifficulty || 'Medium').trim();
  const questionType = String(draft.questionType || context.defaultQuestionType || 'Single Correct').trim();
  const source = String(context.defaultSource || 'Self').trim();
  const explanation = String(draft.explanation || '').trim();

  const optionTexts = Array.isArray(draft.optionTexts) ? draft.optionTexts.map((t) => String(t || '').trim()) : [];
  const options = optionTexts
    .filter(Boolean)
    .slice(0, 6)
    .map((optionText, optIdx) => ({
      optionText,
      isCorrect: false,
      optionNumber: optIdx + 1,
    }));

  const correctSet = resolveCorrectIndices(draft.correctRaw, options);
  options.forEach((o, i) => {
    o.isCorrect = correctSet.has(i);
  });

  const rowErrors = [];
  const preview = questionPreview(questionText);

  if (!questionText) {
    rowErrors.push('Question text is missing');
  } else if (questionText.length < 10) {
    rowErrors.push(`Question text is too short (${questionText.length}/10 characters minimum)`);
  }
  if (!DIFFICULTIES.has(difficulty)) {
    rowErrors.push(`Invalid difficulty "${difficulty}" (use Easy, Medium, or Hard from step 1)`);
  }
  if (!QUESTION_TYPES.has(questionType)) {
    rowErrors.push(`Invalid question type "${questionType}" (use Single Correct or Multiple Correct)`);
  }
  if (!SOURCES.has(source)) {
    rowErrors.push(`Invalid source "${source}"`);
  }
  if (options.length < 2) {
    rowErrors.push('At least 2 answer options are required (A and B minimum)');
  }
  if (options.length > 6) {
    rowErrors.push('Maximum 6 options allowed (A through F)');
  }

  const texts = options.map((o) => o.optionText.toLowerCase());
  if (new Set(texts).size !== texts.length) {
    rowErrors.push('Two or more options have the same text — each option must be unique');
  }

  const correctRaw = String(draft.correctRaw || '').trim();
  const correctCount = options.filter((o) => o.isCorrect).length;
  if (correctCount === 0) {
    if (!correctRaw) {
      rowErrors.push('Correct answer is missing (use a letter like A, or the exact option text)');
    } else {
      rowErrors.push(
        `Correct answer "${correctRaw}" does not match any option — use A–F or copy the exact option text`
      );
    }
  } else if (questionType === 'Single Correct' && correctCount !== 1) {
    rowErrors.push(
      `Single Correct is selected in step 1, but ${correctCount} answers are marked correct — keep only one`
    );
  } else if (questionType === 'Multiple Correct' && correctCount < 2) {
    rowErrors.push(
      `Multiple Correct is selected in step 1, but only ${correctCount} answer is marked — mark at least 2`
    );
  }

  if (rowErrors.length) {
    return {
      error: rowIssue(index, 'VALIDATION', rowErrors.join(' · '), {
        questionPreview: preview,
        fields: rowErrors,
      }),
    };
  }

  return {
    row: {
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
    },
  };
}

/**
 * Validate normalized question drafts (from Word sections or other structured sources).
 */
export function parseBulkQuestionDrafts(drafts, context = {}, { maxRows = 200 } = {}) {
  const nonBlankDrafts = (drafts || []).filter((draft) => !isEmptyDraft(draft));
  const blankCount = (drafts || []).length - nonBlankDrafts.length;

  if (!nonBlankDrafts.length) {
    return {
      rows: [],
      errors: [
        rowIssue(
          0,
          'EMPTY_FILE',
          'No questions found. Each block needs question text, options, and a correct answer.'
        ),
      ],
    };
  }
  if (nonBlankDrafts.length > maxRows) {
    return {
      rows: [],
      errors: [
        rowIssue(
          0,
          'ROW_LIMIT',
          `Too many questions (${nonBlankDrafts.length}). Maximum ${maxRows} per upload — split the file and import in batches.`
        ),
      ],
    };
  }

  const parsed = [];
  const errors = [];

  if (blankCount > 0) {
    errors.push(
      rowIssue(0, 'SKIPPED', `${blankCount} empty placeholder block(s) were ignored`, {
        severity: 'info',
      })
    );
  }

  nonBlankDrafts.forEach((draft, offset) => {
    const index = draft.rowIndex ?? offset + 1;
    const result = validateAndBuildQuestionRow(index, draft, context);
    if (result.error) errors.push(result.error);
    else parsed.push(result.row);
  });

  return { rows: parsed, errors };
}

/**
 * Parse CSV rows into normalized question payloads + validation errors.
 * Context (exam/subject/topic) is applied from the wizard, not the file.
 */
export function parseBulkQuestionTableRows(tableRows, context = {}, { maxRows = 200 } = {}) {
  const rows = tableRows;
  if (!rows.length) {
    return { rows: [], errors: [rowIssue(0, 'EMPTY_FILE', 'File is empty')] };
  }

  const fileKind = detectBulkCsvFileKind(rows);
  if (fileKind === 'subject-outline' || fileKind === 'chapter-outline') {
    return { rows: [], errors: [rowIssue(0, 'OUTLINE_FILE', OUTLINE_UPLOAD_MESSAGE)] };
  }

  const header = rows[0].map((h) => String(h || '').toLowerCase().replace(/\s+/g, '_'));
  const dataRows = rows.slice(1);

  if (dataRows.length > maxRows) {
    return {
      rows: [],
      errors: [rowIssue(0, 'ROW_LIMIT', `Too many rows (max ${maxRows} per upload)`)],
    };
  }

  const drafts = dataRows
    .map((record, offset) => {
      const optionTexts = [
        getColumnValue(record, header, ['option_a', 'option_1', 'option1']),
        getColumnValue(record, header, ['option_b', 'option_2', 'option2']),
        getColumnValue(record, header, ['option_c', 'option_3', 'option3']),
        getColumnValue(record, header, ['option_d', 'option_4', 'option4']),
        getColumnValue(record, header, ['option_e', 'option_5', 'option5']),
        getColumnValue(record, header, ['option_f', 'option_6', 'option6']),
      ].filter(Boolean);
      return {
        rowIndex: offset + 2,
        questionText: getColumnValue(record, header, ['question_text', 'question', 'questiontext']),
        questionType: getColumnValue(record, header, ['question_type', 'type']) || undefined,
        explanation: getColumnValue(record, header, ['explanation', 'rationale']),
        optionTexts,
        correctRaw: getColumnValue(record, header, ['correct', 'correct_answer', 'answer']),
      };
    })
    .filter((draft) => !isEmptyDraft(draft));

  if (!drafts.length) {
    return {
      rows: [],
      errors: [
        rowIssue(
          0,
          'EMPTY_FILE',
          'CSV has a header but no question rows. Add at least one row with question text and options.'
        ),
      ],
    };
  }

  return parseBulkQuestionDrafts(drafts, context, { maxRows });
}

export function parseBulkQuestionCsv(csvText, context = {}, options = {}) {
  const rows = parseCsvText(csvText).filter((row) => {
    const first = String(row[0] || '').trim();
    return first && !first.startsWith('#');
  });
  if (!rows.length) {
    return { rows: [], errors: [rowIssue(0, 'EMPTY_FILE', 'CSV file is empty')] };
  }
  return parseBulkQuestionTableRows(rows, context, options);
}

export function resolveBulkCommitStatus(statusInput) {
  const s = String(statusInput || 'Pending').trim();
  if (s === QUESTION_STATUS.DRAFT) return QUESTION_STATUS.DRAFT;
  return QUESTION_STATUS.PENDING;
}
