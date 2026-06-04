import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';
import { getPlanTestModesMap, normalizePlanTestModes } from '../../utils/subscriptionPlanCatalog.js';

const router = express.Router();

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

    const planIds = (plans || []).map((p) => p.PlanID).filter(Boolean);
    const modeMap = await getPlanTestModesMap(supabase, planIds);
    const plansWithModes = (plans || []).map((p) => ({
      ...p,
      testModes: modeMap.get(p.PlanID) || {
        isScheduledEnabled: false,
        isAdaptiveEnabled: false,
        isSelfTestBuilderEnabled: false,
      },
    }));
    res.json({ plans: plansWithModes });
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

    const { data: modeRow } = await supabase
      .from('SubscriptionPlanTestModes')
      .select('IsScheduledEnabled, IsAdaptiveEnabled, IsSelfTestBuilderEnabled')
      .eq('PlanID', planId)
      .single();

    res.json({
      plan,
      exams: examsWithDetails,
      testModes: normalizePlanTestModes(modeRow),
    });
  } catch (error) {
    console.error('Get subscription plan error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/subscription-plans
 * Create a new subscription plan (SuperAdmin only)
 *
 * NOTE: With the new `Audience` column on SubscriptionPlans, SuperAdmin can now
 * explicitly define whether a plan is for Organizations, Students, or Both.
 */
router.post('/subscription-plans', authenticate, requireSuperAdmin, async (req, res) => {
  const { planName, price, durationMonths, features, audience, testModes } = req.body;
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

    // Validate audience (optional, defaults to 'Organization' at DB level if not provided)
    let planAudience = audience;
    if (planAudience !== undefined) {
      if (!['Organization', 'Student', 'Both'].includes(planAudience)) {
        return res.status(400).json({ error: "Audience must be one of: 'Organization', 'Student', or 'Both'" });
      }
    } else {
      planAudience = 'Organization';
    }

    // Create subscription plan (Status defaults to Active in DB; set explicitly for clarity)
    const { data: newPlan, error: planError } = await supabase
      .from('SubscriptionPlans')
      .insert({
        PlanName: planName.trim(),
        Price: parseFloat(price),
        DurationMonths: parseInt(durationMonths),
        Features: features || {},
        Status: 'Active',
        Audience: planAudience,
      })
      .select()
      .single();

    if (planError) {
      return res.status(500).json({ error: 'Failed to create subscription plan', details: planError.message });
    }

    const requestedModes = {
      isScheduledEnabled:
        testModes?.isScheduledEnabled ??
        ['Organization', 'Both'].includes(planAudience),
      isAdaptiveEnabled: testModes?.isAdaptiveEnabled ?? false,
      isSelfTestBuilderEnabled:
        testModes?.isSelfTestBuilderEnabled ??
        ['Student', 'Both'].includes(planAudience),
    };

    const { error: modeErr } = await supabase.from('SubscriptionPlanTestModes').upsert({
      PlanID: newPlan.PlanID,
      IsScheduledEnabled: !!requestedModes.isScheduledEnabled,
      IsAdaptiveEnabled: !!requestedModes.isAdaptiveEnabled,
      IsSelfTestBuilderEnabled: !!requestedModes.isSelfTestBuilderEnabled,
    });
    if (modeErr) {
      return res.status(500).json({
        error: 'Plan created but failed to save test mode controls',
        details: modeErr.message,
      });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Create',
      entityType: 'Subscription',
      entityID: newPlan.PlanID,
      description: `Super Admin created subscription plan: ${planName} (Audience: ${planAudience})`,
      ipAddress,
      userAgent,
      newData: {
        planName,
        price,
        durationMonths,
        features,
        audience: planAudience,
        testModes: requestedModes,
      },
    });

    res.status(201).json({
      message: 'Subscription plan created successfully',
      plan: { ...newPlan, testModes: requestedModes },
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
  const { planName, price, durationMonths, features, status, audience, testModes } = req.body;
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
    if (status !== undefined) {
      if (status !== 'Active' && status !== 'Inactive') {
        return res.status(400).json({ error: 'Status must be Active or Inactive' });
      }
      updateData.Status = status;
    }

    // Audience update (optional)
    if (audience !== undefined) {
      if (!['Organization', 'Student', 'Both'].includes(audience)) {
        return res.status(400).json({ error: "Audience must be one of: 'Organization', 'Student', or 'Both'" });
      }
      updateData.Audience = audience;
    }

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

    let savedModes = null;
    if (testModes !== undefined) {
      savedModes = {
        isScheduledEnabled: !!testModes?.isScheduledEnabled,
        isAdaptiveEnabled: !!testModes?.isAdaptiveEnabled,
        isSelfTestBuilderEnabled: !!testModes?.isSelfTestBuilderEnabled,
      };
      const { error: modeErr } = await supabase.from('SubscriptionPlanTestModes').upsert({
        PlanID: planId,
        IsScheduledEnabled: savedModes.isScheduledEnabled,
        IsAdaptiveEnabled: savedModes.isAdaptiveEnabled,
        IsSelfTestBuilderEnabled: savedModes.isSelfTestBuilderEnabled,
      });
      if (modeErr) {
        return res.status(500).json({
          error: 'Plan updated but failed to save test mode controls',
          details: modeErr.message,
        });
      }
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
      newData: savedModes ? { ...updateData, testModes: savedModes } : updateData,
    });

    res.json({
      message: 'Subscription plan updated successfully',
      plan: savedModes ? { ...updatedPlan, testModes: savedModes } : updatedPlan,
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

    // Verify plan exists (Audience: Student = individual-only; MaxStudents not applicable)
    const { data: plan } = await supabase
      .from('SubscriptionPlans')
      .select('PlanID, Audience')
      .eq('PlanID', planId)
      .single();
    if (!plan) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }
    const planAudience = plan.Audience ?? 'Organization';

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

    const maxStudentsForInsert =
      planAudience === 'Student' ? null : maxStudents ? parseInt(maxStudents, 10) : null;

    // Create link
    const { data: newLink, error: linkError } = await supabase
      .from('SubscriptionPlanExams')
      .insert({
        PlanID: planId,
        ExamID: examId,
        IsMandatory: isMandatory === true,
        MaxStudents: maxStudentsForInsert,
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

    const { data: planRow } = await supabase
      .from('SubscriptionPlans')
      .select('Audience')
      .eq('PlanID', planId)
      .single();
    const planAudience = planRow?.Audience ?? 'Organization';

    // Build update object
    const updateData = {};
    if (isMandatory !== undefined) updateData.IsMandatory = isMandatory === true;
    if (planAudience === 'Student') {
      updateData.MaxStudents = null;
    } else if (maxStudents !== undefined) {
      updateData.MaxStudents = maxStudents ? parseInt(maxStudents, 10) : null;
    }
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

export default router;
