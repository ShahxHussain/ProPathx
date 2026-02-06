import { supabase } from '../config/database.js';

/**
 * Validate subscription for Organization Subject Expert question creation
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} Validation result with subscription info and available exam IDs
 */
export async function validateSubscriptionForQuestionCreation(orgId) {
  try {
    // 1. Get ALL active subscriptions for the organization
    const today = new Date().toISOString().split('T')[0];
    
    const { data: subscriptions, error: subError } = await supabase
      .from('Subscriptions')
      .select('SubscriptionID, PlanID, Status, StartDate, EndDate, CreatedAt')
      .eq('EntityType', 'Organization')
      .eq('EntityID', orgId)
      .eq('Status', 'Active')
      .gte('EndDate', today)
      .order('CreatedAt', { ascending: false, nullsFirst: false });

    if (subError) {
      console.error('Subscription query error:', subError);
      console.error('Error details:', JSON.stringify(subError, null, 2));
      return {
        valid: false,
        reason: 'Database error',
        message: `Failed to check subscription status: ${subError.message || 'Unknown error'}. Please try again later.`
      };
    }

    if (!subscriptions || subscriptions.length === 0) {
      return {
        valid: false,
        reason: 'No active subscription found',
        message: 'Your organization needs an active subscription to create questions. Please contact your administrator.'
      };
    }

    // 2. Get ALL exams linked to ALL subscription plans
    const planIds = subscriptions.map(sub => sub.PlanID);
    const { data: planExams, error: planExamsError } = await supabase
      .from('SubscriptionPlanExams')
      .select('ExamID, PlanID')
      .in('PlanID', planIds);

    if (planExamsError) {
      console.error('Plan exams query error:', planExamsError);
      console.error('Error details:', JSON.stringify(planExamsError, null, 2));
      return {
        valid: false,
        reason: 'Database error',
        message: `Failed to fetch available exams: ${planExamsError.message || 'Unknown error'}. Please try again later.`
      };
    }

    if (!planExams || planExams.length === 0) {
      return {
        valid: false,
        reason: 'No exams linked to subscription plans',
        message: 'No exams are available in your subscription plans. Please contact support.'
      };
    }

    // Get unique exam IDs from all subscriptions
    const uniqueExamIds = [...new Set(planExams.map(pe => pe.ExamID))];

    return {
      valid: true,
      subscriptions: subscriptions.map(sub => ({
        subscriptionId: sub.SubscriptionID,
        planId: sub.PlanID,
        startDate: sub.StartDate,
        endDate: sub.EndDate
      })),
      availableExamIds: uniqueExamIds
    };
  } catch (error) {
    console.error('Subscription validation error:', error);
    return {
      valid: false,
      reason: 'Unexpected error',
      message: 'An unexpected error occurred. Please try again later.'
    };
  }
}

/**
 * Get subscription status for Organization Subject Expert
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} Subscription status with plan and exam details
 */
export async function getSubscriptionStatus(orgId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get ALL active subscriptions for the organization
    const { data: subscriptions, error: subError } = await supabase
      .from('Subscriptions')
      .select(`
        SubscriptionID,
        PlanID,
        Status,
        StartDate,
        EndDate,
        CreatedAt,
        SubscriptionPlans(
          PlanID,
          PlanName,
          Price,
          DurationMonths
        )
      `)
      .eq('EntityType', 'Organization')
      .eq('EntityID', orgId)
      .eq('Status', 'Active')
      .gte('EndDate', today)
      .order('CreatedAt', { ascending: false, nullsFirst: false });

    if (subError) {
      console.error('Subscription query error:', subError);
      return {
        hasActiveSubscription: false,
        error: 'Failed to fetch subscription status'
      };
    }

    if (!subscriptions || subscriptions.length === 0) {
      return {
        hasActiveSubscription: false,
        subscriptions: [],
        availableExams: []
      };
    }

    // Get ALL exams from ALL subscription plans
    const planIds = subscriptions.map(sub => sub.PlanID);
    const { data: planExams, error: planExamsError } = await supabase
      .from('SubscriptionPlanExams')
      .select(`
        ExamID,
        PlanID,
        Exams(
          ExamID,
          ExamName,
          Description
        )
      `)
      .in('PlanID', planIds);

    if (planExamsError) {
      console.error('Plan exams query error:', planExamsError);
      return {
        hasActiveSubscription: true,
        subscriptions: subscriptions.map(sub => ({
          SubscriptionID: sub.SubscriptionID,
          PlanID: sub.PlanID,
          PlanName: sub.SubscriptionPlans?.PlanName,
          StartDate: sub.StartDate,
          EndDate: sub.EndDate,
          Status: sub.Status
        })),
        availableExams: []
      };
    }

    // Get unique exams (in case same exam is in multiple plans)
    const examMap = new Map();
    (planExams || []).forEach(pe => {
      if (pe.ExamID && !examMap.has(pe.ExamID)) {
        examMap.set(pe.ExamID, {
          ExamID: pe.ExamID,
          ExamName: pe.Exams?.ExamName,
          Description: pe.Exams?.Description
        });
      }
    });

    const availableExams = Array.from(examMap.values());

    return {
      hasActiveSubscription: true,
      subscriptions: subscriptions.map(sub => ({
        SubscriptionID: sub.SubscriptionID,
        PlanID: sub.PlanID,
        PlanName: sub.SubscriptionPlans?.PlanName,
        StartDate: sub.StartDate,
        EndDate: sub.EndDate,
        Status: sub.Status
      })),
      availableExams
    };
  } catch (error) {
    console.error('Get subscription status error:', error);
    return {
      hasActiveSubscription: false,
      error: 'Failed to fetch subscription status'
    };
  }
}
