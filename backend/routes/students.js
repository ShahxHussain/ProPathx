import express from 'express';
import { supabase } from '../config/database.js';
import { authenticate, requireRole, verifyActiveStatus } from '../middleware/auth.js';
import { getClientIP, getUserAgent } from '../utils/logger.js';

const router = express.Router();

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

export default router;
