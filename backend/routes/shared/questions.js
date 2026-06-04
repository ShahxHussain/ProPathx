import express from 'express';
import { supabase } from '../../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../middleware/auth.js';
import { validateSubscriptionForQuestionCreation, getSubscriptionStatus } from '../../utils/subscription.js';

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
          Topics!inner(
            TopicID,
            TopicName,
            Subjects!inner(
              SubjectID,
              SubjectName,
              Exams!inner(
                ExamID,
                ExamName
              )
            )
          )
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

      // Format the response to include exam/subject/topic info
      let formattedQuestions = (questions || []).map((q) => ({
        ...q,
        ExamName: q.Topics?.Subjects?.Exams?.ExamName,
        SubjectName: q.Topics?.Subjects?.SubjectName,
        TopicName: q.Topics?.TopicName,
      }));

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

      // For Organization Subject Expert: Filter by subscription
      if (actorType === 'OrgUser' && orgId) {
        // Validate subscription and get available exam IDs
        const subscriptionValidation = await validateSubscriptionForQuestionCreation(orgId);

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

      const examsWithDetails = await Promise.all(
        (exams || []).map(async (exam) => {
          const { data: subjects, error: subjectsError } = await supabase
            .from('Subjects')
            .select('SubjectID, SubjectName, Description, Weightage, ExamID')
            .eq('ExamID', exam.ExamID)
            .order('SubjectName', { ascending: true });

          if (subjectsError) {
            return { ...exam, subjects: [] };
          }

          const subjectsWithTopics = await Promise.all(
            (subjects || []).map(async (subject) => {
              const { data: chapters } = await supabase
                .from('Chapters')
                .select('ChapterID, ChapterNumber, ChapterName, SubjectID')
                .eq('SubjectID', subject.SubjectID)
                .order('ChapterNumber', { ascending: true });

              const { data: topics, error: topicsError } = await supabase
                .from('Topics')
                .select('TopicID, TopicName, Description, SubjectID, ChapterID, Chapters(ChapterID, ChapterNumber, ChapterName)')
                .eq('SubjectID', subject.SubjectID)
                .order('TopicName', { ascending: true });

              return {
                ...subject,
                chapters: chapters || [],
                topics: topics || [],
              };
            })
          );

          return {
            ...exam,
            subjects: subjectsWithTopics,
          };
        })
      );

      const response = { exams: examsWithDetails };

      if (actorType === 'OrgUser' && orgId) {
        const subscriptionValidation = await validateSubscriptionForQuestionCreation(orgId);
        response.subscriptionStatus = {
          hasActiveSubscription: subscriptionValidation.valid,
          message: subscriptionValidation.valid ? null : subscriptionValidation.message
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
        .select('QuestionID, QuestionText, IsVerified, ReviewerComments, CreatedAt, TimesUsed, TimesCorrect, TimesIncorrect, DifficultyLevel');

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
      const total = questionsList.length;
      const approved = questionsList.filter((q) => q.IsVerified === true).length;
      const pending = questionsList.filter((q) => !q.IsVerified && !q.ReviewerComments).length;
      const rejected = questionsList.filter((q) => q.ReviewerComments && !q.IsVerified).length;
      const qualityScore = total > 0 ? Math.round((approved / total) * 100) : 0;

      const recentQuestions = questionsList
        .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt))
        .slice(0, 5)
        .map((q) => ({
          QuestionID: q.QuestionID,
          QuestionText: q.QuestionText,
          CreatedAt: q.CreatedAt,
          IsVerified: q.IsVerified,
          ReviewerComments: q.ReviewerComments,
          DifficultyLevel: q.DifficultyLevel,
        }));

      const statusData = [
        { status: 'Approved', count: approved },
        { status: 'Pending', count: pending },
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
          approved,
          pending,
          rejected,
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
          Topics!inner(
            TopicID,
            TopicName,
            ChapterID,
            Chapters(ChapterID, ChapterNumber, ChapterName),
            Subjects!inner(
              SubjectID,
              SubjectName,
              Exams!inner(
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

      // Check access - verify user can access this question
      const accessCheck = await checkQuestionAccess(question, userId, orgId, actorType);
      
      if (!accessCheck.hasAccess) {
        return res.status(403).json({ error: accessCheck.reason || 'Access denied' });
      }

      // Get options
      const { data: options, error: optionsError } = await supabase
        .from('Options')
        .select('*')
        .eq('QuestionID', questionId)
        .order('OptionNumber', { ascending: true });

      if (optionsError) {
        return res.status(500).json({ error: 'Failed to fetch options', details: optionsError.message });
      }

      const ch = question.Topics?.Chapters;
      const chapter = ch && (Array.isArray(ch) ? ch[0] : ch);
      res.json({
        question: {
          ...question,
          ExamName: question.Topics?.Subjects?.Exams?.ExamName,
          SubjectName: question.Topics?.Subjects?.SubjectName,
          TopicName: question.Topics?.TopicName,
          ChapterID: question.Topics?.ChapterID,
          ChapterNumber: chapter?.ChapterNumber,
          ChapterName: chapter?.ChapterName,
        },
        options: options || [],
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

      // Validation
      if (!questionText?.trim()) {
        return res.status(400).json({ error: 'Question text is required' });
      }
      
      // Topic ID is optional (can be null)
      // If topicId is provided, verify it exists

      if (!options || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ error: 'At least 2 options are required' });
      }

      // Validate options have text
      const validOptions = options.filter((opt) => opt.optionText?.trim());
      if (validOptions.length < 2) {
        return res.status(400).json({ error: 'At least 2 valid options are required' });
      }

      // Validate at least one correct answer
      const correctOptions = validOptions.filter((opt) => opt.isCorrect === true);
      if (correctOptions.length === 0) {
        return res.status(400).json({ error: 'At least one correct answer must be selected' });
      }

      // Validate question type matches correct answers
      if (questionType === 'Single Correct' && correctOptions.length > 1) {
        return res.status(400).json({ error: 'Single Correct questions must have exactly one correct answer' });
      }

      if (questionType === 'Multiple Correct' && correctOptions.length < 2) {
        return res.status(400).json({ error: 'Multiple Correct questions must have at least 2 correct answers' });
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
        QuestionText: questionText.trim(),
        DifficultyLevel: difficultyLevel || 'Medium',
        Explanation: explanation?.trim() || null,
        QuestionType: questionType || 'Single Correct',
        CreatedBy: finalCreatedBy,
        OrgID: finalOrgID,
        Source: source || 'Self',
        IsVerified: false,
        CreatedAt: new Date().toISOString(),
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

      // Create options
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
        // Rollback question creation
        await supabase.from('Questions').delete().eq('QuestionID', newQuestion.QuestionID);
        return res.status(500).json({ error: 'Failed to create options', details: optionsError.message });
      }

      // Create log
      const actorID = actorType === 'OrgUser' ? (orgUserId || userId) : userId;
      await createLog({
        actorType: actorType === 'OrgUser' ? 'OrgUser' : 'User',
        actorID: actorID,
        actionType: 'Create',
        entityType: 'Question',
        entityID: newQuestion.QuestionID,
        description: `Created question: ${questionText.substring(0, 50)}...`,
        ipAddress,
        userAgent,
        newData: { questionText, difficultyLevel, questionType, topicId },
      });

      res.status(201).json({
        message: 'Question created successfully',
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
    } = req.body;
    const { userId, orgId, actorType } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if question exists (include OrgID, ReviewerComments for access check and status reset)
      const { data: existingQuestion, error: checkError } = await supabase
        .from('Questions')
        .select('QuestionID, TopicID, CreatedBy, OrgID, IsVerified, ReviewerComments, VerifiedBy, VerifiedAt, QuestionText, DifficultyLevel, Explanation, QuestionType, Source, CreatedAt, UpdatedAt')
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

      // Additional check: Cannot update verified questions (unless it's the creator)
      // For OrgUser with CreatedBy=null, we allow updates if exam is in subscription
      if (existingQuestion.IsVerified && existingQuestion.CreatedBy !== userId) {
        return res.status(403).json({ error: 'Cannot update verified question created by another user' });
      }

      // Validation
      if (questionText && !questionText.trim()) {
        return res.status(400).json({ error: 'Question text cannot be empty' });
      }

      if (options && Array.isArray(options)) {
        const validOptions = options.filter((opt) => opt.optionText?.trim());
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

      // If question was verified, unverify it after update (needs re-review)
      if (existingQuestion.IsVerified) {
        updateData.IsVerified = false;
        updateData.VerifiedBy = null;
        updateData.VerifiedAt = null;
        updateData.ReviewerComments = null; // Clear any previous comments
      }

      // If question was rejected (has ReviewerComments and IsVerified = false), 
      // clear comments and reset verification fields to move it back to pending status
      if (existingQuestion.ReviewerComments && !existingQuestion.IsVerified) {
        updateData.ReviewerComments = null;
        updateData.VerifiedBy = null;
        updateData.VerifiedAt = null;
        updateData.IsVerified = false; // Ensure it's marked as pending (not verified)
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
        .select('QuestionID, TopicID, CreatedBy, OrgID, IsVerified, QuestionText, DifficultyLevel, Explanation, QuestionType, Source, CreatedAt, UpdatedAt')
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

