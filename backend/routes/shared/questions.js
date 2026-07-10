import express from 'express';
import { supabase } from '../../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../middleware/auth.js';
import { validateSubscriptionForQuestionCreation, getSubscriptionStatus } from '../../utils/subscription.js';
import {
  QUESTION_STATUS,
  resolveQuestionStatus,
  buildStatusFields,
  countQuestionsByStatus,
  parseStatusFilterInput,
} from '../../utils/questionStatus.js';
import {
  findDuplicateQuestion,
  duplicateQuestionErrorMessage,
  normalizeQuestionText,
} from '../../utils/questionDuplicate.js';
import { batchDuplicateError } from '../../utils/bulkDuplicateCheck.js';
import {
  buildBulkTemplateCsv,
  parseBulkQuestionCsv,
  resolveBulkCommitStatus,
} from '../../utils/bulkQuestionCsv.js';
import {
  buildBulkTemplateDocxBuffer,
  parseBulkQuestionDocx,
} from '../../utils/bulkQuestionDocx.js';
import { loadBulkTemplateContext } from '../../utils/bulkTemplateContext.js';
import {
  getBulkTemplateFilename,
  resolveBulkTemplateMode,
} from '../../utils/bulkTemplateMode.js';
import { finalizeBulkParseResult } from '../../utils/bulkParseResult.js';
import { buildQuestionContributions } from '../../utils/questionContributions.js';

const router = express.Router();

/**
 * Helper function to check if a question can be accessed/modified by the current user
 * @param {Object} question - The question object
 * @param {string} userId - Current user's UserID
 * @param {string} orgId - Current user's OrgID (if OrgUser)
 * @param {string} actorType - 'User' or 'OrgUser'
 * @returns {Promise<{hasAccess: boolean, reason?: string}>}
 */
async function checkQuestionAccess(question, userId, orgId, actorType) {
  // For Platform Subject Expert: Check if they created the question
  if (actorType === 'User') {
    if (question.CreatedBy === userId) {
      return { hasAccess: true };
    }
    return { hasAccess: false, reason: 'Can only modify questions created by you' };
  }

  // For Organization Subject Expert: Check if question belongs to their organization
  if (actorType === 'OrgUser') {
    // Check if question belongs to the organization using OrgID
    if (question.OrgID === orgId) {
      return { hasAccess: true };
    }

    // If OrgID doesn't match, deny access
    return { hasAccess: false, reason: 'Can only modify questions created by your organization' };
  }

  return { hasAccess: false, reason: 'Invalid user type' };
}

function formatQuestionRow(q) {
  const ch = q.Topics?.Chapters;
  const chapter = ch && (Array.isArray(ch) ? ch[0] : ch);
  const options = (q.Options || [])
    .slice()
    .sort((a, b) => (a.OptionNumber ?? 0) - (b.OptionNumber ?? 0));
  const { Options, ...rest } = q;

  return {
    ...rest,
    options,
    ExamName: q.Topics?.Subjects?.Exams?.ExamName,
    SubjectName: q.Topics?.Subjects?.SubjectName,
    TopicName: q.Topics?.TopicName,
    ChapterID: q.Topics?.ChapterID ?? rest.ChapterID,
    ChapterNumber: chapter?.ChapterNumber,
    ChapterName: chapter?.ChapterName,
  };
}

async function buildExamsTree(exams) {
  if (!exams?.length) return [];

  const examIds = exams.map((e) => e.ExamID);
  const { data: subjects, error: subjectsError } = await supabase
    .from('Subjects')
    .select('SubjectID, SubjectName, Description, Weightage, ExamID')
    .in('ExamID', examIds)
    .order('SubjectName', { ascending: true });

  if (subjectsError) {
    return exams.map((exam) => ({ ...exam, subjects: [] }));
  }

  const subjectIds = (subjects || []).map((s) => s.SubjectID);
  if (!subjectIds.length) {
    return exams.map((exam) => ({ ...exam, subjects: [] }));
  }

  const [{ data: chapters }, { data: topics }] = await Promise.all([
    supabase
      .from('Chapters')
      .select('ChapterID, ChapterNumber, ChapterName, SubjectID')
      .in('SubjectID', subjectIds)
      .order('ChapterNumber', { ascending: true }),
    supabase
      .from('Topics')
      .select(
        'TopicID, TopicName, Description, SubjectID, ChapterID, Chapters(ChapterID, ChapterNumber, ChapterName)'
      )
      .in('SubjectID', subjectIds)
      .order('TopicName', { ascending: true }),
  ]);

  const subjectsByExam = new Map();
  for (const subject of subjects || []) {
    if (!subjectsByExam.has(subject.ExamID)) subjectsByExam.set(subject.ExamID, []);
    subjectsByExam.get(subject.ExamID).push(subject);
  }

  const chaptersBySubject = new Map();
  for (const chapter of chapters || []) {
    if (!chaptersBySubject.has(chapter.SubjectID)) chaptersBySubject.set(chapter.SubjectID, []);
    chaptersBySubject.get(chapter.SubjectID).push(chapter);
  }

  const topicsBySubject = new Map();
  for (const topic of topics || []) {
    if (!topicsBySubject.has(topic.SubjectID)) topicsBySubject.set(topic.SubjectID, []);
    topicsBySubject.get(topic.SubjectID).push(topic);
  }

  return exams.map((exam) => ({
    ...exam,
    subjects: (subjectsByExam.get(exam.ExamID) || []).map((subject) => ({
      ...subject,
      chapters: chaptersBySubject.get(subject.SubjectID) || [],
      topics: topicsBySubject.get(subject.SubjectID) || [],
    })),
  }));
}

/**
 * GET /api/questions
 * Get all questions for the logged-in Subject Expert
 * Filters by organization if user is OrgUser
 */
router.get(
  '/',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const { userId, orgId, actorType } = req.user;

    try {
      let query = supabase
        .from('Questions')
        .select(`
          *,
          Topics(
            TopicID,
            TopicName,
            ChapterID,
            Chapters(ChapterID, ChapterNumber, ChapterName),
            Subjects(
              SubjectID,
              SubjectName,
              Exams(
                ExamID,
                ExamName
              )
            )
          ),
          Options(OptionID, OptionText, IsCorrect, OptionNumber)
        `)
        .order('CreatedAt', { ascending: false });

      // Filter questions based on expert type
      if (actorType === 'User') {
        // Platform-level Subject Expert - show only questions created by them
        query = query.eq('CreatedBy', userId);
      } else if (actorType === 'OrgUser' && orgId) {
        // Organization Subject Expert - show only questions belonging to their organization
        query = query.eq('OrgID', orgId);
      }

      const { data: questions, error } = await query;

      if (error) {
        return res.status(500).json({ error: 'Failed to fetch questions', details: error.message });
      }

      const formattedQuestions = (questions || []).map(formatQuestionRow);

      res.json({ questions: formattedQuestions });
    } catch (error) {
      console.error('Get questions error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/questions/exams/list
 * Get list of exams, subjects, and topics
 * - Organization Subject Expert: Only exams from active subscription
 * - Platform Subject Expert: All exams (no subscription required)
 */
router.get(
  '/exams/list',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId, actorType } = req.user;

    try {
      let examsQuery;
      let availableExamIds = null;
      let subscriptionValidation = null;

      // For Organization Subject Expert: Filter by subscription
      if (actorType === 'OrgUser' && orgId) {
        subscriptionValidation = await validateSubscriptionForQuestionCreation(orgId);

        if (!subscriptionValidation.valid) {
          return res.json({
            exams: [],
            subscriptionStatus: {
              hasActiveSubscription: false,
              message: subscriptionValidation.message
            }
          });
        }

        availableExamIds = subscriptionValidation.availableExamIds;

        if (availableExamIds && availableExamIds.length > 0) {
          examsQuery = supabase
            .from('Exams')
            .select('ExamID, ExamName, Description, NoOfSubjects')
            .in('ExamID', availableExamIds)
            .order('ExamName', { ascending: true });
        } else {
          return res.json({
            exams: [],
            subscriptionStatus: {
              hasActiveSubscription: true,
              message: 'No exams are available in your subscription plans. Please contact support.'
            }
          });
        }
      } else if (actorType === 'OrgUser' && !orgId) {
        return res.json({ exams: [] });
      } else {
        // Platform-level Subject Expert: All exams, no subscription required
        examsQuery = supabase
          .from('Exams')
          .select('ExamID, ExamName, Description, NoOfSubjects')
          .order('ExamName', { ascending: true });
      }

      const { data: exams, error: examsError } = await examsQuery;

      if (examsError) {
        return res.status(500).json({ error: 'Failed to fetch exams', details: examsError.message });
      }

      const examsWithDetails = await buildExamsTree(exams || []);

      const response = { exams: examsWithDetails };

      if (actorType === 'OrgUser' && orgId) {
        response.subscriptionStatus = {
          hasActiveSubscription: subscriptionValidation?.valid ?? true,
          message: subscriptionValidation?.valid ? null : subscriptionValidation?.message
        };
      }

      res.json(response);
    } catch (error) {
      console.error('Get exams list error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/questions/subscription/status
 * Organization Subject Expert only; Platform experts don't need subscription
 */
router.get(
  '/subscription/status',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId, actorType } = req.user;

    try {
      if (actorType !== 'OrgUser' || !orgId) {
        return res.status(400).json({
          error: 'This endpoint is only available for Organization Subject Experts'
        });
      }

      const status = await getSubscriptionStatus(orgId);

      res.json(status);
    } catch (error) {
      console.error('Get subscription status error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/questions/dashboard/stats
 * Dashboard statistics for Subject Expert
 */
router.get(
  '/dashboard/stats',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const { userId, orgId, actorType } = req.user;

    try {
      let questionsQuery = supabase
        .from('Questions')
        .select('QuestionID, QuestionText, Status, IsVerified, ReviewerComments, CreatedAt, TimesUsed, TimesCorrect, TimesIncorrect, DifficultyLevel');

      if (actorType === 'OrgUser' && orgId) {
        questionsQuery = questionsQuery.eq('OrgID', orgId);
      } else if (actorType === 'User') {
        questionsQuery = questionsQuery.eq('CreatedBy', userId);
      }

      const { data: questions, error: questionsError } = await questionsQuery;

      if (questionsError) {
        return res.status(500).json({ error: 'Failed to fetch questions', details: questionsError.message });
      }

      const questionsList = questions || [];
      const statusCounts = countQuestionsByStatus(questionsList);
      const { draft, pending, verified, rejected, total } = statusCounts;
      const qualityScore = total > 0 ? Math.round((verified / total) * 100) : 0;

      const recentQuestions = questionsList
        .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt))
        .slice(0, 5)
        .map((q) => ({
          QuestionID: q.QuestionID,
          QuestionText: q.QuestionText,
          CreatedAt: q.CreatedAt,
          Status: resolveQuestionStatus(q),
          IsVerified: q.IsVerified,
          ReviewerComments: q.ReviewerComments,
          DifficultyLevel: q.DifficultyLevel,
        }));

      const statusData = [
        { status: 'Draft', count: draft },
        { status: 'Pending', count: pending },
        { status: 'Verified', count: verified },
        { status: 'Rejected', count: rejected },
      ];

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const questionsByDate = {};
      questionsList
        .filter((q) => new Date(q.CreatedAt) >= thirtyDaysAgo)
        .forEach((q) => {
          const dateObj = new Date(q.CreatedAt);
          const dateKey = dateObj.toISOString().split('T')[0];
          const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (!questionsByDate[dateKey]) {
            questionsByDate[dateKey] = { date: dateLabel, count: 0 };
          }
          questionsByDate[dateKey].count += 1;
        });

      const trendData = Object.entries(questionsByDate)
        .map(([dateKey, data]) => ({ date: data.date, count: data.count, dateKey }))
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .map(({ date, count }) => ({ date, count }));

      const totalUsed = questionsList.reduce((sum, q) => sum + (q.TimesUsed || 0), 0);
      const totalCorrect = questionsList.reduce((sum, q) => sum + (q.TimesCorrect || 0), 0);
      const accuracyRate = totalUsed > 0 ? Math.round((totalCorrect / totalUsed) * 100) : 0;

      res.json({
        stats: {
          total,
          draft,
          pending,
          verified,
          rejected,
          approved: verified,
          qualityScore,
          totalUsed,
          accuracyRate,
        },
        recentQuestions,
        statusData,
        trendData,
      });
    } catch (error) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/questions/dashboard/contributions
 * Personal contribution breakdown by exam → subject → topic.
 */
router.get(
  '/dashboard/contributions',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const { userId, orgId, actorType } = req.user;
    const orgUserId = req.user.orgUserId ?? req.user.org_user_id ?? null;

    try {
      let questionsQuery = supabase.from('Questions').select(`
        QuestionID,
        Status,
        IsVerified,
        ReviewerComments,
        CreatedAt,
        Topics(
          TopicID,
          TopicName,
          Subjects(
            SubjectID,
            SubjectName,
            Exams(ExamID, ExamName)
          )
        )
      `);

      if (actorType === 'OrgUser' && orgUserId) {
        questionsQuery = questionsQuery.eq('CreatedByOrgUserID', String(orgUserId));
        if (orgId) questionsQuery = questionsQuery.eq('OrgID', orgId);
      } else if (actorType === 'OrgUser' && orgId) {
        questionsQuery = questionsQuery.eq('OrgID', orgId);
      } else if (actorType === 'User') {
        questionsQuery = questionsQuery.eq('CreatedBy', userId);
      }

      const { data: questions, error: questionsError } = await questionsQuery;

      if (questionsError) {
        return res.status(500).json({
          error: 'Failed to fetch contributions',
          details: questionsError.message,
        });
      }

      const contribution = buildQuestionContributions(questions || []);

      res.json({
        scope:
          actorType === 'OrgUser' && orgUserId
            ? 'personal'
            : actorType === 'User'
              ? 'personal'
              : 'organization',
        ...contribution,
      });
    } catch (error) {
      console.error('Contributions error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/questions/bulk/template?format=csv|docx&examId&subjectId&chapterId&topicId
 * Download context-aware CSV or Word template for bulk MCQ upload.
 * Current behavior: Mode Q only (topic-level question-entry template).
 */
router.get(
  '/bulk/template',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const format = String(req.query.format || 'csv').toLowerCase();
    const examId = req.query.examId || null;
    const subjectId = req.query.subjectId || null;
    const chapterId = req.query.chapterId || null;
    const topicId = req.query.topicId || null;
    const uiContext = {
      defaultDifficulty: req.query.defaultDifficulty || 'Medium',
      defaultSource: req.query.defaultSource || 'Self',
      defaultQuestionType: req.query.defaultQuestionType || 'Single Correct',
    };

    const modeResult = resolveBulkTemplateMode({ examId, subjectId, chapterId, topicId });
    if (modeResult.error) {
      return res.status(400).json({ error: modeResult.error });
    }

    try {
      const loaded = await loadBulkTemplateContext({ examId, subjectId, chapterId, topicId });
      if (loaded.error) {
        return res.status(400).json({ error: loaded.error });
      }

      const filename = getBulkTemplateFilename(loaded.context, modeResult.mode, format);
      res.setHeader('X-Template-Mode', modeResult.mode);
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Template-Mode');

      if (format === 'docx') {
        const buffer = await buildBulkTemplateDocxBuffer(
          loaded.context,
          modeResult.mode,
          uiContext
        );
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
      }

      if (format !== 'csv') {
        return res.status(400).json({ error: 'format must be csv or docx' });
      }

      const csv = buildBulkTemplateCsv(loaded.context, modeResult.mode, uiContext);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    } catch (error) {
      console.error('Bulk template error:', error);
      return res.status(500).json({ error: 'Failed to generate template' });
    }
  }
);

/**
 * POST /api/questions/bulk/parse
 * Parse CSV text or DOCX (base64) with wizard context — preview only, no DB writes.
 */
router.post(
  '/bulk/parse',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const { csv, docxBase64, context } = req.body || {};
    if (!context?.topicId) {
      return res.status(400).json({
        error:
          'Topic context is required for upload. Select exam, subject, chapter, and topic, then use a question-entry template.',
      });
    }
    if (!context?.chapterId) {
      return res.status(400).json({ error: 'Chapter context is required for question upload' });
    }

    try {
      let result;
      if (docxBase64 && typeof docxBase64 === 'string') {
        const buffer = Buffer.from(docxBase64, 'base64');
        result = finalizeBulkParseResult(await parseBulkQuestionDocx(buffer, context), {
          source: 'docx',
        });
      } else if (csv && typeof csv === 'string') {
        result = finalizeBulkParseResult(parseBulkQuestionCsv(csv, context), { source: 'csv' });
      } else {
        return res.status(400).json({ error: 'CSV text or DOCX file (docxBase64) is required' });
      }
      return res.json(result);
    } catch (error) {
      console.error('Bulk parse error:', error);
      return res.status(500).json({ error: 'Failed to parse upload', details: error.message });
    }
  }
);

/**
 * POST /api/questions/bulk/commit
 * Commit validated rows as Draft or Pending questions.
 */
router.post(
  '/bulk/commit',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const { rows, status: statusInput, context } = req.body || {};
    const { userId, orgId: userOrgId, actorType } = req.user;
    const orgUserId = req.user.orgUserId ?? req.user.org_user_id ?? null;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows to commit' });
    }
    if (rows.length > 200) {
      return res.status(400).json({ error: 'Too many rows (max 200 per commit)' });
    }
    if (!context?.topicId) {
      return res.status(400).json({ error: 'Topic context is required' });
    }

    const commitStatus = resolveBulkCommitStatus(statusInput);
    const isDraft = commitStatus === QUESTION_STATUS.DRAFT;

    try {
      if (actorType === 'OrgUser' && userOrgId) {
        const subscriptionValidation = await validateSubscriptionForQuestionCreation(userOrgId);
        if (!subscriptionValidation.valid) {
          return res.status(403).json({
            error: subscriptionValidation.reason,
            message: subscriptionValidation.message,
          });
        }
        const examIdToCheck = context.examId;
        if (examIdToCheck && !subscriptionValidation.availableExamIds.includes(examIdToCheck)) {
          return res.status(403).json({
            error: 'Exam not in subscription',
            message: "The selected exam is not included in any of your organization's subscription plans.",
          });
        }
      }

      const created = [];
      const errors = [];
      const seenInBatch = new Set();

      for (const row of rows) {
        try {
          const normalized = normalizeQuestionText(row.questionText);
          if (normalized) {
            if (seenInBatch.has(normalized)) {
              errors.push(batchDuplicateError(row.rowIndex));
              continue;
            }

            const duplicate = await findDuplicateQuestion(supabase, {
              questionText: row.questionText?.trim(),
              topicId: context.topicId,
              examId: context.examId || null,
              subjectId: context.subjectId || null,
              chapterId: context.chapterId || null,
              orgId: actorType === 'OrgUser' ? userOrgId : null,
            });
            if (duplicate) {
              errors.push({
                rowIndex: row.rowIndex,
                code: 'DUPLICATE',
                message: duplicateQuestionErrorMessage(duplicate),
              });
              continue;
            }
          }

          let finalCreatedBy = null;
          let finalOrgID = null;
          let finalCreatedByOrgUserID = null;
          if (actorType === 'User') {
            finalCreatedBy = userId;
          } else if (actorType === 'OrgUser') {
            finalOrgID = userOrgId ?? null;
            finalCreatedByOrgUserID = orgUserId ? String(orgUserId) : null;
          }

          const questionData = {
            TopicID: context.topicId,
            QuestionText: row.questionText.trim(),
            DifficultyLevel: row.difficultyLevel || 'Medium',
            Explanation: row.explanation?.trim() || null,
            QuestionType: row.questionType || 'Single Correct',
            CreatedBy: finalCreatedBy,
            OrgID: finalOrgID,
            Source: row.source || 'Self',
            CreatedAt: new Date().toISOString(),
            ...buildStatusFields(commitStatus),
          };
          if (actorType === 'OrgUser') {
            questionData.CreatedByOrgUserID = finalCreatedByOrgUserID;
          }

          const { data: newQuestion, error: questionError } = await supabase
            .from('Questions')
            .insert(questionData)
            .select()
            .single();

          if (questionError) {
            errors.push({
              rowIndex: row.rowIndex,
              code: 'INSERT_FAILED',
              message: questionError.message,
            });
            continue;
          }

          const validOptions = (row.options || []).filter((o) => o.optionText?.trim());
          if (validOptions.length > 0) {
            const optionsToInsert = validOptions.map((opt, index) => ({
              QuestionID: newQuestion.QuestionID,
              OptionNumber: index + 1,
              OptionText: opt.optionText.trim(),
              IsCorrect: opt.isCorrect === true,
            }));
            const { error: optionsError } = await supabase.from('Options').insert(optionsToInsert);
            if (optionsError) {
              await supabase.from('Questions').delete().eq('QuestionID', newQuestion.QuestionID);
              errors.push({
                rowIndex: row.rowIndex,
                code: 'OPTIONS_FAILED',
                message: optionsError.message,
              });
              continue;
            }
          }

          const actorID = actorType === 'OrgUser' ? orgUserId || userId : userId;
          await createLog({
            actorType: actorType === 'OrgUser' ? 'OrgUser' : 'User',
            actorID,
            actionType: 'Create',
            entityType: 'Question',
            entityID: newQuestion.QuestionID,
            description: `Bulk ${isDraft ? 'draft' : 'submit'}: ${row.questionText.substring(0, 50)}...`,
            ipAddress,
            userAgent,
            newData: { bulk: true, rowIndex: row.rowIndex },
          });

          created.push({ rowIndex: row.rowIndex, questionId: newQuestion.QuestionID });
          if (normalized) {
            seenInBatch.add(normalized);
          }
        } catch (rowErr) {
          errors.push({
            rowIndex: row.rowIndex,
            code: 'ROW_ERROR',
            message: rowErr.message,
          });
        }
      }

      res.status(201).json({
        created: created.length,
        skipped: errors.length,
        createdIds: created,
        errors,
      });
    } catch (error) {
      console.error('Bulk commit error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/questions/:questionId
 * Get question details with options
 */
router.get(
  '/:questionId',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const { questionId } = req.params;
    const { userId, orgId, actorType } = req.user;

    try {
      // Get question (include Chapter via Topic for Subject Expert view)
      const { data: question, error: questionError } = await supabase
        .from('Questions')
        .select(`
          *,
          Topics(
            TopicID,
            TopicName,
            ChapterID,
            Chapters(ChapterID, ChapterNumber, ChapterName),
            Subjects(
              SubjectID,
              SubjectName,
              Exams(
                ExamID,
                ExamName
              )
            )
          ),
          Options(OptionID, OptionText, IsCorrect, OptionNumber)
        `)
        .eq('QuestionID', questionId)
        .single();

      if (questionError || !question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      // Check access - verify user can access this question
      const accessCheck = await checkQuestionAccess(question, userId, orgId, actorType);
      
      if (!accessCheck.hasAccess) {
        return res.status(403).json({ error: accessCheck.reason || 'Access denied' });
      }

      const formattedQuestion = formatQuestionRow(question);

      res.json({
        question: formattedQuestion,
        options: formattedQuestion.options || [],
      });
    } catch (error) {
      console.error('Get question details error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/questions
 * Create a new question (Subject Expert only)
 */
router.post(
  '/',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const {
      topicId,
      questionText,
      difficultyLevel,
      explanation,
      questionType,
      options,
      source,
      examId, // Added to validate exam access for Organization Subject Experts
      subjectId,
      chapterId,
      status: statusInput,
    } = req.body;
    const { userId, orgId: userOrgId, actorType } = req.user;
    const orgUserId = req.user.orgUserId ?? req.user.org_user_id ?? null;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      let subscriptionValidation = null;
      
      // For Organization Subject Expert: Validate subscription and exam access
      if (actorType === 'OrgUser' && userOrgId) {
        subscriptionValidation = await validateSubscriptionForQuestionCreation(userOrgId);
        
        if (!subscriptionValidation.valid) {
          return res.status(403).json({
            error: subscriptionValidation.reason,
            message: subscriptionValidation.message
          });
        }

        // If examId is provided (through topic), validate it's in ANY subscription
        if (examId || topicId) {
          let examIdToCheck = examId;
          
          // If examId not provided but topicId is, get examId from topic
          if (!examIdToCheck && topicId) {
            const { data: topic, error: topicError } = await supabase
              .from('Topics')
              .select('SubjectID, Subjects!inner(ExamID)')
              .eq('TopicID', topicId)
              .single();
            
            if (!topicError && topic?.Subjects?.ExamID) {
              examIdToCheck = topic.Subjects.ExamID;
            }
          }

          // Validate exam is in ANY of the organization's subscriptions
          if (examIdToCheck && !subscriptionValidation.availableExamIds.includes(examIdToCheck)) {
            return res.status(403).json({
              error: 'Exam not in subscription',
              message: 'The selected exam is not included in any of your organization\'s subscription plans.'
            });
          }
        }
      }

      const requestedStatus = parseStatusFilterInput(statusInput) || QUESTION_STATUS.PENDING;
      const isDraft = requestedStatus === QUESTION_STATUS.DRAFT;

      // Validation
      if (!isDraft && !questionText?.trim()) {
        return res.status(400).json({ error: 'Question text is required' });
      }

      if (isDraft && !questionText?.trim() && (!options || !options.some((opt) => opt.optionText?.trim()))) {
        return res.status(400).json({ error: 'Add question text or at least one option to save a draft' });
      }

      const optionList = Array.isArray(options) ? options : [];
      const validOptions = optionList.filter((opt) => opt.optionText?.trim());

      if (!isDraft) {
        if (optionList.length < 2) {
          return res.status(400).json({ error: 'At least 2 options are required' });
        }
        if (validOptions.length < 2) {
          return res.status(400).json({ error: 'At least 2 valid options are required' });
        }

        const correctOptions = validOptions.filter((opt) => opt.isCorrect === true);
        if (correctOptions.length === 0) {
          return res.status(400).json({ error: 'At least one correct answer must be selected' });
        }

        if (questionType === 'Single Correct' && correctOptions.length > 1) {
          return res.status(400).json({ error: 'Single Correct questions must have exactly one correct answer' });
        }

        if (questionType === 'Multiple Correct' && correctOptions.length < 2) {
          return res.status(400).json({ error: 'Multiple Correct questions must have at least 2 correct answers' });
        }
      } else if (validOptions.length > 0) {
        const correctOptions = validOptions.filter((opt) => opt.isCorrect === true);
        if (questionType === 'Single Correct' && correctOptions.length > 1) {
          return res.status(400).json({ error: 'Single Correct questions must have exactly one correct answer' });
        }
      }

      // Verify topic exists and user has access (if topicId is provided)
      if (topicId) {
        // First, check if topic exists
        const { data: topic, error: topicError } = await supabase
          .from('Topics')
          .select('TopicID, SubjectID')
          .eq('TopicID', topicId)
          .single();

        if (topicError || !topic) {
          console.error('Topic verification error:', topicError);
          return res.status(404).json({ error: 'Topic not found', details: topicError?.message });
        }

        // For Organization Subject Expert: Verify exam is in subscription
        // For Platform Subject Expert: No restrictions
        if (actorType === 'OrgUser' && userOrgId) {
          const { data: subject, error: subjectError } = await supabase
            .from('Subjects')
            .select('ExamID, SubjectID')
            .eq('SubjectID', topic.SubjectID)
            .single();

          if (subjectError || !subject) {
            return res.status(404).json({ error: 'Subject not found for topic' });
          }

          // Validate that the exam is in the organization's subscription
          // We already have subscriptionValidation from above
          if (subscriptionValidation && subscriptionValidation.availableExamIds) {
            if (!subscriptionValidation.availableExamIds.includes(subject.ExamID)) {
              return res.status(403).json({
                error: 'Exam not in subscription',
                message: 'The selected exam is not included in any of your organization\'s subscription plans.'
              });
            }
          }
        }
      }
      // If topicId is null, question will be created without a topic

      if (!isDraft) {
        try {
          const duplicate = await findDuplicateQuestion(supabase, {
            questionText: questionText?.trim(),
            topicId: topicId || null,
            examId: examId || null,
            subjectId: subjectId || null,
            chapterId: chapterId || null,
            orgId: actorType === 'OrgUser' ? userOrgId : null,
          });
          if (duplicate) {
            return res.status(409).json({
              error: duplicateQuestionErrorMessage(duplicate),
              code: 'DUPLICATE_QUESTION',
              duplicate,
            });
          }
        } catch (dupError) {
          console.error('Duplicate question check failed:', dupError);
          return res.status(500).json({
            error: 'Failed to verify question uniqueness',
            details: dupError.message,
          });
        }
      }

      // Determine question ownership based on expert type
      let finalCreatedBy = null;
      let finalOrgID = null;
      let finalCreatedByOrgUserID = null;

      if (actorType === 'User') {
        finalCreatedBy = userId;
        finalOrgID = null;
      } else if (actorType === 'OrgUser') {
        finalCreatedBy = null;
        finalOrgID = userOrgId ?? null;
        finalCreatedByOrgUserID = orgUserId ? String(orgUserId) : null;
      }

      const questionData = {
        TopicID: topicId || null,
        QuestionText: (questionText?.trim() || 'Untitled draft'),
        DifficultyLevel: difficultyLevel || 'Medium',
        Explanation: explanation?.trim() || null,
        QuestionType: questionType || 'Single Correct',
        CreatedBy: finalCreatedBy,
        OrgID: finalOrgID,
        Source: source || 'Self',
        CreatedAt: new Date().toISOString(),
        ...buildStatusFields(requestedStatus),
      };
      if (actorType === 'OrgUser') {
        questionData.CreatedByOrgUserID = finalCreatedByOrgUserID;
      }

      const { data: newQuestion, error: questionError } = await supabase
        .from('Questions')
        .insert(questionData)
        .select()
        .single();

      if (questionError) {
        return res.status(500).json({ error: 'Failed to create question', details: questionError.message });
      }

      // Create options (skip for empty drafts)
      if (validOptions.length > 0) {
        const optionsToInsert = validOptions.map((opt, index) => ({
          QuestionID: newQuestion.QuestionID,
          OptionNumber: index + 1,
          OptionText: opt.optionText.trim(),
          IsCorrect: opt.isCorrect === true,
        }));

        const { error: optionsError } = await supabase
          .from('Options')
          .insert(optionsToInsert);

        if (optionsError) {
          await supabase.from('Questions').delete().eq('QuestionID', newQuestion.QuestionID);
          return res.status(500).json({ error: 'Failed to create options', details: optionsError.message });
        }
      }

      // Create log
      const actorID = actorType === 'OrgUser' ? (orgUserId || userId) : userId;
      await createLog({
        actorType: actorType === 'OrgUser' ? 'OrgUser' : 'User',
        actorID: actorID,
        actionType: 'Create',
        entityType: 'Question',
        entityID: newQuestion.QuestionID,
        description: `${isDraft ? 'Saved draft' : 'Created question'}: ${(questionText || '').substring(0, 50)}...`,
        ipAddress,
        userAgent,
        newData: { questionText, difficultyLevel, questionType, topicId },
      });

      res.status(201).json({
        message: isDraft ? 'Draft saved successfully' : 'Question created successfully',
        question: newQuestion,
      });
    } catch (error) {
      console.error('Create question error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * PUT /api/questions/:questionId
 * Update a question (only if not verified or created by user)
 */
router.put(
  '/:questionId',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const { questionId } = req.params;
    const {
      topicId,
      questionText,
      difficultyLevel,
      explanation,
      questionType,
      options,
      source,
      status: statusInput,
      examId,
      subjectId,
      chapterId,
    } = req.body;
    const { userId, orgId, actorType } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if question exists (include OrgID, ReviewerComments for access check and status reset)
      const { data: existingQuestion, error: checkError } = await supabase
        .from('Questions')
        .select('QuestionID, TopicID, CreatedBy, OrgID, Status, SubmittedAt, IsVerified, ReviewerComments, VerifiedBy, VerifiedAt, QuestionText, DifficultyLevel, Explanation, QuestionType, Source, CreatedAt, UpdatedAt')
        .eq('QuestionID', questionId)
        .single();

      if (checkError || !existingQuestion) {
        return res.status(404).json({ error: 'Question not found' });
      }

      // Check access - verify user can modify this question
      const accessCheck = await checkQuestionAccess(existingQuestion, userId, orgId, actorType);
      
      if (!accessCheck.hasAccess) {
        return res.status(403).json({ error: accessCheck.reason || 'Access denied' });
      }

      const existingStatus = resolveQuestionStatus(existingQuestion);

      // Additional check: Cannot update verified questions (unless it's the creator)
      if (existingStatus === QUESTION_STATUS.VERIFIED && existingQuestion.CreatedBy !== userId) {
        return res.status(403).json({ error: 'Cannot update verified question created by another user' });
      }

      const requestedStatus = parseStatusFilterInput(statusInput);
      const isDraftSave = requestedStatus === QUESTION_STATUS.DRAFT;

      if (!isDraftSave && questionText && !questionText.trim()) {
        return res.status(400).json({ error: 'Question text cannot be empty' });
      }

      if (options && Array.isArray(options)) {
        const validOptions = options.filter((opt) => opt.optionText?.trim());
        if (!isDraftSave && validOptions.length < 2) {
          return res.status(400).json({ error: 'At least 2 valid options are required' });
        }

        if (!isDraftSave && validOptions.length >= 2) {
          const correctOptions = validOptions.filter((opt) => opt.isCorrect === true);
          if (correctOptions.length === 0) {
            return res.status(400).json({ error: 'At least one correct answer must be selected' });
          }

          if (questionType === 'Single Correct' && correctOptions.length > 1) {
            return res.status(400).json({ error: 'Single Correct questions must have exactly one correct answer' });
          }
        }
      }

      const nextTopicId = topicId !== undefined ? topicId : existingQuestion.TopicID;
      const nextQuestionText =
        questionText !== undefined ? questionText.trim() : existingQuestion.QuestionText;
      const willBeDraft =
        requestedStatus === QUESTION_STATUS.DRAFT ||
        (existingStatus === QUESTION_STATUS.DRAFT && !requestedStatus);

      if (!willBeDraft && !isDraftSave) {
        try {
          const duplicate = await findDuplicateQuestion(supabase, {
            questionText: nextQuestionText,
            topicId: nextTopicId || null,
            examId: examId || null,
            subjectId: subjectId || null,
            chapterId: chapterId || null,
            excludeQuestionId: questionId,
            orgId: actorType === 'OrgUser' ? orgId : null,
          });
          if (duplicate) {
            return res.status(409).json({
              error: duplicateQuestionErrorMessage(duplicate),
              code: 'DUPLICATE_QUESTION',
              duplicate,
            });
          }
        } catch (dupError) {
          console.error('Duplicate question check failed:', dupError);
          return res.status(500).json({
            error: 'Failed to verify question uniqueness',
            details: dupError.message,
          });
        }
      }

      // Update question
      const updateData = {};
      if (topicId !== undefined) updateData.TopicID = topicId;
      if (questionText !== undefined) updateData.QuestionText = questionText.trim();
      if (difficultyLevel !== undefined) updateData.DifficultyLevel = difficultyLevel;
      if (explanation !== undefined) updateData.Explanation = explanation?.trim() || null;
      if (questionType !== undefined) updateData.QuestionType = questionType;
      if (source !== undefined) updateData.Source = source;
      updateData.UpdatedBy = userId;
      updateData.UpdatedAt = new Date().toISOString();
      updateData.LastUpdated = new Date().toISOString();

      if (requestedStatus) {
        Object.assign(
          updateData,
          buildStatusFields(requestedStatus, {
            submittedAt: existingQuestion.SubmittedAt,
          })
        );
      } else if (existingStatus === QUESTION_STATUS.VERIFIED) {
        Object.assign(updateData, buildStatusFields(QUESTION_STATUS.PENDING));
      } else if (existingStatus === QUESTION_STATUS.REJECTED) {
        Object.assign(updateData, buildStatusFields(QUESTION_STATUS.PENDING));
      }

      const { data: updatedQuestion, error: updateError } = await supabase
        .from('Questions')
        .update(updateData)
        .eq('QuestionID', questionId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update question', details: updateError.message });
      }

      // Update options if provided
      if (options && Array.isArray(options)) {
        // Delete existing options
        await supabase.from('Options').delete().eq('QuestionID', questionId);

        // Insert new options
        const validOptions = options.filter((opt) => opt.optionText?.trim());
        const optionsToInsert = validOptions.map((opt, index) => ({
          QuestionID: questionId,
          OptionNumber: index + 1,
          OptionText: opt.optionText.trim(),
          IsCorrect: opt.isCorrect === true,
        }));

        const { error: optionsError } = await supabase
          .from('Options')
          .insert(optionsToInsert);

        if (optionsError) {
          return res.status(500).json({ error: 'Failed to update options', details: optionsError.message });
        }
      }

      // Create log
      await createLog({
        actorType: actorType === 'OrgUser' ? 'OrgUser' : 'User',
        actorID: userId,
        actionType: 'Update',
        entityType: 'Question',
        entityID: questionId,
        description: `Updated question: ${updatedQuestion.QuestionText.substring(0, 50)}...`,
        ipAddress,
        userAgent,
        previousData: existingQuestion,
        newData: updatedQuestion,
      });

      res.json({
        message: 'Question updated successfully',
        question: updatedQuestion,
      });
    } catch (error) {
      console.error('Update question error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/questions/:questionId
 * Delete a question (only if not verified or created by user)
 */
router.delete(
  '/:questionId',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const { questionId } = req.params;
    const { userId, orgId, actorType } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if question exists (include OrgID for access check)
      const { data: existingQuestion, error: checkError } = await supabase
        .from('Questions')
        .select('QuestionID, TopicID, CreatedBy, OrgID, Status, IsVerified, QuestionText, DifficultyLevel, Explanation, QuestionType, Source, CreatedAt, UpdatedAt')
        .eq('QuestionID', questionId)
        .single();

      if (checkError || !existingQuestion) {
        return res.status(404).json({ error: 'Question not found' });
      }

      // Check access - verify user can delete this question
      const accessCheck = await checkQuestionAccess(existingQuestion, userId, orgId, actorType);
      
      if (!accessCheck.hasAccess) {
        return res.status(403).json({ error: accessCheck.reason || 'Access denied' });
      }

      // Check if question is used in any tests
      const { data: testQuestions, error: testError } = await supabase
        .from('TestQuestions')
        .select('TestID')
        .eq('QuestionID', questionId)
        .limit(1);

      if (testError) {
        return res.status(500).json({ error: 'Failed to check question usage', details: testError.message });
      }

      if (testQuestions && testQuestions.length > 0) {
        return res.status(400).json({
          error: 'Cannot delete question that is used in tests. Please remove it from tests first.',
        });
      }

      const questionStatus = resolveQuestionStatus(existingQuestion);
      if (questionStatus === QUESTION_STATUS.VERIFIED) {
        return res.status(400).json({ error: 'Cannot delete a verified question' });
      }

      // Delete question (cascade will delete options)
      const { error: deleteError } = await supabase
        .from('Questions')
        .delete()
        .eq('QuestionID', questionId);

      if (deleteError) {
        return res.status(500).json({ error: 'Failed to delete question', details: deleteError.message });
      }

      // Create log
      await createLog({
        actorType: actorType === 'OrgUser' ? 'OrgUser' : 'User',
        actorID: userId,
        actionType: 'Delete',
        entityType: 'Question',
        entityID: questionId,
        description: `Deleted question: ${existingQuestion.QuestionText.substring(0, 50)}...`,
        ipAddress,
        userAgent,
        previousData: existingQuestion,
      });

      res.json({ message: 'Question deleted successfully' });
    } catch (error) {
      console.error('Delete question error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/questions/topics
 * Create a topic for a subject (Subject Expert only)
 * Used when creating questions and need to create a new topic
 */
router.post(
  '/topics',
  authenticate,
  requireRole(['Subject Expert']),
  verifyActiveStatus,
  async (req, res) => {
    const { examId, subjectId, topicName, description, chapterId } = req.body;
    const { orgUserId, userId, actorType, orgId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Validation
      if (!topicName || !topicName.trim()) {
        return res.status(400).json({ error: 'Topic name is required' });
      }

      if (!examId || !subjectId) {
        return res.status(400).json({ error: 'Exam ID and Subject ID are required' });
      }

      // Verify subject exists and belongs to exam
      const { data: subject, error: subjectError } = await supabase
        .from('Subjects')
        .select('SubjectID, SubjectName, ExamID')
        .eq('SubjectID', subjectId)
        .eq('ExamID', examId)
        .single();

      if (subjectError || !subject) {
        return res.status(404).json({ error: 'Subject not found' });
      }

      // For Organization Subject Expert: Verify exam is in subscription
      if (actorType === 'OrgUser' && orgId) {
        const subscriptionValidation = await validateSubscriptionForQuestionCreation(orgId);
        if (!subscriptionValidation.valid) {
          return res.status(403).json({
            error: subscriptionValidation.reason,
            message: subscriptionValidation.message
          });
        }
        // Check if exam is in any subscription
        if (!subscriptionValidation.availableExamIds.includes(examId)) {
          return res.status(403).json({
            error: 'Exam not in subscription',
            message: 'The selected exam is not included in any of your organization\'s subscription plans.'
          });
        }
      }

      // If chapterId provided, verify it belongs to this subject
      let finalChapterId = null;
      if (chapterId) {
        const { data: chapter, error: chapterErr } = await supabase
          .from('Chapters')
          .select('ChapterID')
          .eq('ChapterID', chapterId)
          .eq('SubjectID', subjectId)
          .single();
        if (!chapterErr && chapter) finalChapterId = chapterId;
      }

      // Create topic
      const { data: newTopic, error: topicError } = await supabase
        .from('Topics')
        .insert({
          SubjectID: subjectId,
          ChapterID: finalChapterId,
          TopicName: topicName.trim(),
          Description: description || null,
          CreatedBy: null,
          CreatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (topicError) {
        return res.status(500).json({ error: 'Failed to create topic', details: topicError.message });
      }

      // Create log
      const actorID = actorType === 'OrgUser' ? orgUserId : userId;
      await createLog({
        actorType: actorType === 'OrgUser' ? 'OrgUser' : 'User',
        actorID: actorID,
        actionType: 'Create',
        entityType: 'Topic',
        entityID: newTopic.TopicID,
        description: `Subject Expert created topic: ${topicName} for subject: ${subject.SubjectName}`,
        ipAddress,
        userAgent,
        newData: { topicName, description },
      });

      res.status(201).json({
        message: 'Topic created successfully',
        topic: newTopic,
      });
    } catch (error) {
      console.error('Create topic error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

export default router;

