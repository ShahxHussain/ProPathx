import express from 'express';
import { supabase } from '../../../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../../../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../../middleware/auth.js';
import {
  checkMinQuestionsForActivateOrAssign,
  ensureScheduledModeEnabledForTestSubscription,
  getEligibleStudentIdsForTestExam,
  deleteStudentAttemptsForTest,
} from './shared.js';

const router = express.Router();

/**
 * GET /api/org/tests/:testId/eligible-students
 * Eligible students for assignment, scoped by test exam + active enrollment status.
 */
router.get('/:testId/eligible-students', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { testId } = req.params;
  const { orgId } = req.user;
  try {
    const rawSearch = req.query.search != null ? String(req.query.search).trim().slice(0, 120).replace(/%/g, '') : '';
    const limit = Math.min(2000, Math.max(1, parseInt(String(req.query.limit || '1000'), 10) || 1000));
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, TestName, ExamID, OrgID')
      .eq('TestID', testId)
      .eq('OrgID', orgId)
      .single();
    if (testError || !test) return res.status(404).json({ error: 'Test not found' });

    let studentsQ = supabase
      .from('Students')
      .select('StudentID, FullName, Email')
      .eq('OrgID', orgId)
      .eq('Status', 'Active')
      .order('FullName', { ascending: true })
      .limit(limit);
    if (rawSearch) {
      const like = `%${rawSearch}%`;
      studentsQ = studentsQ.or(`FullName.ilike.${like},Email.ilike.${like}`);
    }
    const { data: students, error: stErr } = await studentsQ;
    if (stErr) return res.status(500).json({ error: 'Failed to fetch students', details: stErr.message });

    const studentList = students || [];
    const eligibleIds = await getEligibleStudentIdsForTestExam({
      orgId,
      examId: test.ExamID,
      studentIds: studentList.map((s) => s.StudentID),
    });

    const eligibleStudents = studentList
      .filter((s) => eligibleIds.has(s.StudentID))
      .map((s) => ({
        studentId: s.StudentID,
        fullName: s.FullName ?? null,
        email: s.Email ?? null,
      }));

    res.json({
      test: { testId: test.TestID, testName: test.TestName, examId: test.ExamID },
      students: eligibleStudents,
      totals: {
        activeStudents: studentList.length,
        eligibleStudents: eligibleStudents.length,
      },
    });
  } catch (error) {
    console.error('Eligible students for test assignment error:', error);
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
    const eligibleIds = await getEligibleStudentIdsForTestExam({
      orgId,
      examId: test.ExamID,
      studentIds: [studentId],
    });
    if (!eligibleIds.has(studentId)) {
      return res.status(403).json({
        error: 'Student is not currently eligible for this exam. Approve exam enrollment first.',
        code: 'EXAM_ENROLLMENT_REQUIRED',
      });
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
    const eligibleIds = await getEligibleStudentIdsForTestExam({
      orgId,
      examId: test.ExamID,
      studentIds,
    });
    const ineligibleStudentIds = studentIds.filter((id) => !eligibleIds.has(id));
    if (ineligibleStudentIds.length > 0) {
      return res.status(403).json({
        error: 'Some selected students are not eligible for this exam yet.',
        code: 'EXAM_ENROLLMENT_REQUIRED',
        details: { ineligibleStudentIds },
      });
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
    const eligibleIds = await getEligibleStudentIdsForTestExam({
      orgId,
      examId: test.ExamID,
      studentIds,
    });
    const filteredStudentIds = studentIds.filter((id) => eligibleIds.has(id));
    if (!filteredStudentIds.length) {
      return res.status(403).json({
        error: 'No students in this group are currently eligible for this exam.',
        code: 'EXAM_ENROLLMENT_REQUIRED',
      });
    }

    // Check existing assignments
    const { data: existing, error: existingError } = await supabase
      .from('TestAssignments')
      .select('StudentID')
      .eq('TestID', testId)
      .in('StudentID', filteredStudentIds);

    if (existingError) {
      console.error('Error checking existing assignments:', existingError);
      return res.status(500).json({ error: 'Failed to check existing assignments', details: existingError.message });
    }

    const existingStudentIds = new Set((existing || []).map(a => a.StudentID));
    const newStudentIds = filteredStudentIds.filter(id => !existingStudentIds.has(id));

    if (replaceExisting && existingStudentIds.size > 0) {
      const { error: delError } = await supabase
        .from('TestAssignments')
        .delete()
        .eq('TestID', testId)
        .in('StudentID', filteredStudentIds);

      if (delError) {
        console.error('Error deleting existing assignments:', delError);
        return res.status(500).json({ error: 'Failed to replace assignments', details: delError.message });
      }

      const { error: clearAttemptsError } = await deleteStudentAttemptsForTest(supabase, testId, filteredStudentIds);
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
          totalStudentsInGroup: filteredStudentIds.length,
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
    const insertStudentIds = replaceExisting ? filteredStudentIds : newStudentIds;
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
    const eligibleIds = await getEligibleStudentIdsForTestExam({
      orgId,
      examId: test.ExamID,
      studentIds,
    });
    const eligibleStudentIds = studentIds.filter((id) => eligibleIds.has(id));
    if (!eligibleStudentIds.length) {
      return res.status(403).json({
        error: 'No students in the selected groups are currently eligible for this exam.',
        code: 'EXAM_ENROLLMENT_REQUIRED',
      });
    }

    // Check existing assignments
    const { data: existing, error: existingError } = await supabase
      .from('TestAssignments')
      .select('StudentID')
      .eq('TestID', testId)
      .in('StudentID', eligibleStudentIds);

    if (existingError) {
      console.error('Error checking existing assignments:', existingError);
      return res.status(500).json({ error: 'Failed to check existing assignments', details: existingError.message });
    }

    const existingStudentIds = new Set((existing || []).map(a => a.StudentID));
    const newStudentIds = eligibleStudentIds.filter(id => !existingStudentIds.has(id));

    if (replaceExisting && existingStudentIds.size > 0) {
      const { error: delError } = await supabase
        .from('TestAssignments')
        .delete()
        .eq('TestID', testId)
        .in('StudentID', eligibleStudentIds);

      if (delError) {
        console.error('Error deleting existing assignments:', delError);
        return res.status(500).json({ error: 'Failed to replace assignments', details: delError.message });
      }

      const { error: clearAttemptsError } = await deleteStudentAttemptsForTest(supabase, testId, eligibleStudentIds);
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
          totalUniqueStudentsInGroups: eligibleStudentIds.length,
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
    const insertStudentIds = replaceExisting ? eligibleStudentIds : newStudentIds;
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
      .select('TestID, TestName, OrgID, ExamID')
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
    const eligibleIds = await getEligibleStudentIdsForTestExam({
      orgId,
      examId: test.ExamID,
      studentIds,
    });
    const eligibleStudentIds = studentIds.filter((id) => eligibleIds.has(id));
    if (!eligibleStudentIds.length) {
      return res.status(403).json({
        error: 'No active students are currently eligible for this exam.',
        code: 'EXAM_ENROLLMENT_REQUIRED',
      });
    }

    // Check existing assignments
    const { data: existing, error: existingError } = await supabase
      .from('TestAssignments')
      .select('StudentID')
      .eq('TestID', testId)
      .in('StudentID', eligibleStudentIds);

    if (existingError) {
      console.error('Error checking existing assignments:', existingError);
      return res.status(500).json({ error: 'Failed to check existing assignments', details: existingError.message });
    }

    const existingStudentIds = new Set((existing || []).map(a => a.StudentID));
    const newStudentIds = eligibleStudentIds.filter(id => !existingStudentIds.has(id));

    if (replaceExisting && existingStudentIds.size > 0) {
      const { error: delError } = await supabase
        .from('TestAssignments')
        .delete()
        .eq('TestID', testId)
        .in('StudentID', eligibleStudentIds);

      if (delError) {
        console.error('Error deleting existing assignments:', delError);
        return res.status(500).json({ error: 'Failed to replace assignments', details: delError.message });
      }

      const { error: clearAttemptsError } = await deleteStudentAttemptsForTest(supabase, testId, eligibleStudentIds);
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
    const insertStudentIds = replaceExisting ? eligibleStudentIds : newStudentIds;
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

export default router;
