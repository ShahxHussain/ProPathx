export const BULK_TEMPLATE_MODES = {
  QUESTION_ENTRY: 'question-entry',
};

/**
 * Resolve template mode from syllabus selection depth.
 * @see Implementations_Docs/BULK_QUESTION_DYNAMIC_TEMPLATES.md §3
 */
export function resolveBulkTemplateMode({ examId, subjectId, chapterId, topicId }) {
  const exam = String(examId || '').trim();
  const subject = String(subjectId || '').trim();
  const chapter = String(chapterId || '').trim();
  const topic = String(topicId || '').trim();

  if (!exam || !subject || !chapter || !topic) {
    return { error: 'Select Exam, Subject, Chapter, and Topic to generate template.' };
  }
  return { mode: BULK_TEMPLATE_MODES.QUESTION_ENTRY };
}

function slugify(value) {
  return String(value || 'template')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Build download filename for generated templates.
 */
export function getBulkTemplateFilename(context, mode, format) {
  const ext = format === 'docx' ? 'docx' : 'csv';
  const topicSlug = slugify(context.topic?.name);
  return `propath-questions-${topicSlug}.${ext}`;
}
