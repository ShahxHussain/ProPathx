import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';

const router = express.Router();

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

    // Revenue trend: window from query (7 | 30 | 90 days), continuous series for charts
    const rawRevDays = parseInt(String(req.query.revenueDays ?? '7'), 10);
    const revenueWindowDays = [7, 30, 90].includes(rawRevDays) ? rawRevDays : 7;

    const revenueStart = new Date();
    revenueStart.setDate(revenueStart.getDate() - revenueWindowDays);

    const { data: recentPayments } = await supabase
      .from('Payments')
      .select('Amount, PaymentDate, PaymentStatus')
      .eq('PaymentStatus', 'Completed')
      .gte('PaymentDate', revenueStart.toISOString())
      .order('PaymentDate', { ascending: true });

    const revenueByDateKey = {};
    recentPayments?.forEach((payment) => {
      const paymentDate = payment.PaymentDate || payment.paymentDate;
      const amount = payment.Amount || payment.amount || 0;
      if (!paymentDate) return;
      const dateKey = new Date(paymentDate).toISOString().split('T')[0];
      if (!revenueByDateKey[dateKey]) revenueByDateKey[dateKey] = 0;
      revenueByDateKey[dateKey] += parseFloat(amount);
    });

    const revenueData = [];
    for (let i = revenueWindowDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      revenueData.push({
        date: dateLabel,
        revenue: Math.round(revenueByDateKey[dateKey] || 0),
      });
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

export default router;
