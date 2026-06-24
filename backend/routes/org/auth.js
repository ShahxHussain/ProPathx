import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { ensureOrgEnrollmentSettings } from '../../utils/orgEnrollmentSettings.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { validateOrgSignup, validateLogin } from '../../middleware/validation.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../middleware/auth.js';
import { validateSubscriptionForQuestionCreation } from '../../utils/subscription.js';
import {
  filterPlansForOrganizationAudience,
  enrichPlansWithExams,
} from '../../utils/subscriptionPlanCatalog.js';
import { resolveMustChangePassword } from '../../utils/orgMustChangePassword.js';
import { recordOrgUserLastLogin } from '../../utils/lastLogin.js';
import {
  isSupabaseConnectivityError,
  isSupabaseNotFoundError,
  logConnectivityIssue,
  respondDatabaseUnavailable,
} from '../../utils/supabaseErrors.js';
import {
  buildOrgUserLoginPayload,
  getPublicMaintenanceSettings,
  enrichLogsWithActorNames,
} from '../auth/helpers.js';

const router = express.Router();

router.get('/maintenance-public', async (req, res) => {
  try {
    const settings = await getPublicMaintenanceSettings();
    res.json({ settings });
  } catch (error) {
    console.error('Get public maintenance settings error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/auth/announcements/active
 * Public endpoint: returns active announcements for a given role (query param).
 */
router.get('/announcements/active', async (req, res) => {
  try {
    const role = req.query.role || null;
    const now = new Date();

    const { data, error } = await supabase
      .from('Announcements')
      .select('*')
      .eq('IsActive', true)
      .order('CreatedAt', { ascending: false });

    if (error) {
      if (isSupabaseConnectivityError(error)) {
        logConnectivityIssue('announcements/active', error);
        return res.json({ announcements: [] });
      }
      console.error('Supabase error fetching active announcements:', error);
      return res.status(500).json({ error: 'Failed to fetch active announcements', details: error.message });
    }

    const effectiveRole = role || null;

    const filtered = (data || []).filter((a) => {
      // Time window check (in JS to avoid complex OR chaining)
      const startsAtOk = !a.StartsAt || new Date(a.StartsAt) <= now;
      const endsAtOk = !a.EndsAt || new Date(a.EndsAt) >= now;
      if (!startsAtOk || !endsAtOk) return false;

      // Role targeting
      if (!a.TargetRoles || a.TargetRoles.length === 0) {
        return true; // visible to everyone
      }
      if (!effectiveRole) return false;
      return a.TargetRoles.includes(effectiveRole);
    });

    res.json({ announcements: filtered });
  } catch (error) {
    console.error('Get active announcements error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

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
        MustChangePassword: false,
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (userError) {
      // Rollback: delete organization if user creation fails
      await supabase.from('Organizations').delete().eq('OrgID', newOrg.OrgID);
      return res.status(500).json({ error: 'Failed to create admin user', details: userError.message });
    }

    try {
      await ensureOrgEnrollmentSettings(newOrg.OrgID, newUser.OrgUserID);
    } catch (settingsErr) {
      console.error('Failed to init org enrollment settings on signup:', settingsErr);
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

router.post('/first-password', authenticate, async (req, res) => {
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    if (req.user?.actorType !== 'OrgUser' || !req.user.orgUserId) {
      return res.status(403).json({ error: 'Only organization users can use this endpoint' });
    }

    const { newPassword, confirmPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const orgUserId = req.user.orgUserId;

    const { data: orgUser, error: fetchErr } = await supabase
      .from('OrgUsers')
      .select('OrgUserID, OrgID, FullName, Email, Role, Status, PasswordHash, MustChangePassword, LastLogin')
      .eq('OrgUserID', orgUserId)
      .single();

    if (fetchErr) {
      if (isSupabaseConnectivityError(fetchErr)) {
        logConnectivityIssue('first-password (user)', fetchErr);
        return respondDatabaseUnavailable(res, fetchErr);
      }
      return res.status(404).json({ error: 'User not found' });
    }
    if (!orgUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (orgUser.Status !== 'Active') {
      return res.status(403).json({ error: 'User account is inactive' });
    }

    const { data: organization, error: orgError } = await supabase
      .from('Organizations')
      .select('OrgID, OrgName, Status, CreatedBy')
      .eq('OrgID', orgUser.OrgID)
      .single();

    if (orgError) {
      if (isSupabaseConnectivityError(orgError)) {
        logConnectivityIssue('first-password (organization)', orgError);
        return respondDatabaseUnavailable(res, orgError);
      }
      if (isSupabaseNotFoundError(orgError)) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      return res.status(500).json({ error: 'Failed to load organization', details: orgError.message });
    }
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    if (!resolveMustChangePassword(orgUser, organization)) {
      return res.status(400).json({ error: 'Password change is not required for this account' });
    }

    const sameAsTemporary = await verifyPassword(newPassword, orgUser.PasswordHash);
    if (sameAsTemporary) {
      return res.status(400).json({ error: 'Please choose a different password than your temporary one' });
    }

    const passwordHash = await hashPassword(newPassword);
    const { error: updateErr } = await supabase
      .from('OrgUsers')
      .update({
        PasswordHash: passwordHash,
        MustChangePassword: false,
      })
      .eq('OrgUserID', orgUserId);

    if (updateErr) {
      if (isSupabaseConnectivityError(updateErr)) {
        logConnectivityIssue('first-password (update)', updateErr);
        return respondDatabaseUnavailable(res, updateErr);
      }
      return res.status(500).json({ error: 'Failed to update password', details: updateErr.message });
    }

    if (organization.Status !== 'Active') {
      return res.status(403).json({ error: 'Organization is inactive' });
    }

    const { at: now } = await recordOrgUserLastLogin(orgUserId);
    const lastLoginAt = now || new Date().toISOString();

    const updatedUser = { ...orgUser, MustChangePassword: false, LastLogin: lastLoginAt };
    const { token, user } = buildOrgUserLoginPayload(updatedUser, organization);

    await createLog({
      actorType: 'OrgUser',
      actorID: orgUser.OrgUserID,
      actionType: 'Update',
      entityType: 'OrgUser',
      entityID: orgUser.OrgUserID,
      description: `${orgUser.FullName} set password on first login`,
      ipAddress,
      userAgent,
    });

    res.json({
      message: 'Password updated successfully',
      token,
      user,
    });
  } catch (error) {
    console.error('First password error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/auth/login
 * Organization/OrgUser login OR Platform User (Reviewer/Subject Expert) login
 * Checks both OrgUsers and Users tables
 */
router.post('/login', validateLogin, async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // First, try to find in OrgUsers table (organization users)
    const { data: orgUser, error: orgUserError } = await supabase
      .from('OrgUsers')
      .select('*')
      .eq('Email', email)
      .single();

    if (orgUserError && isSupabaseConnectivityError(orgUserError)) {
      logConnectivityIssue('login (user)', orgUserError);
      return respondDatabaseUnavailable(res, orgUserError);
    }

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

      if (orgError) {
        if (isSupabaseConnectivityError(orgError)) {
          logConnectivityIssue('login (organization)', orgError);
          return respondDatabaseUnavailable(res, orgError);
        }
        if (isSupabaseNotFoundError(orgError)) {
          return res.status(404).json({ error: 'Organization not found' });
        }
        return res.status(500).json({ error: 'Failed to load organization', details: orgError.message });
      }
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Check organization status
      if (organization.Status !== 'Active') {
        return res.status(403).json({ error: 'Organization is inactive' });
      }

      const mustChangePassword = resolveMustChangePassword(orgUser, organization);

      // Only record LastLogin after the user has completed onboarding (password set)
      if (!mustChangePassword) {
        await recordOrgUserLastLogin(orgUser.OrgUserID);
      } else if (orgUser.MustChangePassword !== true) {
        // Persist flag when inferred (e.g. column was missing on insert)
        await supabase
          .from('OrgUsers')
          .update({ MustChangePassword: true })
          .eq('OrgUserID', orgUser.OrgUserID);
      }

      const { token, user } = buildOrgUserLoginPayload(
        { ...orgUser, MustChangePassword: mustChangePassword ? true : orgUser.MustChangePassword },
        organization
      );

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
        user,
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

    // Get total tests count for organization (all statuses)
    const { count: totalTestsCount, error: testsError } = await supabase
      .from('Tests')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId);

    if (testsError) {
      console.error('Error fetching tests:', testsError);
    }

    // Enabled tests (Status = Active) — students can be assigned when active
    const { count: activeTestsCount, error: activeTestsError } = await supabase
      .from('Tests')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId)
      .eq('Status', 'Active');

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
 * GET /api/org/auth/exams/subscription
 * Get exams included in the organization's active subscription(s) (OrgAdmin).
 * Optional query: subscriptionId — limit to one availed subscription's plan.
 */
router.get('/exams/subscription', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  try {
    const { orgId } = req.user;
    if (!orgId) {
      return res.status(403).json({ error: 'Organization ID not found' });
    }

    const { subscriptionId: subscriptionIdParam } = req.query;
    let examIds = [];

    if (subscriptionIdParam) {
      const today = new Date().toISOString().split('T')[0];
      const { data: subscription, error: subError } = await supabase
        .from('Subscriptions')
        .select('SubscriptionID, PlanID, Status, EndDate')
        .eq('SubscriptionID', subscriptionIdParam)
        .eq('EntityType', 'Organization')
        .eq('EntityID', orgId)
        .eq('Status', 'Active')
        .gte('EndDate', today)
        .maybeSingle();

      if (subError) {
        return res.status(500).json({ error: 'Failed to fetch subscription', details: subError.message });
      }
      if (!subscription?.PlanID) {
        return res.json({ exams: [] });
      }

      const { data: planExams, error: planExamsError } = await supabase
        .from('SubscriptionPlanExams')
        .select('ExamID')
        .eq('PlanID', subscription.PlanID);

      if (planExamsError) {
        return res.status(500).json({ error: 'Failed to fetch plan exams', details: planExamsError.message });
      }

      examIds = [...new Set((planExams || []).map((pe) => pe.ExamID).filter(Boolean))];
    } else {
      const validation = await validateSubscriptionForQuestionCreation(orgId);
      if (!validation.valid || !validation.availableExamIds || validation.availableExamIds.length === 0) {
        return res.json({ exams: [] });
      }
      examIds = validation.availableExamIds;
    }

    if (!examIds.length) {
      return res.json({ exams: [] });
    }

    const { data: exams, error: examsError } = await supabase
      .from('Exams')
      .select('ExamID, ExamName, Description, Syllabus, NoOfSubjects, CreatedAt')
      .in('ExamID', examIds)
      .order('ExamName', { ascending: true });

    if (examsError) {
      return res.status(500).json({ error: 'Failed to fetch exams', details: examsError.message });
    }
    const list = exams || [];
    const examsWithDetails = await Promise.all(
      list.map(async (exam) => {
        const { count: subjectCount } = await supabase
          .from('Subjects')
          .select('*', { count: 'exact', head: true })
          .eq('ExamID', exam.ExamID);
        return {
          ...exam,
          SubjectCount: subjectCount || 0,
        };
      })
    );
    res.json({ exams: examsWithDetails });
  } catch (error) {
    console.error('Subscription exams error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/auth/exams/:examId
 * Get exam details with subjects and topics (OrgAdmin read-only, for question bank / bulk add)
 */
router.get('/exams/:examId', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  try {
    const { examId } = req.params;
    const { data: exam, error: examError } = await supabase
      .from('Exams')
      .select('ExamID, ExamName, Description, Syllabus')
      .eq('ExamID', examId)
      .single();

    if (examError || !exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const { data: subjects, error: subError } = await supabase
      .from('Subjects')
      .select('SubjectID, SubjectName, Description, ExamID')
      .eq('ExamID', examId);

    if (subError) {
      return res.status(500).json({ error: 'Failed to load subjects', details: subError.message });
    }

    const subjectsWithTopics = await Promise.all(
      (subjects || []).map(async (sub) => {
        const { data: topics } = await supabase
          .from('Topics')
          .select('TopicID, TopicName, Description, SubjectID, ChapterID, Chapters(ChapterID, ChapterNumber, ChapterName)')
          .eq('SubjectID', sub.SubjectID);
        return { ...sub, topics: topics || [] };
      })
    );

    res.json({
      exam: { ...exam, subjects: subjectsWithTopics },
      subjects: subjectsWithTopics,
    });
  } catch (error) {
    console.error('Get exam details error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/auth/questions
 * Get this organization's question bank only (OrgAdmin only)
 * Query: status (all|approved|pending|rejected), page, limit, search, examId, dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD)
 */
router.get('/questions', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  try {
    const { orgId } = req.user;
    if (!orgId) {
      return res.status(403).json({ error: 'Organization ID not found' });
    }
    const { status = 'all', page = 1, limit = 50, search = '', examId, dateFrom, dateTo } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('Questions')
      .select(`
        QuestionID,
        QuestionText,
        DifficultyLevel,
        Explanation,
        QuestionType,
        Source,
        CreatedByOrgUserID,
        CreatedAt,
        IsVerified,
        VerifiedBy,
        VerifiedAt,
        ReviewerComments,
        TopicID,
        Topics(
          TopicID,
          TopicName,
          ChapterID,
          Chapters(ChapterID, ChapterNumber, ChapterName),
          SubjectID,
          Subjects(
            SubjectID,
            SubjectName,
            ExamID,
            Exams(ExamID, ExamName)
          )
        )
      `, { count: 'exact' })
      .eq('OrgID', orgId)
      .order('CreatedAt', { ascending: false });

    if (search && search.trim()) {
      query = query.ilike('QuestionText', `%${search.trim()}%`);
    }
    if (status === 'approved') {
      query = query.eq('IsVerified', true);
    } else if (status === 'rejected') {
      query = query.eq('IsVerified', false).not('ReviewerComments', 'is', null);
    } else if (status === 'pending') {
      query = query.eq('IsVerified', false).is('ReviewerComments', null);
    }

    if (examId && examId.trim()) {
      const { data: subjects } = await supabase.from('Subjects').select('SubjectID').eq('ExamID', examId.trim());
      const subjectIds = (subjects || []).map((s) => s.SubjectID);
      if (subjectIds.length > 0) {
        const { data: topics } = await supabase.from('Topics').select('TopicID').in('SubjectID', subjectIds);
        const topicIds = (topics || []).map((t) => t.TopicID);
        if (topicIds.length > 0) {
          query = query.in('TopicID', topicIds);
        } else {
          query = query.eq('TopicID', '00000000-0000-0000-0000-000000000000');
        }
      } else {
        query = query.eq('TopicID', '00000000-0000-0000-0000-000000000000');
      }
    }

    if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      query = query.gte('CreatedAt', `${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      query = query.lte('CreatedAt', `${dateTo}T23:59:59.999Z`);
    }

    query = query.range(offset, offset + limitNum - 1);
    const { data: questions, error: qError, count } = await query;

    if (qError) {
      return res.status(500).json({ error: 'Failed to fetch questions', details: qError.message });
    }

    const list = questions || [];
    const getQ = (q, key) => q[key] ?? q[key.charAt(0).toLowerCase() + key.slice(1)];
    const createdByOrgUserIds = [...new Set(list.map((q) => getQ(q, 'CreatedByOrgUserID')).filter(Boolean))];
    const verifiedByIds = [...new Set(list.map((q) => getQ(q, 'VerifiedBy')).filter(Boolean))];

    const creatorOrgUsers = new Map();
    if (createdByOrgUserIds.length > 0) {
      const { data: orgUsers } = await supabase
        .from('OrgUsers')
        .select('OrgUserID, FullName, Email')
        .in('OrgUserID', createdByOrgUserIds);
      (orgUsers || []).forEach((u) => creatorOrgUsers.set(String(u.OrgUserID), u));
    }

    const verifierMap = new Map();
    if (verifiedByIds.length > 0) {
      const { data: verifiers } = await supabase
        .from('Users')
        .select('UserID, FullName, Email')
        .in('UserID', verifiedByIds);
      (verifiers || []).forEach((v) => verifierMap.set(String(v.UserID), v));
    }

    const enriched = list.map((q) => {
      const topic = q.Topics;
      const chapter = topic?.Chapters && Array.isArray(topic.Chapters) ? topic.Chapters[0] : topic?.Chapters;
      const subject = topic?.Subjects;
      const exam = subject?.Exams;
      const qCreatedByOrgUserID = getQ(q, 'CreatedByOrgUserID');
      const qVerifiedBy = getQ(q, 'VerifiedBy');
      let createdByOrgUserName = null;
      let createdByOrgUserEmail = null;
      if (qCreatedByOrgUserID && creatorOrgUsers.has(String(qCreatedByOrgUserID))) {
        const ou = creatorOrgUsers.get(String(qCreatedByOrgUserID));
        createdByOrgUserName = ou.FullName;
        createdByOrgUserEmail = ou.Email;
      }
      let statusValue = 'pending';
      if (q.IsVerified === true) statusValue = 'approved';
      else if (q.ReviewerComments) statusValue = 'rejected';
      const verifier = qVerifiedBy && verifierMap.has(String(qVerifiedBy))
        ? verifierMap.get(String(qVerifiedBy))
        : null;

      return {
        questionId: q.QuestionID,
        questionText: q.QuestionText,
        questionTextSnippet: (q.QuestionText || '').substring(0, 120) + ((q.QuestionText || '').length > 120 ? '...' : ''),
        difficultyLevel: q.DifficultyLevel,
        questionType: q.QuestionType,
        source: q.Source,
        examName: exam?.ExamName || '—',
        subjectName: subject?.SubjectName || '—',
        chapterName: chapter?.ChapterName || (chapter?.ChapterNumber ? `Chapter ${chapter.ChapterNumber}` : '—'),
        topicName: topic?.TopicName || '—',
        createdByOrgUserName,
        createdByOrgUserEmail,
        createdAt: q.CreatedAt,
        isVerified: q.IsVerified,
        status: statusValue,
        verifiedBy: verifier ? { fullName: verifier.FullName, email: verifier.Email } : null,
        verifiedAt: q.VerifiedAt,
        reviewerComments: q.ReviewerComments,
        explanation: q.Explanation,
      };
    });

    res.json({
      questions: enriched,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limitNum),
      },
    });
  } catch (error) {
    console.error('Get org questions error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/org/auth/questions/:questionId
 * Delete an organization question (OrgAdmin only). Question must belong to the org and not be used in any test.
 */
router.delete('/questions/:questionId', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  try {
    const { orgId } = req.user;
    const { questionId } = req.params;
    if (!orgId) {
      return res.status(403).json({ error: 'Organization ID not found' });
    }

    const { data: existingQuestion, error: checkError } = await supabase
      .from('Questions')
      .select('QuestionID, OrgID, QuestionText')
      .eq('QuestionID', questionId)
      .single();

    if (checkError || !existingQuestion) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (existingQuestion.OrgID !== orgId) {
      return res.status(403).json({ error: 'You can only delete questions belonging to your organization' });
    }

    const { data: testQuestions, error: testError } = await supabase
      .from('TestQuestions')
      .select('TestID')
      .eq('QuestionID', questionId)
      .limit(1);

    if (testError) {
      return res.status(500).json({ error: 'Failed to check question usage', details: testError.message });
    }
    if (testQuestions && testQuestions.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete question that is used in tests. Remove it from tests first.',
      });
    }

    const { error: deleteError } = await supabase
      .from('Questions')
      .delete()
      .eq('QuestionID', questionId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete question', details: deleteError.message });
    }

    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);
    const actorID = req.user.orgUserId ?? req.user.org_user_id ?? req.user.userId;
    await createLog({
      actorType: 'OrgUser',
      actorID: actorID,
      actionType: 'Delete',
      entityType: 'Question',
      entityID: questionId,
      description: `OrgAdmin deleted question: ${(existingQuestion.QuestionText || '').substring(0, 50)}...`,
      ipAddress,
      userAgent,
      previousData: existingQuestion,
    });

    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Delete org question error:', error);
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
    // Active plans only; Audience: Organization or Both (not Student-only)
    const { data: plans, error: plansError } = await supabase
      .from('SubscriptionPlans')
      .select('*')
      .eq('Status', 'Active')
      .order('PlanName', { ascending: true });

    if (plansError) {
      console.error('Error fetching subscription plans:', plansError);
      return res.status(500).json({ error: 'Failed to fetch subscription plans', details: plansError.message });
    }

    const filtered = filterPlansForOrganizationAudience(plans || []);
    const plansWithExams = await enrichPlansWithExams(supabase, filtered);
    const visible = (plansWithExams || []).filter((p) => p?.testModes?.isScheduledEnabled === true);

    res.json({ plans: visible });
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

    // Check if plan exists and is Active (disabled plans cannot be chosen for new subscriptions)
    const { data: plan, error: planError } = await supabase
      .from('SubscriptionPlans')
      .select('*')
      .eq('PlanID', planId)
      .single();

    if (planError || !plan) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }
    if (plan.Status === 'Inactive') {
      return res.status(400).json({ error: 'This subscription plan is not available for new subscriptions' });
    }

    const planAudience = plan.Audience ?? 'Organization';
    if (planAudience === 'Student') {
      return res.status(400).json({
        error: 'This plan is for individual students only. It cannot be purchased by an organization.',
      });
    }
    if (planAudience !== 'Organization' && planAudience !== 'Both') {
      return res.status(400).json({ error: 'This plan is not available for organizations' });
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

export default router;
