import express from 'express';
import { supabase } from '../../../config/database.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../../middleware/auth.js';

const router = express.Router();

const SELF_TEST_PREFIX = 'Self Practice -';

function classifyTestRow(t) {
  if ((t.TestName || '').startsWith(SELF_TEST_PREFIX)) return 'Self-Test';
  if (t.StartTime) return 'Scheduled';
  return 'Open';
}

/**
 * Derive the effective test status from schedule times + DB status.
 * Scheduled tests: Upcoming → Live → Expired (based on StartTime/EndTime vs now)
 * Open tests: Active / Inactive (from DB)
 * Inactive in DB always wins → "Inactive"
 */
function effectiveTestStatus(t) {
  const dbStatus = (t.Status || 'Active');
  if (dbStatus === 'Inactive') return 'Inactive';

  const now = new Date();
  if (t.StartTime) {
    const start = new Date(t.StartTime);
    const end = t.EndTime ? new Date(t.EndTime) : null;
    if (end && now > end) return 'Expired';
    if (now < start) return 'Upcoming';
    return 'Live';
  }
  return dbStatus;
}

/**
 * Derive effective assignment status considering test expiry.
 * If the test is expired and the student hasn't attempted → "Missed"
 */
function effectiveAssignmentStatus(asgStatus, hasAttempt, hasScore, testExpired) {
  if (hasScore) return 'Completed';
  if (hasAttempt) return 'In Progress';
  if (testExpired && !hasAttempt) return 'Missed';
  return asgStatus || 'Pending';
}

function applyTypeFilter(query, typeFilter) {
  if (typeFilter === 'scheduled') return query.not('StartTime', 'is', null).not('TestName', 'like', `${SELF_TEST_PREFIX}%`);
  if (typeFilter === 'open') return query.is('StartTime', null).not('TestName', 'like', `${SELF_TEST_PREFIX}%`);
  if (typeFilter === 'self-test') return query.like('TestName', `${SELF_TEST_PREFIX}%`);
  return query;
}

/**
 * GET /api/org/tests/analytics/summary
 */
router.get(
  '/analytics/summary',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const typeFilter = (req.query.type || 'all').toLowerCase();

    try {
      let testsQuery = supabase
        .from('Tests')
        .select('TestID, TestName, StartTime, EndTime, TotalQuestions, TotalMarks, Status')
        .eq('OrgID', orgId);
      testsQuery = applyTypeFilter(testsQuery, typeFilter);

      const { data: tests, error: testsErr } = await testsQuery;
      if (testsErr) throw testsErr;

      const testIds = (tests || []).map((t) => t.TestID);
      const totalTests = testIds.length;

      if (totalTests === 0) {
        return res.json({
          totalTests: 0, totalAttempts: 0, avgScore: 0, completionRate: 0, passRate: 0,
          byType: { scheduled: { count: 0, attempts: 0, avgScore: 0 }, open: { count: 0, attempts: 0, avgScore: 0 }, selfTest: { count: 0, attempts: 0, avgScore: 0 } },
        });
      }

      const { data: attempts } = await supabase.from('StudentAttempts').select('AttemptID, TestID, ObtainedMarks').in('TestID', testIds);
      const { data: assignments } = await supabase.from('TestAssignments').select('AssignmentID, TestID').in('TestID', testIds);

      const testMap = {};
      for (const t of tests) testMap[t.TestID] = t;

      let scoreSum = 0, scoredCount = 0, passCount = 0;
      for (const a of attempts || []) {
        const test = testMap[a.TestID];
        if (test && a.ObtainedMarks != null && test.TotalMarks) {
          const pct = (a.ObtainedMarks / test.TotalMarks) * 100;
          scoreSum += pct; scoredCount++;
          if (pct >= 50) passCount++;
        }
      }

      const byType = {
        scheduled: { count: 0, attempts: 0, scoreSum: 0, scored: 0 },
        open: { count: 0, attempts: 0, scoreSum: 0, scored: 0 },
        selfTest: { count: 0, attempts: 0, scoreSum: 0, scored: 0 },
      };
      const typeKeyMap = { 'Scheduled': 'scheduled', 'Open': 'open', 'Self-Test': 'selfTest' };
      for (const t of tests) byType[typeKeyMap[classifyTestRow(t)]].count++;
      for (const a of attempts || []) {
        const test = testMap[a.TestID];
        if (!test) continue;
        const key = typeKeyMap[classifyTestRow(test)];
        byType[key].attempts++;
        if (a.ObtainedMarks != null && test.TotalMarks) {
          byType[key].scoreSum += (a.ObtainedMarks / test.TotalMarks) * 100;
          byType[key].scored++;
        }
      }

      const totalAssignments = (assignments || []).length;
      const totalAttempts = (attempts || []).length;

      let activeCount = 0, expiredCount = 0, upcomingCount = 0;
      for (const t of tests) {
        const es = effectiveTestStatus(t);
        if (es === 'Expired') expiredCount++;
        else if (es === 'Upcoming') upcomingCount++;
        else if (es === 'Live' || es === 'Active') activeCount++;
      }

      res.json({
        totalTests, totalAttempts,
        activeCount, expiredCount, upcomingCount,
        avgScore: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0,
        completionRate: totalAssignments > 0 ? Math.min(Math.round((totalAttempts / totalAssignments) * 100), 100) : 0,
        passRate: scoredCount > 0 ? Math.round((passCount / scoredCount) * 100) : 0,
        byType: {
          scheduled: { count: byType.scheduled.count, attempts: byType.scheduled.attempts, avgScore: byType.scheduled.scored > 0 ? Math.round(byType.scheduled.scoreSum / byType.scheduled.scored) : 0 },
          open: { count: byType.open.count, attempts: byType.open.attempts, avgScore: byType.open.scored > 0 ? Math.round(byType.open.scoreSum / byType.open.scored) : 0 },
          selfTest: { count: byType.selfTest.count, attempts: byType.selfTest.attempts, avgScore: byType.selfTest.scored > 0 ? Math.round(byType.selfTest.scoreSum / byType.selfTest.scored) : 0 },
        },
      });
    } catch (err) {
      console.error('Analytics summary error:', err);
      res.status(500).json({ error: 'Failed to load analytics summary' });
    }
  },
);

/**
 * GET /api/org/tests/analytics/tests
 */
router.get(
  '/analytics/tests',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const typeFilter = (req.query.type || 'all').toLowerCase();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const search = (req.query.search || '').trim();
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 'asc' : 'desc';

    try {
      let query = supabase
        .from('Tests')
        .select(`
          TestID, TestName, DurationMinutes, TotalQuestions, TotalMarks,
          TestDate, StartTime, EndTime, CreatedAt, Status, ScheduleMode,
          QuestionBindingMode, OrgID, ExamID,
          Exams(ExamName)
        `, { count: 'exact' })
        .eq('OrgID', orgId);

      query = applyTypeFilter(query, typeFilter);
      if (search) query = query.ilike('TestName', `%${search}%`);

      const sortMap = { createdAt: 'CreatedAt', testName: 'TestName', duration: 'DurationMinutes', questions: 'TotalQuestions', status: 'Status' };
      query = query.order(sortMap[sortField] || 'CreatedAt', { ascending: sortOrder === 'asc' });
      query = query.range((page - 1) * limit, page * limit - 1);

      const { data: tests, count, error: testsErr } = await query;
      if (testsErr) throw testsErr;

      const testIds = (tests || []).map((t) => t.TestID);
      const attemptsByTest = {};
      const assignmentsByTest = {};

      if (testIds.length > 0) {
        const { data: attempts } = await supabase.from('StudentAttempts').select('AttemptID, TestID, ObtainedMarks').in('TestID', testIds);
        for (const a of attempts || []) {
          if (!attemptsByTest[a.TestID]) attemptsByTest[a.TestID] = [];
          attemptsByTest[a.TestID].push(a);
        }

        const { data: assignments } = await supabase
          .from('TestAssignments')
          .select('AssignmentID, TestID, AssignedBy, StudentID, Students(FullName)')
          .in('TestID', testIds);
        for (const a of assignments || []) {
          if (!assignmentsByTest[a.TestID]) assignmentsByTest[a.TestID] = { count: 0, studentName: null };
          assignmentsByTest[a.TestID].count++;
          if (!a.AssignedBy && a.Students?.FullName) assignmentsByTest[a.TestID].studentName = a.Students.FullName;
        }
      }

      const result = (tests || []).map((t) => {
        const type = classifyTestRow(t);
        const isSelfTest = type === 'Self-Test';
        const att = attemptsByTest[t.TestID] || [];
        const asgInfo = assignmentsByTest[t.TestID] || { count: 0 };
        const totalMarks = t.TotalMarks || 1;
        const scores = att.filter((a) => a.ObtainedMarks != null).map((a) => (a.ObtainedMarks / totalMarks) * 100);

        return {
          testId: t.TestID,
          testName: t.TestName,
          type,
          examName: t.Exams?.ExamName || '—',
          createdBy: isSelfTest ? (asgInfo.studentName || 'Student') : 'OrgAdmin',
          questionCount: t.TotalQuestions || 0,
          duration: t.DurationMinutes || 0,
          totalMarks: t.TotalMarks || 0,
          assignedCount: asgInfo.count,
          attemptCount: att.length,
          avgScore: scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
          highestScore: scores.length > 0 ? Math.round(Math.max(...scores)) : 0,
          lowestScore: scores.length > 0 ? Math.round(Math.min(...scores)) : 0,
          completionRate: asgInfo.count > 0 ? Math.min(Math.round((att.length / asgInfo.count) * 100), 100) : 0,
          status: effectiveTestStatus(t),
          startTime: t.StartTime,
          endTime: t.EndTime,
          bindingMode: t.QuestionBindingMode || 'custom',
          createdAt: t.CreatedAt,
        };
      });

      res.json({ tests: result, pagination: { page, limit, total: count || 0 } });
    } catch (err) {
      console.error('Analytics tests list error:', err);
      res.status(500).json({ error: 'Failed to load analytics tests' });
    }
  },
);

/**
 * GET /api/org/tests/:testId/analytics/detail
 */
router.get(
  '/:testId/analytics/detail',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { testId } = req.params;

    try {
      const { data: test, error: testErr } = await supabase
        .from('Tests')
        .select(`
          TestID, TestName, TotalQuestions, TotalMarks, DurationMinutes, Status,
          QuestionBindingMode, StartTime, EndTime, ExamID, CreatedAt,
          Exams(ExamName)
        `)
        .eq('TestID', testId)
        .eq('OrgID', orgId)
        .single();

      if (testErr || !test) return res.status(404).json({ error: 'Test not found' });

      const type = classifyTestRow(test);
      const isSelfTest = type === 'Self-Test';

      const { data: tqRows } = await supabase
        .from('TestQuestions')
        .select('QuestionID, Questions(TopicID, DifficultyLevel, Topics(TopicName, Subjects(SubjectName)))')
        .eq('TestID', testId);

      const subjectBreakdown = {};
      const difficultyBreakdown = { Easy: 0, Medium: 0, Hard: 0 };
      for (const tq of tqRows || []) {
        const q = tq.Questions;
        if (!q) continue;
        const subName = q.Topics?.Subjects?.SubjectName || 'Unknown';
        subjectBreakdown[subName] = (subjectBreakdown[subName] || 0) + 1;
        const diff = q.DifficultyLevel || 'Medium';
        if (difficultyBreakdown[diff] !== undefined) difficultyBreakdown[diff]++;
      }

      const { data: assignments } = await supabase
        .from('TestAssignments')
        .select(`
          AssignmentID, StudentID, GroupID, AssignmentType, AssignedBy, Status, DueDate, AssignedAt,
          Students(FullName, Email),
          StudentGroups(GroupName)
        `)
        .eq('TestID', testId);

      const { data: attempts } = await supabase
        .from('StudentAttempts')
        .select('AttemptID, StudentID, ObtainedMarks, StartTime, EndTime')
        .eq('TestID', testId);

      const attemptMap = {};
      for (const a of attempts || []) {
        if (!attemptMap[a.StudentID] || (a.ObtainedMarks || 0) > (attemptMap[a.StudentID].ObtainedMarks || 0)) {
          attemptMap[a.StudentID] = a;
        }
      }

      const totalMarks = test.TotalMarks || 1;
      const testStatus = effectiveTestStatus(test);
      const testExpired = testStatus === 'Expired';
      let scoreSum = 0, scoredCount = 0, passCount = 0;
      let creatorName = 'OrgAdmin';

      const students = (assignments || []).map((asg) => {
        if (isSelfTest && !asg.AssignedBy && asg.Students?.FullName) {
          creatorName = asg.Students.FullName;
        }

        const att = attemptMap[asg.StudentID];
        let score = null, timeTaken = null, attemptDate = null, correctAnswers = null;
        const hasAttempt = !!att;
        const hasScore = att?.ObtainedMarks != null;

        if (att) {
          score = hasScore ? Math.round((att.ObtainedMarks / totalMarks) * 100) : null;
          correctAnswers = hasScore ? att.ObtainedMarks : null;
          attemptDate = att.EndTime || att.StartTime;
          if (att.StartTime && att.EndTime) timeTaken = Math.round((new Date(att.EndTime) - new Date(att.StartTime)) / 60000);
          if (score != null) { scoreSum += score; scoredCount++; if (score >= 50) passCount++; }
        }

        const status = effectiveAssignmentStatus(asg.Status, hasAttempt, hasScore, testExpired);

        return {
          studentName: asg.Students?.FullName || '—',
          studentEmail: asg.Students?.Email || '—',
          groupName: asg.StudentGroups?.GroupName || null,
          assignmentType: asg.AssignmentType || 'Individual',
          status, score, correctAnswers,
          totalQuestions: test.TotalQuestions || 0,
          timeTaken, attemptDate,
        };
      });

      const assigned = (assignments || []).length;
      const attempted = Object.keys(attemptMap).length;
      const missed = students.filter((s) => s.status === 'Missed').length;

      res.json({
        test: {
          testId: test.TestID, testName: test.TestName, type,
          examName: test.Exams?.ExamName || '—',
          questionCount: test.TotalQuestions || 0,
          totalMarks: test.TotalMarks || 0,
          duration: test.DurationMinutes || 0,
          status: testStatus,
          bindingMode: test.QuestionBindingMode || 'custom',
          startTime: test.StartTime, endTime: test.EndTime,
          createdAt: test.CreatedAt,
          createdBy: isSelfTest ? creatorName : 'OrgAdmin',
        },
        questionBreakdown: {
          subjects: Object.entries(subjectBreakdown).map(([name, count]) => ({ name, count })),
          difficulty: difficultyBreakdown,
        },
        summary: {
          assigned, attempted, missed,
          pending: Math.max(0, assigned - attempted - missed),
          avgScore: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0,
          passRate: scoredCount > 0 ? Math.round((passCount / scoredCount) * 100) : 0,
        },
        students,
      });
    } catch (err) {
      console.error('Analytics detail error:', err);
      res.status(500).json({ error: 'Failed to load test analytics detail' });
    }
  },
);

/**
 * GET /api/org/tests/analytics/attempts-trend
 */
router.get(
  '/analytics/attempts-trend',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const days = Math.min(90, Math.max(7, parseInt(req.query.days) || 30));
    const typeFilter = (req.query.type || 'all').toLowerCase();

    try {
      let testsQuery = supabase.from('Tests').select('TestID, TestName, StartTime').eq('OrgID', orgId);
      testsQuery = applyTypeFilter(testsQuery, typeFilter);

      const { data: tests } = await testsQuery;
      const testIds = (tests || []).map((t) => t.TestID);
      if (testIds.length === 0) return res.json({ trend: [] });

      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data: attempts } = await supabase
        .from('StudentAttempts')
        .select('AttemptID, TestID, StartTime')
        .in('TestID', testIds)
        .gte('StartTime', since.toISOString());

      const buckets = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
        const key = d.toISOString().slice(0, 10);
        buckets[key] = { date: key, scheduled: 0, open: 0, selfTest: 0, total: 0 };
      }

      const testInfoMap = {};
      for (const t of tests) testInfoMap[t.TestID] = t;

      for (const a of attempts || []) {
        const day = (a.StartTime || '').slice(0, 10);
        if (!buckets[day]) continue;
        buckets[day].total++;
        const t = testInfoMap[a.TestID];
        if (!t) continue;
        const type = classifyTestRow(t);
        if (type === 'Self-Test') buckets[day].selfTest++;
        else if (type === 'Scheduled') buckets[day].scheduled++;
        else buckets[day].open++;
      }

      res.json({ trend: Object.values(buckets) });
    } catch (err) {
      console.error('Attempts trend error:', err);
      res.status(500).json({ error: 'Failed to load attempts trend' });
    }
  },
);

/**
 * GET /api/org/tests/analytics/score-distribution
 */
router.get(
  '/analytics/score-distribution',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const typeFilter = (req.query.type || 'all').toLowerCase();

    try {
      let testsQuery = supabase.from('Tests').select('TestID, TestName, TotalMarks, StartTime').eq('OrgID', orgId);
      testsQuery = applyTypeFilter(testsQuery, typeFilter);

      const { data: tests } = await testsQuery;
      const testIds = (tests || []).map((t) => t.TestID);

      const distribution = [
        { label: '0-20%', min: 0, max: 20, count: 0 },
        { label: '21-40%', min: 21, max: 40, count: 0 },
        { label: '41-60%', min: 41, max: 60, count: 0 },
        { label: '61-80%', min: 61, max: 80, count: 0 },
        { label: '81-100%', min: 81, max: 100, count: 0 },
      ];

      if (testIds.length === 0) return res.json({ distribution });

      const testMarksMap = {};
      for (const t of tests) testMarksMap[t.TestID] = t.TotalMarks || 1;

      const { data: attempts } = await supabase
        .from('StudentAttempts')
        .select('ObtainedMarks, TestID')
        .in('TestID', testIds)
        .not('ObtainedMarks', 'is', null);

      for (const a of attempts || []) {
        const pct = Math.round((a.ObtainedMarks / testMarksMap[a.TestID]) * 100);
        const bucket = distribution.find((d) => pct >= d.min && pct <= d.max);
        if (bucket) bucket.count++;
      }

      res.json({ distribution });
    } catch (err) {
      console.error('Score distribution error:', err);
      res.status(500).json({ error: 'Failed to load score distribution' });
    }
  },
);

export default router;
