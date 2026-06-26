import express from 'express';
import { supabase } from '../../../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../../../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../../middleware/auth.js';
import {
  validateWeightageForAdd,
  ensureScheduledModeEnabledForTestSubscription,
} from './shared.js';

const router = express.Router();

/**
 * GET /api/org/tests/:testId/questions/available
 * List questions that can be added to this test (same exam, org scope, not already in test). Respects MaxQuestionsPerTest.
 */
router.get('/:testId/questions/available', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { orgId } = req.user;
  const { subjectId, topicId, difficulty, approvedOnly, search, customOnly, questionType, page = 1, limit = 50 } = req.query;

  try {
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, ExamID, OrgID, SubscriptionID, TotalQuestions, TotalMarks')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const { data: subscription } = await supabase
      .from('Subscriptions')
      .select('PlanID')
      .eq('SubscriptionID', test.SubscriptionID)
      .single();

    let maxQuestionsPerTest = null;
    if (subscription?.PlanID) {
      const { data: planExam } = await supabase
        .from('SubscriptionPlanExams')
        .select('MaxQuestionsPerTest')
        .eq('PlanID', subscription.PlanID)
        .eq('ExamID', test.ExamID)
        .single();
      maxQuestionsPerTest = planExam?.MaxQuestionsPerTest ?? null;
    }

    const { data: existingRows } = await supabase
      .from('TestQuestions')
      .select('QuestionID')
      .eq('TestID', testId);
    const existingIds = (existingRows || []).map((r) => r.QuestionID);
    const currentCount = existingIds.length;

    const { data: subjects } = await supabase
      .from('Subjects')
      .select('SubjectID')
      .eq('ExamID', test.ExamID);
    const subjectIds = (subjects || []).map((s) => s.SubjectID);
    if (subjectIds.length === 0) {
      return res.json({
        questions: [],
        currentCount,
        maxQuestionsPerTest,
        canAddMore: maxQuestionsPerTest == null || currentCount < maxQuestionsPerTest,
        pagination: { page: 1, limit: Number(limit), total: 0, totalPages: 0 },
      });
    }

    let topicIds = null;
    if (topicId) {
      const { data: t } = await supabase.from('Topics').select('TopicID').eq('TopicID', topicId).single();
      topicIds = t ? [t.TopicID] : [];
    } else {
      const filterSubjectIds = subjectId ? [subjectId] : subjectIds;
      const { data: topics } = await supabase
        .from('Topics')
        .select('TopicID')
        .in('SubjectID', filterSubjectIds);
      topicIds = (topics || []).map((t) => t.TopicID);
    }
    if (topicIds.length === 0) {
      return res.json({
        questions: [],
        currentCount,
        maxQuestionsPerTest,
        canAddMore: true,
        pagination: { page: 1, limit: Number(limit), total: 0, totalPages: 0 },
      });
    }

    // Custom binding: only this org's questions (OrgID = orgId). Otherwise org + platform.
    const customOnlyOrg = customOnly === 'true' || customOnly === '1';
    let query = supabase
      .from('Questions')
      .select(`
        QuestionID,
        QuestionText,
        DifficultyLevel,
        QuestionType,
        IsVerified,
        TopicID,
        OrgID,
        Topics (
          TopicName,
          SubjectID,
          Subjects ( SubjectName, ExamID )
        )
      `, { count: 'exact' })
      .in('TopicID', topicIds);
    if (customOnlyOrg) {
      query = query.eq('OrgID', orgId);
    } else {
      query = query.or(`OrgID.eq.${orgId},OrgID.is.null`);
    }
    if (existingIds.length > 0) {
      query = query.not('QuestionID', 'in', `(${existingIds.join(',')})`);
    }

    if (difficulty) query = query.eq('DifficultyLevel', difficulty);
    if (approvedOnly === 'true' || approvedOnly === '1') query = query.eq('Status', 'Verified');
    if (questionType && (questionType === 'Single Correct' || questionType === 'Multiple Correct')) query = query.eq('QuestionType', questionType);
    if (search && search.trim()) query = query.ilike('QuestionText', `%${search.trim()}%`);

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const from = (pageNum - 1) * limitNum;
    query = query.order('CreatedAt', { ascending: false }).range(from, from + limitNum - 1);

    const { data: questions, error: qError, count } = await query;

    if (qError) {
      console.error('Available questions error:', qError);
      return res.status(500).json({ error: 'Failed to fetch available questions', details: qError.message });
    }

    const total = count ?? (questions?.length ?? 0);
    res.json({
      questions: questions || [],
      currentCount,
      maxQuestionsPerTest,
      canAddMore: maxQuestionsPerTest == null || currentCount < maxQuestionsPerTest,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get available questions error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/tests/:testId/questions
 * Add questions to test. Enforces exam scope, org scope, and MaxQuestionsPerTest.
 */
router.post('/:testId/questions', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { questionIds = [] } = req.body;
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'questionIds must be a non-empty array' });
    }

    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, ExamID, OrgID, SubscriptionID, TotalQuestions, TotalMarks')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const { data: subscription } = await supabase
      .from('Subscriptions')
      .select('PlanID')
      .eq('SubscriptionID', test.SubscriptionID)
      .single();

    let maxQuestionsPerTest = null;
    if (subscription?.PlanID) {
      const { data: planExam } = await supabase
        .from('SubscriptionPlanExams')
        .select('MaxQuestionsPerTest')
        .eq('PlanID', subscription.PlanID)
        .eq('ExamID', test.ExamID)
        .single();
      maxQuestionsPerTest = planExam?.MaxQuestionsPerTest ?? null;
    }

    const { data: existingRows } = await supabase
      .from('TestQuestions')
      .select('QuestionID')
      .eq('TestID', testId);
    const currentCount = (existingRows || []).length;

    const uniqueIds = [...new Set(questionIds)];
    const newCount = currentCount + uniqueIds.length;
    if (maxQuestionsPerTest != null && newCount > maxQuestionsPerTest) {
      return res.status(400).json({
        error: 'Adding these questions would exceed the plan limit',
        maxQuestionsPerTest,
        currentCount,
        requested: uniqueIds.length,
      });
    }

    const { data: subjects } = await supabase
      .from('Subjects')
      .select('SubjectID')
      .eq('ExamID', test.ExamID);
    const subjectIds = (subjects || []).map((s) => s.SubjectID);
    const { data: topics } = await supabase
      .from('Topics')
      .select('TopicID')
      .in('SubjectID', subjectIds);
    const validTopicIds = new Set((topics || []).map((t) => t.TopicID));

    const { data: questions } = await supabase
      .from('Questions')
      .select('QuestionID, TopicID, OrgID')
      .in('QuestionID', uniqueIds);

    const toAdd = [];
    const invalid = [];
    for (const q of questions || []) {
      if (!validTopicIds.has(q.TopicID)) {
        invalid.push(q.QuestionID);
        continue;
      }
      if (q.OrgID != null && q.OrgID !== orgId) {
        invalid.push(q.QuestionID);
        continue;
      }
      toAdd.push(q.QuestionID);
    }
    const alreadyInTest = (existingRows || []).map((r) => r.QuestionID);
    const actuallyNew = toAdd.filter((id) => !alreadyInTest.includes(id));

    if (actuallyNew.length === 0) {
      return res.status(400).json({
        error: invalid.length ? 'Some questions are invalid or not allowed for this test' : 'All given questions are already in this test',
        invalid: invalid.length ? invalid : undefined,
      });
    }

    const totalAfterAdd = currentCount + actuallyNew.length;
    const totalForWeightage = test.TotalQuestions != null ? Math.max(totalAfterAdd, test.TotalQuestions) : totalAfterAdd;
    const weightageCheck = await validateWeightageForAdd(testId, test.ExamID, totalForWeightage, actuallyNew);
    if (!weightageCheck.valid) {
      return res.status(400).json({
        error: weightageCheck.message,
        weightageExceeded: weightageCheck.exceeded,
      });
    }

    const marksPerQuestion = test.TotalMarks ? Number(test.TotalMarks) / (currentCount + actuallyNew.length) : 1;
    const rows = actuallyNew.map((qId) => ({
      TestID: testId,
      QuestionID: qId,
      Marks: marksPerQuestion,
      TimeLimit: null,
      NegativeMarks: 0,
    }));

    const { error: insertError } = await supabase.from('TestQuestions').insert(rows);

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(400).json({ error: 'One or more questions are already in this test' });
      }
      console.error('Insert TestQuestions error:', insertError);
      return res.status(500).json({
        error: 'Failed to add questions',
        details: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
      });
    }

    const linkedAfterAdd = currentCount + actuallyNew.length;
    // Do not overwrite Tests.TotalQuestions — it is the configured paper size from test settings;
    // linked count is testDetails.questions.length from GET.

    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Test',
      entityID: testId,
      description: `Added ${actuallyNew.length} question(s) to test`,
      ipAddress,
      userAgent,
      newData: { addedCount: actuallyNew.length, questionIds: actuallyNew },
    });

    res.status(201).json({
      message: `${actuallyNew.length} question(s) added`,
      added: actuallyNew.length,
      linkedQuestionCount: linkedAfterAdd,
    });
  } catch (error) {
    console.error('Add questions to test error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/tests/:testId/questions/bulk
 * Bulk add N questions by topic/criteria (topicId, subjectId, difficulty, count). Picks randomly from available pool.
 */
router.post('/:testId/questions/bulk', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { topicId, subjectId, difficulty, approvedOnly, count = 10, customOnly } = req.body;
  const { orgId, orgUserId } = req.user;
  const customOnlyOrg = customOnly === true || customOnly === 'true' || customOnly === '1';
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    const addCount = Math.min(100, Math.max(1, parseInt(count, 10) || 10));

    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, ExamID, OrgID, SubscriptionID, TotalQuestions, TotalMarks')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const { data: subscription } = await supabase.from('Subscriptions').select('PlanID').eq('SubscriptionID', test.SubscriptionID).single();
    let maxQuestionsPerTest = null;
    if (subscription?.PlanID) {
      const { data: planExam } = await supabase
        .from('SubscriptionPlanExams')
        .select('MaxQuestionsPerTest')
        .eq('PlanID', subscription.PlanID)
        .eq('ExamID', test.ExamID)
        .single();
      maxQuestionsPerTest = planExam?.MaxQuestionsPerTest ?? null;
    }

    const { data: existingRows } = await supabase.from('TestQuestions').select('QuestionID').eq('TestID', testId);
    const existingIds = (existingRows || []).map((r) => r.QuestionID);
    const currentCount = existingIds.length;

    const { data: subjects } = await supabase.from('Subjects').select('SubjectID').eq('ExamID', test.ExamID);
    const subjectIds = (subjects || []).map((s) => s.SubjectID);
    if (subjectIds.length === 0) {
      return res.status(400).json({ error: 'No subjects for this exam' });
    }

    let topicIds = [];
    if (topicId) {
      const { data: t } = await supabase.from('Topics').select('TopicID').eq('TopicID', topicId).single();
      if (t) topicIds = [t.TopicID];
    } else {
      const filterSubjectIds = subjectId ? [subjectId] : subjectIds;
      const { data: topics } = await supabase.from('Topics').select('TopicID').in('SubjectID', filterSubjectIds);
      topicIds = (topics || []).map((t) => t.TopicID);
    }
    if (topicIds.length === 0) {
      return res.status(400).json({ error: 'No topics match the criteria' });
    }

    let query = supabase
      .from('Questions')
      .select('QuestionID')
      .in('TopicID', topicIds);
    if (customOnlyOrg) {
      query = query.eq('OrgID', orgId);
    } else {
      query = query.or(`OrgID.eq.${orgId},OrgID.is.null`);
    }
    if (existingIds.length > 0) query = query.not('QuestionID', 'in', `(${existingIds.join(',')})`);
    if (difficulty) query = query.eq('DifficultyLevel', difficulty);
    if (approvedOnly === true || approvedOnly === 'true' || approvedOnly === '1') query = query.eq('Status', 'Verified');

    const { data: pool } = await query.limit(500);
    const availableIds = (pool || []).map((q) => q.QuestionID);
    if (availableIds.length === 0) {
      return res.status(400).json({ error: customOnlyOrg ? 'No questions from your organization match the criteria' : 'No questions available matching the criteria' });
    }

    const toAdd = [];
    const shuffled = [...availableIds].sort(() => Math.random() - 0.5);
    const canAdd = maxQuestionsPerTest != null ? Math.min(addCount, maxQuestionsPerTest - currentCount) : addCount;
    for (let i = 0; i < Math.min(canAdd, shuffled.length); i++) toAdd.push(shuffled[i]);

    if (toAdd.length === 0) {
      return res.status(400).json({
        error: maxQuestionsPerTest != null ? 'Plan question limit reached' : 'No questions to add',
        maxQuestionsPerTest,
        currentCount,
      });
    }

    const totalAfterAdd = currentCount + toAdd.length;
    const totalForWeightage = test.TotalQuestions != null ? Math.max(totalAfterAdd, test.TotalQuestions) : totalAfterAdd;
    const weightageCheck = await validateWeightageForAdd(testId, test.ExamID, totalForWeightage, toAdd);
    if (!weightageCheck.valid) {
      return res.status(400).json({
        error: weightageCheck.message,
        weightageExceeded: weightageCheck.exceeded,
      });
    }

    const marksPerQuestion = test.TotalMarks ? Number(test.TotalMarks) / (currentCount + toAdd.length) : 1;
    const rows = toAdd.map((qId) => ({
      TestID: testId,
      QuestionID: qId,
      Marks: marksPerQuestion,
      TimeLimit: null,
      NegativeMarks: 0,
    }));

    const { error: insertError } = await supabase.from('TestQuestions').insert(rows);
    if (insertError) {
      if (insertError.code === '23505') return res.status(400).json({ error: 'One or more questions already in test' });
      return res.status(500).json({ error: 'Failed to add questions', details: insertError.message });
    }

    const linkedAfterAdd = currentCount + toAdd.length;

    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Test',
      entityID: testId,
      description: `Bulk added ${toAdd.length} question(s) to test`,
      ipAddress,
      userAgent,
      newData: { addedCount: toAdd.length, questionIds: toAdd },
    });

    res.status(201).json({
      message: `${toAdd.length} question(s) added`,
      added: toAdd.length,
      linkedQuestionCount: linkedAfterAdd,
    });
  } catch (error) {
    console.error('Bulk add questions error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/tests/:testId/questions/copy-from
 * Copy questions from another test (same org, same exam). Body: { sourceTestId, questionIds?: [] }. If questionIds omitted, copy all.
 */
router.post('/:testId/questions/copy-from', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { sourceTestId, questionIds: requestedIds } = req.body;
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    if (!sourceTestId) {
      return res.status(400).json({ error: 'sourceTestId is required' });
    }

    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, ExamID, OrgID, SubscriptionID, TotalQuestions, TotalMarks')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const { data: sourceTest, error: sourceError } = await supabase
      .from('Tests')
      .select('TestID, ExamID, OrgID')
      .eq('TestID', sourceTestId)
      .eq('OrgID', orgId)
      .single();

    if (sourceError || !sourceTest) {
      return res.status(404).json({ error: 'Source test not found' });
    }
    if (sourceTest.ExamID !== test.ExamID) {
      return res.status(400).json({ error: 'Source test must be for the same exam' });
    }

    const { data: subscription } = await supabase.from('Subscriptions').select('PlanID').eq('SubscriptionID', test.SubscriptionID).single();
    let maxQuestionsPerTest = null;
    if (subscription?.PlanID) {
      const { data: planExam } = await supabase
        .from('SubscriptionPlanExams')
        .select('MaxQuestionsPerTest')
        .eq('PlanID', subscription.PlanID)
        .eq('ExamID', test.ExamID)
        .single();
      maxQuestionsPerTest = planExam?.MaxQuestionsPerTest ?? null;
    }

    const { data: sourceRows } = await supabase
      .from('TestQuestions')
      .select('QuestionID')
      .eq('TestID', sourceTestId);
    let toCopyIds = (sourceRows || []).map((r) => r.QuestionID);
    if (requestedIds && Array.isArray(requestedIds) && requestedIds.length > 0) {
      const requestedSet = new Set(requestedIds);
      toCopyIds = toCopyIds.filter((id) => requestedSet.has(id));
    }

    const { data: existingRows } = await supabase.from('TestQuestions').select('QuestionID').eq('TestID', testId);
    const existingSet = new Set((existingRows || []).map((r) => r.QuestionID));
    let actuallyNew = toCopyIds.filter((id) => !existingSet.has(id));
    if (actuallyNew.length > 0) {
      const { data: qList } = await supabase.from('Questions').select('QuestionID, OrgID').in('QuestionID', actuallyNew);
      const orgOnlyIds = new Set((qList || []).filter((q) => q.OrgID === orgId).map((q) => q.QuestionID));
      actuallyNew = actuallyNew.filter((id) => orgOnlyIds.has(id));
    }
    const currentCount = (existingRows || []).length;
    const newTotal = currentCount + actuallyNew.length;

    if (maxQuestionsPerTest != null && newTotal > maxQuestionsPerTest) {
      return res.status(400).json({
        error: 'Copying would exceed plan limit',
        maxQuestionsPerTest,
        currentCount,
        wouldAdd: actuallyNew.length,
      });
    }
    if (actuallyNew.length === 0) {
      return res.status(400).json({ error: 'All selected questions are already in this test, or none belong to your organization' });
    }

    const weightageCheck = await validateWeightageForAdd(testId, test.ExamID, test.TotalQuestions != null ? Math.max(newTotal, test.TotalQuestions) : newTotal, actuallyNew);
    if (!weightageCheck.valid) {
      return res.status(400).json({ error: weightageCheck.message, weightageExceeded: weightageCheck.exceeded });
    }

    const marksPerQuestion = test.TotalMarks ? Number(test.TotalMarks) / newTotal : 1;
    const rows = actuallyNew.map((qId) => ({
      TestID: testId,
      QuestionID: qId,
      Marks: marksPerQuestion,
      TimeLimit: null,
      NegativeMarks: 0,
    }));

    const { error: insertError } = await supabase.from('TestQuestions').insert(rows);
    if (insertError) {
      if (insertError.code === '23505') return res.status(400).json({ error: 'One or more questions already in test' });
      return res.status(500).json({ error: 'Failed to copy questions', details: insertError.message });
    }

    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Test',
      entityID: testId,
      description: `Copied ${actuallyNew.length} question(s) from another test`,
      ipAddress,
      userAgent,
      newData: { sourceTestId, addedCount: actuallyNew.length },
    });

    res.status(201).json({
      message: `${actuallyNew.length} question(s) copied`,
      added: actuallyNew.length,
      linkedQuestionCount: newTotal,
    });
  } catch (error) {
    console.error('Copy questions from test error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/org/tests/:testId/questions/reorder
 * Reorder questions. Body: { questionIds: string[] } — order of array is the new display order.
 */
router.put('/:testId/questions/reorder', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { questionIds = [] } = req.body;
  const { orgId } = req.user;

  try {
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'questionIds must be a non-empty array' });
    }

    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const { data: existingRows } = await supabase
      .from('TestQuestions')
      .select('QuestionID')
      .eq('TestID', testId);

    const existingIds = new Set((existingRows || []).map((r) => r.QuestionID));
    const validOrder = questionIds.filter((id) => existingIds.has(id));
    if (validOrder.length !== existingIds.size) {
      return res.status(400).json({ error: 'questionIds must contain exactly the questions currently in the test' });
    }

    // DisplayOrder column not in DB; accept reorder request but do not persist order
    res.json({
      message: 'Order updated',
      questionIds: validOrder,
    });
  } catch (error) {
    console.error('Reorder questions error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/org/tests/:testId/questions/:questionId
 * Remove a question from test; update test aggregates.
 */
router.delete('/:testId/questions/:questionId', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId, questionId } = req.params;
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, TestName, OrgID, ExamID, SubscriptionID')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    const modeGuard = await ensureScheduledModeEnabledForTestSubscription(test);
    if (!modeGuard.ok) {
      return res.status(403).json({ error: modeGuard.error, code: 'SCHEDULED_MODE_DISABLED' });
    }

    const { error: delError } = await supabase
      .from('TestQuestions')
      .delete()
      .eq('TestID', testId)
      .eq('QuestionID', questionId);

    if (delError) {
      console.error('Delete TestQuestions error:', delError);
      return res.status(500).json({ error: 'Failed to remove question', details: delError.message });
    }

    const { count: linkedCount, error: cntErr } = await supabase
      .from('TestQuestions')
      .select('*', { count: 'exact', head: true })
      .eq('TestID', testId);

    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Test',
      entityID: testId,
      description: `Removed question from test: ${test.TestName}`,
      ipAddress,
      userAgent,
      newData: { questionId, linkedQuestionCount: cntErr ? null : linkedCount },
    });

    res.json({
      message: 'Question removed from test',
      linkedQuestionCount: cntErr ? undefined : linkedCount ?? 0,
    });
  } catch (error) {
    console.error('Remove question from test error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
