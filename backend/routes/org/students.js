import express from 'express';
import { supabase } from '../../config/database.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../middleware/auth.js';
import { getClientIP, getUserAgent, createLog } from '../../utils/logger.js';
import { hashPassword } from '../../utils/password.js';
import { createNotification } from '../../utils/notifications.js';
import {
  filterPlansForStudentAudience,
  enrichPlansWithExams,
  getPlanTestModesMap,
  isPlanModeEnabled,
} from '../../utils/subscriptionPlanCatalog.js';
import {
  getOrgEnrollmentSettings,
  shouldAutoApproveDirectAssign,
  shouldAutoApproveStudentRequests,
} from '../../utils/orgEnrollmentSettings.js';
import * as shared from '../students/shared.js';

const {
  testNameFromRow,
  testIdFromRow,
  orgIdFromRow,
  testStatusFromRow,
  attemptCompletedFromRow,
  attemptStatusFromRow,
  canonEntityId,
  unwrapEmbedded,
  pickCol,
  totalMarksConfiguredOnTest,
  PG_OPTIONS_BY_QUESTION_FK,
  isUuidLike,
  asAnswerOptionId,
  canonOptionRowId,
  resolveSelectedOptionCanon,
  assignmentWorkflowStatusRaw,
  assignmentRowAllowsStart,
  enrichAttemptDto,
  requireStudentActor,
  isIndividualStudentUser,
  requireIndividualStudent,
  getActiveStudentSubscriptions,
  getActiveSubscriptionsForStudentContext,
  applyQuestionPoolScope,
  allocateQuestionsBySubject,
  buildPlanExamEligibilityMap,
  enrollmentRecordAllowsExamAccess,
  enrollmentStatusHint,
  enrollmentStatusHintOrg,
  applyStudentEnrollmentGate,
  getEligibleStudentExamMap,
  getStudentEnrollmentBlockedExamIdsSet,
  isStudentExamAccessAllowed,
  normalizeOrgIdForEnrollment,
  upsertStudentExamWithdrawal,
  upsertStudentExamActivation,
  upsertStudentExamPendingDirectAssign,
  orgAssignExamEnrollment,
  studentSubmitEnrollmentAccessRequest,
  orgRejectStudentExamEnrollment,
  buildStudentExamEnrollmentListPayload,
  isScheduledModeEnabledForTest,
  scoreQuestionAttempt,
  bulkRegisterRowIssue,
  isDuplicateKeyInsertError,
  loadExistingStudentsByEmails,
  DIRECTORY_STATUS_VALUES,
  directoryDtoFromEnrollmentRecord,
} = shared;

const router = express.Router();

/**
 * ORG ADMIN STUDENT MANAGEMENT ROUTES
 *
 * Mounted at /api/org/students — OrgAdmin manages Students for their organization.
 */

/**
 * POST /api/org/students
 * Register a single student (OrgAdmin only)
 */
router.post(
  '/',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const {
      fullName,
      email,
      password,
      identityNo,
      fatherName,
      gender,
      dateOfBirth,
      address,
      phone,
      status = 'Active',
    } = req.body;

    try {
      if (!fullName || !email) {
        return res.status(400).json({ error: 'Full name and email are required' });
      }

      // Check if email already exists
      const { data: existing } = await supabase
        .from('Students')
        .select('StudentID')
        .eq('Email', email)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ error: 'Email already registered as student' });
      }

      // Hash password if provided, otherwise generate a simple random one
      const plainPassword =
        typeof password === 'string' && password.trim().length > 0
          ? password.trim()
          : Math.random().toString(36).slice(-8);
      const passwordHash = await hashPassword(plainPassword);

      const { data: newStudent, error: insertError } = await supabase
        .from('Students')
        .insert({
          OrgID: orgId,
          IdentityNo: identityNo || null,
          FullName: fullName,
          FatherName: fatherName || null,
          Email: email,
          PasswordHash: passwordHash,
          Gender: gender || null,
          DateOfBirth: dateOfBirth || null,
          Address: address || null,
          Phone: phone || null,
          Status: status || 'Active',
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error registering student:', insertError);
        return res
          .status(500)
          .json({ error: 'Failed to register student', details: insertError.message });
      }

      res.status(201).json({
        message: 'Student registered successfully',
        student: newStudent,
        // NOTE: For security reasons we do NOT return the plain password here.
      });
    } catch (error) {
      console.error('Register student error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);


/**
 * POST /api/org/students/bulk
 * Register multiple students in bulk (OrgAdmin only)
 * Expects body: { students: [{ fullName, email, password?, identityNo, ... }, ...] }
 */
router.post(
  '/bulk',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId, orgUserId, userId } = req.user;
    const reviewerOrgUserId = orgUserId ?? userId ?? null;
    const { students } = req.body || {};
    const rawExamIds = req.body?.examIds;
    const examIds = Array.isArray(rawExamIds)
      ? [...new Set(rawExamIds.map((id) => String(id).trim()).filter(Boolean))]
      : [];

    const MAX_BULK_STUDENTS = 200;
    const MAX_BULK_ENROLL_EXAMS = 40;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'No students provided' });
    }
    if (students.length > MAX_BULK_STUDENTS) {
      return res.status(400).json({
        error: `Too many rows (max ${MAX_BULK_STUDENTS} per upload). Split your CSV.`,
        code: 'LIMIT_STUDENTS',
      });
    }
    if (examIds.length > MAX_BULK_ENROLL_EXAMS) {
      return res.status(400).json({
        error: `Too many exams selected (max ${MAX_BULK_ENROLL_EXAMS}).`,
        code: 'LIMIT_EXAMS',
      });
    }

    try {
      const results = {
        created: 0,
        skipped: 0,
        errors: [],
      };
      const createdStudents = [];

      let allowedExamIds = new Set();
      if (examIds.length > 0) {
        const orgPlanMap = await buildPlanExamEligibilityMap(null, null, orgId);
        allowedExamIds = new Set([...orgPlanMap.keys()]);
        const invalidExams = examIds.filter((id) => !allowedExamIds.has(id));
        if (invalidExams.length > 0) {
          return res.status(400).json({
            error:
              'One or more selected exams are not on your organization active subscription.',
            code: 'EXAM_NOT_IN_PLAN',
            invalidExamIds: invalidExams,
          });
        }
      }

      const emailsToCheck = students
        .filter((s) => s?.fullName && s?.email)
        .map((s) => String(s.email).trim());
      const existingByEmailLower = await loadExistingStudentsByEmails(emailsToCheck);

      for (const [index, s] of students.entries()) {
        try {
          const {
            fullName,
            email,
            password,
            identityNo,
            fatherName,
            gender,
            dateOfBirth,
            address,
            phone,
            status = 'Active',
          } = s;

          if (!fullName || !email) {
            results.skipped++;
            results.errors.push(
              bulkRegisterRowIssue({
                index,
                studentRow: s,
                code: 'MISSING_REQUIRED',
                reason: 'Missing fullName or email',
                help: 'Each CSV row must include FullName and Email. This row was not imported.',
              })
            );
            continue;
          }

          const emailTrimmed = String(email).trim();
          const existing = existingByEmailLower.get(emailTrimmed.toLowerCase());

          if (existing) {
            const inYourOrg = existing.OrgID === orgId;
            results.skipped++;
            results.errors.push(
              bulkRegisterRowIssue({
                index,
                studentRow: s,
                code: 'DUPLICATE_EMAIL',
                reason: 'Email already registered',
                help: inYourOrg
                  ? 'This student is already in your organization. No duplicate account was created and they were not enrolled again from this upload.'
                  : 'This email is already used by another student account. Use a different email or update the existing student instead.',
                existingStudentId: existing.StudentID,
                existingInYourOrg: inYourOrg,
                existingName: existing.FullName || null,
              })
            );
            continue;
          }

          const plainPassword =
            typeof password === 'string' && password.trim().length > 0
              ? password.trim()
              : Math.random().toString(36).slice(-8);
          const passwordHash = await hashPassword(plainPassword);

          const { data: inserted, error: insertError } = await supabase
            .from('Students')
            .insert({
              OrgID: orgId,
              IdentityNo: identityNo || null,
              FullName: fullName,
              FatherName: fatherName || null,
              Email: emailTrimmed,
              PasswordHash: passwordHash,
              Gender: gender || null,
              DateOfBirth: dateOfBirth || null,
              Address: address || null,
              Phone: phone || null,
              Status: status || 'Active',
            })
            .select('StudentID, Email, FullName')
            .single();

          if (insertError) {
            results.skipped++;
            const isDup = isDuplicateKeyInsertError(insertError);
            results.errors.push(
              bulkRegisterRowIssue({
                index,
                studentRow: s,
                code: isDup ? 'DUPLICATE_EMAIL' : 'INSERT_FAILED',
                reason: isDup ? 'Email already registered' : insertError.message,
                help: isDup
                  ? 'This email is already registered. Remove the row or use a different email.'
                  : 'The database could not create this student. Check the data format (e.g. gender, status, dates) and try again.',
              })
            );
          } else {
            results.created++;
            if (inserted?.StudentID) {
              createdStudents.push({
                studentId: inserted.StudentID,
                email: inserted.Email,
                fullName: inserted.FullName,
              });
              existingByEmailLower.set(emailTrimmed.toLowerCase(), {
                StudentID: inserted.StudentID,
                OrgID: orgId,
                FullName: inserted.FullName,
                Email: inserted.Email,
              });
            }
          }
        } catch (error) {
          results.skipped++;
          results.errors.push(
            bulkRegisterRowIssue({
              index,
              studentRow: s,
              code: 'UNEXPECTED',
              reason: error.message,
              help: 'An unexpected error occurred while processing this row.',
            })
          );
        }
      }

      let enrollment = null;
      if (examIds.length > 0 && createdStudents.length > 0) {
        const enrollResults = [];
        const enrollErrors = [];

        for (const { studentId, email, fullName } of createdStudents) {
          let planMap;
          try {
            planMap = await buildPlanExamEligibilityMap(studentId, null, orgId);
          } catch (e) {
            enrollErrors.push({
              studentId,
              email,
              examId: null,
              code: 'PLAN_LOOKUP_FAILED',
              message: e.message || 'Could not load subscription exams for student.',
            });
            continue;
          }

          for (const examId of examIds) {
            try {
              if (!planMap.has(examId)) {
                enrollErrors.push({
                  studentId,
                  email,
                  examId,
                  code: 'EXAM_NOT_IN_PLAN',
                  message: 'Exam is not on this student subscription plan.',
                });
                continue;
              }
              const meta = planMap.get(examId);
              const result = await orgAssignExamEnrollment({
                studentId,
                examId,
                orgId,
                subscriptionId: meta?.subscriptionId ?? null,
                reviewerOrgUserId,
              });

              if (!result.ok) {
                enrollErrors.push({
                  studentId,
                  email,
                  examId,
                  code: result.code || 'ENROLLMENT_FAILED',
                  message: 'Could not enroll student in exam.',
                });
                continue;
              }

              enrollResults.push({
                studentId,
                email,
                fullName,
                examId,
                noop: !!result.noop,
                status: result.enrollment?.Status ?? null,
                enrollmentId: result.enrollment?.EnrollmentID ?? null,
              });
            } catch (e) {
              enrollErrors.push({
                studentId,
                email,
                examId,
                code: 'ERROR',
                message: e.message || 'Unexpected enrollment error',
              });
            }
          }
        }

        const examIdsForNames = [
          ...new Set(
            [...enrollErrors, ...enrollResults].map((r) => r.examId).filter(Boolean)
          ),
        ];
        let examNameById = new Map();
        if (examIdsForNames.length > 0) {
          const { data: examNameRows } = await supabase
            .from('Exams')
            .select('ExamID, ExamName')
            .in('ExamID', examIdsForNames);
          examNameById = new Map(
            (examNameRows || []).map((e) => [e.ExamID, e.ExamName || 'Exam'])
          );
        }

        const withExamNames = (row) => ({
          ...row,
          examName: row.examId ? examNameById.get(row.examId) || 'Exam' : null,
        });

        enrollment = {
          examIds,
          applied: enrollResults.length,
          skippedOrFailed: enrollErrors.length,
          results: enrollResults.map(withExamNames),
          errors: enrollErrors.map((err) => {
            const code = err.code || 'ENROLLMENT_FAILED';
            let help = err.message || 'Enrollment could not be completed.';
            if (code === 'EXAM_NOT_IN_PLAN') {
              help = 'This exam is not included in the subscription plan linked to this student.';
            } else if (code === 'PLAN_LOOKUP_FAILED') {
              help = 'Could not verify subscription coverage for this student.';
            } else if (code === 'ENROLLMENT_FAILED') {
              help = 'Enrollment was not applied. Check Settings → Enrollment approval rules or Exam enrollments.';
            }
            return { ...withExamNames(err), help };
          }),
        };
      }

      res.json({
        message: 'Bulk registration completed',
        summary: {
          ...results,
          rowsReceived: students.length,
          successful: results.created,
          failed: results.errors.length,
          createdStudents: createdStudents.map((c) => ({
            studentId: c.studentId,
            email: c.email,
            fullName: c.fullName,
          })),
        },
        enrollment,
      });
    } catch (error) {
      console.error('Bulk register students error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/org/students
 * Get all students for the organization (OrgAdmin only)
 */
router.get(
  '/',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { page = 1, limit = 20, search = '' } = req.query;

    try {
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      let query = supabase
        .from('Students')
        .select('*', { count: 'exact' })
        .eq('OrgID', orgId);

      if (search) {
        query = query.or(
          `FullName.ilike.%${search}%,Email.ilike.%${search}%,IdentityNo.ilike.%${search}%`
        );
      }

      const { data: students, error, count } = await query
        .order('CreatedAt', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) {
        console.error('Error fetching students:', error);
        return res.status(500).json({ error: 'Failed to fetch students', details: error.message });
      }

      res.json({
        students: students || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
        },
      });
    } catch (error) {
      console.error('List students error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/org/students/exam-enrollments/bulk-assign
 * Approve / activate enrollment for many students × many exams (Cartesian product).
 * Each pair must belong to the org and the exam must be on that student's active subscription plan.
 */
router.post(
  '/exam-enrollments/bulk-assign',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId, orgUserId, userId } = req.user;
    const reviewerOrgUserId = orgUserId ?? userId ?? null;

    const rawStudentIds = req.body?.studentIds;
    const rawExamIds = req.body?.examIds;
    const studentIds = Array.isArray(rawStudentIds)
      ? [...new Set(rawStudentIds.map((id) => String(id).trim()).filter(Boolean))]
      : [];
    const examIds = Array.isArray(rawExamIds)
      ? [...new Set(rawExamIds.map((id) => String(id).trim()).filter(Boolean))]
      : [];

    const MAX_STUDENTS = 120;
    const MAX_EXAMS = 40;
    const MAX_PAIRS = 1500;

    if (studentIds.length === 0 || examIds.length === 0) {
      return res.status(400).json({
        error: 'Provide non-empty studentIds and examIds arrays.',
        code: 'INVALID_PAYLOAD',
      });
    }
    if (studentIds.length > MAX_STUDENTS) {
      return res.status(400).json({
        error: `Too many students (max ${MAX_STUDENTS} per request). Split into smaller batches.`,
        code: 'LIMIT_STUDENTS',
      });
    }
    if (examIds.length > MAX_EXAMS) {
      return res.status(400).json({
        error: `Too many exams (max ${MAX_EXAMS} per request).`,
        code: 'LIMIT_EXAMS',
      });
    }
    if (studentIds.length * examIds.length > MAX_PAIRS) {
      return res.status(400).json({
        error: `Too many student–exam pairs (max ${MAX_PAIRS}). Reduce selection or split batches.`,
        code: 'LIMIT_PAIRS',
      });
    }

    try {
      const results = [];
      const errors = [];

      for (const studentId of studentIds) {
        const { data: student, error: stErr } = await supabase
          .from('Students')
          .select('StudentID')
          .eq('OrgID', orgId)
          .eq('StudentID', studentId)
          .maybeSingle();

        if (stErr || !student) {
          errors.push({
            studentId,
            examId: null,
            code: 'STUDENT_NOT_FOUND',
            message: 'Student not found in this organization.',
          });
          continue;
        }

        let planMap;
        try {
          planMap = await buildPlanExamEligibilityMap(studentId, null, orgId);
        } catch (e) {
          errors.push({
            studentId,
            examId: null,
            code: 'PLAN_LOOKUP_FAILED',
            message: e.message || 'Could not load subscription exams for student.',
          });
          continue;
        }

        for (const examId of examIds) {
          try {
            if (!planMap.has(examId)) {
              errors.push({
                studentId,
                examId,
                code: 'EXAM_NOT_IN_PLAN',
                message: "Exam is not on this student's active subscription.",
              });
              continue;
            }
            const meta = planMap.get(examId);
            const result = await orgAssignExamEnrollment({
              studentId,
              examId,
              orgId,
              subscriptionId: meta?.subscriptionId ?? null,
              reviewerOrgUserId,
            });

            if (!result.ok) {
              errors.push({
                studentId,
                examId,
                code: result.code || 'ACTIVATION_FAILED',
                message: 'Could not update enrollment.',
              });
              continue;
            }

            results.push({
              studentId,
              examId,
              noop: !!result.noop,
              enrollmentId: result.enrollment?.EnrollmentID ?? null,
              status: result.enrollment?.Status ?? null,
            });
          } catch (e) {
            errors.push({
              studentId,
              examId,
              code: 'ERROR',
              message: e.message || 'Unexpected error',
            });
          }
        }
      }

      res.json({
        message: `Applied ${results.length} enrollment update(s); ${errors.length} skipped or failed.`,
        applied: results.length,
        skippedOrFailed: errors.length,
        results,
        errors,
      });
    } catch (error) {
      console.error('Bulk exam enrollment assign error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/org/students/exam-enrollments/bulk-students
 * Candidate students for selected exams (excludes already-active access for all selected exams).
 * Used by Bulk assign UI so admins only see students who still need enrollment action.
 */
router.get(
  '/exam-enrollments/bulk-students',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    try {
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const limit = Math.min(100, Math.max(5, parseInt(String(req.query.limit || '40'), 10) || 40));
      const rawSearch =
        req.query.search != null
          ? String(req.query.search).trim().slice(0, 120).replace(/%/g, '').replace(/,/g, '')
          : '';
      const rawExamIds = req.query.examIds != null ? String(req.query.examIds) : '';
      const examIds = [...new Set(rawExamIds.split(',').map((x) => x.trim()).filter(Boolean))];

      if (examIds.length === 0) {
        return res.status(400).json({
          error: 'examIds query is required (comma-separated list).',
          code: 'EXAM_IDS_REQUIRED',
        });
      }

      let countQ = supabase.from('Students').select('*', { count: 'exact', head: true }).eq('OrgID', orgId);
      if (rawSearch) {
        const like = `%${rawSearch}%`;
        countQ = countQ.or(`FullName.ilike.${like},Email.ilike.${like}`);
      }
      const { count: totalStudentsRaw, error: cErr } = await countQ;
      if (cErr) throw cErr;
      const totalStudents = typeof totalStudentsRaw === 'number' ? totalStudentsRaw : 0;

      const from = (page - 1) * limit;
      let listQ = supabase
        .from('Students')
        .select('StudentID, FullName, Email')
        .eq('OrgID', orgId)
        .order('FullName', { ascending: true });
      if (rawSearch) {
        const like = `%${rawSearch}%`;
        listQ = listQ.or(`FullName.ilike.${like},Email.ilike.${like}`);
      }
      const { data: studentsPage, error: stErr } = await listQ.range(from, from + limit - 1);
      if (stErr) throw stErr;
      const students = studentsPage || [];

      const out = [];
      if (students.length > 0) {
        // Org context uses the same active organization subscription set for all students in this page.
        const orgPlanMap = await buildPlanExamEligibilityMap(null, null, orgId);
        const relevantExamIds = examIds.filter((eid) => orgPlanMap.has(eid));
        if (relevantExamIds.length > 0) {
          const studentIds = students.map((s) => s.StudentID).filter(Boolean);
          const { data: enrollRows, error: enErr } = await supabase
            .from('StudentExamEnrollments')
            .select('StudentID, ExamID, Status')
            .eq('OrgID', orgId)
            .in('StudentID', studentIds)
            .in('ExamID', relevantExamIds);
          if (enErr) throw enErr;

          const statusByStudentExam = new Map();
          for (const row of enrollRows || []) {
            statusByStudentExam.set(`${row.StudentID}::${row.ExamID}`, row.Status ?? null);
          }

          for (const s of students) {
            // Keep student visible if at least one selected exam still needs an enrollment action.
            let needsAny = false;
            for (const examId of relevantExamIds) {
              const status = statusByStudentExam.get(`${s.StudentID}::${examId}`);
              const isActive = status == null || enrollmentRecordAllowsExamAccess(status);
              if (!isActive) {
                needsAny = true;
                break;
              }
            }
            if (!needsAny) continue;

            out.push({
              studentId: s.StudentID,
              fullName: s.FullName ?? null,
              email: s.Email ?? null,
              relevantExamCount: relevantExamIds.length,
            });
          }
        }
      }

      res.json({
        students: out,
        pagination: {
          page,
          limit,
          totalStudents,
          totalStudentPages: totalStudents === 0 ? 0 : Math.ceil(totalStudents / limit),
          shownCandidates: out.length,
        },
      });
    } catch (error) {
      console.error('Bulk students candidate list error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/org/students/exam-enrollments/pending-requests
 * Org-wide Pending enrollment rows (student-initiated or awaiting approval).
 */
router.get(
  '/exam-enrollments/pending-requests',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    try {
      const { data: pendingRows, error: penErr } = await supabase
        .from('StudentExamEnrollments')
        .select('*')
        .eq('OrgID', orgId)
        .eq('Status', 'Pending')
        .order('RequestedAt', { ascending: false })
        .limit(300);

      if (penErr) throw penErr;

      const rows = pendingRows || [];
      const sidSet = [...new Set(rows.map((r) => r.StudentID).filter(Boolean))];
      const eidSet = [...new Set(rows.map((r) => r.ExamID).filter(Boolean))];

      const [{ data: studs }, { data: exams }] = await Promise.all([
        sidSet.length
          ? supabase.from('Students').select('StudentID, FullName, Email').eq('OrgID', orgId).in('StudentID', sidSet)
          : Promise.resolve({ data: [] }),
        eidSet.length
          ? supabase.from('Exams').select('ExamID, ExamName').in('ExamID', eidSet)
          : Promise.resolve({ data: [] }),
      ]);

      const studentById = new Map((studs || []).map((s) => [s.StudentID, s]));
      const examById = new Map((exams || []).map((e) => [e.ExamID, e]));

      const requests = rows.map((r) => ({
        enrollmentId: r.EnrollmentID,
        studentId: r.StudentID,
        examId: r.ExamID,
        requestedAt: r.RequestedAt,
        source: r.Source,
        requestedByType: r.RequestedByType,
        subscriptionId: r.SubscriptionID,
        studentName: studentById.get(r.StudentID)?.FullName ?? null,
        studentEmail: studentById.get(r.StudentID)?.Email ?? null,
        examName: examById.get(r.ExamID)?.ExamName ?? null,
      }));

      res.json({ requests });
    } catch (error) {
      console.error('List pending exam enrollment requests error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);


/**
 * GET /api/org/students/exam-enrollments/directory
 * Student-batch roster: every subscription-eligible student × exam for this page of students, merged with DB enrollment rows.
 * Rows without an enrollment record are "Implicit" (subscription-only access). Orphan enrollment rows (exam no longer on plan) are included.
 */
router.get(
  '/exam-enrollments/directory',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    try {
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const studentBatchLimit = Math.min(40, Math.max(5, parseInt(String(req.query.limit || '25'), 10) || 25));
      const rawSearch =
        req.query.search != null
          ? String(req.query.search).trim().slice(0, 120).replace(/%/g, '').replace(/,/g, '')
          : '';
      const statusParam = req.query.status != null ? String(req.query.status).trim() : '';
      const statusFilter = DIRECTORY_STATUS_VALUES.includes(statusParam) ? statusParam : null;
      const rawExamId =
        req.query.examId != null ? String(req.query.examId).trim().slice(0, 80) : '';
      const examIdFilter =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawExamId)
          ? rawExamId
          : null;
      const rawFromTs = req.query.fromTs != null ? String(req.query.fromTs).trim() : '';
      const rawToTs = req.query.toTs != null ? String(req.query.toTs).trim() : '';
      const fromTs = rawFromTs ? new Date(rawFromTs) : null;
      const toTs = rawToTs ? new Date(rawToTs) : null;
      const fromMs = fromTs && !Number.isNaN(fromTs.getTime()) ? fromTs.getTime() : null;
      const toMs = toTs && !Number.isNaN(toTs.getTime()) ? toTs.getTime() : null;

      const like = rawSearch ? `%${rawSearch}%` : null;

      let countQ = supabase.from('Students').select('*', { count: 'exact', head: true }).eq('OrgID', orgId);
      if (like) {
        countQ = countQ.or(`FullName.ilike.${like},Email.ilike.${like}`);
      }
      const { count: totalStudentsRaw, error: cErr } = await countQ;
      if (cErr) throw cErr;
      const totalStudents = typeof totalStudentsRaw === 'number' ? totalStudentsRaw : 0;

      const from = (page - 1) * studentBatchLimit;
      let listQ = supabase
        .from('Students')
        .select('StudentID, FullName, Email')
        .eq('OrgID', orgId)
        .order('FullName', { ascending: true });
      if (like) {
        listQ = listQ.or(`FullName.ilike.${like},Email.ilike.${like}`);
      }
      const { data: studentsPage, error: lpErr } = await listQ.range(from, from + studentBatchLimit - 1);
      if (lpErr) throw lpErr;

      if (!studentsPage || studentsPage.length === 0) {
        return res.json({
          rows: [],
          pagination: {
            page,
            limit: studentBatchLimit,
            totalStudents,
            totalStudentPages: totalStudents === 0 ? 0 : Math.ceil(totalStudents / studentBatchLimit),
            rowCount: 0,
          },
        });
      }

      const studentIds = studentsPage.map((s) => s.StudentID);

      const { data: enrollRows, error: enErr } = await supabase
        .from('StudentExamEnrollments')
        .select(
          [
            'EnrollmentID',
            'StudentID',
            'ExamID',
            'OrgID',
            'SubscriptionID',
            'Status',
            'Source',
            'RequestedByType',
            'RequestedAt',
            'ReviewedBy',
            'ReviewedAt',
            'ReviewNote',
            'ApprovedAt',
            'WithdrawnAt',
            'WithdrawalInitiatedBy',
            'WithdrawalActorUserID',
            'WithdrawalReason',
            'CreatedAt',
            'UpdatedAt',
          ].join(',')
        )
        .eq('OrgID', orgId)
        .in('StudentID', studentIds);
      if (enErr) throw enErr;

      const enrollMap = new Map();
      const enrollByStudent = new Map();
      for (const r of enrollRows || []) {
        enrollMap.set(`${r.StudentID}:${r.ExamID}`, r);
        if (!enrollByStudent.has(r.StudentID)) enrollByStudent.set(r.StudentID, []);
        enrollByStudent.get(r.StudentID).push(r);
      }

      const planMaps = await Promise.all(
        studentsPage.map(async (s) => ({
          student: s,
          planMap: await buildPlanExamEligibilityMap(s.StudentID, null, orgId),
        }))
      );

      const allExamIds = new Set();
      for (const r of enrollRows || []) {
        if (!examIdFilter || r.ExamID === examIdFilter) allExamIds.add(r.ExamID);
      }
      for (const { planMap } of planMaps) {
        for (const id of planMap.keys()) {
          if (!examIdFilter || id === examIdFilter) allExamIds.add(id);
        }
      }

      const examIdsArr = [...allExamIds];
      const { data: exams } =
        examIdsArr.length > 0
          ? await supabase.from('Exams').select('ExamID, ExamName').in('ExamID', examIdsArr)
          : { data: [] };
      const examById = new Map((exams || []).map((e) => [e.ExamID, e]));

      const reviewedByIds = [
        ...new Set(
          (enrollRows || [])
            .map((r) => r.ReviewedBy)
            .filter(Boolean)
        ),
      ];
      const { data: orgUsers } =
        reviewedByIds.length > 0
          ? await supabase
              .from('OrgUsers')
              .select('OrgUserID, FullName, Email')
              .eq('OrgID', orgId)
              .in('OrgUserID', reviewedByIds)
          : { data: [] };
      const orgUserById = new Map((orgUsers || []).map((u) => [u.OrgUserID, u]));

      const matchesStatusFilter = (dto) => {
        if (!statusFilter) return true;
        if (statusFilter === 'Implicit') return dto.isImplicit === true;
        return dto.status === statusFilter;
      };
      const rowPrimaryTimestamp = (dto) =>
        dto.updatedAt || dto.createdAt || dto.requestedAt || dto.reviewedAt || dto.approvedAt || dto.withdrawnAt || null;
      const matchesDateTimeFilter = (dto) => {
        if (fromMs == null && toMs == null) return true;
        const iso = rowPrimaryTimestamp(dto);
        if (!iso) return false;
        const ts = new Date(iso).getTime();
        if (Number.isNaN(ts)) return false;
        if (fromMs != null && ts < fromMs) return false;
        if (toMs != null && ts > toMs) return false;
        return true;
      };

      const merged = [];

      for (const { student, planMap } of planMaps) {
        let examIds = [...planMap.keys()];
        if (examIdFilter) examIds = examIds.filter((id) => id === examIdFilter);
        examIds.sort((a, b) =>
          String(examById.get(a)?.ExamName || a).localeCompare(String(examById.get(b)?.ExamName || b))
        );

        const seenExamIds = new Set();

        const sn = student.FullName ?? null;
        const se = student.Email ?? null;

        for (const examId of examIds) {
          seenExamIds.add(examId);
          const existing = enrollMap.get(`${student.StudentID}:${examId}`);
          const en = examById.get(examId)?.ExamName ?? null;
          if (existing) {
            const dto = directoryDtoFromEnrollmentRecord(existing, sn, se, en, orgUserById);
            if (matchesStatusFilter(dto) && matchesDateTimeFilter(dto)) merged.push(dto);
          } else {
            const dto = {
              enrollmentId: null,
              isImplicit: true,
              studentId: student.StudentID,
              examId,
              subscriptionId: planMap.get(examId)?.subscriptionId ?? null,
              status: 'Implicit',
              source: null,
              requestedByType: null,
              requestedById: null,
              requestedAt: null,
              reviewedBy: null,
              reviewedAt: null,
              reviewNote: null,
              approvedAt: null,
              withdrawnAt: null,
              withdrawalInitiatedBy: null,
              withdrawalActorUserId: null,
              withdrawalReason: null,
              createdAt: null,
              updatedAt: null,
              studentName: sn,
              studentEmail: se,
              examName: en,
            };
            if (matchesStatusFilter(dto) && matchesDateTimeFilter(dto)) merged.push(dto);
          }
        }

        for (const r of enrollByStudent.get(student.StudentID) || []) {
          if (seenExamIds.has(r.ExamID)) continue;
          if (examIdFilter && r.ExamID !== examIdFilter) continue;
          const en = examById.get(r.ExamID)?.ExamName ?? null;
          const dto = directoryDtoFromEnrollmentRecord(r, sn, se, en, orgUserById);
          if (matchesStatusFilter(dto) && matchesDateTimeFilter(dto)) merged.push(dto);
        }
      }

      merged.sort((a, b) => {
        const n = String(a.studentName || '').localeCompare(String(b.studentName || ''));
        if (n !== 0) return n;
        return String(a.examName || '').localeCompare(String(b.examName || ''));
      });

      res.json({
        rows: merged,
        pagination: {
          page,
          limit: studentBatchLimit,
          totalStudents,
          totalStudentPages: totalStudents === 0 ? 0 : Math.ceil(totalStudents / studentBatchLimit),
          rowCount: merged.length,
        },
      });
    } catch (error) {
      console.error('Exam enrollment directory error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/org/students/:studentId/exam-enrollments
 */
router.get(
  '/:studentId/exam-enrollments',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { studentId } = req.params;

    try {
      const { data: student, error } = await supabase
        .from('Students')
        .select('StudentID')
        .eq('OrgID', orgId)
        .eq('StudentID', studentId)
        .maybeSingle();

      if (error || !student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const payload = await buildStudentExamEnrollmentListPayload(studentId, orgId);
      res.json(payload);
    } catch (error) {
      console.error('Org list exam enrollments error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/org/students/:studentId/exam-enrollments/:examId/withdraw
 */
router.post(
  '/:studentId/exam-enrollments/:examId/withdraw',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId, orgUserId, userId } = req.user;
    const { studentId, examId: rawExamId } = req.params;
    const examId = rawExamId != null ? String(rawExamId).trim() : null;

    try {
      const { data: student, error } = await supabase
        .from('Students')
        .select('StudentID')
        .eq('OrgID', orgId)
        .eq('StudentID', studentId)
        .maybeSingle();

      if (error || !student) {
        return res.status(404).json({ error: 'Student not found' });
      }
      if (!examId) return res.status(400).json({ error: 'Exam ID is required' });

      const planMap = await buildPlanExamEligibilityMap(studentId, null, orgId);
      if (!planMap.has(examId)) {
        return res.status(400).json({
          error: 'This exam is not included in the organization subscription for this student.',
          code: 'EXAM_NOT_IN_PLAN',
        });
      }
      const meta = planMap.get(examId);
      const actorUserId = orgUserId ?? userId ?? null;
      const reason = req.body?.reason != null ? String(req.body.reason).slice(0, 2000) : null;

      const result = await upsertStudentExamWithdrawal({
        studentId,
        examId,
        orgId,
        subscriptionId: meta?.subscriptionId ?? null,
        initiatedBy: 'OrgAdmin',
        actorUserId,
        reason,
      });

      if (!result.ok && result.code === 'ALREADY_WITHDRAWN') {
        return res.status(409).json({
          error: 'Student already withdrew from this exam.',
          enrollment: result.enrollment,
          code: 'ALREADY_WITHDRAWN',
        });
      }

      res.json({
        message: 'Student marked as withdrawn from this exam (record retained).',
        enrollment: result.enrollment,
      });
    } catch (error) {
      console.error('Org withdraw exam enrollment error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/org/students/:studentId/exam-enrollments/:examId/activate
 */
router.post(
  '/:studentId/exam-enrollments/:examId/activate',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { studentId, examId: rawExamId } = req.params;
    const examId = rawExamId != null ? String(rawExamId).trim() : null;

    try {
      const { data: student, error } = await supabase
        .from('Students')
        .select('StudentID')
        .eq('OrgID', orgId)
        .eq('StudentID', studentId)
        .maybeSingle();

      if (error || !student) {
        return res.status(404).json({ error: 'Student not found' });
      }
      if (!examId) return res.status(400).json({ error: 'Exam ID is required' });

      const planMap = await buildPlanExamEligibilityMap(studentId, null, orgId);
      if (!planMap.has(examId)) {
        return res.status(400).json({
          error: 'This exam is not included in the organization subscription for this student.',
          code: 'EXAM_NOT_IN_PLAN',
        });
      }
      const meta = planMap.get(examId);

      const { orgUserId, userId } = req.user;
      const reviewerOrgUserId = orgUserId ?? userId ?? null;
      const result = await orgAssignExamEnrollment({
        studentId,
        examId,
        orgId,
        subscriptionId: meta?.subscriptionId ?? null,
        reviewerOrgUserId,
      });

      const afterStatus = String(result?.enrollment?.Status || '').trim().toLowerCase();
      const approvedByAdmin = !result?.noop && afterStatus === 'approved';
      if (approvedByAdmin) {
        try {
          const { data: examRow } = await supabase
            .from('Exams')
            .select('ExamName')
            .eq('ExamID', examId)
            .maybeSingle();
          const examName = examRow?.ExamName || 'your exam';
          await createNotification({
            entityType: 'Student',
            entityID: studentId,
            title: 'Exam request approved',
            message: `Your request for ${examName} has been approved by your organization admin. You can now access this exam.`,
            notificationType: 'Exam',
          });
        } catch (notifyErr) {
          console.warn('Failed to create student approval notification:', notifyErr?.message || notifyErr);
        }
      }

      const resultStatus = String(result?.enrollment?.Status || '').trim().toLowerCase();
      let message = result.noop
        ? 'Student already active for this exam.'
        : 'Student re-enrolled in this exam.';
      if (!result.noop && resultStatus === 'pending') {
        message =
          'Enrollment saved as Pending. Approve it under Exam enrollments when you are ready.';
      }

      res.json({
        message,
        enrollment: result.enrollment,
        noop: !!result.noop,
      });
    } catch (error) {
      console.error('Org activate exam enrollment error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/org/students/:studentId/exam-enrollments/:examId/reject
 * Org declines a pending student request (optional note shown to student contexts).
 */
router.post(
  '/:studentId/exam-enrollments/:examId/reject',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId, orgUserId, userId } = req.user;
    const { studentId, examId: rawExamId } = req.params;
    const examId = rawExamId != null ? String(rawExamId).trim() : null;

    try {
      const { data: student, error } = await supabase
        .from('Students')
        .select('StudentID')
        .eq('OrgID', orgId)
        .eq('StudentID', studentId)
        .maybeSingle();

      if (error || !student) {
        return res.status(404).json({ error: 'Student not found' });
      }
      if (!examId) return res.status(400).json({ error: 'Exam ID is required' });

      const planMap = await buildPlanExamEligibilityMap(studentId, null, orgId);
      if (!planMap.has(examId)) {
        return res.status(400).json({
          error: 'This exam is not included in the organization subscription for this student.',
          code: 'EXAM_NOT_IN_PLAN',
        });
      }

      const reviewerOrgUserId = orgUserId ?? userId ?? null;
      const reviewNote =
        req.body?.reviewNote != null ? String(req.body.reviewNote).slice(0, 4000) : null;

      const result = await orgRejectStudentExamEnrollment({
        studentId,
        examId,
        orgId,
        reviewerOrgUserId,
        reviewNote,
      });

      if (!result.ok && result.code === 'NO_ROW') {
        return res.status(404).json({ error: 'Enrollment not found for this exam.', code: 'NO_ROW' });
      }

      if (!result.ok && result.code === 'NOT_PENDING') {
        return res.status(409).json({
          error: 'Only a pending enrollment request can be rejected.',
          code: 'NOT_PENDING',
          enrollment: result.enrollment,
        });
      }

      try {
        const { data: examRow } = await supabase
          .from('Exams')
          .select('ExamName')
          .eq('ExamID', examId)
          .maybeSingle();
        const examName = examRow?.ExamName || 'your exam';
        const noteSuffix = reviewNote ? ` Note: ${reviewNote}` : '';
        await createNotification({
          entityType: 'Student',
          entityID: studentId,
          title: 'Exam request rejected',
          message: `Your request for ${examName} was not approved by your organization admin.${noteSuffix}`,
          notificationType: 'Exam',
        });
      } catch (notifyErr) {
        console.warn('Failed to create student rejection notification:', notifyErr?.message || notifyErr);
      }

      res.json({
        message: 'Enrollment request was rejected.',
        enrollment: result.enrollment,
      });
    } catch (error) {
      console.error('Org reject exam enrollment error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/org/students/:studentId
 * Get single student details (OrgAdmin only)
 */
router.get(
  '/:studentId',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { studentId } = req.params;

    try {
      const { data: student, error } = await supabase
        .from('Students')
        .select('*')
        .eq('OrgID', orgId)
        .eq('StudentID', studentId)
        .single();

      if (error) {
        console.error('Error fetching student:', error);
        return res.status(404).json({ error: 'Student not found' });
      }

      res.json({ student });
    } catch (error) {
      console.error('Get student details error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * PUT /api/org/students/:studentId
 * Update student (OrgAdmin only)
 */
router.put(
  '/:studentId',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { studentId } = req.params;
    const {
      fullName,
      email,
      password,
      identityNo,
      fatherName,
      gender,
      dateOfBirth,
      address,
      phone,
      status,
    } = req.body;

    try {
      const updateData = {};

      if (fullName !== undefined) updateData.FullName = fullName;
      if (email !== undefined) updateData.Email = email;
      if (identityNo !== undefined) updateData.IdentityNo = identityNo;
      if (fatherName !== undefined) updateData.FatherName = fatherName;
      if (gender !== undefined) updateData.Gender = gender;
      if (dateOfBirth !== undefined) updateData.DateOfBirth = dateOfBirth;
      if (address !== undefined) updateData.Address = address;
      if (phone !== undefined) updateData.Phone = phone;
      if (status !== undefined) updateData.Status = status;

      if (password && password.trim().length > 0) {
        updateData.PasswordHash = await hashPassword(password.trim());
      }

      const { data: updated, error } = await supabase
        .from('Students')
        .update(updateData)
        .eq('OrgID', orgId)
        .eq('StudentID', studentId)
        .select()
        .single();

      if (error) {
        console.error('Error updating student:', error);
        return res.status(500).json({ error: 'Failed to update student', details: error.message });
      }

      res.json({
        message: 'Student updated successfully',
        student: updated,
      });
    } catch (error) {
      console.error('Update student error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/org/students/:studentId
 * Delete student (OrgAdmin only)
 */
router.delete(
  '/:studentId',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgId } = req.user;
    const { studentId } = req.params;

    try {
      const { error } = await supabase
        .from('Students')
        .delete()
        .eq('OrgID', orgId)
        .eq('StudentID', studentId);

      if (error) {
        console.error('Error deleting student:', error);
        return res.status(500).json({ error: 'Failed to delete student', details: error.message });
      }

      res.json({ message: 'Student deleted successfully' });
    } catch (error) {
      console.error('Delete student error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

export default router;
