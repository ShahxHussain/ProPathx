import express from 'express';
import { supabase } from '../../../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../../../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../../middleware/auth.js';
import {
  bindingFromTestRow,
  loadTestQuestionsWithQuestions,
  getOrCreateUsageCounter,
  orgHasQualifyingSubscription,
  checkMinQuestionsForActivateOrAssign,
} from './shared.js';
import { isPlanModeEnabled } from '../../../utils/subscriptionPlanCatalog.js';

const router = express.Router();

/**
 * POST /api/org/tests
 * Create a new test (OrgAdmin only)
 */
router.post('/', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const {
    testName,
    examId,
    subscriptionId,
    durationMinutes,
    totalQuestions,
    totalMarks,
    testDate,
    startTime,
    endTime,
    status = 'Inactive',
    questionIds = [],
  } = req.body;

  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Validate required fields
    if (!testName || !examId || !subscriptionId) {
      return res.status(400).json({ error: 'Missing required fields: testName, examId, subscriptionId' });
    }

    if (!(await orgHasQualifyingSubscription(orgId))) {
      return res.status(403).json({
        error: 'No active organization subscription. Subscribe or renew a plan to create tests.',
        code: 'SUBSCRIPTION_REQUIRED',
      });
    }

    // Validate subscription belongs to organization and is active
    const { data: subscription, error: subError } = await supabase
      .from('Subscriptions')
      .select('*, SubscriptionPlans(*)')
      .eq('SubscriptionID', subscriptionId)
      .eq('EntityType', 'Organization')
      .eq('EntityID', orgId)
      .eq('Status', 'Active')
      .single();

    if (subError || !subscription) {
      return res.status(404).json({ error: 'Active subscription not found for this organization' });
    }

    const scheduledAllowed = await isPlanModeEnabled(supabase, subscription.PlanID, 'isScheduledEnabled');
    if (!scheduledAllowed) {
      return res.status(403).json({
        error: 'Scheduled tests are disabled in the selected subscription plan.',
        code: 'SCHEDULED_MODE_DISABLED',
      });
    }

    // Check if subscription is still valid (not expired)
    const now = new Date();
    const endDate = new Date(subscription.EndDate);
    if (endDate < now) {
      return res.status(400).json({ error: 'Subscription has expired' });
    }

    // Check if exam is in the subscription plan
    const { data: planExam, error: planExamError } = await supabase
      .from('SubscriptionPlanExams')
      .select('*')
      .eq('PlanID', subscription.PlanID)
      .eq('ExamID', examId)
      .single();

    if (planExamError || !planExam) {
      return res.status(403).json({ error: 'Exam is not included in your subscription plan' });
    }

    // Get or create usage counter
    let usageCounter;
    try {
      console.log(`[POST /api/org/tests] Attempting to get/create usage counter for SubscriptionID: ${subscriptionId}, ExamID: ${examId}, OrgID: ${orgId}`);
      usageCounter = await getOrCreateUsageCounter(subscriptionId, examId, orgId);
      console.log(`[POST /api/org/tests] ✅ Successfully got/created usage counter: ${usageCounter.UsageID}`);
    } catch (counterError) {
      console.error('[POST /api/org/tests] ❌ Exception in getOrCreateUsageCounter:', counterError);
      console.error('[POST /api/org/tests] Exception stack:', counterError.stack);
      // Return detailed error to frontend
      return res.status(500).json({ 
        error: 'Failed to initialize usage counter',
        details: counterError.message || 'An unexpected error occurred while initializing usage counter',
        errorType: counterError.name || 'Unknown',
        subscriptionId,
        examId,
        orgId,
        // Include the full error for debugging
        fullError: process.env.NODE_ENV === 'development' ? counterError.toString() : undefined
      });
    }

    // Check usage limits
    if (planExam.MaxTests && usageCounter.TestsCreated >= planExam.MaxTests) {
      return res.status(403).json({
        error: 'Maximum test creation limit reached',
        limit: planExam.MaxTests,
        current: usageCounter.TestsCreated,
      });
    }

    if (planExam.MaxTestsPerDay && usageCounter.TestsCreatedToday >= planExam.MaxTestsPerDay) {
      return res.status(403).json({
        error: 'Daily test creation limit reached',
        limit: planExam.MaxTestsPerDay,
        current: usageCounter.TestsCreatedToday,
      });
    }

    if (planExam.MaxQuestionsPerTest && totalQuestions > planExam.MaxQuestionsPerTest) {
      return res.status(400).json({
        error: 'Total questions exceeds plan limit',
        limit: planExam.MaxQuestionsPerTest,
        requested: totalQuestions,
      });
    }

    // Create test
    // Note: Tests.CreatedBy references Users.UserID, but OrgUsers don't have corresponding UserIDs
    // We set it to null and track the creator in the audit logs instead
    const testDateVal =
      testDate && String(testDate).trim() !== '' ? testDate : null;
    const startTimeVal =
      startTime && String(startTime).trim() !== '' ? startTime : null;
    const endTimeVal =
      endTime && String(endTime).trim() !== '' ? endTime : null;

    const questionBindingMode = ['custom', 'auto', 'hybrid'].includes(req.body.questionBindingMode)
      ? req.body.questionBindingMode
      : 'custom';
    const hybridPctRaw = Math.max(0, Math.min(100, Number(req.body.hybridAutoPercent) || 0));
    const scheduleModeVal = startTimeVal ? 'scheduled' : 'open';

    const { data: newTest, error: testError } = await supabase
      .from('Tests')
      .insert({
        SubscriptionID: subscriptionId,
        ExamID: examId,
        OrgID: orgId,
        CreatedBy: null, // OrgUsers don't have UserID - creator tracked in audit logs
        TestName: testName,
        DurationMinutes: durationMinutes,
        TotalQuestions: totalQuestions || questionIds.length,
        TotalMarks: totalMarks,
        TestDate: testDateVal,
        StartTime: startTimeVal,
        EndTime: endTimeVal,
        Status: status,
        CreatedAt: new Date().toISOString(),
        QuestionBindingMode: questionBindingMode,
        HybridAutoPercent: questionBindingMode === 'hybrid' ? hybridPctRaw : 0,
        ScheduleMode: scheduleModeVal,
      })
      .select()
      .single();

    if (testError) {
      console.error('Error creating test:', testError);
      return res.status(500).json({ error: 'Failed to create test', details: testError.message });
    }

    // Link questions to test if provided
    if (questionIds && questionIds.length > 0) {
      const testQuestions = questionIds.map((qId, index) => ({
        TestID: newTest.TestID,
        QuestionID: qId,
        Marks: totalMarks ? totalMarks / questionIds.length : 1,
        TimeLimit: null,
        NegativeMarks: 0,
      }));

      const { error: testQuestionsError } = await supabase
        .from('TestQuestions')
        .insert(testQuestions);

      if (testQuestionsError) {
        console.error('Error linking questions to test:', testQuestionsError);
        // Don't fail - test is created, questions can be added later
      }
    }

    // Update usage counters
    const { error: updateError } = await supabase
      .from('UsageCounters')
      .update({
        TestsCreated: (usageCounter.TestsCreated || 0) + 1,
        TestsCreatedToday: (usageCounter.TestsCreatedToday || 0) + 1,
        // QuestionsCreated column doesn't exist in database - removed
        UpdatedAt: new Date().toISOString(),
      })
      .eq('UsageID', usageCounter.UsageID);

    if (updateError) {
      console.error('Error updating usage counters:', updateError);
      // Log but don't fail - test is created
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Create',
      entityType: 'Test',
      entityID: newTest.TestID,
      description: `Created scheduled test: ${testName}`,
      ipAddress,
      userAgent,
      newData: { testName, examId, totalQuestions, scheduleMode: scheduleModeVal },
    });

    res.status(201).json({
      message: 'Test created successfully',
      test: {
        testId: newTest.TestID,
        testName: newTest.TestName,
        examId: newTest.ExamID,
        subscriptionId: newTest.SubscriptionID,
        scheduleMode: newTest.ScheduleMode,
        status: newTest.Status,
        createdAt: newTest.CreatedAt,
      },
      usage: {
        testsCreated: (usageCounter.TestsCreated || 0) + 1,
        testsCreatedToday: (usageCounter.TestsCreatedToday || 0) + 1,
        remainingTests: planExam.MaxTests ? planExam.MaxTests - (usageCounter.TestsCreated || 0) - 1 : null,
        remainingToday: planExam.MaxTestsPerDay ? planExam.MaxTestsPerDay - (usageCounter.TestsCreatedToday || 0) - 1 : null,
      },
    });
  } catch (error) {
    console.error('Create test error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/tests
 * Get all tests for the organization (OrgAdmin only)
 */
router.get('/', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { orgId } = req.user;
  const { page = 1, limit = 20 } = req.query;

  try {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const { data: tests, error: testsError } = await supabase
      .from('Tests')
      .select(`
        *,
        Exams (
          ExamID,
          ExamName,
          Description
        ),
        Subscriptions (
          SubscriptionID,
          Status
        )
      `)
      .eq('OrgID', orgId)
      .order('CreatedAt', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (testsError) {
      console.error('Error fetching tests:', testsError);
      return res.status(500).json({ error: 'Failed to fetch tests', details: testsError.message });
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from('Tests')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId);

    res.json({
      tests: tests || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum),
      },
    });
  } catch (error) {
    console.error('Get tests error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/tests/:testId
 * Get test details (OrgAdmin only)
 */
router.get('/:testId', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { orgId } = req.user;

  try {
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select(`
        *,
        Exams (
          ExamID,
          ExamName,
          Description
        ),
        Subscriptions (
          SubscriptionID,
          Status,
          SubscriptionPlans (
            PlanID,
            PlanName
          )
        )
      `)
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const { rows: testQuestions } = await loadTestQuestionsWithQuestions(supabase, testId);

    const bindingConfig = bindingFromTestRow(test);

    res.json({
      test: {
        ...test,
        questions: testQuestions || [],
        bindingType: bindingConfig.bindingType,
        autoPercent: bindingConfig.autoPercent,
        scheduleMode: bindingConfig.scheduleMode,
      },
    });
  } catch (error) {
    console.error('Get test error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/org/tests/:testId
 * Update test metadata (name, type, duration, totals, schedule window, ScheduleMode, status).
 */
router.put('/:testId', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { orgId, orgUserId } = req.user;
  const b = req.body || {};
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    const { data: existing, error: exErr } = await supabase
      .from('Tests')
      .select('TestID, TestName, OrgID')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();

    if (exErr || !existing) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const updates = {};
    if (b.testName != null && String(b.testName).trim()) updates.TestName = String(b.testName).trim();
    if (b.durationMinutes != null && !Number.isNaN(Number(b.durationMinutes))) {
      updates.DurationMinutes = Number(b.durationMinutes);
    }
    if (b.totalQuestions != null && !Number.isNaN(Number(b.totalQuestions))) {
      updates.TotalQuestions = Number(b.totalQuestions);
    }
    if (b.totalMarks != null && !Number.isNaN(Number(b.totalMarks))) {
      updates.TotalMarks = Number(b.totalMarks);
    }
    if (b.testDate !== undefined) {
      updates.TestDate = b.testDate && String(b.testDate).trim() ? String(b.testDate).split('T')[0] : null;
    }
    if (b.startTime !== undefined) {
      updates.StartTime = b.startTime && String(b.startTime).trim() ? b.startTime : null;
    }
    if (b.endTime !== undefined) {
      updates.EndTime = b.endTime && String(b.endTime).trim() ? b.endTime : null;
    }
    if (b.scheduleMode === 'open' || b.scheduleMode === 'scheduled') {
      updates.ScheduleMode = b.scheduleMode;
    }
    if (b.status === 'Active' || b.status === 'Inactive') {
      updates.Status = b.status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data: updated, error: upErr } = await supabase
      .from('Tests')
      .update(updates)
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .select(
        `
        *,
        Exams ( ExamID, ExamName )
      `
      )
      .single();

    if (upErr) {
      console.error('PUT /tests/:testId', upErr);
      return res.status(500).json({ error: 'Failed to update test', details: upErr.message });
    }

    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Test',
      entityID: testId,
      description: `Updated test: ${updated.TestName || testId}`,
      ipAddress,
      userAgent,
      newData: updates,
    });

    res.json({ message: 'Test updated', test: updated });
  } catch (error) {
    console.error('PUT test error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/tests/:testId/binding-config
 * Get question binding type for this test (Custom / Auto / Hybrid). Persisted on Tests.QuestionBindingMode / HybridAutoPercent.
 */
router.get('/:testId/binding-config', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { orgId } = req.user;
  try {
    const { data: test, error } = await supabase
      .from('Tests')
      .select('TestID, QuestionBindingMode, HybridAutoPercent, ScheduleMode')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();
    if (error || !test) return res.status(404).json({ error: 'Test not found' });
    const cfg = bindingFromTestRow(test);
    res.json({ bindingType: cfg.bindingType, autoPercent: cfg.autoPercent, scheduleMode: cfg.scheduleMode });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * PUT /api/org/tests/:testId/binding-config
 * Set question binding type (custom | auto | hybrid) and optional autoPercent for hybrid. Persisted on Tests.
 */
router.put('/:testId/binding-config', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { orgId } = req.user;
  const { bindingType = 'custom', autoPercent = 0 } = req.body || {};
  try {
    const { data: existing, error } = await supabase
      .from('Tests')
      .select('TestID')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();
    if (error || !existing) return res.status(404).json({ error: 'Test not found' });
    const valid = ['custom', 'auto', 'hybrid'].includes(bindingType);
    if (!valid) return res.status(400).json({ error: 'bindingType must be custom, auto, or hybrid' });
    const percent = Math.max(0, Math.min(100, Number(autoPercent) || 0));
    const hybridPct = bindingType === 'hybrid' ? percent : 0;

    const { data: updated, error: updErr } = await supabase
      .from('Tests')
      .update({
        QuestionBindingMode: bindingType,
        HybridAutoPercent: hybridPct,
      })
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .select('QuestionBindingMode, HybridAutoPercent, ScheduleMode')
      .single();

    if (updErr) {
      console.error('binding-config update:', updErr);
      return res.status(500).json({ error: 'Failed to save binding config', details: updErr.message });
    }

    const cfg = bindingFromTestRow(updated);
    res.json({ bindingType: cfg.bindingType, autoPercent: cfg.autoPercent, scheduleMode: cfg.scheduleMode });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * PUT /api/org/tests/:testId/status
 * Update test status (enable/disable)
 */
router.put('/:testId/status', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { status } = req.body;
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    const normalizedStatus = String(status || '').trim();
    if (!['Active', 'Inactive'].includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status. Must be Active or Inactive.' });
    }

    if (normalizedStatus === 'Active') {
      const minCheck = await checkMinQuestionsForActivateOrAssign(testId, orgId);
      if (!minCheck.ok) return res.status(minCheck.status).json(minCheck.body);
    }

    // Verify test belongs to organization
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, TestName, OrgID, Status')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Update status
    const { data: updated, error: updateError } = await supabase
      .from('Tests')
      .update({ Status: normalizedStatus })
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating test status:', updateError);
      return res.status(500).json({ error: 'Failed to update status', details: updateError.message });
    }

    // Log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Test',
      entityID: testId,
      description: `Updated test status to ${normalizedStatus} for ${test.TestName}`,
      ipAddress,
      userAgent,
      previousData: { status: test.Status },
      newData: { status: normalizedStatus },
    });

    res.json({ message: 'Status updated', test: updated });
  } catch (error) {
    console.error('Update test status error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
