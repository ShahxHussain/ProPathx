import express from 'express';
import { supabase } from '../../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../middleware/auth.js';

const router = express.Router();

const sortOptions = (options = []) =>
  [...options].sort((a, b) => (a.OptionNumber || 0) - (b.OptionNumber || 0));

const formatReviewerQuestion = (q, includeOptions = false) => {
  const ch = q.Topics?.Chapters;
  const chapter = Array.isArray(ch) ? ch[0] : ch;
  const formatted = {
    QuestionID: q.QuestionID,
    QuestionText: q.QuestionText,
    DifficultyLevel: q.DifficultyLevel,
    QuestionType: q.QuestionType,
    Explanation: q.Explanation,
    CreatedAt: q.CreatedAt,
    IsVerified: q.IsVerified,
    ReviewerComments: q.ReviewerComments,
    VerifiedBy: q.VerifiedBy,
    VerifiedAt: q.VerifiedAt,
    ExamName: q.Topics?.Subjects?.Exams?.ExamName,
    SubjectName: q.Topics?.Subjects?.SubjectName,
    TopicName: q.Topics?.TopicName,
    ChapterNumber: chapter?.ChapterNumber,
    ChapterName: chapter?.ChapterName,
    CreatedBy: q.CreatedBy,
  };

  if (includeOptions) {
    formatted.options = sortOptions(q.Options || []);
  }

  return formatted;
};

const resolveCreatorInfo = async (createdBy) => {
  if (!createdBy) return null;

  const [{ data: platformUser }, { data: orgUser }] = await Promise.all([
    supabase.from('Users').select('UserID, FullName, Email').eq('UserID', createdBy).maybeSingle(),
    supabase.from('OrgUsers').select('OrgUserID, FullName, Email').eq('OrgUserID', createdBy).maybeSingle(),
  ]);

  if (platformUser) {
    return { name: platformUser.FullName, email: platformUser.Email, type: 'Platform' };
  }
  if (orgUser) {
    return { name: orgUser.FullName, email: orgUser.Email, type: 'Organization' };
  }
  return null;
};

const fetchOptionsByQuestionIds = async (questionIds = []) => {
  const ids = [...new Set(questionIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const { data: options, error } = await supabase
    .from('Options')
    .select('OptionID, OptionText, OptionNumber, IsCorrect, QuestionID')
    .in('QuestionID', ids)
    .order('OptionNumber', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const map = {};
  (options || []).forEach((opt) => {
    if (!map[opt.QuestionID]) map[opt.QuestionID] = [];
    map[opt.QuestionID].push(opt);
  });
  return map;
};

const attachOptions = (questions = [], optionsMap = {}) =>
  questions.map((q) => ({
    ...formatReviewerQuestion(q, false),
    options: sortOptions(optionsMap[q.QuestionID] || []),
  }));

/**
 * GET /api/reviewers/dashboard/stats
 * Get dashboard statistics for Reviewer
 */
router.get(
  '/dashboard/stats',
  authenticate,
  requireRole(['Reviewer']),
  verifyActiveStatus,
  async (req, res) => {
    const { userId, orgId, actorType } = req.user;

    try {
      // Build base query for questions
      let questionsQuery = supabase
        .from('Questions')
        .select('QuestionID, IsVerified, ReviewerComments, CreatedAt, VerifiedBy, VerifiedAt');

      // Filter by organization if user is OrgUser
      if (actorType === 'OrgUser' && orgId) {
        questionsQuery = questionsQuery.eq('OrgID', orgId);
      }
      // Platform-level Reviewers can see all questions

      const { data: questions, error: questionsError } = await questionsQuery;

      if (questionsError) {
        return res.status(500).json({ error: 'Failed to fetch questions', details: questionsError.message });
      }

      const questionsList = questions || [];

      // Calculate statistics
      const pending = questionsList.filter((q) => !q.IsVerified && !q.ReviewerComments).length;
      const approved = questionsList.filter((q) => q.IsVerified === true).length;
      const rejected = questionsList.filter((q) => q.ReviewerComments && !q.IsVerified).length;
      const totalReviewed = approved + rejected;

      // Get questions reviewed by this reviewer
      const reviewedByMe = questionsList.filter((q) => q.VerifiedBy === userId).length;

      // Get recent reviews (last 5)
      const recentReviews = questionsList
        .filter((q) => q.VerifiedBy === userId && q.VerifiedAt)
        .sort((a, b) => new Date(b.VerifiedAt) - new Date(a.VerifiedAt))
        .slice(0, 5)
        .map((q) => ({
          QuestionID: q.QuestionID,
          IsVerified: q.IsVerified,
          ReviewerComments: q.ReviewerComments,
          VerifiedAt: q.VerifiedAt,
        }));

      // Get questions by status for chart
      const statusData = [
        { status: 'Pending', count: pending },
        { status: 'Approved', count: approved },
        { status: 'Rejected', count: rejected },
      ];

      // Get review activity over last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const reviewsByDate = {};
      questionsList
        .filter((q) => q.VerifiedBy === userId && q.VerifiedAt && new Date(q.VerifiedAt) >= thirtyDaysAgo)
        .forEach((q) => {
          const dateObj = new Date(q.VerifiedAt);
          const dateKey = dateObj.toISOString().split('T')[0];
          const dateLabel = dateObj.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          if (!reviewsByDate[dateKey]) {
            reviewsByDate[dateKey] = { date: dateLabel, count: 0 };
          }
          reviewsByDate[dateKey].count += 1;
        });

      const trendData = Object.entries(reviewsByDate)
        .map(([dateKey, data]) => ({ date: data.date, count: data.count, dateKey }))
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .map(({ date, count }) => ({ date, count }));

      res.json({
        stats: {
          pending,
          approved,
          rejected,
          totalReviewed,
          reviewedByMe,
        },
        recentReviews,
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
 * GET /api/reviewers/questions
 * Get questions for review (pending, approved, rejected)
 */
router.get(
  '/questions',
  authenticate,
  requireRole(['Reviewer']),
  verifyActiveStatus,
  async (req, res) => {
    const { status, limit = 50, offset = 0 } = req.query;
    const { userId, orgId, actorType } = req.user;

    try {
      let questionsQuery = supabase
        .from('Questions')
        .select(`
          QuestionID,
          QuestionText,
          DifficultyLevel,
          QuestionType,
          Explanation,
          CreatedAt,
          IsVerified,
          ReviewerComments,
          VerifiedBy,
          VerifiedAt,
          CreatedBy,
          OrgID,
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
          )
        `)
        .order('CreatedAt', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      // Filter by organization if user is OrgUser
      if (actorType === 'OrgUser' && orgId) {
        questionsQuery = questionsQuery.eq('OrgID', orgId);
      }

      // Filter by status
      if (status === 'pending') {
        questionsQuery = questionsQuery.eq('IsVerified', false).is('ReviewerComments', null);
      } else if (status === 'approved') {
        questionsQuery = questionsQuery.eq('IsVerified', true);
      } else if (status === 'rejected') {
        questionsQuery = questionsQuery.eq('IsVerified', false).not('ReviewerComments', 'is', null);
      }

      const { data: questions, error: questionsError } = await questionsQuery;

      if (questionsError) {
        return res.status(500).json({ error: 'Failed to fetch questions', details: questionsError.message });
      }

      const questionList = questions || [];
      let optionsMap = {};
      try {
        optionsMap = await fetchOptionsByQuestionIds(questionList.map((q) => q.QuestionID));
      } catch (optionsError) {
        console.error('Failed to fetch question options:', optionsError);
        return res.status(500).json({
          error: 'Failed to fetch question options',
          details: optionsError.message,
        });
      }

      const formattedQuestions = attachOptions(questionList, optionsMap);

      res.json({ questions: formattedQuestions });
    } catch (error) {
      console.error('Get questions error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/reviewers/questions/:questionId
 * Get question details with options for review
 */
router.get(
  '/questions/:questionId',
  authenticate,
  requireRole(['Reviewer']),
  verifyActiveStatus,
  async (req, res) => {
    const { questionId } = req.params;
    const { orgId, actorType } = req.user;

    try {
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
          )
        `)
        .eq('QuestionID', questionId)
        .single();

      if (questionError || !question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      if (actorType === 'OrgUser' && orgId && question.OrgID !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const [{ data: options, error: optionsError }, creatorInfo] = await Promise.all([
        supabase
          .from('Options')
          .select('OptionID, OptionText, OptionNumber, IsCorrect')
          .eq('QuestionID', questionId)
          .order('OptionNumber', { ascending: true }),
        resolveCreatorInfo(question.CreatedBy),
      ]);

      if (optionsError) {
        return res.status(500).json({ error: 'Failed to fetch options', details: optionsError.message });
      }

      const formatted = formatReviewerQuestion(question, false);

      res.json({
        question: {
          ...formatted,
          ChapterID: question.Topics?.ChapterID,
        },
        options: sortOptions(options || []),
        creator: creatorInfo,
      });
    } catch (error) {
      console.error('Get question details error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/reviewers/questions/:questionId/approve
 * Approve a question
 */
router.post(
  '/questions/:questionId/approve',
  authenticate,
  requireRole(['Reviewer']),
  verifyActiveStatus,
  async (req, res) => {
    const { questionId } = req.params;
    const { userId, orgId, actorType } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if question exists
      const { data: question, error: questionError } = await supabase
        .from('Questions')
        .select('*')
        .eq('QuestionID', questionId)
        .single();

      if (questionError || !question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      // Check organization access for OrgUsers
      if (actorType === 'OrgUser' && orgId && question.OrgID !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Update question
      const { data: updatedQuestion, error: updateError } = await supabase
        .from('Questions')
        .update({
          IsVerified: true,
          VerifiedBy: userId,
          VerifiedAt: new Date().toISOString(),
          ReviewerComments: null,
          UpdatedBy: userId,
          UpdatedAt: new Date().toISOString(),
        })
        .eq('QuestionID', questionId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to approve question', details: updateError.message });
      }

      // Create log
      await createLog({
        actorType: actorType === 'OrgUser' ? 'OrgUser' : 'User',
        actorID: userId,
        actionType: 'Update',
        entityType: 'Question',
        entityID: questionId,
        description: `Approved question: ${question.QuestionText?.substring(0, 50)}...`,
        ipAddress,
        userAgent,
        previousData: { IsVerified: false },
        newData: { IsVerified: true, VerifiedBy: userId },
      });

      res.json({
        message: 'Question approved successfully',
        question: updatedQuestion,
      });
    } catch (error) {
      console.error('Approve question error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/reviewers/questions/:questionId/reject
 * Reject a question
 */
router.post(
  '/questions/:questionId/reject',
  authenticate,
  requireRole(['Reviewer']),
  verifyActiveStatus,
  async (req, res) => {
    const { questionId } = req.params;
    const { comments } = req.body;
    const { userId, orgId, actorType } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Validation
      if (!comments || !comments.trim()) {
        return res.status(400).json({ error: 'Rejection comments are required' });
      }

      // Check if question exists
      const { data: question, error: questionError } = await supabase
        .from('Questions')
        .select('*')
        .eq('QuestionID', questionId)
        .single();

      if (questionError || !question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      // Check organization access for OrgUsers
      if (actorType === 'OrgUser' && orgId && question.OrgID !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Update question
      const { data: updatedQuestion, error: updateError } = await supabase
        .from('Questions')
        .update({
          IsVerified: false,
          VerifiedBy: userId,
          VerifiedAt: new Date().toISOString(),
          ReviewerComments: comments.trim(),
          UpdatedBy: userId,
          UpdatedAt: new Date().toISOString(),
        })
        .eq('QuestionID', questionId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to reject question', details: updateError.message });
      }

      // Create log
      await createLog({
        actorType: actorType === 'OrgUser' ? 'OrgUser' : 'User',
        actorID: userId,
        actionType: 'Update',
        entityType: 'Question',
        entityID: questionId,
        description: `Rejected question: ${question.QuestionText?.substring(0, 50)}...`,
        ipAddress,
        userAgent,
        previousData: { IsVerified: question.IsVerified, ReviewerComments: question.ReviewerComments },
        newData: { IsVerified: false, ReviewerComments: comments.trim(), VerifiedBy: userId },
      });

      res.json({
        message: 'Question rejected successfully',
        question: updatedQuestion,
      });
    } catch (error) {
      console.error('Reject question error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/reviewers/experts/performance
 * Get Subject Expert performance metrics
 */
router.get(
  '/experts/performance',
  authenticate,
  requireRole(['Reviewer']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId, actorType } = req.user;

    try {
      // Build query for questions
      let questionsQuery = supabase
        .from('Questions')
        .select('QuestionID, CreatedBy, IsVerified, ReviewerComments, CreatedAt, OrgID');

      // Filter by organization if user is OrgUser
      if (actorType === 'OrgUser' && orgId) {
        questionsQuery = questionsQuery.eq('OrgID', orgId);
      }

      const { data: questions, error: questionsError } = await questionsQuery;

      if (questionsError) {
        return res.status(500).json({ error: 'Failed to fetch questions', details: questionsError.message });
      }

      // Group questions by creator
      const expertStats = {};
      (questions || []).forEach((q) => {
        const creatorId = q.CreatedBy;
        if (!creatorId) return;

        if (!expertStats[creatorId]) {
          expertStats[creatorId] = {
            createdBy: creatorId,
            totalQuestions: 0,
            approved: 0,
            rejected: 0,
            pending: 0,
          };
        }

        expertStats[creatorId].totalQuestions += 1;
        if (q.IsVerified) {
          expertStats[creatorId].approved += 1;
        } else if (q.ReviewerComments) {
          expertStats[creatorId].rejected += 1;
        } else {
          expertStats[creatorId].pending += 1;
        }
      });

      // Get creator details
      const expertIds = Object.keys(expertStats);
      const experts = [];

      for (const creatorId of expertIds) {
        // Try platform users first
        const { data: platformUser } = await supabase
          .from('Users')
          .select('UserID, FullName, Email, Role')
          .eq('UserID', creatorId)
          .eq('Role', 'Subject Expert')
          .single();

        if (platformUser) {
          const stats = expertStats[creatorId];
          const approvalRate = stats.totalQuestions > 0
            ? Math.round((stats.approved / stats.totalQuestions) * 100)
            : 0;

          experts.push({
            id: platformUser.UserID,
            name: platformUser.FullName,
            email: platformUser.Email,
            type: 'Platform',
            ...stats,
            approvalRate,
          });
        } else {
          // Try org users
          const { data: orgUser } = await supabase
            .from('OrgUsers')
            .select('OrgUserID, FullName, Email, Role, OrgID')
            .eq('OrgUserID', creatorId)
            .eq('Role', 'Subject Expert')
            .single();

          if (orgUser) {
            // Check organization access for OrgUsers
            if (actorType === 'OrgUser' && orgId && orgUser.OrgID !== orgId) {
              continue; // Skip experts from other organizations
            }

            const stats = expertStats[creatorId];
            const approvalRate = stats.totalQuestions > 0
              ? Math.round((stats.approved / stats.totalQuestions) * 100)
              : 0;

            experts.push({
              id: orgUser.OrgUserID,
              name: orgUser.FullName,
              email: orgUser.Email,
              type: 'Organization',
              orgId: orgUser.OrgID,
              ...stats,
              approvalRate,
            });
          }
        }
      }

      res.json({ experts });
    } catch (error) {
      console.error('Get experts performance error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

export default router;

