import express from 'express';
import { supabase } from '../config/database.js';
import { authenticate, requireRole, verifyActiveStatus } from '../middleware/auth.js';
import { handleValidationErrors } from '../middleware/validation.js';
import { body } from 'express-validator';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { createLog, getClientIP, getUserAgent } from '../utils/logger.js';
import {
  ENROLLMENT_APPROVAL_MODES,
  ensureOrgEnrollmentSettings,
  getOrgEnrollmentSettings,
  mapEnrollmentSettingsRow,
  normalizeEnrollmentPair,
} from '../utils/orgEnrollmentSettings.js';
import { enrichPlansWithExams } from '../utils/subscriptionPlanCatalog.js';

const router = express.Router();

function parseDateOnly(isoOrDate) {
  if (!isoOrDate) return null;
  const dateStr = String(isoOrDate).split('T')[0];
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function daysUntilEnd(endDate) {
  const end = parseDateOnly(endDate);
  if (!end) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function isSubscriptionActive(sub, today) {
  if (String(sub.Status || '').toLowerCase() !== 'active') return false;
  if (!sub.EndDate) return false;
  const endDateOnly = parseDateOnly(sub.EndDate);
  return endDateOnly && endDateOnly >= today;
}

function aggregateUsageRows(rows) {
  const byExam = new Map();
  for (const row of rows || []) {
    const examId = row.ExamID;
    if (!examId) continue;
    const prev = byExam.get(examId) || {
      examId,
      studentsEnrolled: 0,
      testsCreated: 0,
      testsCreatedToday: 0,
      studentAttempts: 0,
      aiQuestionsGenerated: 0,
    };
    byExam.set(examId, {
      examId,
      studentsEnrolled: prev.studentsEnrolled + (Number(row.StudentsEnrolled) || 0),
      testsCreated: prev.testsCreated + (Number(row.TestsCreated) || 0),
      testsCreatedToday: prev.testsCreatedToday + (Number(row.TestsCreatedToday) || 0),
      studentAttempts: prev.studentAttempts + (Number(row.StudentAttempts) || 0),
      aiQuestionsGenerated: prev.aiQuestionsGenerated + (Number(row.AIQuestionsGenerated) || 0),
    });
  }

  const usageByExam = [...byExam.values()];
  const usageTotals = usageByExam.reduce(
    (acc, u) => ({
      studentsEnrolled: acc.studentsEnrolled + u.studentsEnrolled,
      testsCreated: acc.testsCreated + u.testsCreated,
      testsCreatedToday: acc.testsCreatedToday + u.testsCreatedToday,
      studentAttempts: acc.studentAttempts + u.studentAttempts,
      aiQuestionsGenerated: acc.aiQuestionsGenerated + u.aiQuestionsGenerated,
    }),
    {
      studentsEnrolled: 0,
      testsCreated: 0,
      testsCreatedToday: 0,
      studentAttempts: 0,
      aiQuestionsGenerated: 0,
    }
  );
  return { usageByExam, usageTotals };
}

async function loadActiveSubscriptionSummary(orgId) {
  const { data: subscriptions, error } = await supabase
    .from('Subscriptions')
    .select(
      `
      SubscriptionID,
      PlanID,
      StartDate,
      EndDate,
      Status,
      AutoRenew,
      ActivatedAt,
      CreatedAt,
      SubscriptionPlans (
        PlanID,
        PlanName,
        Price,
        DurationMonths,
        Features,
        Audience,
        Status
      )
    `
    )
    .eq('EntityType', 'Organization')
    .eq('EntityID', orgId)
    .order('CreatedAt', { ascending: false });

  if (error) throw error;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const allSubs = subscriptions || [];
  const active = allSubs.find((sub) => isSubscriptionActive(sub, today)) || null;

  if (!active) {
    return {
      active: null,
      plan: null,
      usageByExam: [],
      usageTotals: null,
      subscriptionHistoryCount: allSubs.length,
    };
  }

  const subscriptionId = active.SubscriptionID;
  const planRow = active.SubscriptionPlans;

  const { data: usageRows, error: usageErr } = await supabase
    .from('UsageCounters')
    .select(
      'ExamID, StudentsEnrolled, TestsCreated, TestsCreatedToday, StudentAttempts, AIQuestionsGenerated, MonthKey'
    )
    .eq('SubscriptionID', subscriptionId);

  if (usageErr) throw usageErr;

  const { usageByExam, usageTotals } = aggregateUsageRows(usageRows);
  const usageMap = new Map(usageByExam.map((u) => [u.examId, u]));

  let planDetails = null;
  if (planRow) {
    const [enriched] = await enrichPlansWithExams(supabase, [planRow]);
    const exams = (enriched?.exams || []).map((exam) => ({
      examId: exam.ExamID,
      examName: exam.ExamName,
      description: exam.ExamDescription || null,
      isMandatory: !!exam.IsMandatory,
      maxStudents: exam.MaxStudents,
      maxTests: exam.MaxTests,
      maxQuestionsPerTest: exam.MaxQuestionsPerTest,
      maxTestsPerDay: exam.MaxTestsPerDay,
      aiSupport: !!exam.AISupport,
      verifiedQuestionCount: exam.VerifiedPlatformQuestionCount ?? 0,
      usage: usageMap.get(exam.ExamID) || {
        studentsEnrolled: 0,
        testsCreated: 0,
        testsCreatedToday: 0,
        studentAttempts: 0,
        aiQuestionsGenerated: 0,
      },
    }));

    planDetails = {
      features: enriched?.Features && typeof enriched.Features === 'object' ? enriched.Features : {},
      testModes: enriched?.testModes || null,
      exams,
      examCount: exams.length,
      verifiedQuestionPoolTotal: enriched?.VerifiedPlatformQuestionPoolTotal ?? 0,
      audience: enriched?.Audience ?? 'Organization',
      planStatus: enriched?.Status ?? 'Active',
    };
  }

  const daysRemaining = daysUntilEnd(active.EndDate);

  return {
    active: {
      subscriptionId,
      planId: active.PlanID,
      planName: planRow?.PlanName || '—',
      price: planRow?.Price != null ? Number(planRow.Price) : null,
      durationMonths: planRow?.DurationMonths ?? null,
      startDate: active.StartDate,
      endDate: active.EndDate,
      activatedAt: active.ActivatedAt ?? null,
      createdAt: active.CreatedAt ?? null,
      status: active.Status,
      autoRenew: active.AutoRenew === true,
      daysRemaining,
      isExpiringSoon: daysRemaining != null && daysRemaining >= 0 && daysRemaining <= 14,
    },
    plan: planDetails,
    usageByExam,
    usageTotals,
    subscriptionHistoryCount: allSubs.length,
  };
}

/**
 * GET /api/org/settings
 */
router.get('/', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  try {
    const { orgId, orgUserId } = req.user;
    await ensureOrgEnrollmentSettings(orgId, orgUserId ?? null);

    const [{ data: org, error: orgErr }, enrollment, subscriptionSummary, { data: orgUser, error: userErr }] =
      await Promise.all([
        supabase
          .from('Organizations')
          .select('OrgID, OrgName, OrgEmail, Phone, Address, Status, CreatedAt')
          .eq('OrgID', orgId)
          .single(),
        getOrgEnrollmentSettings(orgId),
        loadActiveSubscriptionSummary(orgId),
        supabase
          .from('OrgUsers')
          .select('OrgUserID, FullName, Email, Phone')
          .eq('OrgUserID', orgUserId)
          .single(),
      ]);

    if (orgErr || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    if (userErr || !orgUser) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const { count: studentCount } = await supabase
      .from('Students')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId);

    const { count: pendingEnrollments } = await supabase
      .from('StudentExamEnrollments')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId)
      .eq('Status', 'Pending');

    res.json({
      organization: {
        orgId: org.OrgID,
        orgName: org.OrgName,
        orgEmail: org.OrgEmail,
        phone: org.Phone,
        address: org.Address,
        status: org.Status,
        createdAt: org.CreatedAt,
      },
      enrollment,
      account: {
        orgUserId: orgUser.OrgUserID,
        fullName: orgUser.FullName,
        email: orgUser.Email,
        phone: orgUser.Phone,
      },
      subscription: subscriptionSummary,
      counts: {
        students: studentCount ?? 0,
        pendingEnrollments: pendingEnrollments ?? 0,
      },
    });
  } catch (error) {
    console.error('Get org settings error:', error);
    res.status(500).json({ error: 'Failed to load settings', details: error.message });
  }
});

const validateEnrollmentPatch = [
  body('allowStudentRequests').optional().isBoolean(),
  body('enrollmentApprovalMode')
    .optional()
    .isIn(ENROLLMENT_APPROVAL_MODES)
    .withMessage(`enrollmentApprovalMode must be one of: ${ENROLLMENT_APPROVAL_MODES.join(', ')}`),
  handleValidationErrors,
];

/**
 * PATCH /api/org/settings/enrollment
 */
router.patch(
  '/enrollment',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  validateEnrollmentPatch,
  async (req, res) => {
    try {
      const { orgId, orgUserId, userId } = req.user;
      const reviewerId = orgUserId ?? userId ?? null;
      await ensureOrgEnrollmentSettings(orgId, reviewerId);

      const { data: currentRow } = await supabase
        .from('OrgEnrollmentSettings')
        .select('AllowStudentRequests, EnrollmentApprovalMode')
        .eq('OrgID', orgId)
        .maybeSingle();

      const current = mapEnrollmentSettingsRow(currentRow);
      const merged = normalizeEnrollmentPair({
        allowStudentRequests:
          req.body.allowStudentRequests !== undefined
            ? !!req.body.allowStudentRequests
            : current.allowStudentRequests,
        enrollmentApprovalMode:
          req.body.enrollmentApprovalMode !== undefined
            ? req.body.enrollmentApprovalMode
            : current.enrollmentApprovalMode,
      });

      if (
        req.body.allowStudentRequests === false &&
        req.body.enrollmentApprovalMode === 'auto_student_requests'
      ) {
        return res.status(400).json({
          error:
            'Auto-approve student requests cannot be used while student exam enrollment requests are turned off.',
          code: 'STUDENT_REQUESTS_MODE_CONFLICT',
        });
      }

      if (
        req.body.allowStudentRequests === undefined &&
        req.body.enrollmentApprovalMode === undefined
      ) {
        return res.status(400).json({ error: 'No enrollment fields to update' });
      }

      const patch = {
        AllowStudentRequests: merged.allowStudentRequests,
        EnrollmentApprovalMode: merged.enrollmentApprovalMode,
      };

      patch.UpdatedAt = new Date().toISOString();
      patch.UpdatedBy = reviewerId;

      const { data: updated, error } = await supabase
        .from('OrgEnrollmentSettings')
        .update(patch)
        .eq('OrgID', orgId)
        .select('AllowStudentRequests, EnrollmentApprovalMode, UpdatedAt')
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to update enrollment settings', details: error.message });
      }

      await createLog({
        actorType: 'OrgUser',
        actorID: reviewerId,
        actionType: 'Update',
        entityType: 'Organization',
        entityID: orgId,
        description: 'Updated organization enrollment settings',
        ipAddress: getClientIP(req),
        userAgent: getUserAgent(req),
        newData: mapEnrollmentSettingsRow(updated),
      });

      res.json({
        message: 'Enrollment settings saved',
        enrollment: mapEnrollmentSettingsRow(updated),
      });
    } catch (error) {
      console.error('Patch org enrollment settings error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

const validateAccountPatch = [
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  handleValidationErrors,
];

/**
 * PATCH /api/org/settings/account
 */
router.patch(
  '/account',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  validateAccountPatch,
  async (req, res) => {
    try {
      const { orgUserId, userId } = req.user;
      const actorId = orgUserId ?? userId;
      const { fullName } = req.body;

      if (!fullName) {
        return res.status(400).json({ error: 'fullName is required' });
      }

      const { data: updated, error } = await supabase
        .from('OrgUsers')
        .update({ FullName: String(fullName).trim() })
        .eq('OrgUserID', actorId)
        .select('OrgUserID, FullName, Email, Phone')
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to update account', details: error.message });
      }

      res.json({
        message: 'Account updated',
        account: {
          orgUserId: updated.OrgUserID,
          fullName: updated.FullName,
          email: updated.Email,
          phone: updated.Phone,
        },
      });
    } catch (error) {
      console.error('Patch org account error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

const validatePasswordPatch = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  handleValidationErrors,
];

/**
 * PATCH /api/org/settings/password
 */
router.patch(
  '/password',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  validatePasswordPatch,
  async (req, res) => {
    try {
      const { orgUserId, userId } = req.user;
      const actorId = orgUserId ?? userId;
      const { currentPassword, newPassword } = req.body;

      const { data: orgUser, error: fetchErr } = await supabase
        .from('OrgUsers')
        .select('PasswordHash')
        .eq('OrgUserID', actorId)
        .single();

      if (fetchErr || !orgUser?.PasswordHash) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const valid = await verifyPassword(currentPassword, orgUser.PasswordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const passwordHash = await hashPassword(newPassword);
      const { error: updateErr } = await supabase
        .from('OrgUsers')
        .update({ PasswordHash: passwordHash })
        .eq('OrgUserID', actorId);

      if (updateErr) {
        return res.status(500).json({ error: 'Failed to update password', details: updateErr.message });
      }

      await createLog({
        actorType: 'OrgUser',
        actorID: actorId,
        actionType: 'Update',
        entityType: 'User',
        entityID: actorId,
        description: 'OrgAdmin changed password',
        ipAddress: getClientIP(req),
        userAgent: getUserAgent(req),
      });

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error('Patch org password error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * PATCH /api/org/settings/subscription/auto-renew
 */
router.patch(
  '/subscription/auto-renew',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  body('autoRenew').isBoolean().withMessage('autoRenew must be a boolean'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { orgId, orgUserId, userId } = req.user;
      const reviewerId = orgUserId ?? userId ?? null;
      const autoRenew = !!req.body.autoRenew;

      const summary = await loadActiveSubscriptionSummary(orgId);
      if (!summary.active?.subscriptionId) {
        return res.status(404).json({ error: 'No active subscription found for this organization' });
      }

      const { data: updated, error } = await supabase
        .from('Subscriptions')
        .update({ AutoRenew: autoRenew })
        .eq('SubscriptionID', summary.active.subscriptionId)
        .eq('EntityType', 'Organization')
        .eq('EntityID', orgId)
        .select('SubscriptionID, AutoRenew, Status')
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to update auto-renew', details: error.message });
      }

      await createLog({
        actorType: 'OrgUser',
        actorID: reviewerId,
        actionType: 'Update',
        entityType: 'Subscription',
        entityID: updated.SubscriptionID,
        description: `Auto-renew ${autoRenew ? 'enabled' : 'disabled'} for organization subscription`,
        ipAddress: getClientIP(req),
        userAgent: getUserAgent(req),
        newData: { autoRenew },
      });

      res.json({
        message: autoRenew ? 'Auto-renew enabled' : 'Auto-renew disabled',
        autoRenew: updated.AutoRenew === true,
      });
    } catch (error) {
      console.error('Patch subscription auto-renew error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

export default router;
