/**
 * Normalize question text for duplicate comparison (trim, collapse whitespace, lowercase).
 */
export function normalizeQuestionText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function formatDuplicateResponse(question, topic) {
  const resolvedTopic = Array.isArray(topic) ? topic[0] : topic;
  const chapterRaw = resolvedTopic?.Chapters;
  const chapter = Array.isArray(chapterRaw) ? chapterRaw[0] : chapterRaw;
  const subject = resolvedTopic?.Subjects;
  const exam = subject?.Exams;
  const examObj = Array.isArray(exam) ? exam[0] : exam;

  return {
    questionId: question.QuestionID,
    status: question.Status,
    questionTextSnippet: (question.QuestionText || '').substring(0, 120),
    examName: examObj?.ExamName || null,
    subjectName: subject?.SubjectName || null,
    chapterName:
      chapter?.ChapterName ||
      (chapter?.ChapterNumber ? `Chapter ${chapter.ChapterNumber}` : null),
    topicName: resolvedTopic?.TopicName || null,
  };
}

async function topicIdsForHierarchy(supabase, { examId, subjectId, chapterId }) {
  if (chapterId) {
    const { data } = await supabase.from('Topics').select('TopicID').eq('ChapterID', chapterId);
    return (data || []).map((t) => t.TopicID);
  }
  if (subjectId) {
    const { data } = await supabase.from('Topics').select('TopicID').eq('SubjectID', subjectId);
    return (data || []).map((t) => t.TopicID);
  }
  if (examId) {
    const { data: subjects } = await supabase.from('Subjects').select('SubjectID').eq('ExamID', examId);
    const subjectIds = (subjects || []).map((s) => s.SubjectID);
    if (subjectIds.length === 0) return [];
    const { data: topics } = await supabase.from('Topics').select('TopicID').in('SubjectID', subjectIds);
    return (topics || []).map((t) => t.TopicID);
  }
  return [];
}

function matchesHierarchy(candidate, { examId, subjectId, chapterId, topicId }) {
  const topic = Array.isArray(candidate.Topics) ? candidate.Topics[0] : candidate.Topics;

  if (topicId) {
    return (candidate.TopicID || topic?.TopicID) === topicId;
  }

  if (!topic) {
    return !examId && !subjectId && !chapterId;
  }

  if (examId && topic.Subjects?.ExamID && topic.Subjects.ExamID !== examId) return false;
  if (subjectId && topic.SubjectID && topic.SubjectID !== subjectId) return false;
  if (chapterId && topic.ChapterID && topic.ChapterID !== chapterId) return false;

  return true;
}

/**
 * Find an existing question duplicate for Subject Expert create/update.
 * Matches on normalized question text + exam / subject / chapter / topic context.
 */
export async function findDuplicateQuestion(
  supabase,
  {
    questionText,
    topicId = null,
    examId = null,
    subjectId = null,
    chapterId = null,
    excludeQuestionId = null,
    orgId = null,
  }
) {
  const normalized = normalizeQuestionText(questionText);
  if (!normalized || normalized === 'untitled draft') {
    return null;
  }

  let query = supabase.from('Questions').select(`
      QuestionID,
      QuestionText,
      Status,
      TopicID,
      Topics(
        TopicID,
        TopicName,
        SubjectID,
        ChapterID,
        Subjects(SubjectID, SubjectName, ExamID, Exams(ExamID, ExamName)),
        Chapters(ChapterID, ChapterNumber, ChapterName)
      )
    `);

  if (orgId) {
    query = query.eq('OrgID', orgId);
  } else {
    query = query.is('OrgID', null);
  }

  if (excludeQuestionId) {
    query = query.neq('QuestionID', excludeQuestionId);
  }

  if (topicId) {
    query = query.eq('TopicID', topicId);
  } else {
    const topicIds = await topicIdsForHierarchy(supabase, { examId, subjectId, chapterId });
    const filters = ['TopicID.is.null'];
    if (topicIds.length > 0) {
      filters.push(`TopicID.in.(${topicIds.join(',')})`);
    }
    query = query.or(filters.join(','));
  }

  const { data: candidates, error } = await query;
  if (error) {
    throw error;
  }

  const context = { examId, subjectId, chapterId, topicId };
  const match = (candidates || []).find((q) => {
    if (normalizeQuestionText(q.QuestionText) !== normalized) return false;
    return matchesHierarchy(q, context);
  });

  if (!match) return null;

  return formatDuplicateResponse(match, match.Topics);
}

export function duplicateQuestionErrorMessage(duplicate) {
  const parts = [
    duplicate?.examName,
    duplicate?.subjectName,
    duplicate?.chapterName,
    duplicate?.topicName,
  ].filter(Boolean);

  const where = parts.length > 0 ? ` (${parts.join(' → ')})` : '';
  return `A question with the same text already exists${where}. Please review the existing question instead of creating a duplicate.`;
}
