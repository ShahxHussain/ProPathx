import express from 'express';
import { supabase } from '../config/database.js';
import { authenticate, requireRole, verifyActiveStatus } from '../middleware/auth.js';
import { getClientIP, getUserAgent } from '../utils/logger.js';
import { hashPassword } from '../utils/password.js';

const router = express.Router();

/**
 * NOTE: This router is mounted for BOTH:
 * - /api/student        (student-facing dashboard & assignments)
 * - /api/org/students   (OrgAdmin-facing student management)
 *
 * Student-facing routes live under /dashboard/... and /assignments
 * OrgAdmin CRUD routes live at the root path (/), /bulk, /:studentId
 */

/**
 * GET /api/student/dashboard/stats
 * Get student dashboard statistics
 */
router.get('/dashboard/stats', authenticate, async (req, res) => {
  try {
    const { studentId, orgId } = req.user;

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }

    // Get total test assignments
    const { count: totalAssignments, error: assignmentsError } = await supabase
      .from('TestAssignments')
      .select('*', { count: 'exact', head: true })
      .eq('StudentID', studentId);

    // Get completed attempts
    const { count: completedTests, error: completedError } = await supabase
      .from('StudentAttempts')
      .select('*', { count: 'exact', head: true })
      .eq('StudentID', studentId)
      .eq('Status', 'Completed');

    // Get pending assignments (not yet attempted)
    const { data: allAssignments, error: allAssignmentsError } = await supabase
      .from('TestAssignments')
      .select('AssignmentID, TestID, DueDate')
      .eq('StudentID', studentId);

    const now = new Date();
    let pendingTests = 0;
    let expiredTests = 0;

    if (allAssignments) {
      for (const assignment of allAssignments) {
        // Check if student has attempted this test
        const { count: attempts } = await supabase
          .from('StudentAttempts')
          .select('*', { count: 'exact', head: true })
          .eq('StudentID', studentId)
          .eq('TestID', assignment.TestID);

        if (!attempts || attempts === 0) {
          // Not attempted yet
          if (assignment.DueDate) {
            const dueDate = new Date(assignment.DueDate);
            if (dueDate < now) {
              expiredTests++;
            } else {
              pendingTests++;
            }
          } else {
            pendingTests++;
          }
        }
      }
    }

    // Get average score
    const { data: attempts, error: attemptsError } = await supabase
      .from('StudentAttempts')
      .select('ObtainedMarks, TotalMarks')
      .eq('StudentID', studentId)
      .eq('Status', 'Completed')
      .not('ObtainedMarks', 'is', null)
      .not('TotalMarks', 'is', null);

    let averageScore = 0;
    if (attempts && attempts.length > 0) {
      const totalScore = attempts.reduce((sum, attempt) => {
        if (attempt.TotalMarks > 0) {
          return sum + (attempt.ObtainedMarks / attempt.TotalMarks) * 100;
        }
        return sum;
      }, 0);
      averageScore = totalScore / attempts.length;
    }

    // Get recent test assignments
    const { data: recentAssignments, error: recentError } = await supabase
      .from('TestAssignments')
      .select('*')
      .eq('StudentID', studentId)
      .order('AssignedAt', { ascending: false })
      .limit(5);

    // Fetch test details for each assignment
    const enrichedRecentAssignments = await Promise.all(
      (recentAssignments || []).map(async (assignment) => {
        const { data: test } = await supabase
          .from('Tests')
          .select('TestID, TestName, Description, StartDate, EndDate, DurationMinutes')
          .eq('TestID', assignment.TestID)
          .single();

        return {
          ...assignment,
          Tests: test ? [test] : [],
        };
      })
    );

    res.json({
      stats: {
        totalAssignments: totalAssignments || 0,
        completedTests: completedTests || 0,
        pendingTests,
        expiredTests,
        averageScore: Math.round(averageScore * 10) / 10,
      },
      recentAssignments: enrichedRecentAssignments || [],
    });
  } catch (error) {
    console.error('Get student dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/student/assignments
 * Get all test assignments for the student
 */
router.get('/assignments', authenticate, async (req, res) => {
  try {
    const { studentId } = req.user;

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }

    const { data: assignments, error } = await supabase
      .from('TestAssignments')
      .select('*')
      .eq('StudentID', studentId)
      .order('AssignedAt', { ascending: false });

    if (error) {
      console.error('Error fetching assignments:', error);
      return res.status(500).json({ error: 'Failed to fetch assignments', details: error.message });
    }

    // Enrich with test details and attempt status
    const enrichedAssignments = await Promise.all(
      (assignments || []).map(async (assignment) => {
        // Fetch test details
        const { data: test } = await supabase
          .from('Tests')
          .select('TestID, TestName, Description, StartDate, EndDate, DurationMinutes, Status')
          .eq('TestID', assignment.TestID)
          .single();

        // Fetch attempt status
        const { data: attempts } = await supabase
          .from('StudentAttempts')
          .select('AttemptID, Status, ObtainedMarks, TotalMarks, StartedAt, CompletedAt')
          .eq('StudentID', studentId)
          .eq('TestID', assignment.TestID)
          .order('StartedAt', { ascending: false })
          .limit(1);

        return {
          ...assignment,
          Tests: test ? [test] : [],
          latestAttempt: attempts && attempts.length > 0 ? attempts[0] : null,
          hasAttempted: attempts && attempts.length > 0,
        };
      })
    );

    res.json({
      assignments: enrichedAssignments,
      total: enrichedAssignments.length,
    });
  } catch (error) {
    console.error('Get student assignments error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/student/tests/:testId/attempts
 * Start or resume an attempt for the given test
 */
router.post('/tests/:testId/attempts', authenticate, async (req, res) => {
  try {
    // Resolve student identity: JWT uses studentId; fallback to userId when actorType is Student
    const { studentId: rawStudentId, orgId, actorType, userId } = req.user;
    const studentId = rawStudentId != null ? String(rawStudentId).trim() : (actorType === 'Student' && userId != null ? String(userId).trim() : null);
    const { testId: rawTestId } = req.params;
    const testId = rawTestId != null ? String(rawTestId).trim() : null;

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }
    if (!testId) {
      return res.status(400).json({ error: 'Test ID is required' });
    }

    // Ensure there is an assignment for this student & test
    const { data: assignment, error: assignmentError } = await supabase
      .from('TestAssignments')
      .select('*')
      .eq('StudentID', studentId)
      .eq('TestID', testId)
      .maybeSingle();

    if (assignmentError) {
      console.error('Start attempt: assignment lookup failed', { studentId, testId, error: assignmentError });
      return res.status(500).json({
        error: 'Failed to verify assignment',
        ...(process.env.NODE_ENV === 'development' && { details: assignmentError.message }),
      });
    }
    if (!assignment) {
      console.warn('Start attempt: no assignment found', { studentId, testId });
      return res.status(404).json({
        error: 'Test is not assigned to this student',
        ...(process.env.NODE_ENV === 'development' && {
          hint: 'Check that TestAssignments has a row for this TestID and StudentID. StudentID in JWT must match Students.StudentID.',
        }),
      });
    }

    if (!['Pending', 'InProgress'].includes(assignment.Status)) {
      return res.status(400).json({ error: 'This assignment is not available for attempt' });
    }

    // Load test details
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, OrgID, TestName, Description, TestType, DurationMinutes, TotalQuestions, TotalMarks, StartTime, EndTime, Status')
      .eq('TestID', testId)
      .single();

    if (testError || !test || test.OrgID !== orgId) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (test.Status !== 'Active') {
      return res.status(400).json({ error: 'Test is not active' });
    }

    const now = new Date();
    if (test.StartTime) {
      const start = new Date(test.StartTime);
      if (start > now) {
        return res.status(400).json({ error: 'Test has not started yet' });
      }
    }
    if (test.EndTime) {
      const end = new Date(test.EndTime);
      if (end < now) {
        return res.status(400).json({ error: 'Test has already ended' });
      }
    }
    if (assignment.DueDate) {
      const due = new Date(assignment.DueDate);
      if (due < now) {
        return res.status(400).json({ error: 'Assignment due date has passed' });
      }
    }

    // Check for existing attempts
    const { data: existingAttempts } = await supabase
      .from('StudentAttempts')
      .select('AttemptID, Status, StartTime, EndTime, ObtainedMarks, TotalMarks')
      .eq('StudentID', studentId)
      .eq('TestID', testId)
      .order('StartTime', { ascending: false })
      .limit(1);

    const existingAttempt = existingAttempts && existingAttempts.length > 0 ? existingAttempts[0] : null;

    if (existingAttempt && existingAttempt.Status === 'Completed') {
      return res.status(400).json({ error: 'You have already completed this test' });
    }

    let attempt = existingAttempt;

    if (!attempt) {
      // Create new attempt
      const { data: newAttempt, error: insertError } = await supabase
        .from('StudentAttempts')
        .insert({
          StudentID: studentId,
          TestID: testId,
          StartTime: new Date().toISOString(),
          Status: 'InProgress',
          TotalMarks: test.TotalMarks || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating attempt:', insertError);
        return res.status(500).json({ error: 'Failed to start attempt', details: insertError.message });
      }

      attempt = newAttempt;

      // Mark assignment as InProgress if it was Pending
      if (assignment.Status === 'Pending') {
        await supabase
          .from('TestAssignments')
          .update({ Status: 'InProgress' })
          .eq('AssignmentID', assignment.AssignmentID);
      }
    }

    // Load questions for this test (Custom binding baseline)
    const { data: testQuestions, error: tqError } = await supabase
      .from('TestQuestions')
      .select(
        `
        QuestionID,
        Marks,
        NegativeMarks,
        Questions (
          QuestionID,
          QuestionText,
          QuestionType,
          DifficultyLevel,
          Options (
            OptionID,
            OptionNumber,
            OptionText
          )
        )
      `
      )
      .eq('TestID', testId)
      .order('DisplayOrder', { ascending: true });

    if (tqError) {
      console.error('Error loading test questions for attempt:', tqError);
      return res
        .status(500)
        .json({ error: 'Failed to load questions for this test', details: tqError.message });
    }

    const questions = (testQuestions || []).map((row) => {
      const q = row.Questions || {};
      return {
        questionId: q.QuestionID,
        questionText: q.QuestionText,
        questionType: q.QuestionType,
        difficultyLevel: q.DifficultyLevel,
        marks: row.Marks,
        negativeMarks: row.NegativeMarks,
        options: (q.Options || []).map((opt) => ({
          optionId: opt.OptionID,
          optionNumber: opt.OptionNumber,
          optionText: opt.OptionText,
        })),
      };
    });

    if (questions.length === 0) {
      return res
        .status(400)
        .json({ error: 'This test has no questions configured. Please contact your organization.' });
    }

    res.json({
      attempt: {
        attemptId: attempt.AttemptID,
        status: attempt.Status,
        startTime: attempt.StartTime,
      },
      test: {
        testId: test.TestID,
        testName: test.TestName,
        description: test.Description,
        testType: test.TestType,
        durationMinutes: test.DurationMinutes,
        totalQuestions: test.TotalQuestions,
        totalMarks: test.TotalMarks,
        startTime: test.StartTime,
        endTime: test.EndTime,
      },
      assignment: {
        assignmentId: assignment.AssignmentID,
        status: assignment.Status,
        dueDate: assignment.DueDate,
      },
      questions,
    });
  } catch (error) {
    console.error('Start attempt error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/student/tests/:testId/attempts/:attemptId/submit
 * Submit answers for an attempt and finalize it
 */
router.post('/tests/:testId/attempts/:attemptId/submit', authenticate, async (req, res) => {
  try {
    const { studentId } = req.user;
    const { testId, attemptId } = req.params;
    const { answers } = req.body || {};

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'No answers provided' });
    }

    // Load attempt
    const { data: attempt, error: attemptError } = await supabase
      .from('StudentAttempts')
      .select('*')
      .eq('AttemptID', attemptId)
      .eq('StudentID', studentId)
      .eq('TestID', testId)
      .single();

    if (attemptError || !attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attempt.Status === 'Completed') {
      return res.status(400).json({ error: 'Attempt already completed' });
    }

    // Load test & questions with correct options
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, TotalMarks')
      .eq('TestID', testId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const { data: testQuestions, error: tqError } = await supabase
      .from('TestQuestions')
      .select(
        `
        QuestionID,
        Marks,
        NegativeMarks,
        Questions (
          QuestionID,
          QuestionType,
          Options (
            OptionID,
            IsCorrect
          )
        )
      `
      )
      .eq('TestID', testId);

    if (tqError) {
      console.error('Error loading questions for scoring:', tqError);
      return res
        .status(500)
        .json({ error: 'Failed to load questions for scoring', details: tqError.message });
    }

    const answerMap = new Map();
    for (const a of answers) {
      if (!a || !a.questionId) continue;
      const selected = Array.isArray(a.selectedOptionIds) ? a.selectedOptionIds : [];
      answerMap.set(a.questionId, new Set(selected));
    }

    let obtainedMarks = 0;
    let maxMarks = 0;

    // Clear previous answers for this attempt (if any)
    await supabase.from('StudentAnswers').delete().eq('AttemptID', attemptId);

    const studentAnswersToInsert = [];

    for (const row of testQuestions || []) {
      const q = row.Questions || {};
      const qId = q.QuestionID;
      const marks = Number(row.Marks) || 0;
      const negative = Number(row.NegativeMarks) || 0;

      maxMarks += marks;

      const correctOptionIds = new Set(
        (q.Options || [])
          .filter((opt) => opt.IsCorrect)
          .map((opt) => opt.OptionID)
      );

      const selectedSet = answerMap.get(qId) || new Set();

      // Insert StudentAnswers rows
      for (const opt of q.Options || []) {
        if (selectedSet.has(opt.OptionID)) {
          studentAnswersToInsert.push({
            AttemptID: attemptId,
            QuestionID: qId,
            OptionID: opt.OptionID,
            IsCorrect: !!opt.IsCorrect,
          });
        }
      }

      // Scoring: full marks only if exact match; otherwise negative (if configured)
      if (selectedSet.size === 0) {
        continue; // no answer, zero marks
      }

      let isExactMatch = true;
      if (selectedSet.size !== correctOptionIds.size) {
        isExactMatch = false;
      } else {
        for (const id of selectedSet) {
          if (!correctOptionIds.has(id)) {
            isExactMatch = false;
            break;
          }
        }
      }

      if (isExactMatch) {
        obtainedMarks += marks;
      } else if (negative > 0) {
        obtainedMarks -= negative;
      }
    }

    if (studentAnswersToInsert.length > 0) {
      await supabase.from('StudentAnswers').insert(studentAnswersToInsert);
    }

    const finalTotalMarks = test.TotalMarks || maxMarks || null;

    // Finalize attempt
    const { data: updatedAttempt, error: updateError } = await supabase
      .from('StudentAttempts')
      .update({
        Status: 'Completed',
        EndTime: new Date().toISOString(),
        ObtainedMarks: obtainedMarks,
        TotalMarks: finalTotalMarks,
      })
      .eq('AttemptID', attemptId)
      .select()
      .single();

    if (updateError) {
      console.error('Error finalizing attempt:', updateError);
      return res.status(500).json({ error: 'Failed to finalize attempt', details: updateError.message });
    }

    // Mark assignment as completed
    await supabase
      .from('TestAssignments')
      .update({ Status: 'Completed' })
      .eq('StudentID', studentId)
      .eq('TestID', testId);

    res.json({
      message: 'Attempt submitted successfully',
      attempt: updatedAttempt,
      score: obtainedMarks,
      totalMarks: finalTotalMarks,
      percentage:
        finalTotalMarks && finalTotalMarks > 0
          ? Math.round((obtainedMarks / finalTotalMarks) * 1000) / 10
          : null,
    });
  } catch (error) {
    console.error('Submit attempt error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});
/**
 * GET /api/student/tests
 * Get tests currently available for the logged-in student
 * (assignment-based visibility)
 */
router.get('/tests', authenticate, async (req, res) => {
  try {
    const { studentId, orgId } = req.user;

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }

    // Load assignments for this student that are potentially available
    const { data: assignments, error } = await supabase
      .from('TestAssignments')
      .select('*')
      .eq('StudentID', studentId)
      .in('Status', ['Pending', 'InProgress']);

    if (error) {
      console.error('Error fetching assignments for available tests:', error);
      return res.status(500).json({ error: 'Failed to fetch assignments', details: error.message });
    }

    const now = new Date();

    const enriched = await Promise.all(
      (assignments || []).map(async (assignment) => {
        const { data: test } = await supabase
          .from('Tests')
          .select('TestID, OrgID, ExamID, TestName, Description, TestType, DurationMinutes, StartTime, EndTime, Status, TotalQuestions, TotalMarks')
          .eq('TestID', assignment.TestID)
          .single();

        if (!test || test.OrgID !== orgId || test.Status !== 'Active') {
          return null;
        }

        // Time window check
        let withinWindow = true;
        if (test.StartTime) {
          const start = new Date(test.StartTime);
          if (start > now) withinWindow = false;
        }
        if (test.EndTime) {
          const end = new Date(test.EndTime);
          if (end < now) withinWindow = false;
        }
        if (assignment.DueDate) {
          const due = new Date(assignment.DueDate);
          if (due < now) withinWindow = false;
        }

        if (!withinWindow) {
          return null;
        }

        // Latest attempt (if any)
        const { data: attempts } = await supabase
          .from('StudentAttempts')
          .select('AttemptID, Status, ObtainedMarks, TotalMarks, StartTime, EndTime')
          .eq('StudentID', studentId)
          .eq('TestID', assignment.TestID)
          .order('StartTime', { ascending: false })
          .limit(1);

        const latestAttempt = attempts && attempts.length > 0 ? attempts[0] : null;

        return {
          assignmentId: assignment.AssignmentID,
          assignmentStatus: assignment.Status,
          dueDate: assignment.DueDate,
          assignedAt: assignment.AssignedAt,
          test: test,
          latestAttempt,
        };
      })
    );

    const availableTests = enriched.filter((item) => item !== null);

    res.json({
      tests: availableTests,
      total: availableTests.length,
    });
  } catch (error) {
    console.error('Get student available tests error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * ORG ADMIN STUDENT MANAGEMENT ROUTES
 *
 * These routes are mounted at /api/org/students and allow an OrgAdmin
 * to manage the Students table for their organization.
 */

/**
 * POST /api/org/students
 * Register a single student (OrgAdmin only)
 */
router.post(
  '/',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const {
      fullName,
      email,
      password,
      identityNo,
      fatherName,
      gender,
      dateOfBirth,
      address,
      phone,
      status = 'Active',
    } = req.body;

    try {
      if (!fullName || !email) {
        return res.status(400).json({ error: 'Full name and email are required' });
      }

      // Check if email already exists
      const { data: existing } = await supabase
        .from('Students')
        .select('StudentID')
        .eq('Email', email)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ error: 'Email already registered as student' });
      }

      // Hash password if provided, otherwise generate a simple random one
      const plainPassword =
        typeof password === 'string' && password.trim().length > 0
          ? password.trim()
          : Math.random().toString(36).slice(-8);
      const passwordHash = await hashPassword(plainPassword);

      const { data: newStudent, error: insertError } = await supabase
        .from('Students')
        .insert({
          OrgID: orgId,
          IdentityNo: identityNo || null,
          FullName: fullName,
          FatherName: fatherName || null,
          Email: email,
          PasswordHash: passwordHash,
          Gender: gender || null,
          DateOfBirth: dateOfBirth || null,
          Address: address || null,
          Phone: phone || null,
          Status: status || 'Active',
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error registering student:', insertError);
        return res
          .status(500)
          .json({ error: 'Failed to register student', details: insertError.message });
      }

      res.status(201).json({
        message: 'Student registered successfully',
        student: newStudent,
        // NOTE: For security reasons we do NOT return the plain password here.
      });
    } catch (error) {
      console.error('Register student error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/org/students/bulk
 * Register multiple students in bulk (OrgAdmin only)
 * Expects body: { students: [{ fullName, email, password?, identityNo, ... }, ...] }
 */
router.post(
  '/bulk',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { students } = req.body || {};

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'No students provided' });
    }

    try {
      const results = {
        created: 0,
        skipped: 0,
        errors: [],
      };

      for (const [index, s] of students.entries()) {
        try {
          const {
            fullName,
            email,
            password,
            identityNo,
            fatherName,
            gender,
            dateOfBirth,
            address,
            phone,
            status = 'Active',
          } = s;

          if (!fullName || !email) {
            results.skipped++;
            results.errors.push({
              index,
              email,
              reason: 'Missing fullName or email',
            });
            continue;
          }

          const { data: existing } = await supabase
            .from('Students')
            .select('StudentID')
            .eq('Email', email)
            .maybeSingle();

          if (existing) {
            results.skipped++;
            results.errors.push({
              index,
              email,
              reason: 'Email already registered',
            });
            continue;
          }

          const plainPassword =
            typeof password === 'string' && password.trim().length > 0
              ? password.trim()
              : Math.random().toString(36).slice(-8);
          const passwordHash = await hashPassword(plainPassword);

          const { error: insertError } = await supabase.from('Students').insert({
            OrgID: orgId,
            IdentityNo: identityNo || null,
            FullName: fullName,
            FatherName: fatherName || null,
            Email: email,
            PasswordHash: passwordHash,
            Gender: gender || null,
            DateOfBirth: dateOfBirth || null,
            Address: address || null,
            Phone: phone || null,
            Status: status || 'Active',
          });

          if (insertError) {
            results.skipped++;
            results.errors.push({
              index,
              email,
              reason: insertError.message,
            });
          } else {
            results.created++;
          }
        } catch (error) {
          results.skipped++;
          results.errors.push({
            index,
            email: s?.email,
            reason: error.message,
          });
        }
      }

      res.json({
        message: 'Bulk registration completed',
        summary: results,
      });
    } catch (error) {
      console.error('Bulk register students error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/org/students
 * Get all students for the organization (OrgAdmin only)
 */
router.get(
  '/',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { page = 1, limit = 20, search = '' } = req.query;

    try {
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      let query = supabase
        .from('Students')
        .select('*', { count: 'exact' })
        .eq('OrgID', orgId);

      if (search) {
        query = query.or(
          `FullName.ilike.%${search}%,Email.ilike.%${search}%,IdentityNo.ilike.%${search}%`
        );
      }

      const { data: students, error, count } = await query
        .order('CreatedAt', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) {
        console.error('Error fetching students:', error);
        return res.status(500).json({ error: 'Failed to fetch students', details: error.message });
      }

      res.json({
        students: students || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
        },
      });
    } catch (error) {
      console.error('List students error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/org/students/:studentId
 * Get single student details (OrgAdmin only)
 */
router.get(
  '/:studentId',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { studentId } = req.params;

    try {
      const { data: student, error } = await supabase
        .from('Students')
        .select('*')
        .eq('OrgID', orgId)
        .eq('StudentID', studentId)
        .single();

      if (error) {
        console.error('Error fetching student:', error);
        return res.status(404).json({ error: 'Student not found' });
      }

      res.json({ student });
    } catch (error) {
      console.error('Get student details error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * PUT /api/org/students/:studentId
 * Update student (OrgAdmin only)
 */
router.put(
  '/:studentId',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { studentId } = req.params;
    const {
      fullName,
      email,
      password,
      identityNo,
      fatherName,
      gender,
      dateOfBirth,
      address,
      phone,
      status,
    } = req.body;

    try {
      const updateData = {};

      if (fullName !== undefined) updateData.FullName = fullName;
      if (email !== undefined) updateData.Email = email;
      if (identityNo !== undefined) updateData.IdentityNo = identityNo;
      if (fatherName !== undefined) updateData.FatherName = fatherName;
      if (gender !== undefined) updateData.Gender = gender;
      if (dateOfBirth !== undefined) updateData.DateOfBirth = dateOfBirth;
      if (address !== undefined) updateData.Address = address;
      if (phone !== undefined) updateData.Phone = phone;
      if (status !== undefined) updateData.Status = status;

      if (password && password.trim().length > 0) {
        updateData.PasswordHash = await hashPassword(password.trim());
      }

      const { data: updated, error } = await supabase
        .from('Students')
        .update(updateData)
        .eq('OrgID', orgId)
        .eq('StudentID', studentId)
        .select()
        .single();

      if (error) {
        console.error('Error updating student:', error);
        return res.status(500).json({ error: 'Failed to update student', details: error.message });
      }

      res.json({
        message: 'Student updated successfully',
        student: updated,
      });
    } catch (error) {
      console.error('Update student error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/org/students/:studentId
 * Delete student (OrgAdmin only)
 */
router.delete(
  '/:studentId',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { studentId } = req.params;

    try {
      const { error } = await supabase
        .from('Students')
        .delete()
        .eq('OrgID', orgId)
        .eq('StudentID', studentId);

      if (error) {
        console.error('Error deleting student:', error);
        return res.status(500).json({ error: 'Failed to delete student', details: error.message });
      }

      res.json({ message: 'Student deleted successfully' });
    } catch (error) {
      console.error('Delete student error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

export default router;
