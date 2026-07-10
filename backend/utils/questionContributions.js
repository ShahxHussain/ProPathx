import { resolveQuestionStatus, statusToApiSlug } from './questionStatus.js';

function emptyStatusCounts() {
  return { draft: 0, pending: 0, verified: 0, rejected: 0, total: 0 };
}

function bumpStatusCounts(counts, question) {
  counts.total += 1;
  const slug = statusToApiSlug(resolveQuestionStatus(question));
  if (counts[slug] !== undefined) counts[slug] += 1;
}

function sortByCountDesc(a, b) {
  return b.count - a.count || String(a.name).localeCompare(String(b.name));
}

/**
 * Roll up questions into exam → subject → topic contribution tree.
 */
export function buildQuestionContributions(questions = []) {
  const totals = emptyStatusCounts();
  const examsMap = new Map();
  const subjectIds = new Set();
  const topicIds = new Set();

  for (const question of questions) {
    bumpStatusCounts(totals, question);

    const topic = question.Topics;
    if (!topic?.TopicID) continue;

    const subject = topic.Subjects;
    const exam = subject?.Exams;
    const examId = exam?.ExamID || 'uncategorized';
    const examName = exam?.ExamName || 'Uncategorized';
    const subjectId = subject?.SubjectID || 'uncategorized';
    const subjectName = subject?.SubjectName || 'Uncategorized';
    const topicId = topic.TopicID;
    const topicName = topic.TopicName || 'Unnamed topic';

    subjectIds.add(`${examId}:${subjectId}`);
    topicIds.add(topicId);

    if (!examsMap.has(examId)) {
      examsMap.set(examId, {
        examId,
        examName,
        count: 0,
        byStatus: emptyStatusCounts(),
        subjects: new Map(),
      });
    }
    const examNode = examsMap.get(examId);
    bumpStatusCounts(examNode.byStatus, question);
    examNode.count += 1;

    if (!examNode.subjects.has(subjectId)) {
      examNode.subjects.set(subjectId, {
        subjectId,
        subjectName,
        count: 0,
        byStatus: emptyStatusCounts(),
        topics: new Map(),
      });
    }
    const subjectNode = examNode.subjects.get(subjectId);
    bumpStatusCounts(subjectNode.byStatus, question);
    subjectNode.count += 1;

    if (!subjectNode.topics.has(topicId)) {
      subjectNode.topics.set(topicId, {
        topicId,
        topicName,
        count: 0,
        byStatus: emptyStatusCounts(),
      });
    }
    const topicNode = subjectNode.topics.get(topicId);
    bumpStatusCounts(topicNode.byStatus, question);
    topicNode.count += 1;
  }

  const exams = Array.from(examsMap.values())
    .map((exam) => ({
      ...exam,
      subjects: Array.from(exam.subjects.values())
        .map((subject) => ({
          ...subject,
          topics: Array.from(subject.topics.values()).sort(sortByCountDesc),
        }))
        .sort(sortByCountDesc),
    }))
    .sort(sortByCountDesc);

  const topExams = exams.slice(0, 6).map((e) => ({
    examId: e.examId,
    examName: e.examName,
    count: e.count,
  }));

  return {
    totals,
    coverage: {
      exams: exams.length,
      subjects: subjectIds.size,
      topics: topicIds.size,
    },
    exams,
    topExams,
  };
}
