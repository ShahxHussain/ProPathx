import express from 'express';
import { supabase } from '../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../middleware/auth.js';

const router = express.Router();

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
        TestDate: testDate,
        StartTime: startTime,
        EndTime: endTime,
        Status: status,
        CreatedAt: new Date().toISOString(),
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

    // Get test questions
    const { data: testQuestions, error: questionsError } = await supabase
      .from('TestQuestions')
      .select(`
        *,
        Questions (
          QuestionID,
          QuestionText,
          DifficultyLevel,
          QuestionType
        )
      `)
      .eq('TestID', testId);

    res.json({
      test: {
        ...test,
        questions: testQuestions || [],
      },
    });
  } catch (error) {
    console.error('Get test error:', error);
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

    if (existing) {
      if (!replaceExisting) {
        return res.status(409).json({ error: 'Test is already assigned to this student' });
      }

      // Replace: delete existing assignment then insert new one (to update due date / reset status)
      const { error: delError } = await supabase
        .from('TestAssignments')
        .delete()
        .eq('TestID', testId)
        .eq('StudentID', studentId);

      if (delError) {
        console.error('Error deleting existing assignment:', delError);
        return res.status(500).json({ error: 'Failed to replace assignment', details: delError.message });
      }
    }

    // Create assignment
    const { data: assignment, error: assignError } = await supabase
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

    if (assignError) {
      console.error('Error creating assignment:', assignError);
      return res.status(500).json({ error: 'Failed to assign test', details: assignError.message });
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
      message: 'Test assigned successfully',
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
    }

    if (newStudentIds.length === 0 && !replaceExisting) {
      return res.status(409).json({ error: 'Test is already assigned to all selected students' });
    }

    // Create assignments (either new only, or full list if replacing)
    const insertStudentIds = replaceExisting ? studentIds : newStudentIds;
    const assignmentsToInsert = insertStudentIds.map(studentId => ({
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
    const assignmentsToInsert = insertStudentIds.map(studentId => ({
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
    }

    if (newStudentIds.length === 0 && !replaceExisting) {
      return res.status(409).json({ error: 'Test is already assigned to all active students' });
    }

    // Create assignments
    const insertStudentIds = replaceExisting ? studentIds : newStudentIds;
    const assignmentsToInsert = insertStudentIds.map(studentId => ({
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
