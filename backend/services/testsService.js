import { supabase } from '../config/database.js';
import { isPlanModeEnabled } from '../utils/subscriptionPlanCatalog.js';

export function bindingFromTestRow(test) {
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
export const PG_OPTIONS_BY_QUESTION_FK = 'Options!Options_QuestionID_fkey';

export function enrollmentStatusAllowsTestAssignment(statusRaw) {
  const normalized = String(statusRaw || '').trim().toLowerCase();
  return normalized === 'approved' || normalized === 'active';
}

export async function getEligibleStudentIdsForTestExam({ orgId, examId, studentIds }) {
  const uniqueStudentIds = [...new Set((studentIds || []).filter(Boolean))];
  if (!uniqueStudentIds.length || !examId) return new Set();
  const { data, error } = await supabase
    .from('StudentExamEnrollments')
    .select('StudentID, Status')
    .eq('OrgID', orgId)
    .eq('ExamID', examId)
    .in('StudentID', uniqueStudentIds);
  if (error) throw error;
  const allowed = new Set();
  for (const row of data || []) {
    if (enrollmentStatusAllowsTestAssignment(row.Status)) {
      allowed.add(row.StudentID);
    }
  }
  return allowed;
}

export async function ensureScheduledModeEnabledForTestSubscription(test) {
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
export async function loadTestQuestionsWithQuestions(supabaseClient, testId) {
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
export async function deleteStudentAttemptsForTest(supabaseClient, testId, studentIds) {
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
export async function orgHasQualifyingSubscription(orgId) {
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
export const MIN_QUESTIONS_PER_TEST = 1;

/**
 * Returns the minimum number of questions required for the test (for activate/assign).
 * Uses constant; can later read from SubscriptionPlanExams.MinQuestionsPerTest if column is added.
 */
export function getMinQuestionsForTest() {
  return MIN_QUESTIONS_PER_TEST;
}

/**
 * Validate subject weightage: per-subject question count must not exceed (totalQuestions * Subject.Weightage/100).
 * Returns { valid: true } or { valid: false, message, exceeded }.
 */
export async function validateWeightageForAdd(testId, examId, totalQuestionsAfterAdd, questionIdsToAdd) {
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
export async function checkMinQuestionsForActivateOrAssign(testId, orgId) {
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
export async function checkAndResetDailyCounters(counter) {
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
export async function getOrCreateUsageCounter(subscriptionId, examId, orgId = null) {
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
