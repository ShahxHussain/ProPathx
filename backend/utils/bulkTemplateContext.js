import { supabase } from '../config/database.js';

const UNCATEGORIZED_CHAPTER = {
  id: null,
  number: null,
  name: 'Uncategorized',
};

function groupTopicsByChapter(chapters, topics) {
  const chapterMap = new Map();
  for (const chapter of chapters) {
    chapterMap.set(chapter.ChapterID, {
      id: chapter.ChapterID,
      number: chapter.ChapterNumber,
      name: chapter.ChapterName || `Chapter ${chapter.ChapterNumber}`,
      topics: [],
    });
  }

  const uncategorized = { ...UNCATEGORIZED_CHAPTER, topics: [] };

  for (const topic of topics) {
    const entry = {
      id: topic.TopicID,
      name: topic.TopicName,
      chapterId: topic.ChapterID || null,
    };
    if (topic.ChapterID && chapterMap.has(topic.ChapterID)) {
      chapterMap.get(topic.ChapterID).topics.push(entry);
    } else {
      uncategorized.topics.push(entry);
    }
  }

  const grouped = Array.from(chapterMap.values());
  if (uncategorized.topics.length > 0) {
    grouped.push(uncategorized);
  }
  return grouped;
}

/**
 * Load syllabus slice for dynamic bulk template generation.
 */
export async function loadBulkTemplateContext({ examId, subjectId, chapterId, topicId }) {
  const [{ data: exam, error: examError }, { data: subject, error: subjectError }] =
    await Promise.all([
      supabase.from('Exams').select('ExamID, ExamName').eq('ExamID', examId).maybeSingle(),
      supabase
        .from('Subjects')
        .select('SubjectID, SubjectName, ExamID')
        .eq('SubjectID', subjectId)
        .maybeSingle(),
    ]);

  if (examError || !exam) {
    return { error: 'Exam not found' };
  }
  if (subjectError || !subject) {
    return { error: 'Subject not found' };
  }
  if (subject.ExamID !== exam.ExamID) {
    return { error: 'Subject does not belong to the selected exam' };
  }

  const [{ data: chapters }, { data: topics }] = await Promise.all([
    supabase
      .from('Chapters')
      .select('ChapterID, ChapterNumber, ChapterName, SubjectID')
      .eq('SubjectID', subjectId)
      .order('ChapterNumber', { ascending: true }),
    supabase
      .from('Topics')
      .select('TopicID, TopicName, ChapterID, SubjectID')
      .eq('SubjectID', subjectId)
      .order('TopicName', { ascending: true }),
  ]);

  let chapter = null;
  if (chapterId) {
    const match = (chapters || []).find((c) => c.ChapterID === chapterId);
    if (!match) {
      return { error: 'Chapter not found for this subject' };
    }
    chapter = {
      id: match.ChapterID,
      number: match.ChapterNumber,
      name: match.ChapterName || `Chapter ${match.ChapterNumber}`,
    };
  }

  let topic = null;
  if (topicId) {
    const match = (topics || []).find((t) => t.TopicID === topicId);
    if (!match) {
      return { error: 'Topic not found for this subject' };
    }
    if (chapterId && match.ChapterID && match.ChapterID !== chapterId) {
      return { error: 'Topic does not belong to the selected chapter' };
    }
    topic = { id: match.TopicID, name: match.TopicName, chapterId: match.ChapterID || null };
  }

  const chapterGroups = groupTopicsByChapter(chapters || [], topics || []);
  const chapterTopics = chapter
    ? (chapterGroups.find((g) => g.id === chapter.id)?.topics || [])
    : [];

  return {
    context: {
      exam: { id: exam.ExamID, name: exam.ExamName },
      subject: { id: subject.SubjectID, name: subject.SubjectName },
      chapter,
      topic,
      chapterGroups,
      chapterTopics,
      generatedAt: new Date().toISOString().slice(0, 10),
    },
  };
}
