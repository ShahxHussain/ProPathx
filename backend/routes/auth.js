import express from 'express';
import { supabase } from '../config/database.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../utils/logger.js';
import { validateOrgSignup, validateLogin } from '../middleware/validation.js';
import { authenticate, requireRole, verifyActiveStatus } from '../middleware/auth.js';

const router = express.Router();

/**
 * Helper function to enrich logs with actor names
 */
async function enrichLogsWithActorNames(logs) {
  return Promise.all(
    logs.map(async (log) => {
      let actorName = 'Unknown';
      let actorEmail = null;

      try {
        if (log.ActorType === 'User') {
          const { data: user } = await supabase
            .from('Users')
            .select('FullName, Email')
            .eq('UserID', log.ActorID)
            .single();
          if (user) {
            actorName = user.FullName || 'Unknown User';
            actorEmail = user.Email;
          }
        } else if (log.ActorType === 'OrgUser') {
          const { data: orgUser } = await supabase
            .from('OrgUsers')
            .select('FullName, Email')
            .eq('OrgUserID', log.ActorID)
            .single();
          if (orgUser) {
            actorName = orgUser.FullName || 'Unknown Org User';
            actorEmail = orgUser.Email;
          }
        } else if (log.ActorType === 'Organization') {
          const { data: org } = await supabase
            .from('Organizations')
            .select('OrgName, OrgEmail')
            .eq('OrgID', log.ActorID)
            .single();
          if (org) {
            actorName = org.OrgName || 'Unknown Organization';
            actorEmail = org.OrgEmail;
          }
        } else if (log.ActorType === 'Student') {
          const { data: student } = await supabase
            .from('Students')
            .select('FullName, Email')
            .eq('StudentID', log.ActorID)
            .single();
          if (student) {
            actorName = student.FullName || 'Unknown Student';
            actorEmail = student.Email;
          }
        }
      } catch (err) {
        console.error('Error enriching log:', err);
      }

      return {
        ...log,
        ActorName: actorName,
        ActorEmail: actorEmail,
      };
    })
  );
}

/**
 * POST /api/org/auth/signup
 * Organization self-signup
 */
router.post('/signup', validateOrgSignup, async (req, res) => {
  const { orgName, orgEmail, password, phone, address } = req.body;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if organization email already exists
    const { data: existingOrg } = await supabase
      .from('Organizations')
      .select('OrgID')
      .eq('OrgEmail', orgEmail)
      .single();

    if (existingOrg) {
      return res.status(409).json({ error: 'Organization email already registered' });
    }

    // Check if email already exists as OrgUser
    const { data: existingUser } = await supabase
      .from('OrgUsers')
      .select('OrgUserID')
      .eq('Email', orgEmail)
      .single();

    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Use transaction-like approach with Supabase
    // First, create organization
    const { data: newOrg, error: orgError } = await supabase
      .from('Organizations')
      .insert({
        OrgName: orgName,
        OrgEmail: orgEmail,
        Phone: phone || null,
        Address: address || null,
        Status: 'Active',
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (orgError) {
      return res.status(500).json({ error: 'Failed to create organization', details: orgError.message });
    }

    // Then, create OrgAdmin user (Organization acts as OrgAdmin)
    const { data: newUser, error: userError } = await supabase
      .from('OrgUsers')
      .insert({
        OrgID: newOrg.OrgID,
        FullName: orgName, // Organization name as FullName
        Email: orgEmail, // Organization email as login email
        PasswordHash: passwordHash,
        Role: 'OrgAdmin',
        Phone: phone || null,
        Status: 'Active',
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (userError) {
      // Rollback: delete organization if user creation fails
      await supabase.from('Organizations').delete().eq('OrgID', newOrg.OrgID);
      return res.status(500).json({ error: 'Failed to create admin user', details: userError.message });
    }

    // Create signup log
    await createLog({
      actorType: 'Organization',
      actorID: newOrg.OrgID,
      actionType: 'Signup',
      entityType: 'Organization',
      entityID: newOrg.OrgID,
      description: `Organization ${orgName} signed up`,
      ipAddress,
      userAgent,
      newData: { orgName, orgEmail },
    });

    res.status(201).json({
      message: 'Organization created successfully',
      organization: {
        orgId: newOrg.OrgID,
        orgName: newOrg.OrgName,
        orgEmail: newOrg.OrgEmail,
      },
      admin: {
        userId: newUser.OrgUserID,
        email: newUser.Email,
        role: newUser.Role,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/auth/login
 * Organization/OrgUser login OR Platform User (Reviewer/Subject Expert) login
 * Checks both OrgUsers and Users tables
 */
router.post('/login', validateLogin, async (req, res, next) => {
  const { email, password } = req.body;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if this is a student login request by checking the base URL
    // If the request is to /api/student/auth/login, skip this route and let student route handle it
    const isStudentAuthRequest = req.baseUrl && req.baseUrl.includes('/student/auth');
    
    if (isStudentAuthRequest) {
      // This is a student login request, skip to next route (student login handler)
      // Use next('route') to skip to the next matching route
      return next('route');
    }

    // First, try to find in OrgUsers table (organization users)
    const { data: orgUser, error: orgUserError } = await supabase
      .from('OrgUsers')
      .select('*')
      .eq('Email', email)
      .single();

    if (!orgUserError && orgUser) {
      // Verify password
      const isValidPassword = await verifyPassword(password, orgUser.PasswordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Check user status
      if (orgUser.Status !== 'Active') {
        return res.status(403).json({ error: `Account is ${orgUser.Status.toLowerCase()}` });
      }

      // Fetch organization
      const { data: organization, error: orgError } = await supabase
        .from('Organizations')
        .select('*')
        .eq('OrgID', orgUser.OrgID)
        .single();

      if (orgError || !organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Check organization status
      if (organization.Status !== 'Active') {
        return res.status(403).json({ error: 'Organization is inactive' });
      }

      // Update LastLogin
      await supabase
        .from('OrgUsers')
        .update({ LastLogin: new Date().toISOString() })
        .eq('OrgUserID', orgUser.OrgUserID);

      // Generate JWT token
      const token = generateToken({
        actorType: 'OrgUser',
        orgId: organization.OrgID,
        orgUserId: orgUser.OrgUserID,
        role: orgUser.Role,
      });

      // Create login log
      await createLog({
        actorType: 'OrgUser',
        actorID: orgUser.OrgUserID,
        actionType: 'Login',
        entityType: 'OrgUser',
        entityID: orgUser.OrgUserID,
        description: `User ${orgUser.FullName} logged in`,
        ipAddress,
        userAgent,
      });

      return res.json({
        message: 'Login successful',
        token,
        user: {
          userId: orgUser.OrgUserID,
          fullName: orgUser.FullName,
          email: orgUser.Email,
          role: orgUser.Role,
          orgId: organization.OrgID,
          orgName: organization.OrgName,
          userType: 'Organization',
        },
      });
    }

    // If not found in OrgUsers, check Users table (platform users)
    const { data: platformUser, error: platformUserError } = await supabase
      .from('Users')
      .select('*')
      .eq('Email', email)
      .in('Role', ['Reviewer', 'Subject Expert'])
      .single();

    if (platformUserError || !platformUser) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, platformUser.PasswordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check user status
    if (platformUser.Status !== 'Active') {
      return res.status(403).json({ error: `Account is ${platformUser.Status.toLowerCase()}` });
    }

    // Update LastLogin
    await supabase
      .from('Users')
      .update({ LastLogin: new Date().toISOString() })
      .eq('UserID', platformUser.UserID);

    // Generate JWT token
    const token = generateToken({
      actorType: 'User',
      userId: platformUser.UserID,
      role: platformUser.Role,
    });

    // Create login log
    await createLog({
      actorType: 'User',
      actorID: platformUser.UserID,
      actionType: 'Login',
      entityType: 'User',
      entityID: platformUser.UserID,
      description: `Platform ${platformUser.Role} ${platformUser.FullName} logged in`,
      ipAddress,
      userAgent,
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        userId: platformUser.UserID,
        fullName: platformUser.FullName,
        email: platformUser.Email,
        role: platformUser.Role,
        userType: 'Platform',
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/auth/dashboard/stats
 * Get organization dashboard statistics (OrgAdmin only)
 */
router.get('/dashboard/stats', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  try {
    const { orgId } = req.user;

    // Get total users count in organization
    const { count: totalUsersCount, error: usersError } = await supabase
      .from('OrgUsers')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId)
      .eq('Status', 'Active');

    if (usersError) {
      console.error('Error fetching users:', usersError);
    }

    // Get total tests count for organization
    const { count: totalTestsCount, error: testsError } = await supabase
      .from('Tests')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId)
      .eq('Status', 'Active');

    if (testsError) {
      console.error('Error fetching tests:', testsError);
    }

    // Get active tests count (tests currently running)
    const now = new Date().toISOString();
    const { count: activeTestsCount, error: activeTestsError } = await supabase
      .from('Tests')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId)
      .eq('Status', 'Active')
      .lte('StartDate', now)
      .gte('EndDate', now);

    if (activeTestsError) {
      console.error('Error fetching active tests:', activeTestsError);
    }

    // Get completed tests count (tests with at least one attempt)
    const { data: orgTests, error: orgTestsError } = await supabase
      .from('Tests')
      .select('TestID')
      .eq('OrgID', orgId);

    let completedTestsCount = 0;
    if (orgTests && !orgTestsError && orgTests.length > 0) {
      const testIds = orgTests.map(t => t.TestID || t.testID);
      const { count: completedCount, error: attemptsError } = await supabase
        .from('StudentAttempts')
        .select('*', { count: 'exact', head: true })
        .in('TestID', testIds);
      
      if (!attemptsError) {
        completedTestsCount = completedCount || 0;
      } else {
        console.error('Error fetching completed tests:', attemptsError);
      }
    }

    // Get user growth data (last 30 days) - organization specific
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: userGrowth } = await supabase
      .from('OrgUsers')
      .select('CreatedAt, Role')
      .eq('OrgID', orgId)
      .gte('CreatedAt', thirtyDaysAgo.toISOString());

    const userGrowthByDate = {};
    userGrowth?.forEach((user) => {
      const date = new Date(user.CreatedAt).toISOString().split('T')[0];
      const dateLabel = new Date(user.CreatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      if (!userGrowthByDate[date]) {
        userGrowthByDate[date] = { date: dateLabel, dateKey: date, users: 0 };
      }
      userGrowthByDate[date].users += 1;
    });

    const userGrowthData = Object.values(userGrowthByDate)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map(({ date, users }) => ({ date, users }));

    // Get test creation trend (last 30 days) - organization specific
    const { data: testGrowth } = await supabase
      .from('Tests')
      .select('CreatedAt')
      .eq('OrgID', orgId)
      .gte('CreatedAt', thirtyDaysAgo.toISOString());

    const testGrowthByDate = {};
    testGrowth?.forEach((test) => {
      const date = new Date(test.CreatedAt).toISOString().split('T')[0];
      const dateLabel = new Date(test.CreatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      if (!testGrowthByDate[date]) {
        testGrowthByDate[date] = { date: dateLabel, dateKey: date, tests: 0 };
      }
      testGrowthByDate[date].tests += 1;
    });

    const testGrowthData = Object.values(testGrowthByDate)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map(({ date, tests }) => ({ date, tests }));

    // Get role distribution in organization
    const { data: orgUsersByRole } = await supabase
      .from('OrgUsers')
      .select('Role')
      .eq('OrgID', orgId)
      .eq('Status', 'Active');

    const roleDistribution = {
      'OrgAdmin': 0,
      'Reviewer': 0,
      'Subject Expert': 0,
    };

    orgUsersByRole?.forEach((user) => {
      const role = user.Role || '';
      if (role === 'OrgAdmin') {
        roleDistribution['OrgAdmin'] += 1;
      } else if (role === 'Reviewer') {
        roleDistribution['Reviewer'] += 1;
      } else if (role === 'Subject Expert') {
        roleDistribution['Subject Expert'] += 1;
      }
    });

    // Get test status distribution
    const { data: allOrgTests } = await supabase
      .from('Tests')
      .select('Status, TestID')
      .eq('OrgID', orgId);

    const testStatusData = {
      Active: 0,
      Inactive: 0,
      Completed: 0,
    };

    allOrgTests?.forEach((test) => {
      const status = test.Status || 'Inactive';
      if (status === 'Active') {
        testStatusData.Active += 1;
      } else if (status === 'Inactive') {
        testStatusData.Inactive += 1;
      }
    });

    // Count completed tests (those with attempts)
    if (orgTests && !orgTestsError && orgTests.length > 0) {
      const testIds = orgTests.map(t => t.TestID || t.testID);
      const { data: attempts } = await supabase
        .from('StudentAttempts')
        .select('TestID')
        .in('TestID', testIds);
      
      if (attempts) {
        const completedTestIds = [...new Set(attempts.map(a => a.TestID || a.testID))];
        testStatusData.Completed = completedTestIds.length;
      }
    }

    // Get student attempts trend (last 30 days) - organization specific
    if (orgTests && !orgTestsError && orgTests.length > 0) {
      const testIds = orgTests.map(t => t.TestID || t.testID);
      const { data: recentAttempts } = await supabase
        .from('StudentAttempts')
        .select('StartTime, TestID')
        .in('TestID', testIds)
        .gte('StartTime', thirtyDaysAgo.toISOString());

      const attemptsByDate = {};
      recentAttempts?.forEach((attempt) => {
        const date = new Date(attempt.StartTime).toISOString().split('T')[0];
        const dateLabel = new Date(attempt.StartTime).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        if (!attemptsByDate[date]) {
          attemptsByDate[date] = { date: dateLabel, dateKey: date, attempts: 0 };
        }
        attemptsByDate[date].attempts += 1;
      });

      var attemptsTrendData = Object.values(attemptsByDate)
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .map(({ date, attempts }) => ({ date, attempts }));
    } else {
      var attemptsTrendData = [];
    }

    // Get total students count
    const { count: totalStudentsCount, error: studentsError } = await supabase
      .from('Students')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId)
      .eq('Status', 'Active');

    if (studentsError) {
      console.error('Error fetching students:', studentsError);
    }

    // Get total groups count
    const { count: totalGroupsCount, error: groupsError } = await supabase
      .from('StudentGroups')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId)
      .eq('Status', 'Active');

    if (groupsError) {
      console.error('Error fetching groups:', groupsError);
    }

    // Get questions count for organization
    const { count: totalQuestionsCount, error: questionsError } = await supabase
      .from('Questions')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId);

    if (questionsError) {
      console.error('Error fetching questions:', questionsError);
    }

    // Get pending and approved questions
    const { data: orgQuestions, error: orgQuestionsError } = await supabase
      .from('Questions')
      .select('IsVerified, ReviewerComments')
      .eq('OrgID', orgId);

    let pendingQuestions = 0;
    let approvedQuestions = 0;
    if (orgQuestions && !orgQuestionsError) {
      approvedQuestions = orgQuestions.filter(q => q.IsVerified === true).length;
      pendingQuestions = orgQuestions.filter(q => !q.IsVerified && !q.ReviewerComments).length;
    }

    res.json({
      stats: {
        totalUsers: totalUsersCount || 0,
        totalTests: totalTestsCount || 0,
        activeTests: activeTestsCount || 0,
        completedTests: completedTestsCount,
        totalStudents: totalStudentsCount || 0,
        totalGroups: totalGroupsCount || 0,
        totalQuestions: totalQuestionsCount || 0,
        pendingQuestions: pendingQuestions,
        approvedQuestions: approvedQuestions,
      },
      userGrowthData: userGrowthData || [],
      testGrowthData: testGrowthData || [],
      attemptsTrendData: attemptsTrendData || [],
      roleDistribution: roleDistribution,
      testStatusData: testStatusData,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/auth/exams/explore
 * Get all exams for exploration (OrgAdmin only) - read-only view
 */
router.get('/exams/explore', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  try {
    // Get all exams (not filtered by organization - OrgAdmin can explore all)
    // Exams are now platform-wide (no OrgID)
    let query = supabase
      .from('Exams')
      .select('ExamID, ExamName, Description, Syllabus, NoOfSubjects, CreatedAt');
    
    // Try ordering by CreatedAt, but don't fail if column doesn't exist
    let { data: exams, error } = await query.order('CreatedAt', { ascending: false });

    if (error) {
      console.warn('Ordering by CreatedAt failed, trying without order:', error.message);
      // If ordering fails, try without order
      const result = await supabase
        .from('Exams')
        .select('ExamID, ExamName, Description, Syllabus, NoOfSubjects, CreatedAt');
      
      exams = result.data;
      error = result.error;
      
      if (error) {
        console.error('Error fetching exams:', error);
        return res.status(500).json({ error: 'Failed to fetch exams', details: error.message });
      }
    }
    
    // Exams are platform-wide (no OrgID)
    const examsToProcess = exams || [];

    // Get subject count for each exam
    const examsWithDetails = await Promise.all(
      examsToProcess.map(async (exam) => {
        const { count: subjectCount } = await supabase
          .from('Subjects')
          .select('*', { count: 'exact', head: true })
          .eq('ExamID', exam.ExamID);

        return {
          ...exam,
          OrgName: null, // All exams are platform-wide
          SubjectCount: subjectCount || 0,
        };
      })
    );

    res.json({ exams: examsWithDetails || [] });
  } catch (error) {
    console.error('Explore exams error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/auth/logs
 * Get organization logs with filtering (OrgAdmin only)
 * Query params:
 *   - startDate: ISO date string (optional)
 *   - endDate: ISO date string (optional)
 *   - actorType: Filter by actor type (optional)
 *   - actionType: Filter by action type (optional)
 *   - entityType: Filter by entity type (optional)
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 50, max: 200)
 */
router.get('/logs', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  try {
    const { orgId } = req.user;
    const { startDate, endDate, actorType, actionType, entityType, page = 1, limit = 50 } = req.query;

    if (!orgId) {
      return res.status(403).json({ error: 'Organization ID not found' });
    }

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    // Get all IDs related to this organization
    // 1. Get all OrgUserIDs for this organization
    const { data: orgUsers } = await supabase
      .from('OrgUsers')
      .select('OrgUserID')
      .eq('OrgID', orgId);
    const orgUserIds = (orgUsers || []).map((u) => u.OrgUserID);

    // 2. Get all StudentIDs for this organization
    const { data: students } = await supabase
      .from('Students')
      .select('StudentID')
      .eq('OrgID', orgId);
    const studentIds = (students || []).map((s) => s.StudentID);

    // 3. Get all TestIDs for this organization
    const { data: tests } = await supabase
      .from('Tests')
      .select('TestID')
      .eq('OrgID', orgId);
    const testIds = (tests || []).map((t) => t.TestID);

    // Get question IDs for this organization
    const { data: questions } = await supabase
      .from('Questions')
      .select('QuestionID')
      .eq('OrgID', orgId);
    const questionIds = (questions || []).map((q) => q.QuestionID);

    // Fetch logs and filter in JavaScript (more reliable than complex OR queries)
    // Build base query with date filters
    let query = supabase.from('Logs').select('*', { count: 'exact' });

    // Apply date filters first
    if (startDate) {
      query = query.gte('Timestamp', new Date(startDate).toISOString());
    }
    if (endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setDate(endDateObj.getDate() + 1);
      query = query.lt('Timestamp', endDateObj.toISOString());
    }

    // Apply type filters
    if (actorType) {
      query = query.eq('ActorType', actorType);
    }
    if (actionType) {
      query = query.eq('ActionType', actionType);
    }
    if (entityType) {
      query = query.eq('EntityType', entityType);
    }

    // Order by timestamp
    query = query.order('Timestamp', { ascending: false });

    // Fetch all matching logs (we'll filter and paginate in JavaScript)
    const { data: allLogs, error, count } = await query;

    if (error) {
      console.error('Logs query error:', error);
      return res.status(500).json({ error: 'Failed to fetch logs', details: error.message });
    }

    // Filter logs to only include organization-related ones
    const filteredLogs = (allLogs || []).filter((log) => {
      const isOrgActor =
        (log.ActorType === 'Organization' && log.ActorID === orgId) ||
        (log.ActorType === 'OrgUser' && orgUserIds.includes(log.ActorID)) ||
        (log.ActorType === 'Student' && studentIds.includes(log.ActorID));

      const isOrgEntity =
        (log.EntityType === 'Organization' && log.EntityID === orgId) ||
        (log.EntityType === 'Student' && studentIds.includes(log.EntityID)) ||
        (log.EntityType === 'Test' && testIds.includes(log.EntityID)) ||
        (log.EntityType === 'Question' && questionIds.includes(log.EntityID));

      return isOrgActor || isOrgEntity;
    });

    // Apply pagination
    const paginatedLogs = filteredLogs.slice(offset, offset + limitNum);

    // Enrich logs with actor names
    const enrichedLogs = await enrichLogsWithActorNames(paginatedLogs);

    res.json({
      logs: enrichedLogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum),
      },
    });
  } catch (error) {
    console.error('Get org logs error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/auth/subscription-plans
 * Get all available subscription plans with exam details (OrgAdmin only)
 */
router.get('/subscription-plans', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  try {
    // Get all subscription plans
    const { data: plans, error: plansError } = await supabase
      .from('SubscriptionPlans')
      .select('*')
      .order('PlanName', { ascending: true });

    if (plansError) {
      console.error('Error fetching subscription plans:', plansError);
      return res.status(500).json({ error: 'Failed to fetch subscription plans', details: plansError.message });
    }

    if (!plans || plans.length === 0) {
      return res.json({ plans: [] });
    }

    // For each plan, get linked exams with details
    const plansWithExams = await Promise.all(
      plans.map(async (plan) => {
        // Get linked exams for this plan
        const { data: planExams, error: planExamsError } = await supabase
          .from('SubscriptionPlanExams')
          .select('*')
          .eq('PlanID', plan.PlanID);

        if (planExamsError) {
          console.error(`Error fetching exams for plan ${plan.PlanID}:`, planExamsError);
          return { ...plan, exams: [] };
        }

        if (!planExams || planExams.length === 0) {
          return { ...plan, exams: [] };
        }

        // Get exam details
        const examIds = planExams.map((pe) => pe.ExamID).filter(Boolean);
        const { data: exams, error: examsError } = await supabase
          .from('Exams')
          .select('ExamID, ExamName, Description')
          .in('ExamID', examIds);

        if (examsError) {
          console.error(`Error fetching exam details for plan ${plan.PlanID}:`, examsError);
          return { ...plan, exams: [] };
        }

        const examMap = new Map((exams || []).map((e) => [e.ExamID, e]));

        // Combine plan exam data with exam details
        const examsWithDetails = planExams.map((pe) => {
          const exam = examMap.get(pe.ExamID);
          return {
            ExamID: pe.ExamID,
            ExamName: exam?.ExamName || 'Unknown Exam',
            ExamDescription: exam?.Description || null,
            IsMandatory: pe.IsMandatory || false,
            MaxStudents: pe.MaxStudents,
            MaxTests: pe.MaxTests,
            MaxQuestionsPerTest: pe.MaxQuestionsPerTest,
            MaxTestsPerDay: pe.MaxTestsPerDay,
            AISupport: pe.AISupport || false,
          };
        });

        return {
          ...plan,
          exams: examsWithDetails,
        };
      })
    );

    res.json({ plans: plansWithExams || [] });
  } catch (error) {
    console.error('Get subscription plans error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/auth/subscriptions
 * Create a new subscription for the organization (OrgAdmin only)
 */
router.post('/subscriptions', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { planId, autoRenew = false } = req.body;
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Validate planId
    if (!planId) {
      return res.status(400).json({ error: 'PlanID is required' });
    }

    // Check if plan exists
    const { data: plan, error: planError } = await supabase
      .from('SubscriptionPlans')
      .select('*')
      .eq('PlanID', planId)
      .single();

    if (planError || !plan) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    // Check if organization already has an active subscription
    const { data: existingSubscriptions, error: existingError } = await supabase
      .from('Subscriptions')
      .select('*')
      .eq('EntityType', 'Organization')
      .eq('EntityID', orgId)
      .eq('Status', 'Active');

    if (existingError) {
      console.error('Error checking existing subscriptions:', existingError);
      return res.status(500).json({ error: 'Failed to check existing subscriptions', details: existingError.message });
    }

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (plan.DurationMonths || 1));

    // Create subscription
    const { data: newSubscription, error: subscriptionError } = await supabase
      .from('Subscriptions')
      .insert({
        EntityType: 'Organization',
        EntityID: orgId,
        PlanID: planId,
        StartDate: startDate.toISOString().split('T')[0],
        EndDate: endDate.toISOString().split('T')[0],
        ActivatedAt: new Date().toISOString(),
        AutoRenew: autoRenew || false,
        Status: 'Active',
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (subscriptionError) {
      console.error('Error creating subscription:', subscriptionError);
      return res.status(500).json({ error: 'Failed to create subscription', details: subscriptionError.message });
    }

    // Get exams linked to this plan
    const { data: planExams, error: planExamsError } = await supabase
      .from('SubscriptionPlanExams')
      .select('ExamID')
      .eq('PlanID', planId);

    if (planExamsError) {
      console.error('Error fetching plan exams:', planExamsError);
      // Continue even if this fails - usage counters can be initialized later
    }

    // Initialize UsageCounters for each exam in the plan
    if (planExams && planExams.length > 0) {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
      const usageCounterInserts = planExams.map((pe) => ({
        SubscriptionID: newSubscription.SubscriptionID,
        ExamID: pe.ExamID,
        EntityType: 'Organization',
        EntityID: orgId,
        MonthKey: currentMonth,
        StudentsEnrolled: 0,
        TestsCreated: 0,
        TestsCreatedToday: 0,
        // QuestionsCreated column doesn't exist in database - removed
        AIQuestionsGenerated: 0,
        StudentAttempts: 0,
        LastResetAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      }));

      console.log(`[POST /subscriptions] Initializing ${usageCounterInserts.length} usage counters for subscription ${newSubscription.SubscriptionID}`);
      console.log(`[POST /subscriptions] Usage counter inserts:`, usageCounterInserts);

      const { data: insertedCounters, error: usageError } = await supabase
        .from('UsageCounters')
        .insert(usageCounterInserts)
        .select();

      if (usageError) {
        console.error('[POST /subscriptions] Error initializing usage counters:', usageError);
        console.error('[POST /subscriptions] Error details:', {
          code: usageError.code,
          message: usageError.message,
          details: usageError.details,
          hint: usageError.hint
        });
        // Log but don't fail - counters can be created on-demand
      } else {
        console.log(`[POST /subscriptions] Successfully initialized ${insertedCounters?.length || 0} usage counters`);
      }
    } else {
      console.log(`[POST /subscriptions] No exams linked to plan ${planId}, skipping usage counter initialization`);
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Subscription',
      entityType: 'Subscription',
      entityID: newSubscription.SubscriptionID,
      description: `Organization subscribed to plan: ${plan.PlanName}`,
      ipAddress,
      userAgent,
      newData: { planId, planName: plan.PlanName, autoRenew },
    });

    res.status(201).json({
      message: 'Subscription created successfully',
      subscription: {
        subscriptionId: newSubscription.SubscriptionID,
        planId: newSubscription.PlanID,
        planName: plan.PlanName,
        startDate: newSubscription.StartDate,
        endDate: newSubscription.EndDate,
        status: newSubscription.Status,
        autoRenew: newSubscription.AutoRenew,
      },
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/auth/subscriptions
 * Get all subscriptions for the organization (OrgAdmin only)
 */
router.get('/subscriptions', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { orgId } = req.user;

  try {
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('Subscriptions')
      .select(`
        *,
        SubscriptionPlans (
          PlanID,
          PlanName,
          Price,
          DurationMonths,
          Features
        )
      `)
      .eq('EntityType', 'Organization')
      .eq('EntityID', orgId)
      .order('CreatedAt', { ascending: false });

    if (subscriptionsError) {
      console.error('Error fetching subscriptions:', subscriptionsError);
      return res.status(500).json({ error: 'Failed to fetch subscriptions', details: subscriptionsError.message });
    }

    // Check and update expired subscriptions
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const updatedSubscriptions = (subscriptions || []).map((sub) => {
      if (sub.Status === 'Active' && sub.EndDate) {
        try {
          // Parse end date - handle YYYY-MM-DD format
          const dateStr = String(sub.EndDate).split('T')[0];
          const [year, month, day] = dateStr.split('-').map(Number);
          
          if (year && month && day) {
            const endDateOnly = new Date(year, month - 1, day);
            if (endDateOnly < today) {
              // Update status to Expired (async, don't wait)
              supabase
                .from('Subscriptions')
                .update({ Status: 'Expired' })
                .eq('SubscriptionID', sub.SubscriptionID)
                .then(() => {});
              return { ...sub, Status: 'Expired' };
            }
          }
        } catch (error) {
          console.error('Error checking subscription expiry:', error);
        }
      }
      return sub;
    });

    console.log('📋 Returning subscriptions:', updatedSubscriptions.length);
    res.json({ subscriptions: updatedSubscriptions || [] });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/org/auth/subscriptions/:subscriptionId
 * Cancel/Unsubscribe from a subscription (OrgAdmin only)
 */
router.delete('/subscriptions/:subscriptionId', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { subscriptionId } = req.params;
  const { orgId, userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if subscription exists and belongs to the organization
    const { data: subscription, error: fetchError } = await supabase
      .from('Subscriptions')
      .select(`
        *,
        SubscriptionPlans (
          PlanID,
          PlanName
        )
      `)
      .eq('SubscriptionID', subscriptionId)
      .eq('EntityType', 'Organization')
      .eq('EntityID', orgId)
      .single();

    if (fetchError || !subscription) {
      return res.status(404).json({ error: 'Subscription not found or you do not have permission to cancel it' });
    }

    // Update subscription status to Cancelled
    const { error: updateError } = await supabase
      .from('Subscriptions')
      .update({ 
        Status: 'Cancelled',
        AutoRenew: false // Disable auto-renewal
      })
      .eq('SubscriptionID', subscriptionId);

    if (updateError) {
      console.error('Error cancelling subscription:', updateError);
      return res.status(500).json({ error: 'Failed to cancel subscription', details: updateError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Update',
      entityType: 'Subscription',
      entityID: subscriptionId,
      description: `OrgAdmin cancelled subscription: ${subscription.SubscriptionPlans?.PlanName || subscriptionId}`,
      ipAddress,
      userAgent,
      previousData: subscription,
      newData: { Status: 'Cancelled', AutoRenew: false },
    });

    res.json({ message: 'Subscription cancelled successfully' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/student/auth/login
 * Student login
 * Authenticates students from the "Students" table (separate from OrgUsers/Users tables)
 * Students table fields: StudentID, OrgID, Email (UNIQUE), PasswordHash, Status, etc.
 */
router.post('/login', validateLogin, async (req, res, next) => {
  const { email, password } = req.body;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  // Only handle student logins if this is mounted at /api/student/auth
  const isStudentAuthRequest = req.baseUrl && req.baseUrl.includes('/student/auth');
  if (!isStudentAuthRequest) {
    // This route is mounted at /api/org/auth, skip it (org login will handle it)
    return next('route');
  }

  try {
    console.log('🔵 Student login route hit for email:', email);
    // Normalize email (trim and lowercase for comparison)
    const normalizedEmail = email.trim().toLowerCase();
    
    // Find student by email from the Students table (case-insensitive)
    // Students table is separate from OrgUsers and Users tables
    const { data: students, error: studentError } = await supabase
      .from('Students')
      .select('*')
      .ilike('Email', normalizedEmail);

    if (studentError) {
      console.error('Error fetching student:', studentError);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!students || students.length === 0) {
      console.log('Student not found for email:', normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Find exact match (case-insensitive comparison)
    const student = students.find(s => s.Email?.toLowerCase() === normalizedEmail) || students[0];

    if (!student) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('Student found:', student.Email, 'Status:', student.Status);

    // Verify password
    if (!student.PasswordHash) {
      console.log('Student found but no password hash:', student.StudentID);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Clean password hash (remove any extra whitespace or newlines)
    const cleanHash = String(student.PasswordHash).trim().replace(/\s+/g, '');
    
    // Validate hash format (should start with $2a$, $2b$, or $2y$)
    if (!cleanHash.match(/^\$2[ayb]\$\d{2}\$/)) {
      console.error('Invalid password hash format for student:', student.Email);
      console.error('Hash value:', cleanHash.substring(0, 20) + '...');
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    console.log('Attempting password verification for:', student.Email);
    console.log('Email from request:', email);
    console.log('Email from DB:', student.Email);
    console.log('Password length:', password?.length || 0);
    console.log('Hash length:', cleanHash.length);
    console.log('Hash starts with:', cleanHash.substring(0, 10));
    
    const isValidPassword = await verifyPassword(password, cleanHash);
    
    if (!isValidPassword) {
      console.log('❌ Password verification failed for student:', student.Email);
      console.log('Password provided:', password ? `"${password}" (length: ${password.length})` : 'null/undefined');
      console.log('Hash (first 30 chars):', cleanHash.substring(0, 30));
      
      // Try to verify if password might have whitespace issues
      const trimmedPassword = password?.trim();
      if (trimmedPassword !== password) {
        console.log('⚠️ Password has leading/trailing whitespace, trying trimmed version...');
        const trimmedValid = await verifyPassword(trimmedPassword, cleanHash);
        if (trimmedValid) {
          console.log('✅ Trimmed password matches!');
          // Continue with trimmed password
          // But we'll still return error to be safe - user should fix their input
        }
      }
      
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    console.log('Password verified successfully for:', student.Email);

    // Check student status
    if (student.Status !== 'Active') {
      return res.status(403).json({ error: `Account is ${student.Status?.toLowerCase() || 'inactive'}` });
    }

    // Verify student belongs to an organization
    if (!student.OrgID) {
      return res.status(403).json({ error: 'Student is not associated with an organization' });
    }

    // Fetch organization to verify it's active
    const { data: organization, error: orgError } = await supabase
      .from('Organizations')
      .select('OrgID, OrgName, Status')
      .eq('OrgID', student.OrgID)
      .single();

    if (orgError || !organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    if (organization.Status !== 'Active') {
      return res.status(403).json({ error: 'Organization is inactive' });
    }

    // Update LastLogin
    await supabase
      .from('Students')
      .update({ LastLogin: new Date().toISOString() })
      .eq('StudentID', student.StudentID);

    // Generate JWT token
    const token = generateToken({
      actorType: 'Student',
      studentId: student.StudentID,
      orgId: student.OrgID,
      role: 'Student',
    });

    // Create login log
    await createLog({
      actorType: 'Student',
      actorID: student.StudentID,
      actionType: 'Login',
      entityType: 'Student',
      entityID: student.StudentID,
      description: `Student ${student.FullName} logged in`,
      ipAddress,
      userAgent,
    });

    return res.json({
      message: 'Login successful',
      token,
      user: {
        userId: student.StudentID,
        fullName: student.FullName,
        email: student.Email,
        role: 'Student',
        orgId: student.OrgID,
        orgName: organization.OrgName,
        userType: 'Student',
      },
    });
  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/student/auth/me
 * Get current student info
 */
router.get('/student/me', authenticate, async (req, res) => {
  try {
    const { studentId } = req.user;

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }

    const { data: student, error } = await supabase
      .from('Students')
      .select(`
        *,
        Organizations:OrgID (
          OrgID,
          OrgName,
          Status
        )
      `)
      .eq('StudentID', studentId)
      .single();

    if (error || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Remove sensitive data
    const { PasswordHash, ...studentData } = student;

    res.json({
      user: {
        userId: student.StudentID,
        fullName: student.FullName,
        email: student.Email,
        role: 'Student',
        orgId: student.OrgID,
        orgName: student.Organizations?.[0]?.OrgName || null,
        userType: 'Student',
      },
    });
  } catch (error) {
    console.error('Get student info error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;

