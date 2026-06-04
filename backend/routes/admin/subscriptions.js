import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/admin/subscriptions
 * Get all subscriptions with details and usage (SuperAdmin only)
 * Query params: status (all|Active|Expired|Cancelled), entityType (all|Organization|Student), page, limit
 */
router.get('/subscriptions', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { status = 'all', entityType = 'all', page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    // Build query for subscriptions
    let query = supabase
      .from('Subscriptions')
      .select(`
        SubscriptionID,
        EntityType,
        EntityID,
        PlanID,
        StartDate,
        EndDate,
        Status,
        ActivatedAt,
        AutoRenew,
        CreatedAt,
        SubscriptionPlans (
          PlanID,
          PlanName,
          Price,
          DurationMonths,
          Features
        )
      `, { count: 'exact' })
      .order('CreatedAt', { ascending: false });

    // Apply filters
    if (status !== 'all') {
      query = query.eq('Status', status);
    }
    if (entityType !== 'all') {
      query = query.eq('EntityType', entityType);
    }

    // Apply pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data: subscriptions, error: subError, count } = await query;

    if (subError) {
      return res.status(500).json({ error: 'Failed to fetch subscriptions', details: subError.message });
    }

    // Enrich subscriptions with entity details and usage
    const enrichedSubscriptions = await Promise.all(
      (subscriptions || []).map(async (sub) => {
        let entityDetails = null;
        const entityId = sub.EntityID;

        // Fetch entity details based on EntityType
        if (sub.EntityType === 'Organization' && entityId) {
          const { data: org } = await supabase
            .from('Organizations')
            .select('OrgID, OrgName, OrgEmail, Phone, Address, Status')
            .eq('OrgID', entityId)
            .single();
          if (org) {
            entityDetails = {
              id: org.OrgID,
              name: org.OrgName,
              email: org.OrgEmail,
              phone: org.Phone,
              address: org.Address,
              status: org.Status,
            };
          }
        } else if (sub.EntityType === 'Student' && entityId) {
          const { data: student } = await supabase
            .from('Students')
            .select('StudentID, FullName, Email, Phone, Status')
            .eq('StudentID', entityId)
            .single();
          if (student) {
            entityDetails = {
              id: student.StudentID,
              name: student.FullName,
              email: student.Email,
              phone: student.Phone,
              status: student.Status,
            };
          }
        }

        // Calculate actual usage from database tables (more accurate than UsageCounters)
        let totalUsage = {
          studentsEnrolled: 0,
          testsCreated: 0,
          questionsCreated: 0,
          aiQuestionsGenerated: 0,
          studentAttempts: 0,
        };

        const usageByExam = {};

        // For Organization subscriptions: count from OrgID
        // For Student subscriptions: count from StudentID
        if (sub.EntityType === 'Organization' && entityId) {
          // Count students enrolled (students with this OrgID)
          const { count: studentsCount } = await supabase
            .from('Students')
            .select('*', { count: 'exact', head: true })
            .eq('OrgID', entityId)
            .eq('Status', 'Active');
          totalUsage.studentsEnrolled = studentsCount || 0;

          // Count tests created - for organization subscriptions, count all tests for that org
          // This is more accurate since SubscriptionID might not be set on all tests
          const { data: tests, error: testsError } = await supabase
            .from('Tests')
            .select('TestID, ExamID, SubscriptionID, Exams(ExamID, ExamName)')
            .eq('OrgID', entityId);
          
          let relevantTests = [];
          if (!testsError && tests) {
            // Filter tests that match this subscription OR have no SubscriptionID set
            // (for backward compatibility with tests created before subscription tracking)
            relevantTests = tests.filter(
              (t) => !t.SubscriptionID || t.SubscriptionID === sub.SubscriptionID
            );
            totalUsage.testsCreated = relevantTests.length;
            
            // Group tests by exam for usageByExam
            relevantTests.forEach((test) => {
              const examId = test.ExamID;
              if (examId) {
                if (!usageByExam[examId]) {
                  usageByExam[examId] = {
                    examId,
                    examName: test.Exams?.ExamName || 'Unknown Exam',
                    studentsEnrolled: 0,
                    testsCreated: 0,
                    questionsCreated: 0,
                    aiQuestionsGenerated: 0,
                    studentAttempts: 0,
                  };
                }
                usageByExam[examId].testsCreated += 1;
              }
            });
          }

          // Count questions created by this organization (questions with this OrgID)
          const { data: questions, error: questionsError } = await supabase
            .from('Questions')
            .select('QuestionID, Source, TopicID, Topics(SubjectID, Subjects(ExamID, Exams(ExamID, ExamName)))')
            .eq('OrgID', entityId);

          if (!questionsError && questions) {
            totalUsage.questionsCreated = questions.length;
            
            // Count AI-generated questions
            const aiQuestions = questions.filter((q) => q.Source === 'AI');
            totalUsage.aiQuestionsGenerated = aiQuestions.length;

            // Group questions by exam
            questions.forEach((question) => {
              const examId = question.Topics?.Subjects?.ExamID;
              if (examId) {
                if (!usageByExam[examId]) {
                  usageByExam[examId] = {
                    examId,
                    examName: question.Topics?.Subjects?.Exams?.ExamName || 'Unknown Exam',
                    studentsEnrolled: 0,
                    testsCreated: 0,
                    questionsCreated: 0,
                    aiQuestionsGenerated: 0,
                    studentAttempts: 0,
                  };
                }
                usageByExam[examId].questionsCreated += 1;
                if (question.Source === 'AI') {
                  usageByExam[examId].aiQuestionsGenerated += 1;
                }
              }
            });
          }

          // Count student attempts (through tests linked to this subscription)
          const testIds = relevantTests.map((t) => t.TestID);
          if (testIds.length > 0) {
            const { count: attemptsCount } = await supabase
              .from('StudentAttempts')
              .select('*', { count: 'exact', head: true })
              .in('TestID', testIds);
            totalUsage.studentAttempts = attemptsCount || 0;

            // Update usageByExam with student attempts per exam
            const { data: attempts } = await supabase
              .from('StudentAttempts')
              .select('TestID, Tests(ExamID)')
              .in('TestID', testIds);

            if (attempts) {
              attempts.forEach((attempt) => {
                const examId = attempt.Tests?.ExamID;
                if (examId && usageByExam[examId]) {
                  usageByExam[examId].studentAttempts += 1;
                }
              });
            }

            // Update students enrolled per exam (students in org who have attempted tests for that exam)
            for (const examId of Object.keys(usageByExam)) {
              const examTests = relevantTests.filter((t) => t.ExamID === examId);
              if (examTests.length > 0) {
                const examTestIds = examTests.map((t) => t.TestID);
                const { data: examAttempts } = await supabase
                  .from('StudentAttempts')
                  .select('StudentID')
                  .in('TestID', examTestIds);
                
                if (examAttempts) {
                  const uniqueStudents = new Set(examAttempts.map((a) => a.StudentID));
                  usageByExam[examId].studentsEnrolled = uniqueStudents.size;
                }
              }
            }
          }

        } else if (sub.EntityType === 'Student' && entityId) {
          // For Student subscriptions: count their own usage
          // Count tests created by this student (if they can create tests)
          const { count: testsCount } = await supabase
            .from('Tests')
            .select('*', { count: 'exact', head: true })
            .eq('SubscriptionID', sub.SubscriptionID);
          totalUsage.testsCreated = testsCount || 0;

          // Count student attempts
          const { count: attemptsCount } = await supabase
            .from('StudentAttempts')
            .select('*', { count: 'exact', head: true })
            .eq('StudentID', entityId);
          totalUsage.studentAttempts = attemptsCount || 0;

          // Get tests for this subscription to group by exam
          const { data: tests } = await supabase
            .from('Tests')
            .select('TestID, ExamID, Exams(ExamID, ExamName)')
            .eq('SubscriptionID', sub.SubscriptionID);

          if (tests) {
            tests.forEach((test) => {
              const examId = test.ExamID;
              if (examId) {
                if (!usageByExam[examId]) {
                  usageByExam[examId] = {
                    examId,
                    examName: test.Exams?.ExamName || 'Unknown Exam',
                    studentsEnrolled: 0,
                    testsCreated: 0,
                    questionsCreated: 0,
                    aiQuestionsGenerated: 0,
                    studentAttempts: 0,
                  };
                }
                usageByExam[examId].testsCreated += 1;
              }
            });

            // Count attempts per exam
            const testIds = tests.map((t) => t.TestID);
            const { data: attempts } = await supabase
              .from('StudentAttempts')
              .select('TestID, Tests(ExamID)')
              .eq('StudentID', entityId)
              .in('TestID', testIds);

            if (attempts) {
              attempts.forEach((attempt) => {
                const examId = attempt.Tests?.ExamID;
                if (examId && usageByExam[examId]) {
                  usageByExam[examId].studentAttempts += 1;
                }
              });
            }
          }
        }

        // Also fetch UsageCounters for reference (may have additional tracking)
        const { data: usageCounters } = await supabase
          .from('UsageCounters')
          .select(`
            UsageID,
            ExamID,
            MonthKey,
            StudentsEnrolled,
            TestsCreated,
            TestsCreatedToday,
            QuestionsCreated,
            AIQuestionsGenerated,
            StudentAttempts,
            LastResetAt,
            UpdatedAt,
            Exams (
              ExamID,
              ExamName
            )
          `)
          .eq('SubscriptionID', sub.SubscriptionID)
          .order('MonthKey', { ascending: false })
          .order('UpdatedAt', { ascending: false });

        // Fetch payment information
        const { data: payments } = await supabase
          .from('Payments')
          .select('PaymentID, Amount, PaymentDate, PaymentStatus, PaymentMethod, TransactionID')
          .eq('SubscriptionID', sub.SubscriptionID)
          .order('PaymentDate', { ascending: false });

        const totalPaid = (payments || [])
          .filter((p) => p.PaymentStatus === 'Completed')
          .reduce((sum, p) => sum + parseFloat(p.Amount || 0), 0);

        return {
          subscriptionId: sub.SubscriptionID,
          entityType: sub.EntityType,
          entityId: sub.EntityID,
          entityDetails,
          plan: sub.SubscriptionPlans
            ? {
                planId: sub.SubscriptionPlans.PlanID,
                planName: sub.SubscriptionPlans.PlanName,
                price: sub.SubscriptionPlans.Price,
                durationMonths: sub.SubscriptionPlans.DurationMonths,
                features: sub.SubscriptionPlans.Features,
              }
            : null,
          startDate: sub.StartDate,
          endDate: sub.EndDate,
          status: sub.Status,
          activatedAt: sub.ActivatedAt,
          autoRenew: sub.AutoRenew,
          createdAt: sub.CreatedAt,
          totalUsage,
          usageByExam: Object.values(usageByExam),
          usageCounters: usageCounters || [],
          payments: payments || [],
          totalPaid,
          paymentCount: payments?.length || 0,
        };
      })
    );

    res.json({
      subscriptions: enrichedSubscriptions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum),
      },
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
