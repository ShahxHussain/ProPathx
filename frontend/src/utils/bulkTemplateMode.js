export const BULK_TEMPLATE_INSTRUCTIONS = [
  'Set Exam, Subject, Chapter, Topic, Difficulty, Source, and Question type in step 1 before upload.',
  'Each Question block = one MCQ. Copy a blank block to add more questions.',
  'Do not rename section headings (Question text, Answer options, Correct answer(s), Explanation).',
  'In the file only: question text, options A and B, correct answer, explanation.',
  'Question text must be at least 10 characters. Options A and B are required.',
  'Correct answer: use A or B (or A,B for multiple correct), or paste the exact option text.',
  'Invalid questions are skipped — valid ones can still be imported.',
];

export const BULK_TEMPLATE_MODES = {
  QUESTION_ENTRY: 'question-entry',
};

/**
 * @param {{ examId?: string, subjectId?: string, chapterId?: string, topicId?: string }} selection
 */
export function resolveBulkTemplateMode(selection) {
  const examId = selection?.examId?.trim?.() || selection?.examId;
  const subjectId = selection?.subjectId?.trim?.() || selection?.subjectId;
  const chapterId = selection?.chapterId?.trim?.() || selection?.chapterId;
  const topicId = selection?.topicId?.trim?.() || selection?.topicId;

  if (!examId || !subjectId || !chapterId || !topicId) return null;
  return BULK_TEMPLATE_MODES.QUESTION_ENTRY;
}

export function getBulkTemplateModeLabel(mode) {
  if (mode === BULK_TEMPLATE_MODES.QUESTION_ENTRY) return 'Question template';
  return null;
}

/** @param {object} topic */
export function getTopicChapterId(topic) {
  if (!topic) return null;
  const chapter = topic.Chapters;
  const nested = chapter && (Array.isArray(chapter) ? chapter[0] : chapter);
  return topic.ChapterID || nested?.ChapterID || null;
}

/**
 * @param {string | null} mode
 * @param {{ subjectName?: string, chapterName?: string, topicName?: string }} labels
 */
export function getBulkTemplateHelperText(mode, labels = {}) {
  const { topicName } = labels;

  if (!mode) {
    return {
      headline: 'Select Exam, Subject, Chapter, and Topic to enable download.',
      detail: 'Only topic-level question template is available right now.',
    };
  }

  return {
    headline: `Download: question-entry template for ${topicName || 'the selected topic'}.`,
    detail: 'Fill question text, options, and correct answers in the file. Difficulty, source, and question type come from step 1.',
  };
}

export function getBulkGenerateButtonLabel(mode, format) {
  const kind = mode === BULK_TEMPLATE_MODES.QUESTION_ENTRY ? 'Question template' : 'Question template';
  const ext = format === 'docx' ? 'Word' : 'CSV';
  return `Download ${ext} · ${kind}`;
}
