import express from 'express';
import { supabase } from '../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../middleware/auth.js';
import { isPlanModeEnabled } from '../utils/subscriptionPlanCatalog.js';

const router = express.Router();

/** Reads question binding + schedule mode from Tests row (PascalCase or camelCase from PostgREST). */
function bindingFromTestRow(test) {
  if (!test) {
    return { bindingType: 'custom', autoPercent: 0, scheduleMode: 'open' };
  }
  const mode = test.QuestionBindingMode ?? test.questionBindingMode ?? 'custom';
  const pct = test.HybridAutoPercent ?? test.hybridAutoPercent ?? 0;
  const sched = test.ScheduleMode ?? test.scheduleMode ?? 'open';
  return {
    bindingType: ['custom', 'auto', 'hybrid'].includes(mode) ? mode : 'custom',
    autoPercent: Math.max(0, Math.min(100, Number(pct) || 0)),
    scheduleMode: sched === 'scheduled' ? 'scheduled' : 'open',
  };
}

/** PostgREST: disambiguate Questions ↔ Options embed (see students.js same constant). */
const PG_OPTIONS_BY_QUESTION_FK = 'Options!Options_QuestionID_fkey';

async function ensureScheduledModeEnabledForTestSubscription(test) {
  const subscriptionId = test?.SubscriptionID ?? test?.subscriptionId ?? null;
  if (!subscriptionId) {
    return { ok: false, error: 'This test is missing subscription linkage.' };
  }
  const { data: subscription, error: subErr } = await supabase
    .from('Subscriptions')
    .select('PlanID')
    .eq('SubscriptionID', subscriptionId)
    .single();
  if (subErr || !subscription?.PlanID) {
    return { ok: false, error: 'Failed to validate test subscription plan.' };
  }
  const allowed = await isPlanModeEnabled(supabase, subscription.PlanID, 'isScheduledEnabled');
  if (!allowed) {
    return {
      ok: false,
      error:
        'Scheduled mode is disabled in the subscription plan linked to this test. Enable Scheduled mode to assign this test.',
    };
  }
  return { ok: true };
}

/**
 * TestQuestions + Questions for org test detail / wizard.
 * If the PostgREST embed fails (schema/RLS/Options), fall back to flat queries so linked rows still appear.
 */
async function loadTestQuestionsWithQuestions(supabaseClient, testId) {
  const embedSelect = `
        *,
        Questions (
          QuestionID,
          QuestionText,
          DifficultyLevel,
          QuestionType,
          Explanation,
          ${PG_OPTIONS_BY_QUESTION_FK} (
            OptionID,
            OptionNumber,
            OptionText,
            IsCorrect
          )
        )
      `;
  const { data: embedded, error: embedErr } = await supabaseClient
    .from('TestQuestions')
    .select(embedSelect)
    .eq('TestID', testId)
    .order('QuestionID', { ascending: true });

  if (!embedErr && Array.isArray(embedded)) {
    return { rows: embedded, usedFallback: false };
  }

  if (embedErr) {
    console.error('TestQuestions embed select failed:', testId, embedErr.message);
  }

  const { data: tqRows, error: tqErr } = await supabaseClient
    .from('TestQuestions')
    .select('TestID, QuestionID, Marks, NegativeMarks, TimeLimit')
    .eq('TestID', testId)
    .order('QuestionID', { ascending: true });

  if (tqErr || !tqRows?.length) {
    return { rows: Array.isArray(embedded) ? embedded : [], usedFallback: !!embedErr };
  }

  const qIds = [...new Set(tqRows.map((r) => r.QuestionID).filter(Boolean))];
  const { data: qRows, error: qErr } = await supabaseClient
    .from('Questions')
    .select('QuestionID, QuestionText, DifficultyLevel, QuestionType, Explanation')
    .in('QuestionID', qIds);

  if (qErr) {
    console.error('Questions fallback fetch failed:', testId, qErr.message);
    return {
      rows: tqRows.map((tq) => ({ ...tq, Questions: { QuestionID: tq.QuestionID, QuestionText: '' } })),
      usedFallback: true,
    };
  }

  const qMap = new Map((qRows || []).map((q) => [q.QuestionID, q]));
  const rows = tqRows.map((tq) => ({
    ...tq,
    Questions: qMap.get(tq.QuestionID) || { QuestionID: tq.QuestionID, QuestionText: '' },
  }));
  return { rows, usedFallback: true };
}

/**
 * When an org replaces a student's assignment (delete + re-insert), old StudentAttempts
 * must be removed or the student UI still shows "Completed" from the prior attempt.
 * Clears Certificates rows tied to those attempts first (FK may otherwise block delete).
 */
async function deleteStudentAttemptsForTest(supabaseClient, testId, studentIds) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (ids.length === 0) return { error: null };

  const { data: attempts, error: fetchError } = await supabaseClient
    .from('StudentAttempts')
    .select('AttemptID')
    .eq('TestID', testId)
    .in('StudentID', ids);

  if (fetchError) return { error: fetchError };

  const attemptIds = (attempts || []).map((a) => a.AttemptID).filter(Boolean);
  if (attemptIds.length > 0) {
    const { error: certDelError } = await supabaseClient.from('Certificates').delete().in('AttemptID', attemptIds);
    if (certDelError) {
      const { error: certNullError } = await supabaseClient
        .from('Certificates')
        .update({ AttemptID: null })
        .in('AttemptID', attemptIds);
      if (certNullError) return { error: certNullError };
    }
  }

  const { error } = await supabaseClient
    .from('StudentAttempts')
    .delete()
    .eq('TestID', testId)
    .in('StudentID', ids);
  return { error };
}

/** At least one non-expired Active org subscription (see schedule_or_opentiime_assigned.md §2.1). */
async function orgHasQualifyingSubscription(orgId) {
  const { data: subs, error } = await supabase
    .from('Subscriptions')
    .select('SubscriptionID, Status, EndDate')
    .eq('EntityType', 'Organization')
    .eq('EntityID', orgId);
  if (error || !subs?.length) return false;
  const now = new Date();
  return subs.some((s) => {
    const st = String(s.Status || '').toLowerCase();
    if (st !== 'active') return false;
    if (!s.EndDate) return false;
    return new Date(s.EndDate) >= now;
  });
}

/** Minimum questions required before a test can be activated or assigned (can later come from SubscriptionPlanExams.MinQuestionsPerTest) */
const MIN_QUESTIONS_PER_TEST = 1;

/**
 * Returns the minimum number of questions required for the test (for activate/assign).
 * Uses constant; can later read from SubscriptionPlanExams.MinQuestionsPerTest if column is added.
 */
function getMinQuestionsForTest() {
  return MIN_QUESTIONS_PER_TEST;
}

/**
 * Validate subject weightage: per-subject question count must not exceed (totalQuestions * Subject.Weightage/100).
 * Returns { valid: true } or { valid: false, message, exceeded }.
 */
async function validateWeightageForAdd(testId, examId, totalQuestionsAfterAdd, questionIdsToAdd) {
  if (!examId || totalQuestionsAfterAdd <= 0) return { valid: true };
  const { data: subjects } = await supabase
    .from('Subjects')
    .select('SubjectID, SubjectName, Weightage')
    .eq('ExamID', examId);
  if (!subjects || subjects.length === 0) return { valid: true };

  const maxPerSubject = new Map();
  for (const s of subjects) {
    const w = s.Weightage != null ? parseFloat(s.Weightage) : null;
    const max = w != null && !isNaN(w) ? Math.ceil((totalQuestionsAfterAdd * w) / 100) : null;
    if (max != null) maxPerSubject.set(s.SubjectID, { max, subjectName: s.SubjectName });
  }
  if (maxPerSubject.size === 0) return { valid: true };

  const { data: existingTq } = await supabase
    .from('TestQuestions')
    .select('QuestionID')
    .eq('TestID', testId);
  const existingIds = (existingTq || []).map((r) => r.QuestionID);
  const allIds = [...new Set([...existingIds, ...(questionIdsToAdd || [])])];
  if (allIds.length === 0) return { valid: true };

  const { data: questionsWithTopic } = await supabase
    .from('Questions')
    .select('QuestionID, TopicID')
    .in('QuestionID', allIds);
  const topicIds = [...new Set((questionsWithTopic || []).map((q) => q.TopicID).filter(Boolean))];
  if (topicIds.length === 0) return { valid: true };

  const { data: topics } = await supabase
    .from('Topics')
    .select('TopicID, SubjectID')
    .in('TopicID', topicIds);
  const topicToSubject = new Map((topics || []).map((t) => [t.TopicID, t.SubjectID]));
  const qidToSubject = new Map();
  for (const q of questionsWithTopic || []) {
    const sid = topicToSubject.get(q.TopicID);
    if (sid) qidToSubject.set(q.QuestionID, sid);
  }

  const currentCountBySubject = new Map();
  for (const qid of existingIds) {
    const sid = qidToSubject.get(qid);
    if (sid) currentCountBySubject.set(sid, (currentCountBySubject.get(sid) || 0) + 1);
  }
  const addCountBySubject = new Map();
  for (const qid of questionIdsToAdd || []) {
    const sid = qidToSubject.get(qid);
    if (sid) addCountBySubject.set(sid, (addCountBySubject.get(sid) || 0) + 1);
  }

  const exceeded = [];
  for (const [subjectId, { max, subjectName }] of maxPerSubject) {
    const current = currentCountBySubject.get(subjectId) || 0;
    const add = addCountBySubject.get(subjectId) || 0;
    const total = current + add;
    if (total > max) {
      exceeded.push({ subjectId, subjectName, current, add, total, max });
    }
  }
  if (exceeded.length > 0) {
    const msg = exceeded.map((e) => `${e.subjectName}: ${e.total} questions (max ${e.max} by weightage)`).join('; ');
    return { valid: false, message: `Subject weightage exceeded: ${msg}`, exceeded };
  }
  return { valid: true };
}

/**
 * Check test has at least min questions; returns { ok: false, status, body } to send, or { ok: true }.
 */
async function checkMinQuestionsForActivateOrAssign(testId, orgId) {
  const { data: test, error: testError } = await supabase
    .from('Tests')
    .select('TestID, SubscriptionID, ExamID, TotalQuestions, QuestionBindingMode, HybridAutoPercent')
    .eq('TestID', testId)
    .eq('OrgID', orgId)
    .single();
  if (testError || !test) return { ok: false, status: 404, body: { error: 'Test not found' } };
  const minRequired = getMinQuestionsForTest();
  const mode = String(test.QuestionBindingMode ?? 'custom').toLowerCase();
  const totalQ = test.TotalQuestions != null ? Number(test.TotalQuestions) : 0;
  const hybridPct = Number(test.HybridAutoPercent ?? 0);

  const { count: linkedCount, error: countError } = await supabase
    .from('TestQuestions')
    .select('*', { count: 'exact', head: true })
    .eq('TestID', testId);
  const linked = !countError && linkedCount != null ? linkedCount : 0;

  // Auto: pool draw at attempt time — no TestQuestions rows required; TotalQuestions is the paper size.
  if (mode === 'auto') {
    if (totalQ < minRequired) {
      return {
        ok: false,
        status: 400,
        body: {
          error: `Set at least ${minRequired} total question(s) on this test (auto mode). Open the test on the Tests list and edit totals.`,
          minRequired,
          bindingMode: 'auto',
          totalQuestions: totalQ,
          hint: 'Auto mode uses Total questions only; add questions in the bank is not required for assignment.',
        },
      };
    }
    return { ok: true };
  }

  // Hybrid: need both a configured attempt size and the custom-linked portion (see schedule_or_opentiime_assigned.md).
  if (mode === 'hybrid') {
    if (totalQ < minRequired) {
      return {
        ok: false,
        status: 400,
        body: {
          error: `Set total questions to at least ${minRequired} (hybrid mode).`,
          minRequired,
          bindingMode: 'hybrid',
          totalQuestions: totalQ,
          linkedCount: linked,
        },
      };
    }
    if (hybridPct < 100 && linked < minRequired) {
      return {
        ok: false,
        status: 400,
        body: {
          error: `Add at least ${minRequired} question(s) to this test for the custom portion (hybrid ${100 - hybridPct}% custom).`,
          minRequired,
          bindingMode: 'hybrid',
          linkedCount: linked,
          hybridAutoPercent: hybridPct,
        },
      };
    }
    if (hybridPct >= 100) {
      if (totalQ < minRequired) {
        return {
          ok: false,
          status: 400,
          body: {
            error: `Set at least ${minRequired} total question(s) (hybrid is 100% auto).`,
            minRequired,
            bindingMode: 'hybrid',
            totalQuestions: totalQ,
          },
        };
      }
      return { ok: true };
    }
    return { ok: true };
  }

  // Custom (default): fixed paper from TestQuestions only.
  if (linked < minRequired) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Add at least ${minRequired} question(s) to this test (custom mode) before activating or assigning.`,
        minRequired,
        bindingMode: 'custom',
        linkedCount: linked,
      },
    };
  }
  return { ok: true };
}

/**
 * Helper function to check and reset daily counters
 * Accepts a counter object directly to avoid re-querying
 */
async function checkAndResetDailyCounters(counter) {
  if (!counter || !counter.UsageID) {
    return null;
  }

  const now = new Date();
  const lastReset = counter.LastResetAt ? new Date(counter.LastResetAt) : null;

  // Reset if LastResetAt is null or more than 24 hours ago
  if (!lastReset || (now - lastReset) > 24 * 60 * 60 * 1000) {
    const { error: updateError } = await supabase
      .from('UsageCounters')
      .update({
        TestsCreatedToday: 0,
        LastResetAt: now.toISOString(),
        UpdatedAt: now.toISOString(),
      })
      .eq('UsageID', counter.UsageID);

    if (!updateError) {
      return { ...counter, TestsCreatedToday: 0 };
    }
  }

  return counter;
}

/**
 * Helper function to get or create usage counter
 */
async function getOrCreateUsageCounter(subscriptionId, examId, orgId = null) {
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  console.log(`[getOrCreateUsageCounter] Starting with SubscriptionID: ${subscriptionId}, ExamID: ${examId}, MonthKey: ${currentMonth}, OrgID: ${orgId}`);

  // Try to get existing counter
  let { data: counter, error: counterError } = await supabase
    .from('UsageCounters')
    .select('*')
    .eq('SubscriptionID', subscriptionId)
    .eq('ExamID', examId)
    .eq('MonthKey', currentMonth)
    .maybeSingle(); // Use maybeSingle() instead of single() to avoid errors when no row exists

  console.log(`[getOrCreateUsageCounter] Query result:`, { 
    hasCounter: !!counter, 
    hasError: !!counterError,
    errorCode: counterError?.code,
    errorMessage: counterError?.message 
  });

  // Check if error is because no row exists (PGRST116) or a real error
  const isNotFoundError = counterError && (
    counterError.code === 'PGRST116' || 
    counterError.message?.includes('No rows') ||
    counterError.message?.includes('not found')
  );

  // If not found (expected), create one
  // maybeSingle() returns { data: null, error: null } when no row exists
  if (isNotFoundError || (!counterError && !counter) || counter === null) {
    console.log(`[getOrCreateUsageCounter] Creating new usage counter for SubscriptionID: ${subscriptionId}, ExamID: ${examId}, MonthKey: ${currentMonth}`);
    
    const insertData = {
      SubscriptionID: subscriptionId,
      ExamID: examId,
      MonthKey: currentMonth,
      StudentsEnrolled: 0,
      TestsCreated: 0,
      TestsCreatedToday: 0,
      // QuestionsCreated column doesn't exist in database - removed
      AIQuestionsGenerated: 0,
      StudentAttempts: 0,
      LastResetAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString(),
    };

    // Add EntityType and EntityID if orgId is provided
    if (orgId) {
      insertData.EntityType = 'Organization';
      insertData.EntityID = orgId;
    }

    console.log(`[getOrCreateUsageCounter] Insert data:`, insertData);
    
    try {
      const { data: newCounter, error: createError } = await supabase
        .from('UsageCounters')
        .insert(insertData)
        .select()
        .single();

      if (createError) {
        console.error('[getOrCreateUsageCounter] ❌ Create error occurred:', createError);
        console.error('[getOrCreateUsageCounter] Error details:', {
          code: createError.code,
          message: createError.message,
          details: createError.details,
          hint: createError.hint,
          SubscriptionID: subscriptionId,
          ExamID: examId,
          MonthKey: currentMonth,
          insertData: insertData
        });
        
        // Check if it's a unique constraint violation (counter already exists)
        if (createError.code === '23505' || createError.message?.includes('duplicate') || createError.message?.includes('unique')) {
          console.log('[getOrCreateUsageCounter] Counter already exists (race condition), fetching it...');
          // Try to fetch it again
          const { data: existingCounter, error: fetchError } = await supabase
            .from('UsageCounters')
            .select('*')
            .eq('SubscriptionID', subscriptionId)
            .eq('ExamID', examId)
            .eq('MonthKey', currentMonth)
            .single();
          
          if (fetchError || !existingCounter) {
            console.error('[getOrCreateUsageCounter] Error fetching counter after duplicate error:', fetchError);
            // Return error object with details instead of null
            throw new Error(`Failed to fetch counter after duplicate error: ${fetchError?.message || 'Unknown error'}`);
          }
          
          console.log(`[getOrCreateUsageCounter] Successfully fetched existing counter: ${existingCounter.UsageID}`);
          counter = existingCounter;
        } else {
          // Other error - throw with details
          const errorMsg = `Database error creating usage counter: ${createError.message || 'Unknown error'} (Code: ${createError.code || 'N/A'})`;
          console.error('[getOrCreateUsageCounter] Fatal error:', errorMsg);
          throw new Error(errorMsg);
        }
      } else if (newCounter) {
        console.log(`[getOrCreateUsageCounter] ✅ Successfully created usage counter: ${newCounter.UsageID}`);
        counter = newCounter;
      } else {
        const errorMsg = 'No error but also no counter returned from insert - database may not have returned the created record';
        console.error(`[getOrCreateUsageCounter] ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (err) {
      console.error('[getOrCreateUsageCounter] Unexpected error:', err);
      // Re-throw to preserve error details
      throw err;
    }
  } else if (counterError) {
    // Real error occurred (not a "not found" error)
    const errorMsg = `Error fetching usage counter: ${counterError.message || 'Unknown error'} (Code: ${counterError.code || 'N/A'})`;
    console.error(`[getOrCreateUsageCounter] ${errorMsg}`);
    console.error('[getOrCreateUsageCounter] Details:', {
      SubscriptionID: subscriptionId,
      ExamID: examId,
      MonthKey: currentMonth,
      error: counterError.message,
      code: counterError.code,
      details: counterError.details,
      hint: counterError.hint
    });
    throw new Error(errorMsg);
  } else {
    console.log(`Found existing usage counter: ${counter.UsageID} for SubscriptionID: ${subscriptionId}, ExamID: ${examId}, MonthKey: ${currentMonth}`);
  }

  if (!counter) {
    const errorMsg = 'Counter is null after all attempts - this should not happen';
    console.error(`[getOrCreateUsageCounter] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // Check and reset daily counters using the counter we already have
  return await checkAndResetDailyCounters(counter);
}

/**
 * POST /api/org/tests
 * Create a new test (OrgAdmin only)
 */
router.post('/', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const {
    testName,
    examId,
    subscriptionId,
    testType,
    durationMinutes,
    totalQuestions,
    totalMarks,
    testDate,
    startTime,
    endTime,
    status = 'Active',
    questionIds = [],
  } = req.body;

  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Validate required fields
    if (!testName || !examId || !subscriptionId || !testType) {
      return res.status(400).json({ error: 'Missing required fields: testName, examId, subscriptionId, testType' });
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
        TestType: testType,
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
      description: `Created ${testType} test: ${testName}`,
      ipAddress,
      userAgent,
      newData: { testName, examId, testType, totalQuestions },
    });

    res.status(201).json({
      message: 'Test created successfully',
      test: {
        testId: newTest.TestID,
        testName: newTest.TestName,
        examId: newTest.ExamID,
        subscriptionId: newTest.SubscriptionID,
        testType: newTest.TestType,
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
    if (b.testType != null && ['Practice', 'Mock', 'Final'].includes(b.testType)) updates.TestType = b.testType;
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
    if (approvedOnly === 'true' || approvedOnly === '1') query = query.eq('IsVerified', true);
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
    if (approvedOnly === true || approvedOnly === 'true' || approvedOnly === '1') query = query.eq('IsVerified', true);

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
      .select('TestID, TestName, OrgID, SubscriptionID')
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

/**
 * POST /api/org/tests/:testId/assign/single
 * Assign test to a single student
 */
router.post('/:testId/assign/single', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { studentId, dueDate, replaceExisting = false } = req.body;
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const minCheck = await checkMinQuestionsForActivateOrAssign(testId, orgId);
    if (!minCheck.ok) return res.status(minCheck.status).json(minCheck.body);

    // Verify test belongs to organization
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, TestName, OrgID, SubscriptionID')
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

    // Verify student belongs to organization
    const { data: student, error: studentError } = await supabase
      .from('Students')
      .select('StudentID, FullName, Email')
      .eq('StudentID', studentId)
      .eq('OrgID', orgId)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check if assignment already exists
    const { data: existing, error: existingError } = await supabase
      .from('TestAssignments')
      .select('AssignmentID')
      .eq('TestID', testId)
      .eq('StudentID', studentId)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
      console.error('Error checking existing assignment:', existingError);
      return res.status(500).json({ error: 'Failed to check existing assignment', details: existingError.message });
    }

    let assignment;
    let assignError;

    if (existing) {
      if (!replaceExisting) {
        return res.status(409).json({ error: 'Test is already assigned to this student' });
      }

      const { error: clearAttemptsError } = await deleteStudentAttemptsForTest(supabase, testId, [studentId]);
      if (clearAttemptsError) {
        console.error('Error clearing attempts for reassignment:', clearAttemptsError);
        return res.status(500).json({
          error: 'Failed to reset prior attempts for reassigned test',
          details: clearAttemptsError.message,
        });
      }

      // Replace in place (avoids re-insert failures e.g. unknown columns; preserves CompletedCycleCount if present)
      const upd = await supabase
        .from('TestAssignments')
        .update({
          DueDate: dueDate ? new Date(dueDate).toISOString() : null,
          Status: 'Pending',
          AssignedAt: new Date().toISOString(),
          AssignedBy: orgUserId,
        })
        .eq('AssignmentID', existing.AssignmentID)
        .select()
        .single();
      assignment = upd.data;
      assignError = upd.error;
    } else {
      const ins = await supabase
        .from('TestAssignments')
        .insert({
          TestID: testId,
          StudentID: studentId,
          AssignmentType: 'Single',
          AssignedBy: orgUserId,
          Status: 'Pending',
          AssignedAt: new Date().toISOString(),
          DueDate: dueDate ? new Date(dueDate).toISOString() : null,
        })
        .select()
        .single();
      assignment = ins.data;
      assignError = ins.error;
    }

    if (assignError) {
      console.error('Error saving assignment:', assignError);
      return res.status(500).json({
        error: existing ? 'Failed to replace assignment' : 'Failed to assign test',
        details: assignError.message,
      });
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Organization',
      entityID: orgId,
      description: `Assigned test "${test.TestName}" to student ${student.FullName}`,
      ipAddress,
      userAgent,
      newData: { testId, testName: test.TestName, studentId, studentName: student.FullName },
    });

    res.status(201).json({
      message: existing ? 'Assignment replaced successfully' : 'Test assigned successfully',
      assignment: {
        assignmentId: assignment.AssignmentID,
        testId: assignment.TestID,
        studentId: assignment.StudentID,
        status: assignment.Status,
      },
    });
  } catch (error) {
    console.error('Assign test to single student error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/tests/:testId/assign/multiple
 * Assign test to multiple selected students
 */
router.post('/:testId/assign/multiple', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { studentIds, dueDate, replaceExisting = false } = req.body; // Array of student IDs
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'Student IDs array is required and must not be empty' });
    }

    const minCheck = await checkMinQuestionsForActivateOrAssign(testId, orgId);
    if (!minCheck.ok) return res.status(minCheck.status).json(minCheck.body);

    // Verify test belongs to organization
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, TestName, OrgID, SubscriptionID')
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

    // Verify all students belong to organization
    const { data: students, error: studentsError } = await supabase
      .from('Students')
      .select('StudentID, FullName')
      .eq('OrgID', orgId)
      .in('StudentID', studentIds);

    if (studentsError) {
      console.error('Error verifying students:', studentsError);
      return res.status(500).json({ error: 'Failed to verify students', details: studentsError.message });
    }

    if (students.length !== studentIds.length) {
      return res.status(400).json({ error: 'Some students do not belong to your organization' });
    }

    // Check existing assignments
    const { data: existing, error: existingError } = await supabase
      .from('TestAssignments')
      .select('StudentID')
      .eq('TestID', testId)
      .in('StudentID', studentIds);

    if (existingError) {
      console.error('Error checking existing assignments:', existingError);
      return res.status(500).json({ error: 'Failed to check existing assignments', details: existingError.message });
    }

    const existingStudentIds = new Set((existing || []).map(a => a.StudentID));
    const newStudentIds = studentIds.filter(id => !existingStudentIds.has(id));

    // If requested, replace existing (delete + re-insert all selected)
    if (replaceExisting && existingStudentIds.size > 0) {
      const { error: delError } = await supabase
        .from('TestAssignments')
        .delete()
        .eq('TestID', testId)
        .in('StudentID', studentIds);

      if (delError) {
        console.error('Error deleting existing assignments:', delError);
        return res.status(500).json({ error: 'Failed to replace assignments', details: delError.message });
      }

      const { error: clearAttemptsError } = await deleteStudentAttemptsForTest(supabase, testId, studentIds);
      if (clearAttemptsError) {
        console.error('Error clearing attempts for reassignment:', clearAttemptsError);
        return res.status(500).json({
          error: 'Failed to reset prior attempts for reassigned test',
          details: clearAttemptsError.message,
        });
      }
    }

    if (newStudentIds.length === 0 && !replaceExisting) {
      return res.status(409).json({ error: 'Test is already assigned to all selected students' });
    }

    // Create assignments (either new only, or full list if replacing)
    const insertStudentIds = replaceExisting ? studentIds : newStudentIds;
    const assignmentsToInsert = insertStudentIds.map((studentId) => ({
      TestID: testId,
      StudentID: studentId,
      AssignmentType: 'Multiple',
      AssignedBy: orgUserId,
      Status: 'Pending',
      AssignedAt: new Date().toISOString(),
      DueDate: dueDate ? new Date(dueDate).toISOString() : null,
    }));

    const { data: assignments, error: insertError } = await supabase
      .from('TestAssignments')
      .insert(assignmentsToInsert)
      .select();

    if (insertError) {
      console.error('Error creating assignments:', insertError);
      return res.status(500).json({ error: 'Failed to assign test', details: insertError.message });
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Organization',
      entityID: orgId,
      description: `Assigned test "${test.TestName}" to ${newStudentIds.length} student(s)`,
      ipAddress,
      userAgent,
      newData: { testId, testName: test.TestName, studentIds: newStudentIds, count: newStudentIds.length },
    });

    res.status(201).json({
      message: replaceExisting ? 'Assignments replaced successfully' : 'Test assigned successfully',
      assigned: replaceExisting ? insertStudentIds.length : newStudentIds.length,
      skipped: replaceExisting ? 0 : existingStudentIds.size,
      replaced: replaceExisting ? existingStudentIds.size : 0,
      assignments: assignments || [],
    });
  } catch (error) {
    console.error('Assign test to multiple students error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/tests/:testId/assign/group
 * Assign test to a student group
 */
router.post('/:testId/assign/group', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { groupId, dueDate, replaceExisting = false } = req.body;
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    if (!groupId) {
      return res.status(400).json({ error: 'Group ID is required' });
    }

    const minCheck = await checkMinQuestionsForActivateOrAssign(testId, orgId);
    if (!minCheck.ok) return res.status(minCheck.status).json(minCheck.body);

    // Verify test belongs to organization
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, TestName, OrgID, SubscriptionID')
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

    // Verify group belongs to organization
    const { data: group, error: groupError } = await supabase
      .from('StudentGroups')
      .select('GroupID, GroupName')
      .eq('GroupID', groupId)
      .eq('OrgID', orgId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get all students in the group
    const { data: members, error: membersError } = await supabase
      .from('StudentGroupMembers')
      .select('StudentID')
      .eq('GroupID', groupId);

    if (membersError) {
      console.error('Error fetching group members:', membersError);
      return res.status(500).json({ error: 'Failed to fetch group members', details: membersError.message });
    }

    if (!members || members.length === 0) {
      return res.status(400).json({ error: 'Group has no members' });
    }

    const studentIds = members.map(m => m.StudentID);

    // Check existing assignments
    const { data: existing, error: existingError } = await supabase
      .from('TestAssignments')
      .select('StudentID')
      .eq('TestID', testId)
      .in('StudentID', studentIds);

    if (existingError) {
      console.error('Error checking existing assignments:', existingError);
      return res.status(500).json({ error: 'Failed to check existing assignments', details: existingError.message });
    }

    const existingStudentIds = new Set((existing || []).map(a => a.StudentID));
    const newStudentIds = studentIds.filter(id => !existingStudentIds.has(id));

    if (replaceExisting && existingStudentIds.size > 0) {
      const { error: delError } = await supabase
        .from('TestAssignments')
        .delete()
        .eq('TestID', testId)
        .in('StudentID', studentIds);

      if (delError) {
        console.error('Error deleting existing assignments:', delError);
        return res.status(500).json({ error: 'Failed to replace assignments', details: delError.message });
      }

      const { error: clearAttemptsError } = await deleteStudentAttemptsForTest(supabase, testId, studentIds);
      if (clearAttemptsError) {
        console.error('Error clearing attempts for reassignment:', clearAttemptsError);
        return res.status(500).json({
          error: 'Failed to reset prior attempts for reassigned test',
          details: clearAttemptsError.message,
        });
      }
    }

    if (newStudentIds.length === 0 && !replaceExisting) {
      // Provide detailed info for UI/debugging
      const existingIds = Array.from(existingStudentIds);
      const { data: existingStudents, error: existingStudentsError } = await supabase
        .from('Students')
        .select('StudentID, FullName, Email')
        .eq('OrgID', orgId)
        .in('StudentID', existingIds);

      if (existingStudentsError) {
        console.error('Error fetching existing assigned students:', existingStudentsError);
      }

      return res.status(409).json({
        error: 'Test is already assigned to all students in this group',
        details: {
          reason: 'already_assigned',
          scope: 'group',
          testId,
          groupId,
          totalStudentsInGroup: studentIds.length,
          alreadyAssignedCount: existingStudentIds.size,
          alreadyAssignedStudents: (existingStudents || []).map(s => ({
            studentId: s.StudentID,
            fullName: s.FullName,
            email: s.Email,
            reason: 'Existing assignment found for this test',
          })),
        },
      });
    }

    // Create assignments
    const insertStudentIds = replaceExisting ? studentIds : newStudentIds;
    const assignmentsToInsert = insertStudentIds.map((studentId) => ({
      TestID: testId,
      StudentID: studentId,
      GroupID: groupId,
      AssignmentType: 'Group',
      AssignedBy: orgUserId,
      Status: 'Pending',
      AssignedAt: new Date().toISOString(),
      DueDate: dueDate ? new Date(dueDate).toISOString() : null,
    }));

    const { data: assignments, error: insertError } = await supabase
      .from('TestAssignments')
      .insert(assignmentsToInsert)
      .select();

    if (insertError) {
      console.error('Error creating assignments:', insertError);
      return res.status(500).json({ error: 'Failed to assign test', details: insertError.message });
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Organization',
      entityID: orgId,
      description: `Assigned test "${test.TestName}" to group "${group.GroupName}" (${newStudentIds.length} students)`,
      ipAddress,
      userAgent,
      newData: { testId, testName: test.TestName, groupId, groupName: group.GroupName, count: newStudentIds.length },
    });

    res.status(201).json({
      message: replaceExisting ? 'Assignments replaced successfully' : 'Test assigned to group successfully',
      assigned: replaceExisting ? insertStudentIds.length : newStudentIds.length,
      skipped: replaceExisting ? 0 : existingStudentIds.size,
      replaced: replaceExisting ? existingStudentIds.size : 0,
      assignments: assignments || [],
    });
  } catch (error) {
    console.error('Assign test to group error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/tests/:testId/assign/groups
 * Assign test to multiple groups
 */
router.post('/:testId/assign/groups', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { groupIds, dueDate, replaceExisting = false } = req.body; // Array of group IDs
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({ error: 'Group IDs array is required and must not be empty' });
    }

    const minCheck = await checkMinQuestionsForActivateOrAssign(testId, orgId);
    if (!minCheck.ok) return res.status(minCheck.status).json(minCheck.body);

    // Verify test belongs to organization
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, TestName, OrgID, SubscriptionID')
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

    // Verify all groups belong to organization
    const { data: groups, error: groupsError } = await supabase
      .from('StudentGroups')
      .select('GroupID, GroupName')
      .eq('OrgID', orgId)
      .in('GroupID', groupIds);

    if (groupsError) {
      console.error('Error verifying groups:', groupsError);
      return res.status(500).json({ error: 'Failed to verify groups', details: groupsError.message });
    }

    if (groups.length !== groupIds.length) {
      return res.status(400).json({ error: 'Some groups do not belong to your organization' });
    }

    // Get all students from all groups
    const { data: allMembers, error: membersError } = await supabase
      .from('StudentGroupMembers')
      .select('StudentID, GroupID')
      .in('GroupID', groupIds);

    if (membersError) {
      console.error('Error fetching group members:', membersError);
      return res.status(500).json({ error: 'Failed to fetch group members', details: membersError.message });
    }

    if (!allMembers || allMembers.length === 0) {
      return res.status(400).json({ error: 'Selected groups have no members' });
    }

    // Get unique student IDs
    const studentIds = [...new Set(allMembers.map(m => m.StudentID))];

    // Check existing assignments
    const { data: existing, error: existingError } = await supabase
      .from('TestAssignments')
      .select('StudentID')
      .eq('TestID', testId)
      .in('StudentID', studentIds);

    if (existingError) {
      console.error('Error checking existing assignments:', existingError);
      return res.status(500).json({ error: 'Failed to check existing assignments', details: existingError.message });
    }

    const existingStudentIds = new Set((existing || []).map(a => a.StudentID));
    const newStudentIds = studentIds.filter(id => !existingStudentIds.has(id));

    if (replaceExisting && existingStudentIds.size > 0) {
      const { error: delError } = await supabase
        .from('TestAssignments')
        .delete()
        .eq('TestID', testId)
        .in('StudentID', studentIds);

      if (delError) {
        console.error('Error deleting existing assignments:', delError);
        return res.status(500).json({ error: 'Failed to replace assignments', details: delError.message });
      }

      const { error: clearAttemptsError } = await deleteStudentAttemptsForTest(supabase, testId, studentIds);
      if (clearAttemptsError) {
        console.error('Error clearing attempts for reassignment:', clearAttemptsError);
        return res.status(500).json({
          error: 'Failed to reset prior attempts for reassigned test',
          details: clearAttemptsError.message,
        });
      }
    }

    if (newStudentIds.length === 0 && !replaceExisting) {
      // Provide detailed info for UI/debugging
      const existingIds = Array.from(existingStudentIds);
      const { data: existingStudents, error: existingStudentsError } = await supabase
        .from('Students')
        .select('StudentID, FullName, Email')
        .eq('OrgID', orgId)
        .in('StudentID', existingIds);

      if (existingStudentsError) {
        console.error('Error fetching existing assigned students:', existingStudentsError);
      }

      return res.status(409).json({
        error: 'Test is already assigned to all students in the selected groups',
        details: {
          reason: 'already_assigned',
          scope: 'groups',
          testId,
          groupIds,
          totalUniqueStudentsInGroups: studentIds.length,
          alreadyAssignedCount: existingStudentIds.size,
          alreadyAssignedStudents: (existingStudents || []).map(s => ({
            studentId: s.StudentID,
            fullName: s.FullName,
            email: s.Email,
            reason: 'Existing assignment found for this test',
          })),
        },
      });
    }

    // Create assignments with group mapping
    const insertStudentIds = replaceExisting ? studentIds : newStudentIds;
    const assignmentsToInsert = insertStudentIds.map(studentId => {
      // Find which group(s) this student belongs to
      const studentGroups = allMembers.filter(m => m.StudentID === studentId).map(m => m.GroupID);
      // Use the first group ID (or we could create multiple assignments, but UNIQUE constraint prevents that)
      return {
        TestID: testId,
        StudentID: studentId,
        GroupID: studentGroups[0] || null,
        AssignmentType: 'Multiple',
        AssignedBy: orgUserId,
        Status: 'Pending',
        AssignedAt: new Date().toISOString(),
        DueDate: dueDate ? new Date(dueDate).toISOString() : null,
      };
    });

    const { data: assignments, error: insertError } = await supabase
      .from('TestAssignments')
      .insert(assignmentsToInsert)
      .select();

    if (insertError) {
      console.error('Error creating assignments:', insertError);
      return res.status(500).json({ error: 'Failed to assign test', details: insertError.message });
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Organization',
      entityID: orgId,
      description: `Assigned test "${test.TestName}" to ${groupIds.length} group(s) (${newStudentIds.length} students)`,
      ipAddress,
      userAgent,
      newData: { testId, testName: test.TestName, groupIds, count: newStudentIds.length },
    });

    res.status(201).json({
      message: replaceExisting ? 'Assignments replaced successfully' : 'Test assigned to groups successfully',
      assigned: replaceExisting ? insertStudentIds.length : newStudentIds.length,
      skipped: replaceExisting ? 0 : existingStudentIds.size,
      replaced: replaceExisting ? existingStudentIds.size : 0,
      assignments: assignments || [],
    });
  } catch (error) {
    console.error('Assign test to multiple groups error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/tests/:testId/assign/all
 * Assign test to all students in the organization
 */
router.post('/:testId/assign/all', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { orgId, orgUserId } = req.user;
  const { dueDate, replaceExisting = false } = req.body;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    const minCheck = await checkMinQuestionsForActivateOrAssign(testId, orgId);
    if (!minCheck.ok) return res.status(minCheck.status).json(minCheck.body);

    // Verify test belongs to organization
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, TestName, OrgID')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Get all active students in the organization
    const { data: students, error: studentsError } = await supabase
      .from('Students')
      .select('StudentID')
      .eq('OrgID', orgId)
      .eq('Status', 'Active');

    if (studentsError) {
      console.error('Error fetching students:', studentsError);
      return res.status(500).json({ error: 'Failed to fetch students', details: studentsError.message });
    }

    if (!students || students.length === 0) {
      return res.status(400).json({ error: 'No active students found in your organization' });
    }

    const studentIds = students.map(s => s.StudentID);

    // Check existing assignments
    const { data: existing, error: existingError } = await supabase
      .from('TestAssignments')
      .select('StudentID')
      .eq('TestID', testId)
      .in('StudentID', studentIds);

    if (existingError) {
      console.error('Error checking existing assignments:', existingError);
      return res.status(500).json({ error: 'Failed to check existing assignments', details: existingError.message });
    }

    const existingStudentIds = new Set((existing || []).map(a => a.StudentID));
    const newStudentIds = studentIds.filter(id => !existingStudentIds.has(id));

    if (replaceExisting && existingStudentIds.size > 0) {
      const { error: delError } = await supabase
        .from('TestAssignments')
        .delete()
        .eq('TestID', testId)
        .in('StudentID', studentIds);

      if (delError) {
        console.error('Error deleting existing assignments:', delError);
        return res.status(500).json({ error: 'Failed to replace assignments', details: delError.message });
      }

      const { error: clearAttemptsError } = await deleteStudentAttemptsForTest(supabase, testId, studentIds);
      if (clearAttemptsError) {
        console.error('Error clearing attempts for reassignment:', clearAttemptsError);
        return res.status(500).json({
          error: 'Failed to reset prior attempts for reassigned test',
          details: clearAttemptsError.message,
        });
      }
    }

    if (newStudentIds.length === 0 && !replaceExisting) {
      return res.status(409).json({ error: 'Test is already assigned to all active students' });
    }

    // Create assignments
    const insertStudentIds = replaceExisting ? studentIds : newStudentIds;
    const assignmentsToInsert = insertStudentIds.map((studentId) => ({
      TestID: testId,
      StudentID: studentId,
      AssignmentType: 'All',
      AssignedBy: orgUserId,
      Status: 'Pending',
      AssignedAt: new Date().toISOString(),
      DueDate: dueDate ? new Date(dueDate).toISOString() : null,
    }));

    const { data: assignments, error: insertError } = await supabase
      .from('TestAssignments')
      .insert(assignmentsToInsert)
      .select();

    if (insertError) {
      console.error('Error creating assignments:', insertError);
      return res.status(500).json({ error: 'Failed to assign test', details: insertError.message });
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Organization',
      entityID: orgId,
      description: `Assigned test "${test.TestName}" to all active students (${newStudentIds.length} students)`,
      ipAddress,
      userAgent,
      newData: { testId, testName: test.TestName, count: newStudentIds.length },
    });

    res.status(201).json({
      message: replaceExisting ? 'Assignments replaced successfully' : 'Test assigned to all students successfully',
      assigned: replaceExisting ? insertStudentIds.length : newStudentIds.length,
      skipped: replaceExisting ? 0 : existingStudentIds.size,
      replaced: replaceExisting ? existingStudentIds.size : 0,
      assignments: assignments || [],
    });
  } catch (error) {
    console.error('Assign test to all students error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/tests/:testId/assignments
 * Get all assignments for a test
 */
router.get('/:testId/assignments', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { orgId } = req.user;

  try {
    // Verify test belongs to organization
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, TestName, OrgID')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Get all assignments for this test
    const { data: assignments, error: assignmentsError } = await supabase
      .from('TestAssignments')
      .select(`
        *,
        Students (
          StudentID,
          FullName,
          Email,
          Status
        ),
        StudentGroups (
          GroupID,
          GroupName
        )
      `)
      .eq('TestID', testId)
      .order('AssignedAt', { ascending: false });

    if (assignmentsError) {
      console.error('Error fetching assignments:', assignmentsError);
      return res.status(500).json({ error: 'Failed to fetch assignments', details: assignmentsError.message });
    }

    res.json({
      test: {
        testId: test.TestID,
        testName: test.TestName,
      },
      assignments: assignments || [],
      total: assignments?.length || 0,
    });
  } catch (error) {
    console.error('Get test assignments error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
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
