function formatUiContextLine(ui = {}) {
  const difficulty = ui.defaultDifficulty || 'Medium';
  const source = ui.defaultSource || 'Self';
  const questionType = ui.defaultQuestionType || 'Single Correct';
  return `${difficulty} · ${source} · ${questionType}`;
}

export const BULK_TEMPLATE_INSTRUCTIONS = [
  'Set Exam, Subject, Chapter, Topic, Difficulty, Source, and Question type in ProPath before upload.',
  'Each Question block = one MCQ. Copy a blank block to add more questions.',
  'Do not rename section headings (Question text, Answer options, Correct answer(s), Explanation).',
  'In the file only: question text, options A–F, correct answer, explanation.',
  'Question text must be at least 10 characters. Options A and B are required.',
  'Correct answer: use a letter (A) or multiple letters (A,C), or paste the exact option text.',
  'Invalid questions are skipped on upload — valid ones can still be imported.',
];

/** Shared CSV comment block — guidance on “page 1”. */
export function buildCsvGuidanceComments(mode, templateContext, uiContext = {}) {
  const { exam, subject, chapter, topic, generatedAt } = templateContext;
  const divider = '# ─────────────────────────────────────────────────────────';

  const sharedFooter = [
    '#',
    '# Set in ProPath app (not in this file): Difficulty · Source · Question type',
    `# UI context: ${formatUiContextLine(uiContext)}`,
    `# Generated: ${generatedAt}`,
  ];

  return [
    '# ProPath — Question entry',
    divider,
    '# HOW TO USE THIS FILE',
    `# Exam: ${exam.name} | Subject: ${subject.name}`,
    `# Chapter: ${chapter?.name || '—'} | Topic: ${topic?.name || '—'}`,
    `# UI context: ${formatUiContextLine(uiContext)}`,
    '#',
    ...BULK_TEMPLATE_INSTRUCTIONS.map((line) => `# ${line}`),
    divider,
    '# EXAMPLE ROW (optional reference — delete before upload):',
    ...sharedFooter,
  ];
}

export const QUESTION_ENTRY_CSV_EXAMPLE = [
  'What is $2+2$?',
  '3',
  '4',
  '5',
  '6',
  '',
  '',
  'B',
  'Basic addition',
];

export { formatUiContextLine, BULK_TEMPLATE_INSTRUCTIONS };
