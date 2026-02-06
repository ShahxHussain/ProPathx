import express from 'express';
import { supabase } from '../config/database.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../utils/logger.js';
import { validateLogin, validateCreatePlatformUser, validateUpdatePlatformUser, validateUpdateOrganization, validateCreateOrganization } from '../middleware/validation.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/admin/test
 * Test route to verify admin routes are registered (development only)
 */
if (process.env.NODE_ENV === 'development') {
  router.get('/test', (req, res) => {
    res.json({ message: 'Admin routes are working!', timestamp: new Date().toISOString() });
  });
}

/**
 * POST /api/admin/login
 * Super Admin login
 */
router.post('/login', validateLogin, async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Find SuperAdmin in Users table
    const { data: superAdmin, error: userError } = await supabase
      .from('Users')
      .select('*')
      .eq('Email', email)
      .eq('Role', 'SuperAdmin')
      .single();

    if (userError || !superAdmin) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, superAdmin.PasswordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check user status
    if (superAdmin.Status !== 'Active') {
      return res.status(403).json({ error: `Account is ${superAdmin.Status.toLowerCase()}` });
    }

    // Update LastLogin
    await supabase
      .from('Users')
      .update({ LastLogin: new Date().toISOString() })
      .eq('UserID', superAdmin.UserID);

    // Generate JWT token
    const token = generateToken({
      actorType: 'User',
      userId: superAdmin.UserID,
      role: 'SuperAdmin',
    });

    // Create login log
    await createLog({
      actorType: 'User',
      actorID: superAdmin.UserID,
      actionType: 'Login',
      entityType: 'User',
      entityID: superAdmin.UserID,
      description: `Super Admin ${superAdmin.FullName} logged in`,
      ipAddress,
      userAgent,
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        userId: superAdmin.UserID,
        fullName: superAdmin.FullName,
        email: superAdmin.Email,
        role: superAdmin.Role,
      },
    });
  } catch (error) {
    console.error('Super Admin login error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/admin/dashboard/stats
 * Get high-level dashboard statistics (SuperAdmin only)
 */
router.get('/dashboard/stats', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    // Get active organizations count
    const { count: activeOrgsCount } = await supabase
      .from('Organizations')
      .select('*', { count: 'exact', head: true })
      .eq('Status', 'Active');

    // Get total organizations count
    const { count: totalOrgsCount } = await supabase
      .from('Organizations')
      .select('*', { count: 'exact', head: true });

    // Get total revenue from Payments table
    const { data: payments } = await supabase
      .from('Payments')
      .select('Amount, PaymentStatus')
      .eq('PaymentStatus', 'Completed');

    const totalRevenue = payments?.reduce((sum, payment) => {
      const amount = payment.Amount || payment.amount || 0;
      return sum + parseFloat(amount);
    }, 0) || 0;

    // Get total users count (platform-level + org users)
    const { count: platformUsersCount } = await supabase
      .from('Users')
      .select('*', { count: 'exact', head: true })
      .eq('Status', 'Active');

    const { count: orgUsersCount } = await supabase
      .from('OrgUsers')
      .select('*', { count: 'exact', head: true })
      .eq('Status', 'Active');

    const totalUsersCount = (platformUsersCount || 0) + (orgUsersCount || 0);

    // Get total students count
    const { count: totalStudentsCount } = await supabase
      .from('Students')
      .select('*', { count: 'exact', head: true })
      .eq('Status', 'Active');

    // Get total tests count
    const { count: totalTestsCount } = await supabase
      .from('Tests')
      .select('*', { count: 'exact', head: true })
      .eq('Status', 'Active');

    // Get revenue data for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentPayments } = await supabase
      .from('Payments')
      .select('Amount, PaymentDate, PaymentStatus')
      .eq('PaymentStatus', 'Completed')
      .gte('PaymentDate', sevenDaysAgo.toISOString())
      .order('PaymentDate', { ascending: true });

    const revenueByDate = {};
    recentPayments?.forEach((payment) => {
      const paymentDate = payment.PaymentDate || payment.paymentDate;
      const amount = payment.Amount || payment.amount || 0;

      if (paymentDate) {
        const date = new Date(paymentDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        if (!revenueByDate[date]) {
          revenueByDate[date] = 0;
        }
        revenueByDate[date] += parseFloat(amount);
      }
    });

    const revenueData = Object.entries(revenueByDate).map(([date, revenue]) => ({
      date,
      revenue: Math.round(revenue),
    }));

    if (revenueData.length === 0) {
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        revenueData.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue: 0,
        });
      }
    }

    // Get recent alerts from Logs table
    const { data: recentLogs } = await supabase
      .from('Logs')
      .select('*')
      .order('Timestamp', { ascending: false })
      .limit(10);

    const alerts = recentLogs?.map((log) => {
      const actionType = log.ActionType || log.actionType || '';
      const entityType = log.EntityType || log.entityType || '';
      const description = log.Description || log.description || '';
      const logID = log.LogID || log.logID || log.id;
      const timestamp = log.Timestamp || log.timestamp;

      let type = 'info';
      if (actionType === 'Delete' || actionType.includes('Error')) {
        type = 'error';
      } else if (actionType === 'Update' || actionType.includes('Warning')) {
        type = 'warning';
      } else if (actionType === 'Create' || actionType === 'Login') {
        type = 'success';
      }

      return {
        id: logID,
        type,
        message: description || `${actionType} on ${entityType}`,
        timestamp: timestamp,
      };
    }) || [];

    // Get user growth data (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: platformUsersGrowth } = await supabase
      .from('Users')
      .select('CreatedAt')
      .gte('CreatedAt', thirtyDaysAgo.toISOString());

    const { data: orgUsersGrowth } = await supabase
      .from('OrgUsers')
      .select('CreatedAt')
      .gte('CreatedAt', thirtyDaysAgo.toISOString());

    const userGrowthByDate = {};
    [...(platformUsersGrowth || []), ...(orgUsersGrowth || [])].forEach((user) => {
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

    // Get organization status distribution
    const { data: orgsByStatus } = await supabase
      .from('Organizations')
      .select('Status');

    const orgStatusData = {
      Active: 0,
      Inactive: 0,
      Suspended: 0,
    };
    orgsByStatus?.forEach((org) => {
      const status = org.Status || 'Inactive';
      if (orgStatusData.hasOwnProperty(status)) {
        orgStatusData[status] += 1;
      }
    });

    // Get user role distribution
    // Get all platform users (including Super Admins)
    const { data: platformUsersByRole } = await supabase
      .from('Users')
      .select('Role')
      .eq('Status', 'Active');

    const { data: orgUsersByRole } = await supabase
      .from('OrgUsers')
      .select('Role')
      .eq('Status', 'Active');

    // Get students count
    const { count: studentsCount } = await supabase
      .from('Students')
      .select('*', { count: 'exact', head: true })
      .eq('Status', 'Active');

    const roleDistribution = {
      'Super Admin': 0,
      'Reviewer': 0,
      'Subject Expert': 0,
      'OrgAdmin': 0,
      'Student': 0,
    };

    // Count platform users by role (including Super Admin)
    platformUsersByRole?.forEach((user) => {
      const role = user.Role || '';
      if (role === 'Super Admin' || role === 'SuperAdmin') {
        roleDistribution['Super Admin'] += 1;
      } else if (role === 'Reviewer') {
        roleDistribution['Reviewer'] += 1;
      } else if (role === 'Subject Expert') {
        roleDistribution['Subject Expert'] += 1;
      }
    });

    // Count organization users by role
    orgUsersByRole?.forEach((user) => {
      const role = user.Role || '';
      if (role === 'OrgAdmin') {
        roleDistribution['OrgAdmin'] += 1;
      } else if (role === 'Subject Expert') {
        roleDistribution['Subject Expert'] += 1;
      } else if (role === 'Reviewer') {
        roleDistribution['Reviewer'] += 1;
      }
    });

    // Add students count
    roleDistribution['Student'] = studentsCount || 0;

    // Get questions statistics
    const { data: questionsStats } = await supabase
      .from('Questions')
      .select('IsVerified, ReviewerComments, CreatedAt');

    const questionsList = questionsStats || [];
    const totalQuestions = questionsList.length;
    const approvedQuestions = questionsList.filter((q) => q.IsVerified).length;
    const pendingQuestions = questionsList.filter((q) => !q.IsVerified && !q.ReviewerComments).length;
    const rejectedQuestions = questionsList.filter((q) => q.ReviewerComments && !q.IsVerified).length;

    // Get questions created trend (last 30 days)
    const { data: questionsGrowth } = await supabase
      .from('Questions')
      .select('CreatedAt')
      .gte('CreatedAt', thirtyDaysAgo.toISOString());

    const questionsGrowthByDate = {};
    questionsGrowth?.forEach((q) => {
      const date = new Date(q.CreatedAt).toISOString().split('T')[0];
      const dateLabel = new Date(q.CreatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      if (!questionsGrowthByDate[date]) {
        questionsGrowthByDate[date] = { date: dateLabel, dateKey: date, questions: 0 };
      }
      questionsGrowthByDate[date].questions += 1;
    });

    const questionsTrendData = Object.values(questionsGrowthByDate)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map(({ date, questions }) => ({ date, questions }));

    // Get top organizations by user count
    const { data: orgsWithUsers } = await supabase
      .from('Organizations')
      .select('OrgID, OrgName');

    const orgUserCounts = [];
    for (const org of orgsWithUsers || []) {
      const { count } = await supabase
        .from('OrgUsers')
        .select('*', { count: 'exact', head: true })
        .eq('OrgID', org.OrgID)
        .eq('Status', 'Active');

      orgUserCounts.push({
        name: org.OrgName,
        users: count || 0,
      });
    }

    const topOrgs = orgUserCounts
      .sort((a, b) => b.users - a.users)
      .slice(0, 5);

    res.json({
      stats: {
        activeOrgs: activeOrgsCount || 0,
        totalOrgs: totalOrgsCount || 0,
        totalRevenue: totalRevenue,
        totalUsers: totalUsersCount || 0,
        totalStudents: totalStudentsCount || 0,
        totalTests: totalTestsCount || 0,
        totalQuestions: totalQuestions,
        approvedQuestions: approvedQuestions,
        pendingQuestions: pendingQuestions,
        rejectedQuestions: rejectedQuestions,
      },
      revenueData,
      userGrowthData,
      questionsTrendData,
      orgStatusData: Object.entries(orgStatusData).map(([name, value]) => ({ name, value })),
      roleDistribution: Object.entries(roleDistribution).map(([name, value]) => ({ name, value })),
      questionsStatusData: [
        { name: 'Approved', value: approvedQuestions },
        { name: 'Pending', value: pendingQuestions },
        { name: 'Rejected', value: rejectedQuestions },
      ],
      topOrganizations: topOrgs,
      alerts,
      systemHealth: {
        cpu: 35,
        latency: 120,
        status: 'healthy',
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/admin/organizations
 * List all organizations with details (SuperAdmin only)
 */
router.get('/organizations', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { data: organizations, error } = await supabase
      .from('Organizations')
      .select('OrgID, OrgName, OrgEmail, Address, Phone, Status, CreatedAt, CreatedBy')
      .order('CreatedAt', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch organizations', details: error.message });
    }

    res.json({ organizations: organizations || [] });
  } catch (error) {
    console.error('List organizations error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/organizations/create
 * Create a new organization with OrgAdmin user (SuperAdmin only)
 */
router.post(
  '/organizations/create',
  authenticate,
  requireSuperAdmin,
  validateCreateOrganization,
  async (req, res) => {
    const { orgName, orgEmail, phone, address, adminFullName, adminPassword, adminRole, status } = req.body;
    const { userId: actorId } = req.user; // SuperAdmin's UserID
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Use orgEmail for both organization and admin email (OrgAdmin == Organization)
      const adminEmail = orgEmail;

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
        .eq('Email', adminEmail)
        .single();

      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered as an organization user' });
      }

      // Check if email exists in Users table
      const { data: existingPlatformUser } = await supabase
        .from('Users')
        .select('UserID')
        .eq('Email', adminEmail)
        .single();

      if (existingPlatformUser) {
        return res.status(409).json({ error: 'Email already registered as a platform user' });
      }

      // Hash password
      const passwordHash = await hashPassword(adminPassword);

      // Create organization
      const { data: newOrg, error: orgError } = await supabase
        .from('Organizations')
        .insert({
          OrgName: orgName,
          OrgEmail: orgEmail,
          Phone: phone || null,
          Address: address || null,
          Status: status || 'Active',
          CreatedBy: actorId, // SuperAdmin who created it
          CreatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (orgError) {
        return res.status(500).json({ error: 'Failed to create organization', details: orgError.message });
      }

      // Create OrgAdmin user (using orgEmail as the email)
      const { data: newUser, error: userError } = await supabase
        .from('OrgUsers')
        .insert({
          OrgID: newOrg.OrgID,
          FullName: adminFullName,
          Email: adminEmail, // Same as orgEmail
          PasswordHash: passwordHash,
          Role: adminRole || 'OrgAdmin',
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

      // Create log
      await createLog({
        actorType: 'User',
        actorID: actorId,
        actionType: 'Create',
        entityType: 'Organization',
        entityID: newOrg.OrgID,
        description: `Super Admin created organization: ${orgName} with admin: ${adminFullName}`,
        ipAddress,
        userAgent,
        newData: { orgName, orgEmail, adminFullName, adminRole },
      });

      res.status(201).json({
        message: 'Organization created successfully',
        organization: {
          orgId: newOrg.OrgID,
          orgName: newOrg.OrgName,
          orgEmail: newOrg.OrgEmail,
          status: newOrg.Status,
        },
        admin: {
          userId: newUser.OrgUserID,
          fullName: newUser.FullName,
          email: newUser.Email,
          role: newUser.Role,
          status: newUser.Status,
        },
      });
    } catch (error) {
      console.error('Create organization error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/admin/users/create
 * Create a platform-level user (Reviewer or Subject Expert) - SuperAdmin only
 * NOTE: This route must come before GET /users to ensure proper route matching
 */
router.post(
  '/users/create',
  authenticate,
  requireSuperAdmin,
  validateCreatePlatformUser,
  async (req, res) => {
    console.log('POST /api/admin/users/create - Route hit!');
    const { fullName, email, password, phone, role } = req.body;
    const { userId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if email already exists in Users table
      const { data: existingUser } = await supabase
        .from('Users')
        .select('UserID')
        .eq('Email', email)
        .single();

      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered as a platform user' });
      }

      // Check if email exists in OrgUsers table (to prevent conflicts)
      const { data: existingOrgUser } = await supabase
        .from('OrgUsers')
        .select('OrgUserID')
        .eq('Email', email)
        .single();

      if (existingOrgUser) {
        return res.status(409).json({
          error: 'Email already registered as an organization user. Platform users must have unique emails.',
        });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create new platform user
      const { data: newUser, error: userError } = await supabase
        .from('Users')
        .insert({
          FullName: fullName,
          Email: email,
          PasswordHash: passwordHash,
          Role: role,
          Phone: phone || null,
          Status: 'Active',
          CreatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (userError) {
        return res.status(500).json({ error: 'Failed to create platform user', details: userError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: userId,
        actionType: 'Create',
        entityType: 'User',
        entityID: newUser.UserID,
        description: `Super Admin created platform ${role} user: ${fullName}`,
        ipAddress,
        userAgent,
        newData: { fullName, email, role, userType: 'Platform' },
      });

      res.status(201).json({
        message: 'Platform user created successfully',
        user: {
          userId: newUser.UserID,
          fullName: newUser.FullName,
          email: newUser.Email,
          role: newUser.Role,
          status: newUser.Status,
          userType: 'Platform',
        },
      });
    } catch (error) {
      console.error('Create platform user error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/admin/users
 * List all platform users and organization users with details (SuperAdmin only)
 */
router.get('/users', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    // Platform-level users (Users table)
    const { data: platformUsers, error: platformError } = await supabase
      .from('Users')
      .select('UserID, FullName, Email, Role, Phone, Status, CreatedAt, LastLogin')
      .order('CreatedAt', { ascending: false });

    if (platformError) {
      return res.status(500).json({ error: 'Failed to fetch platform users', details: platformError.message });
    }

    // Organization users with their organization info
    const { data: orgUsers, error: orgUsersError } = await supabase
      .from('OrgUsers')
      .select('OrgUserID, OrgID, FullName, Email, Role, Phone, Status, CreatedAt, LastLogin')
      .order('CreatedAt', { ascending: false });

    if (orgUsersError) {
      return res.status(500).json({ error: 'Failed to fetch organization users', details: orgUsersError.message });
    }

    // Fetch organizations to map OrgID -> OrgName
    const { data: orgs, error: orgsError } = await supabase
      .from('Organizations')
      .select('OrgID, OrgName');

    if (orgsError) {
      return res.status(500).json({ error: 'Failed to fetch organizations', details: orgsError.message });
    }

    const orgMap = new Map(orgs.map((o) => [o.OrgID, o.OrgName]));

    const orgUsersWithOrg = orgUsers.map((u) => ({
      ...u,
      OrgName: orgMap.get(u.OrgID) || null,
    }));

    res.json({
      platformUsers: platformUsers || [],
      orgUsers: orgUsersWithOrg,
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/users/:userId
 * Update a platform-level user (SuperAdmin only)
 */
router.put(
  '/users/:userId',
  authenticate,
  requireSuperAdmin,
  validateUpdatePlatformUser,
  async (req, res) => {
    const { userId } = req.params;
    const { fullName, email, password, phone, role, status } = req.body;
    const { userId: actorId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if user exists
      const { data: existingUser, error: fetchError } = await supabase
        .from('Users')
        .select('*')
        .eq('UserID', userId)
        .single();

      if (fetchError || !existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Prevent editing SuperAdmin role (safety check)
      if (existingUser.Role === 'SuperAdmin' && role && role !== 'SuperAdmin') {
        return res.status(403).json({ error: 'Cannot change SuperAdmin role' });
      }

      // If email is being changed, check for conflicts
      if (email && email !== existingUser.Email) {
        const { data: emailConflict } = await supabase
          .from('Users')
          .select('UserID')
          .eq('Email', email)
          .neq('UserID', userId)
          .single();

        if (emailConflict) {
          return res.status(409).json({ error: 'Email already in use by another platform user' });
        }

        // Check OrgUsers table too
        const { data: orgEmailConflict } = await supabase
          .from('OrgUsers')
          .select('OrgUserID')
          .eq('Email', email)
          .single();

        if (orgEmailConflict) {
          return res.status(409).json({ error: 'Email already in use by an organization user' });
        }
      }

      // Build update object
      const updateData = {};
      if (fullName) updateData.FullName = fullName;
      if (email) updateData.Email = email;
      if (phone !== undefined) updateData.Phone = phone || null;
      if (role) updateData.Role = role;
      if (status) updateData.Status = status;
      if (password) {
        updateData.PasswordHash = await hashPassword(password);
      }

      // Update user
      const { data: updatedUser, error: updateError } = await supabase
        .from('Users')
        .update(updateData)
        .eq('UserID', userId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update user', details: updateError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: actorId,
        actionType: 'Update',
        entityType: 'User',
        entityID: userId,
        description: `Super Admin updated platform user: ${updatedUser.FullName}`,
        ipAddress,
        userAgent,
        oldData: existingUser,
        newData: updateData,
      });

      res.json({
        message: 'User updated successfully',
        user: {
          userId: updatedUser.UserID,
          fullName: updatedUser.FullName,
          email: updatedUser.Email,
          role: updatedUser.Role,
          status: updatedUser.Status,
          phone: updatedUser.Phone,
        },
      });
    } catch (error) {
      console.error('Update platform user error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/admin/users/:userId
 * Delete a platform-level user (SuperAdmin only)
 */
router.delete('/users/:userId', authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  const { userId: actorId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('Users')
      .select('*')
      .eq('UserID', userId)
      .single();

    if (fetchError || !existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting SuperAdmin
    if (existingUser.Role === 'SuperAdmin') {
      return res.status(403).json({ error: 'Cannot delete SuperAdmin user' });
    }

    // Prevent deleting yourself
    if (parseInt(userId) === actorId) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }

    // Delete user
    const { error: deleteError } = await supabase.from('Users').delete().eq('UserID', userId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete user', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: actorId,
      actionType: 'Delete',
      entityType: 'User',
      entityID: userId,
      description: `Super Admin deleted platform user: ${existingUser.FullName}`,
      ipAddress,
      userAgent,
      oldData: existingUser,
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete platform user error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/users/org/:orgUserId
 * Update an organization user (SuperAdmin only)
 */
router.put(
  '/users/org/:orgUserId',
  authenticate,
  requireSuperAdmin,
  validateUpdatePlatformUser, // Reuse same validation
  async (req, res) => {
    const { orgUserId } = req.params;
    const { fullName, email, password, phone, role, status } = req.body;
    const { userId: actorId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if user exists
      const { data: existingUser, error: fetchError } = await supabase
        .from('OrgUsers')
        .select('*')
        .eq('OrgUserID', orgUserId)
        .single();

      if (fetchError || !existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If email is being changed, check for conflicts
      if (email && email !== existingUser.Email) {
        const { data: emailConflict } = await supabase
          .from('OrgUsers')
          .select('OrgUserID')
          .eq('Email', email)
          .neq('OrgUserID', orgUserId)
          .single();

        if (emailConflict) {
          return res.status(409).json({ error: 'Email already in use by another organization user' });
        }

        // Check Users table too
        const { data: platformEmailConflict } = await supabase
          .from('Users')
          .select('UserID')
          .eq('Email', email)
          .single();

        if (platformEmailConflict) {
          return res.status(409).json({ error: 'Email already in use by a platform user' });
        }
      }

      // Build update object
      const updateData = {};
      if (fullName) updateData.FullName = fullName;
      if (email) updateData.Email = email;
      if (phone !== undefined) updateData.Phone = phone || null;
      if (role) updateData.Role = role;
      if (status) updateData.Status = status;
      if (password) {
        updateData.PasswordHash = await hashPassword(password);
      }

      // Update user
      const { data: updatedUser, error: updateError } = await supabase
        .from('OrgUsers')
        .update(updateData)
        .eq('OrgUserID', orgUserId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update user', details: updateError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: actorId,
        actionType: 'Update',
        entityType: 'OrgUser',
        entityID: orgUserId,
        description: `Super Admin updated organization user: ${updatedUser.FullName}`,
        ipAddress,
        userAgent,
        oldData: existingUser,
        newData: updateData,
      });

      res.json({
        message: 'User updated successfully',
        user: {
          userId: updatedUser.OrgUserID,
          fullName: updatedUser.FullName,
          email: updatedUser.Email,
          role: updatedUser.Role,
          status: updatedUser.Status,
          phone: updatedUser.Phone,
        },
      });
    } catch (error) {
      console.error('Update organization user error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/admin/users/org/:orgUserId
 * Delete an organization user (SuperAdmin only)
 */
router.delete('/users/org/:orgUserId', authenticate, requireSuperAdmin, async (req, res) => {
  const { orgUserId } = req.params;
  const { userId: actorId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('OrgUsers')
      .select('*')
      .eq('OrgUserID', orgUserId)
      .single();

    if (fetchError || !existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user
    const { error: deleteError } = await supabase.from('OrgUsers').delete().eq('OrgUserID', orgUserId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete user', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: actorId,
      actionType: 'Delete',
      entityType: 'OrgUser',
      entityID: orgUserId,
      description: `Super Admin deleted organization user: ${existingUser.FullName}`,
      ipAddress,
      userAgent,
      oldData: existingUser,
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete organization user error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/organizations/:orgId
 * Update an organization (SuperAdmin only)
 */
router.put(
  '/organizations/:orgId',
  authenticate,
  requireSuperAdmin,
  validateUpdateOrganization,
  async (req, res) => {
    const { orgId } = req.params;
    const { orgName, orgEmail, phone, address, status } = req.body;
    const { userId: actorId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if organization exists
      const { data: existingOrg, error: fetchError } = await supabase
        .from('Organizations')
        .select('*')
        .eq('OrgID', orgId)
        .single();

      if (fetchError || !existingOrg) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // If email is being changed, check for conflicts
      if (orgEmail && orgEmail !== existingOrg.OrgEmail) {
        const { data: emailConflict } = await supabase
          .from('Organizations')
          .select('OrgID')
          .eq('OrgEmail', orgEmail)
          .neq('OrgID', orgId)
          .single();

        if (emailConflict) {
          return res.status(409).json({ error: 'Email already in use by another organization' });
        }
      }

      // Build update object
      const updateData = {};
      if (orgName) updateData.OrgName = orgName;
      if (orgEmail) updateData.OrgEmail = orgEmail;
      if (phone !== undefined) updateData.Phone = phone || null;
      if (address !== undefined) updateData.Address = address || null;
      if (status) updateData.Status = status;

      // Update organization
      const { data: updatedOrg, error: updateError } = await supabase
        .from('Organizations')
        .update(updateData)
        .eq('OrgID', orgId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update organization', details: updateError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: actorId,
        actionType: 'Update',
        entityType: 'Organization',
        entityID: orgId,
        description: `Super Admin updated organization: ${updatedOrg.OrgName}`,
        ipAddress,
        userAgent,
        oldData: existingOrg,
        newData: updateData,
      });

      res.json({
        message: 'Organization updated successfully',
        organization: {
          orgId: updatedOrg.OrgID,
          orgName: updatedOrg.OrgName,
          orgEmail: updatedOrg.OrgEmail,
          phone: updatedOrg.Phone,
          address: updatedOrg.Address,
          status: updatedOrg.Status,
        },
      });
    } catch (error) {
      console.error('Update organization error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/admin/organizations/:orgId
 * Delete an organization (SuperAdmin only)
 */
router.delete('/organizations/:orgId', authenticate, requireSuperAdmin, async (req, res) => {
  const { orgId } = req.params;
  const { userId: actorId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if organization exists
    const { data: existingOrg, error: fetchError } = await supabase
      .from('Organizations')
      .select('*')
      .eq('OrgID', orgId)
      .single();

    if (fetchError || !existingOrg) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if organization has users
    const { count: userCount } = await supabase
      .from('OrgUsers')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId);

    if (userCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete organization with existing users',
        details: `This organization has ${userCount} user(s). Please delete or transfer users first.`,
      });
    }

    // Delete organization
    const { error: deleteError } = await supabase.from('Organizations').delete().eq('OrgID', orgId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete organization', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: actorId,
      actionType: 'Delete',
      entityType: 'Organization',
      entityID: orgId,
      description: `Super Admin deleted organization: ${existingOrg.OrgName}`,
      ipAddress,
      userAgent,
      oldData: existingOrg,
    });

    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * ============================================
 * EXAM MANAGEMENT ROUTES (SuperAdmin only)
 * ============================================
 */

/**
 * GET /api/admin/exams
 * Get all exams across all organizations (SuperAdmin only)
 */
router.get('/exams', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    // Try ordering by CreatedAt, but handle if column doesn't exist
    let { data: exams, error } = await supabase
      .from('Exams')
      .select('*')
      .order('CreatedAt', { ascending: false });

    // If ordering fails, try without order
    if (error) {
      console.warn('Ordering by CreatedAt failed, trying without order:', error.message);
      const result = await supabase.from('Exams').select('*');
      exams = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Error fetching exams:', error);
      return res.status(500).json({ error: 'Failed to fetch exams', details: error.message });
    }

    // Exams are now platform-wide (no OrgID)
    const examsWithOrg = (exams || []).map((exam) => ({
      ...exam,
      OrgName: null, // All exams are platform-wide
    }));

    res.json({ exams: examsWithOrg });
  } catch (error) {
    console.error('Get exams error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/exams
 * Create a new exam (SuperAdmin only)
 */
router.post('/exams', authenticate, requireSuperAdmin, async (req, res) => {
  const { examName, description, syllabus, noOfSubjects } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Validation
    if (!examName || !examName.trim()) {
      return res.status(400).json({ error: 'Exam name is required' });
    }

    if (noOfSubjects && (noOfSubjects < 1 || noOfSubjects > 50)) {
      return res.status(400).json({ error: 'Number of subjects must be between 1 and 50' });
    }

    // Create exam (OrgID removed - exams are now platform-wide)
    const { data: newExam, error: examError } = await supabase
      .from('Exams')
      .insert({
        ExamName: examName.trim(),
        Description: description || null,
        Syllabus: syllabus || null,
        NoOfSubjects: noOfSubjects || null,
        CreatedBy: userId, // SuperAdmin UserID
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (examError) {
      console.error('Supabase error creating exam:', examError);
      return res.status(500).json({ 
        error: 'Failed to create exam', 
        details: examError.message,
        code: examError.code,
        hint: examError.hint 
      });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Create',
      entityType: 'Exam',
      entityID: newExam.ExamID,
      description: `Super Admin created exam: ${examName}`,
      ipAddress,
      userAgent,
      newData: { examName, description, noOfSubjects },
    });

    res.status(201).json({
      message: 'Exam created successfully',
      exam: newExam,
    });
  } catch (error) {
    console.error('Create exam error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/admin/exams/:examId
 * Get exam details with subjects and topics (SuperAdmin only)
 */
router.get('/exams/:examId', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId } = req.params;

  try {
    // Get exam
    const { data: exam, error: examError } = await supabase
      .from('Exams')
      .select('*')
      .eq('ExamID', examId)
      .single();

    if (examError || !exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Exams are now platform-wide (no OrgID)
    exam.OrgName = null;

    // Get subjects for this exam
    const { data: subjects, error: subjectsError } = await supabase
      .from('Subjects')
      .select('*')
      .eq('ExamID', examId)
      .order('CreatedAt', { ascending: true });

    if (subjectsError) {
      return res.status(500).json({ error: 'Failed to fetch subjects', details: subjectsError.message });
    }

    // Get topics for each subject
    const subjectsWithTopics = await Promise.all(
      (subjects || []).map(async (subject) => {
        const { data: topics, error: topicsError } = await supabase
          .from('Topics')
          .select('*')
          .eq('SubjectID', subject.SubjectID)
          .order('CreatedAt', { ascending: true });

        return {
          ...subject,
          topics: topics || [],
        };
      })
    );

    res.json({
      exam,
      subjects: subjectsWithTopics,
    });
  } catch (error) {
    console.error('Get exam details error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/exams/:examId
 * Update exam (SuperAdmin only)
 */
router.put('/exams/:examId', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId } = req.params;
  const { examName, description, syllabus, noOfSubjects } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if exam exists
    const { data: existingExam, error: fetchError } = await supabase
      .from('Exams')
      .select('*')
      .eq('ExamID', examId)
      .single();

    if (fetchError || !existingExam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Build update object (OrgID removed - exams are now platform-wide)
    const updateData = {};
    if (examName) updateData.ExamName = examName.trim();
    if (description !== undefined) updateData.Description = description || null;
    if (syllabus !== undefined) updateData.Syllabus = syllabus || null;
    if (noOfSubjects !== undefined) updateData.NoOfSubjects = noOfSubjects || null;

    // Update exam
    const { data: updatedExam, error: updateError } = await supabase
      .from('Exams')
      .update(updateData)
      .eq('ExamID', examId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update exam', details: updateError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Update',
      entityType: 'Exam',
      entityID: examId,
      description: `Super Admin updated exam: ${updatedExam.ExamName}`,
      ipAddress,
      userAgent,
      oldData: existingExam,
      newData: updateData,
    });

    res.json({
      message: 'Exam updated successfully',
      exam: updatedExam,
    });
  } catch (error) {
    console.error('Update exam error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/admin/exams/:examId
 * Delete exam (SuperAdmin only)
 */
router.delete('/exams/:examId', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId } = req.params;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if exam exists
    const { data: existingExam, error: fetchError } = await supabase
      .from('Exams')
      .select('*')
      .eq('ExamID', examId)
      .single();

    if (fetchError || !existingExam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Delete exam (cascade will handle subjects and topics)
    const { error: deleteError } = await supabase.from('Exams').delete().eq('ExamID', examId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete exam', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Delete',
      entityType: 'Exam',
      entityID: examId,
      description: `Super Admin deleted exam: ${existingExam.ExamName}`,
      ipAddress,
      userAgent,
      oldData: existingExam,
    });

    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Delete exam error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/exams/:examId/subjects
 * Create a subject for an exam (SuperAdmin only)
 */
router.post('/exams/:examId/subjects', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId } = req.params;
  const { subjectName, description, weightage } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Verify exam exists
    const { data: exam } = await supabase.from('Exams').select('ExamID').eq('ExamID', examId).single();
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Validation
    if (!subjectName || !subjectName.trim()) {
      return res.status(400).json({ error: 'Subject name is required' });
    }

    // Create subject
    const { data: newSubject, error: subjectError } = await supabase
      .from('Subjects')
      .insert({
        ExamID: examId,
        SubjectName: subjectName.trim(),
        Description: description || null,
        Weightage: weightage || null,
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (subjectError) {
      return res.status(500).json({ error: 'Failed to create subject', details: subjectError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Create',
      entityType: 'Subject',
      entityID: newSubject.SubjectID,
      description: `Super Admin created subject: ${subjectName} for exam`,
      ipAddress,
      userAgent,
      newData: { subjectName, description, weightage },
    });

    res.status(201).json({
      message: 'Subject created successfully',
      subject: newSubject,
    });
  } catch (error) {
    console.error('Create subject error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/exams/:examId/subjects/:subjectId
 * Update a subject (SuperAdmin only)
 */
router.put('/exams/:examId/subjects/:subjectId', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId, subjectId } = req.params;
  const { subjectName, description, weightage } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Verify subject exists and belongs to exam
    const { data: existingSubject, error: fetchError } = await supabase
      .from('Subjects')
      .select('*')
      .eq('SubjectID', subjectId)
      .eq('ExamID', examId)
      .single();

    if (fetchError || !existingSubject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Build update object
    const updateData = {};
    if (subjectName) updateData.SubjectName = subjectName.trim();
    if (description !== undefined) updateData.Description = description || null;
    if (weightage !== undefined) updateData.Weightage = weightage || null;

    // Update subject
    const { data: updatedSubject, error: updateError } = await supabase
      .from('Subjects')
      .update(updateData)
      .eq('SubjectID', subjectId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update subject', details: updateError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Update',
      entityType: 'Subject',
      entityID: subjectId,
      description: `Super Admin updated subject: ${updatedSubject.SubjectName}`,
      ipAddress,
      userAgent,
      oldData: existingSubject,
      newData: updateData,
    });

    res.json({
      message: 'Subject updated successfully',
      subject: updatedSubject,
    });
  } catch (error) {
    console.error('Update subject error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/admin/exams/:examId/subjects/:subjectId
 * Delete a subject (SuperAdmin only)
 */
router.delete('/exams/:examId/subjects/:subjectId', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId, subjectId } = req.params;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Verify subject exists
    const { data: existingSubject, error: fetchError } = await supabase
      .from('Subjects')
      .select('*')
      .eq('SubjectID', subjectId)
      .eq('ExamID', examId)
      .single();

    if (fetchError || !existingSubject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Delete subject (cascade will handle topics)
    const { error: deleteError } = await supabase.from('Subjects').delete().eq('SubjectID', subjectId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete subject', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Delete',
      entityType: 'Subject',
      entityID: subjectId,
      description: `Super Admin deleted subject: ${existingSubject.SubjectName}`,
      ipAddress,
      userAgent,
      oldData: existingSubject,
    });

    res.json({ message: 'Subject deleted successfully' });
  } catch (error) {
    console.error('Delete subject error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/exams/:examId/subjects/:subjectId/topics
 * Create a topic for a subject (SuperAdmin only)
 */
router.post('/exams/:examId/subjects/:subjectId/topics', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId, subjectId } = req.params;
  const { topicName, description } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Verify subject exists and belongs to exam
    const { data: subject } = await supabase
      .from('Subjects')
      .select('SubjectID')
      .eq('SubjectID', subjectId)
      .eq('ExamID', examId)
      .single();

    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Validation
    if (!topicName || !topicName.trim()) {
      return res.status(400).json({ error: 'Topic name is required' });
    }

    // Create topic
    const { data: newTopic, error: topicError } = await supabase
      .from('Topics')
      .insert({
        SubjectID: subjectId,
        TopicName: topicName.trim(),
        Description: description || null,
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (topicError) {
      return res.status(500).json({ error: 'Failed to create topic', details: topicError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Create',
      entityType: 'Topic',
      entityID: newTopic.TopicID,
      description: `Super Admin created topic: ${topicName}`,
      ipAddress,
      userAgent,
      newData: { topicName, description },
    });

    res.status(201).json({
      message: 'Topic created successfully',
      topic: newTopic,
    });
  } catch (error) {
    console.error('Create topic error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/exams/:examId/subjects/:subjectId/topics/:topicId
 * Update a topic (SuperAdmin only)
 */
router.put(
  '/exams/:examId/subjects/:subjectId/topics/:topicId',
  authenticate,
  requireSuperAdmin,
  async (req, res) => {
    const { examId, subjectId, topicId } = req.params;
    const { topicName, description } = req.body;
    const { userId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Verify topic exists and belongs to subject
      const { data: existingTopic, error: fetchError } = await supabase
        .from('Topics')
        .select('*, Subjects!inner(ExamID)')
        .eq('TopicID', topicId)
        .eq('SubjectID', subjectId)
        .single();

      if (fetchError || !existingTopic) {
        return res.status(404).json({ error: 'Topic not found' });
      }

      // Build update object
      const updateData = {};
      if (topicName) updateData.TopicName = topicName.trim();
      if (description !== undefined) updateData.Description = description || null;

      // Update topic
      const { data: updatedTopic, error: updateError } = await supabase
        .from('Topics')
        .update(updateData)
        .eq('TopicID', topicId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update topic', details: updateError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: userId,
        actionType: 'Update',
        entityType: 'Topic',
        entityID: topicId,
        description: `Super Admin updated topic: ${updatedTopic.TopicName}`,
        ipAddress,
        userAgent,
        oldData: existingTopic,
        newData: updateData,
      });

      res.json({
        message: 'Topic updated successfully',
        topic: updatedTopic,
      });
    } catch (error) {
      console.error('Update topic error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/admin/exams/:examId/subjects/:subjectId/topics/:topicId
 * Delete a topic (SuperAdmin only)
 */
router.delete(
  '/exams/:examId/subjects/:subjectId/topics/:topicId',
  authenticate,
  requireSuperAdmin,
  async (req, res) => {
    const { examId, subjectId, topicId } = req.params;
    const { userId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Verify topic exists
      const { data: existingTopic, error: fetchError } = await supabase
        .from('Topics')
        .select('*')
        .eq('TopicID', topicId)
        .eq('SubjectID', subjectId)
        .single();

      if (fetchError || !existingTopic) {
        return res.status(404).json({ error: 'Topic not found' });
      }

      // Delete topic
      const { error: deleteError } = await supabase.from('Topics').delete().eq('TopicID', topicId);

      if (deleteError) {
        return res.status(500).json({ error: 'Failed to delete topic', details: deleteError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: userId,
        actionType: 'Delete',
        entityType: 'Topic',
        entityID: topicId,
        description: `Super Admin deleted topic: ${existingTopic.TopicName}`,
        ipAddress,
        userAgent,
        oldData: existingTopic,
      });

      res.json({ message: 'Topic deleted successfully' });
    } catch (error) {
      console.error('Delete topic error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * ============================================
 * SUBSCRIPTION PLANS MANAGEMENT
 * ============================================
 */

/**
 * GET /api/admin/subscription-plans
 * Get all subscription plans (SuperAdmin only)
 */
router.get('/subscription-plans', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    // Query without ordering first to check if table exists
    let query = supabase.from('SubscriptionPlans').select('*');
    
    // Try to order by CreatedAt, fallback to PlanName if CreatedAt doesn't exist
    const { data: plans, error } = await query.order('PlanName', { ascending: true });

    if (error) {
      console.error('Supabase error fetching subscription plans:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch subscription plans', 
        details: error.message,
        code: error.code,
        hint: error.hint 
      });
    }

    res.json({ plans: plans || [] });
  } catch (error) {
    console.error('Get subscription plans error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/admin/subscription-plans/:planId
 * Get subscription plan details with linked exams (SuperAdmin only)
 */
router.get('/subscription-plans/:planId', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { planId } = req.params;

    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from('SubscriptionPlans')
      .select('*')
      .eq('PlanID', planId)
      .single();

    if (planError || !plan) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    // Get linked exams - fetch separately since Exams table no longer has OrgID
    const { data: planExams, error: planExamsError } = await supabase
      .from('SubscriptionPlanExams')
      .select('*')
      .eq('PlanID', planId);

    if (planExamsError) {
      return res.status(500).json({ error: 'Failed to fetch plan exams', details: planExamsError.message });
    }

    if (!planExams || planExams.length === 0) {
      return res.json({ plan, exams: [] });
    }

    // Get ExamIDs and fetch exam details
    const examIds = planExams.map((pe) => pe.ExamID).filter(Boolean);
    const { data: exams, error: examsError } = await supabase
      .from('Exams')
      .select('ExamID, ExamName, Description')
      .in('ExamID', examIds);

    if (examsError) {
      return res.status(500).json({ error: 'Failed to fetch exam details', details: examsError.message });
    }

    const examMap = new Map((exams || []).map((e) => [e.ExamID, e]));

    const examsWithDetails = (planExams || []).map((pe) => {
      const exam = examMap.get(pe.ExamID);
      return {
        ...pe,
        ExamName: exam?.ExamName || 'Unknown Exam',
        ExamDescription: exam?.Description || null,
        OrgName: null, // Exams are platform-wide, no organization
      };
    });

    res.json({
      plan,
      exams: examsWithDetails,
    });
  } catch (error) {
    console.error('Get subscription plan error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/subscription-plans
 * Create a new subscription plan (SuperAdmin only)
 */
router.post('/subscription-plans', authenticate, requireSuperAdmin, async (req, res) => {
  const { planName, price, durationMonths, features } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Validation
    if (!planName || !planName.trim()) {
      return res.status(400).json({ error: 'Plan name is required' });
    }

    if (price === undefined || price === null || price < 0) {
      return res.status(400).json({ error: 'Valid price is required' });
    }

    if (!durationMonths || durationMonths < 1) {
      return res.status(400).json({ error: 'Duration must be at least 1 month' });
    }

    // Create subscription plan
    const { data: newPlan, error: planError } = await supabase
      .from('SubscriptionPlans')
      .insert({
        PlanName: planName.trim(),
        Price: parseFloat(price),
        DurationMonths: parseInt(durationMonths),
        Features: features || {},
      })
      .select()
      .single();

    if (planError) {
      return res.status(500).json({ error: 'Failed to create subscription plan', details: planError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Create',
      entityType: 'Subscription',
      entityID: newPlan.PlanID,
      description: `Super Admin created subscription plan: ${planName}`,
      ipAddress,
      userAgent,
      newData: { planName, price, durationMonths, features },
    });

    res.status(201).json({
      message: 'Subscription plan created successfully',
      plan: newPlan,
    });
  } catch (error) {
    console.error('Create subscription plan error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/subscription-plans/:planId
 * Update a subscription plan (SuperAdmin only)
 */
router.put('/subscription-plans/:planId', authenticate, requireSuperAdmin, async (req, res) => {
  const { planId } = req.params;
  const { planName, price, durationMonths, features } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if plan exists
    const { data: existingPlan, error: fetchError } = await supabase
      .from('SubscriptionPlans')
      .select('*')
      .eq('PlanID', planId)
      .single();

    if (fetchError || !existingPlan) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    // Build update object
    const updateData = {};
    if (planName !== undefined) updateData.PlanName = planName.trim();
    if (price !== undefined) updateData.Price = parseFloat(price);
    if (durationMonths !== undefined) updateData.DurationMonths = parseInt(durationMonths);
    if (features !== undefined) updateData.Features = features;

    // Update plan
    const { data: updatedPlan, error: updateError } = await supabase
      .from('SubscriptionPlans')
      .update(updateData)
      .eq('PlanID', planId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update subscription plan', details: updateError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Update',
      entityType: 'Subscription',
      entityID: planId,
      description: `Super Admin updated subscription plan: ${updatedPlan.PlanName}`,
      ipAddress,
      userAgent,
      previousData: existingPlan,
      newData: updateData,
    });

    res.json({
      message: 'Subscription plan updated successfully',
      plan: updatedPlan,
    });
  } catch (error) {
    console.error('Update subscription plan error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/admin/subscription-plans/:planId
 * Delete a subscription plan (SuperAdmin only)
 */
router.delete('/subscription-plans/:planId', authenticate, requireSuperAdmin, async (req, res) => {
  const { planId } = req.params;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if plan exists
    const { data: existingPlan, error: fetchError } = await supabase
      .from('SubscriptionPlans')
      .select('*')
      .eq('PlanID', planId)
      .single();

    if (fetchError || !existingPlan) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    // Check if plan has active subscriptions
    const { data: activeSubscriptions } = await supabase
      .from('Subscriptions')
      .select('SubscriptionID')
      .eq('PlanID', planId)
      .eq('Status', 'Active')
      .limit(1);

    if (activeSubscriptions && activeSubscriptions.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete subscription plan with active subscriptions',
      });
    }

    // Delete plan (SubscriptionPlanExams will be deleted via CASCADE)
    const { error: deleteError } = await supabase.from('SubscriptionPlans').delete().eq('PlanID', planId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete subscription plan', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Delete',
      entityType: 'Subscription',
      entityID: planId,
      description: `Super Admin deleted subscription plan: ${existingPlan.PlanName}`,
      ipAddress,
      userAgent,
      previousData: existingPlan,
    });

    res.json({ message: 'Subscription plan deleted successfully' });
  } catch (error) {
    console.error('Delete subscription plan error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * ============================================
 * SUBSCRIPTION PLAN EXAMS MANAGEMENT
 * ============================================
 */

/**
 * GET /api/admin/subscription-plans/:planId/exams
 * Get all exams linked to a subscription plan (SuperAdmin only)
 */
router.get('/subscription-plans/:planId/exams', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { planId } = req.params;
    console.log(`Fetching exams for plan: ${planId}`);

    // First get all SubscriptionPlanExams for this plan
    const { data: planExams, error: planExamsError } = await supabase
      .from('SubscriptionPlanExams')
      .select('*')
      .eq('PlanID', planId);

    if (planExamsError) {
      console.error('Error fetching SubscriptionPlanExams:', planExamsError);
      return res.status(500).json({ error: 'Failed to fetch plan exams', details: planExamsError.message });
    }

    console.log(`Found ${planExams?.length || 0} SubscriptionPlanExams records`);

    if (!planExams || planExams.length === 0) {
      return res.json({ exams: [] });
    }

    // Get all ExamIDs
    const examIds = planExams.map((pe) => pe.ExamID).filter(Boolean);
    console.log(`ExamIDs to fetch:`, examIds);

    if (examIds.length === 0) {
      console.warn('No ExamIDs found in SubscriptionPlanExams');
      return res.json({ exams: [] });
    }

    // Fetch exam details - try without .in() first to see if it's a syntax issue
    let exams = [];
    let examsError = null;

    // Try fetching exams one by one if .in() doesn't work
    try {
      const { data: examsData, error: examsErr } = await supabase
        .from('Exams')
        .select('ExamID, ExamName, Description')
        .in('ExamID', examIds);

      if (examsErr) {
        console.error('Error with .in() query:', examsErr);
        // Fallback: fetch exams one by one
        console.log('Attempting to fetch exams individually...');
        const examPromises = examIds.map(async (examId) => {
          const { data: examData, error: examErr } = await supabase
            .from('Exams')
            .select('ExamID, ExamName, Description')
            .eq('ExamID', examId)
            .single();
          
          if (examErr) {
            console.error(`Error fetching exam ${examId}:`, examErr);
            return null;
          }
          return examData;
        });

        const examResults = await Promise.all(examPromises);
        exams = examResults.filter((e) => e !== null);
        console.log(`Fetched ${exams.length} exams individually`);
      } else {
        exams = examsData || [];
        console.log(`Fetched ${exams.length} exams using .in()`);
      }
    } catch (fetchError) {
      console.error('Error fetching Exams:', fetchError);
      examsError = fetchError;
    }

    if (examsError && exams.length === 0) {
      return res.status(500).json({ 
        error: 'Failed to fetch exam details', 
        details: examsError.message || 'Could not fetch exam information',
        examIds: examIds 
      });
    }

    // Create a map of ExamID to Exam details
    const examMap = new Map(exams.map((e) => [e.ExamID, e]));
    console.log(`Exam map created with ${examMap.size} entries`);

    // Combine plan exam data with exam details
    // Note: Exams are platform-wide now, so no OrgName needed
    const examsWithDetails = planExams.map((pe) => {
      const exam = examMap.get(pe.ExamID);
      if (!exam) {
        console.warn(`Exam not found for ExamID: ${pe.ExamID}`);
      }
      return {
        ...pe,
        ExamID: pe.ExamID,
        ExamName: exam?.ExamName || `Unknown Exam (${pe.ExamID.substring(0, 8)}...)`,
        ExamDescription: exam?.Description || null,
        OrgName: null, // Exams are platform-wide, no organization
      };
    });

    console.log(`Returning ${examsWithDetails.length} exams with details`);
    res.json({ exams: examsWithDetails || [] });
  } catch (error) {
    console.error('Get plan exams error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/subscription-plans/:planId/exams
 * Link an exam to a subscription plan (SuperAdmin only)
 */
router.post('/subscription-plans/:planId/exams', authenticate, requireSuperAdmin, async (req, res) => {
  const { planId } = req.params;
  const {
    examId,
    isMandatory,
    maxStudents,
    maxTests,
    maxQuestionsPerTest,
    maxTestsPerDay,
    aiSupport,
    extraConfig,
  } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Validation
    if (!examId) {
      return res.status(400).json({ error: 'Exam ID is required' });
    }

    // Verify plan exists
    const { data: plan } = await supabase.from('SubscriptionPlans').select('PlanID').eq('PlanID', planId).single();
    if (!plan) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    // Verify exam exists
    const { data: exam } = await supabase.from('Exams').select('ExamID, ExamName').eq('ExamID', examId).single();
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Check if already linked
    const { data: existingLink } = await supabase
      .from('SubscriptionPlanExams')
      .select('PlanID, ExamID')
      .eq('PlanID', planId)
      .eq('ExamID', examId)
      .single();

    if (existingLink) {
      return res.status(409).json({ error: 'Exam is already linked to this subscription plan' });
    }

    // Create link
    const { data: newLink, error: linkError } = await supabase
      .from('SubscriptionPlanExams')
      .insert({
        PlanID: planId,
        ExamID: examId,
        IsMandatory: isMandatory === true,
        MaxStudents: maxStudents ? parseInt(maxStudents) : null,
        MaxTests: maxTests ? parseInt(maxTests) : null,
        MaxQuestionsPerTest: maxQuestionsPerTest ? parseInt(maxQuestionsPerTest) : null,
        MaxTestsPerDay: maxTestsPerDay ? parseInt(maxTestsPerDay) : null,
        AISupport: aiSupport === true,
        ExtraConfig: extraConfig || null,
      })
      .select()
      .single();

    if (linkError) {
      return res.status(500).json({ error: 'Failed to link exam to plan', details: linkError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Create',
      entityType: 'Subscription',
      entityID: planId,
      description: `Super Admin linked exam "${exam.ExamName}" to subscription plan`,
      ipAddress,
      userAgent,
      newData: {
        planId,
        examId,
        examName: exam.ExamName,
        isMandatory,
        maxStudents,
        maxTests,
        maxQuestionsPerTest,
        maxTestsPerDay,
        aiSupport,
      },
    });

    res.status(201).json({
      message: 'Exam linked to subscription plan successfully',
      link: newLink,
    });
  } catch (error) {
    console.error('Link exam to plan error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/subscription-plans/:planId/exams/:examId
 * Update exam limits in subscription plan (SuperAdmin only)
 */
router.put('/subscription-plans/:planId/exams/:examId', authenticate, requireSuperAdmin, async (req, res) => {
  const { planId, examId } = req.params;
  const {
    isMandatory,
    maxStudents,
    maxTests,
    maxQuestionsPerTest,
    maxTestsPerDay,
    aiSupport,
    extraConfig,
  } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if link exists
    const { data: existingLink, error: fetchError } = await supabase
      .from('SubscriptionPlanExams')
      .select('*')
      .eq('PlanID', planId)
      .eq('ExamID', examId)
      .single();

    if (fetchError || !existingLink) {
      return res.status(404).json({ error: 'Exam is not linked to this subscription plan' });
    }

    // Build update object
    const updateData = {};
    if (isMandatory !== undefined) updateData.IsMandatory = isMandatory === true;
    if (maxStudents !== undefined) updateData.MaxStudents = maxStudents ? parseInt(maxStudents) : null;
    if (maxTests !== undefined) updateData.MaxTests = maxTests ? parseInt(maxTests) : null;
    if (maxQuestionsPerTest !== undefined)
      updateData.MaxQuestionsPerTest = maxQuestionsPerTest ? parseInt(maxQuestionsPerTest) : null;
    if (maxTestsPerDay !== undefined) updateData.MaxTestsPerDay = maxTestsPerDay ? parseInt(maxTestsPerDay) : null;
    if (aiSupport !== undefined) updateData.AISupport = aiSupport === true;
    if (extraConfig !== undefined) updateData.ExtraConfig = extraConfig || null;

    // Update link
    const { data: updatedLink, error: updateError } = await supabase
      .from('SubscriptionPlanExams')
      .update(updateData)
      .eq('PlanID', planId)
      .eq('ExamID', examId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update plan exam link', details: updateError.message });
    }

    // Get exam name for log
    const { data: exam } = await supabase.from('Exams').select('ExamName').eq('ExamID', examId).single();

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Update',
      entityType: 'Subscription',
      entityID: planId,
      description: `Super Admin updated exam limits for "${exam?.ExamName || examId}" in subscription plan`,
      ipAddress,
      userAgent,
      previousData: existingLink,
      newData: updateData,
    });

    res.json({
      message: 'Plan exam link updated successfully',
      link: updatedLink,
    });
  } catch (error) {
    console.error('Update plan exam link error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/admin/subscription-plans/:planId/exams/:examId
 * Unlink an exam from subscription plan (SuperAdmin only)
 */
router.delete('/subscription-plans/:planId/exams/:examId', authenticate, requireSuperAdmin, async (req, res) => {
  const { planId, examId } = req.params;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if link exists
    const { data: existingLink, error: fetchError } = await supabase
      .from('SubscriptionPlanExams')
      .select('*')
      .eq('PlanID', planId)
      .eq('ExamID', examId)
      .single();

    if (fetchError || !existingLink) {
      return res.status(404).json({ error: 'Exam is not linked to this subscription plan' });
    }

    // Get exam name for log
    const { data: exam } = await supabase.from('Exams').select('ExamName').eq('ExamID', examId).single();

    // Delete link
    const { error: deleteError } = await supabase
      .from('SubscriptionPlanExams')
      .delete()
      .eq('PlanID', planId)
      .eq('ExamID', examId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to unlink exam from plan', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Delete',
      entityType: 'Subscription',
      entityID: planId,
      description: `Super Admin unlinked exam "${exam?.ExamName || examId}" from subscription plan`,
      ipAddress,
      userAgent,
      previousData: existingLink,
    });

    res.json({ message: 'Exam unlinked from subscription plan successfully' });
  } catch (error) {
    console.error('Unlink exam from plan error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/admin/logs
 * Get system logs with filtering (SuperAdmin only)
 * Query params:
 *   - startDate: ISO date string (optional)
 *   - endDate: ISO date string (optional)
 *   - actorType: Filter by actor type (optional)
 *   - actionType: Filter by action type (optional)
 *   - entityType: Filter by entity type (optional)
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 50, max: 200)
 */
router.get('/logs', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate, actorType, actionType, entityType, page = 1, limit = 50 } = req.query;
    
    // Validate pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    // Build query
    let query = supabase
      .from('Logs')
      .select('*', { count: 'exact' })
      .order('Timestamp', { ascending: false });

    // Apply date filters
    if (startDate) {
      query = query.gte('Timestamp', new Date(startDate).toISOString());
    }
    if (endDate) {
      // Add one day to endDate to include the entire end date
      const endDateObj = new Date(endDate);
      endDateObj.setDate(endDateObj.getDate() + 1);
      query = query.lt('Timestamp', endDateObj.toISOString());
    }

    // Apply filters
    if (actorType) {
      query = query.eq('ActorType', actorType);
    }
    if (actionType) {
      query = query.eq('ActionType', actionType);
    }
    if (entityType) {
      query = query.eq('EntityType', entityType);
    }

    // Apply pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data: logs, error, count } = await query;

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch logs', details: error.message });
    }

    // Enrich logs with actor names
    const enrichedLogs = await Promise.all(
      (logs || []).map(async (log) => {
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
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/admin/logs/stats
 * Get log statistics (SuperAdmin only)
 */
router.get('/logs/stats', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = supabase.from('Logs').select('ActorType, ActionType, EntityType', { count: 'exact' });

    if (startDate) {
      query = query.gte('Timestamp', new Date(startDate).toISOString());
    }
    if (endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setDate(endDateObj.getDate() + 1);
      query = query.lt('Timestamp', endDateObj.toISOString());
    }

    const { data: logs, count } = await query;

    // Calculate statistics
    const stats = {
      total: count || 0,
      byActorType: {},
      byActionType: {},
      byEntityType: {},
    };

    (logs || []).forEach((log) => {
      stats.byActorType[log.ActorType] = (stats.byActorType[log.ActorType] || 0) + 1;
      stats.byActionType[log.ActionType] = (stats.byActionType[log.ActionType] || 0) + 1;
      stats.byEntityType[log.EntityType] = (stats.byEntityType[log.EntityType] || 0) + 1;
    });

    res.json({ stats });
  } catch (error) {
    console.error('Get log stats error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
