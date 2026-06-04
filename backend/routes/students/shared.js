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

/** Supabase/PostgREST may return PascalCase or camelCase column keys depending on config. */
export function testNameFromRow(t) {
  if (!t) return null;
  return t.TestName ?? t.testName ?? null;
}

export function testIdFromRow(t) {
  if (!t) return null;
  return t.TestID ?? t.testId ?? null;
}

/** PostgREST may return OrgID or orgId. */
export function orgIdFromRow(t) {
  if (!t) return null;
  return t.OrgID ?? t.orgId ?? null;
}

export function testStatusFromRow(t) {
  if (!t) return null;
  return t.Status ?? t.status ?? null;
}

/** StudentAttempts has no Status column in schema — completion is indicated by EndTime. */
export function attemptCompletedFromRow(a) {
  if (!a) return false;
  const end = a.EndTime ?? a.endTime;
  return end != null && end !== '';
}

export function attemptStatusFromRow(a) {
  return attemptCompletedFromRow(a) ? 'Completed' : 'InProgress';
}

/** Normalize UUID / id strings for consistent Map/Set lookups (PostgREST casing varies). */
export function canonEntityId(id) {
  if (id == null || id === '') return null;
  return String(id).trim().toLowerCase();
}

/** Unwrap PostgREST embedded resource: object, single-element array, or null. */
export function unwrapEmbedded(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === 'object') return value;
  return null;
}

/** First non-empty column (PascalCase, camelCase, or snake_case from PostgREST / DB drivers). */
export function pickCol(row, keys) {
  if (row == null || typeof row !== 'object') return null;
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== '') return v;
  }
  return null;
}

/**
 * Tests.TotalMarks from the test definition (org wizard). PostgREST may return PascalCase or camelCase.
 * Use this instead of `test.TotalMarks || fallback` so camelCase `totalMarks` is not treated as missing.
 * Returns null when unset; 0 is valid.
 */
export function totalMarksConfiguredOnTest(test) {
  if (test == null || typeof test !== 'object') return null;
  const raw = pickCol(test, ['TotalMarks', 'totalMarks', 'total_marks']);
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * PostgREST embed hint: Options.QuestionID → Questions (avoids "more than one relationship" when the schema
 * exposes multiple paths). If insert still fails, confirm name: SELECT conname FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'Options';
 */
export const PG_OPTIONS_BY_QUESTION_FK = 'Options!Options_QuestionID_fkey';

/** True if string looks like a UUID (for option keys / StudentAnswers.OptionID). */
export function isUuidLike(raw) {
  if (raw == null || raw === '') return false;
  const s = String(raw).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Legacy: integer option slot (Options.OptionNumber) from client or old rows.
 * Prefer UUID OptionID everywhere; this remains for backward-compatible submits.
 */
export function asAnswerOptionId(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const t = Math.trunc(raw);
    return Number.isSafeInteger(t) ? t : null;
  }
  const s = String(raw).trim();
  if (/^-?\d+$/.test(s)) {
    const t = parseInt(s, 10);
    return Number.isSafeInteger(t) ? t : null;
  }
  return null;
}

/** Canonical option row id for scoring / StudentAnswers (Options.OptionID uuid). */
export function canonOptionRowId(raw) {
  if (raw == null || raw === '') return null;
  return isUuidLike(raw) ? canonEntityId(raw) : null;
}

/**
 * Resolve one client selection to Options.OptionID (canonical lowercase uuid) for this question.
 * Accepts Options.OptionID (uuid string) or legacy OptionNumber (int).
 */
export function resolveSelectedOptionCanon(raw, opts) {
  if (raw == null || !Array.isArray(opts)) return null;
  const s = String(raw).trim();
  if (isUuidLike(s)) {
    const c = canonEntityId(s);
    for (const opt of opts) {
      const oid = pickCol(opt, ['OptionID', 'optionId', 'option_id']);
      if (oid != null && canonEntityId(oid) === c) return c;
    }
    return null;
  }
  const n = asAnswerOptionId(raw);
  if (n == null) return null;
  for (const opt of opts) {
    const num = Number(opt.OptionNumber ?? opt.optionNumber);
    if (Number.isFinite(num) && num === n) {
      const oid = pickCol(opt, ['OptionID', 'optionId', 'option_id']);
      return oid != null ? canonEntityId(oid) : null;
    }
  }
  return null;
}

/**
 * TestAssignments.Status from PostgREST (PascalCase or camelCase). Empty/null treated as Pending for legacy rows.
 */
export function assignmentWorkflowStatusRaw(row) {
  return pickCol(row, ['Status', 'status']);
}

export function assignmentRowAllowsStart(row) {
  const raw = assignmentWorkflowStatusRaw(row);
  if (raw == null || String(raw).trim() === '') return true;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  return s === 'pending' || s === 'inprogress';
}

/** Merge derived Status and max marks from Tests for API consumers (UI expects these fields). */
export function enrichAttemptDto(attempt, testTotalMarks) {
  if (!attempt) return null;
  const tm =
    testTotalMarks != null ? testTotalMarks : attempt.TotalMarks ?? attempt.totalMarks ?? null;
  const ord = pickCol(attempt, ['AttemptOrdinal', 'attemptOrdinal']);
  return {
    ...attempt,
    Status: attemptStatusFromRow(attempt),
    TotalMarks: tm != null ? tm : null,
    AttemptOrdinal: ord != null ? Number(ord) : null,
  };
}


export function requireStudentActor(req, res, next) {
  if (req.user?.actorType !== 'Student' || !req.user?.studentId) {
    return res.status(403).json({ error: 'Student access only' });
  }
  next();
}

export function isIndividualStudentUser(user) {
  if (!user || user.actorType !== 'Student' || !user.studentId) return false;
  const enrollmentType = String(user.enrollmentType ?? user.EnrollmentType ?? '').trim().toLowerCase();
  const orgId = user.orgId ?? user.OrgID ?? null;
  return enrollmentType === 'individual' || orgId == null || orgId === '';
}

export function requireIndividualStudent(req, res, next) {
  if (!isIndividualStudentUser(req.user)) {
    return res.status(403).json({
      error:
        'This feature is available for individual students only. Organization-enrolled students should use assigned tests.',
    });
  }
  next();
}

export async function getActiveStudentSubscriptions(studentId) {
  const { data, error } = await supabase
    .from('Subscriptions')
    .select('SubscriptionID, PlanID, Status, StartDate, EndDate')
    .eq('EntityType', 'Student')
    .eq('EntityID', studentId)
    .eq('Status', 'Active');
  if (error) throw error;
  const today = new Date();
  return (data || []).filter((sub) => {
    if (!sub.EndDate) return true;
    const end = new Date(sub.EndDate);
    return !Number.isNaN(end.getTime()) && end >= today;
  });
}

export async function getActiveSubscriptionsForStudentContext(studentId, orgId = null) {
  const q = supabase
    .from('Subscriptions')
    .select('SubscriptionID, PlanID, Status, StartDate, EndDate, EntityType, EntityID')
    .eq('Status', 'Active');

  if (orgId) {
    q.eq('EntityType', 'Organization').eq('EntityID', orgId);
  } else {
    q.eq('EntityType', 'Student').eq('EntityID', studentId);
  }

  const { data, error } = await q;
  if (error) throw error;
  const today = new Date();
  return (data || []).filter((sub) => {
    if (!sub.EndDate) return true;
    const end = new Date(sub.EndDate);
    return !Number.isNaN(end.getTime()) && end >= today;
  });
}

export function applyQuestionPoolScope(query, orgId = null) {
  if (orgId) return query.or(`OrgID.is.null,OrgID.eq.${orgId}`);
  return query.is('OrgID', null);
}

export function allocateQuestionsBySubject(subjects, requestedTotal) {
  const active = (subjects || []).filter((s) => Number(s.availableCount) > 0);
  const totalAvail = active.reduce((sum, s) => sum + Number(s.availableCount || 0), 0);
  if (active.length === 0 || totalAvail <= 0) {
    return { ok: false, reason: 'No verified question pool available for this exam.' };
  }
  const total = Math.max(1, Math.trunc(Number(requestedTotal) || 0));
  if (total > totalAvail) {
    return {
      ok: false,
      reason: `Only ${totalAvail} verified questions are currently available for this exam.`,
      maxAllowed: totalAvail,
    };
  }

  const base = active.map((s) => {
    const raw = (total * Number(s.availableCount || 0)) / totalAvail;
    return {
      ...s,
      requested: Math.min(Number(s.availableCount || 0), Math.floor(raw)),
      frac: raw - Math.floor(raw),
    };
  });

  let assigned = base.reduce((sum, s) => sum + s.requested, 0);
  let remaining = total - assigned;

  // Keep distribution fair: grant leftover questions by largest fractional remainder, respecting availability.
  const priority = [...base].sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (remaining > 0 && priority.length > 0) {
    const target = priority[i % priority.length];
    const canTake = target.requested < Number(target.availableCount || 0);
    if (canTake) {
      target.requested += 1;
      remaining -= 1;
    }
    i += 1;
    if (i > priority.length * 20) break;
  }

  assigned = priority.reduce((sum, s) => sum + s.requested, 0);
  if (assigned !== total) {
    return { ok: false, reason: 'Could not allocate requested questions across subject pools safely.' };
  }

  return {
    ok: true,
    allocated: priority
      .filter((s) => s.requested > 0)
      .map((s) => ({
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        questionCount: s.requested,
        availableCount: Number(s.availableCount || 0),
      }))
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
  };
}

/**
 * Exams granted by active subscription plan(s), before per-student enrollment filtering.
 */
export async function buildPlanExamEligibilityMap(studentId, allowedPlanIds = null, orgId = null) {
  const activeSubsAll = await getActiveSubscriptionsForStudentContext(studentId, orgId);
  const allowedSet = Array.isArray(allowedPlanIds) ? new Set(allowedPlanIds.filter(Boolean)) : null;
  const activeSubs = allowedSet
    ? activeSubsAll.filter((s) => allowedSet.has(s.PlanID))
    : activeSubsAll;
  if (activeSubs.length === 0) return new Map();

  const planIds = [...new Set(activeSubs.map((s) => s.PlanID).filter(Boolean))];
  if (planIds.length === 0) return new Map();

  const { data: planExams, error: peErr } = await supabase
    .from('SubscriptionPlanExams')
    .select('PlanID, ExamID, MaxQuestionsPerTest')
    .in('PlanID', planIds);
  if (peErr) throw peErr;

  const out = new Map();
  for (const row of planExams || []) {
    const examId = row.ExamID;
    if (!examId) continue;
    const prior = out.get(examId);
    if (!prior) {
      out.set(examId, {
        examId,
        maxQuestionsPerTest: row.MaxQuestionsPerTest ?? null,
        subscriptionId: activeSubs.find((s) => s.PlanID === row.PlanID)?.SubscriptionID ?? null,
      });
    } else if (
      row.MaxQuestionsPerTest != null &&
      (prior.maxQuestionsPerTest == null || Number(row.MaxQuestionsPerTest) < Number(prior.maxQuestionsPerTest))
    ) {
      prior.maxQuestionsPerTest = Number(row.MaxQuestionsPerTest);
    }
  }
  return out;
}

/** Canonical DB enum + legacy text Active (pre-migration). */
export function enrollmentRecordAllowsExamAccess(statusRaw) {
  const s = String(statusRaw ?? '').trim();
  if (!s) return true;
  const u = s.toLowerCase();
  return u === 'approved' || u === 'active';
}

export function enrollmentStatusHint(statusRaw) {
  const s = String(statusRaw ?? '').trim();
  if (!s) return null;
  const hints = {
    Pending: 'Awaiting approval from your organization.',
    Rejected: 'Your organization did not approve access for this exam.',
    Withdrawn: 'You left this exam (or were withdrawn). Request access — your school must approve.',
    Suspended: 'Access is paused. Contact your organization or submit a request if shown.',
    Approved: null,
    Active: null,
  };
  return hints[s] ?? hints[s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()] ?? null;
}

/** Admin-facing guidance when reviewing enrollments (not shown on student dashboard). */
export function enrollmentStatusHintOrg(hasEnrollmentRow, statusRaw) {
  if (!hasEnrollmentRow) {
    return 'Subscription-only access: no enrollment row. Student keeps normal plan access until you withdraw.';
  }
  const s = String(statusRaw ?? '').trim();
  const hints = {
    Pending:
      'Awaiting your approval — student cannot take this exam until approved in Pending requests.',
    Rejected:
      'Rejected — blocked until the student submits a new request (Pending) or you restore access.',
    Withdrawn:
      'Withdrawn — blocked until the student submits a Pending request or you use Approve / enroll.',
    Suspended:
      'Suspended — blocked until you approve/enroll or the student submits a Pending request when applicable.',
    Approved: null,
    Active: null,
  };
  return hints[s] ?? hints[s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()] ?? null;
}

/**
 * Organization-enrolled students only: enrollment rows are scoped by OrgID.
 * Individual learners skip this gate (subscription/plan eligibility only).
 */
export async function applyStudentEnrollmentGate(studentId, examMap, orgId = null) {
  if (!examMap || examMap.size === 0) return;
  const oid = normalizeOrgIdForEnrollment(orgId);
  if (!oid) return;
  const ids = [...examMap.keys()];
  const { data, error } = await supabase
    .from('StudentExamEnrollments')
    .select('ExamID, Status')
    .eq('StudentID', studentId)
    .eq('OrgID', oid)
    .in('ExamID', ids);
  if (error) throw error;
  for (const row of data || []) {
    if (!enrollmentRecordAllowsExamAccess(row.Status)) examMap.delete(row.ExamID);
  }
}

export async function getEligibleStudentExamMap(studentId, allowedPlanIds = null, orgId = null) {
  const out = await buildPlanExamEligibilityMap(studentId, allowedPlanIds, orgId);
  await applyStudentEnrollmentGate(studentId, out, orgId);
  return out;
}

export async function getStudentEnrollmentBlockedExamIdsSet(studentId, examIds, orgId = null) {
  const oid = normalizeOrgIdForEnrollment(orgId);
  if (!oid) return new Set();
  const ids = [...new Set((examIds || []).filter(Boolean))];
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from('StudentExamEnrollments')
    .select('ExamID, Status')
    .eq('StudentID', studentId)
    .eq('OrgID', oid)
    .in('ExamID', ids);
  if (error) throw error;
  const blocked = new Set();
  for (const row of data || []) {
    if (!enrollmentRecordAllowsExamAccess(row.Status)) blocked.add(row.ExamID);
  }
  return blocked;
}

export async function isStudentExamAccessAllowed(studentId, examId, orgId = null) {
  if (!examId) return true;
  const oid = normalizeOrgIdForEnrollment(orgId);
  if (!oid) return true;
  const { data, error } = await supabase
    .from('StudentExamEnrollments')
    .select('Status')
    .eq('StudentID', studentId)
    .eq('ExamID', examId)
    .eq('OrgID', oid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return true;
  return enrollmentRecordAllowsExamAccess(data.Status);
}

export function normalizeOrgIdForEnrollment(orgId) {
  if (orgId == null || orgId === '') return null;
  return String(orgId);
}

export async function upsertStudentExamWithdrawal({
  studentId,
  examId,
  orgId,
  subscriptionId,
  initiatedBy,
  actorUserId,
  reason,
}) {
  const nowIso = new Date().toISOString();
  const orgStored = normalizeOrgIdForEnrollment(orgId);
  if (!orgStored) {
    throw new Error('OrgID is required for exam enrollment updates');
  }

  const sourceRow =
    initiatedBy === 'Student' ? 'StudentRequest' : 'DirectAssign';
  const requestedByTypeRow =
    initiatedBy === 'Student' ? 'Student' : 'OrgAdmin';

  const { data: existing, error: exErr } = await supabase
    .from('StudentExamEnrollments')
    .select('*')
    .eq('StudentID', studentId)
    .eq('ExamID', examId)
    .eq('OrgID', orgStored)
    .maybeSingle();
  if (exErr) throw exErr;

  if (existing) {
    const stLower = String(existing.Status ?? '').trim().toLowerCase();
    if (stLower === 'withdrawn') {
      return { ok: false, code: 'ALREADY_WITHDRAWN', enrollment: existing };
    }
    const { data: updated, error: upErr } = await supabase
      .from('StudentExamEnrollments')
      .update({
        Status: 'Withdrawn',
        WithdrawnAt: nowIso,
        WithdrawalInitiatedBy: initiatedBy,
        WithdrawalActorUserID: actorUserId ?? null,
        WithdrawalReason: reason ?? null,
        ApprovedAt: null,
        ReviewNote: null,
        ReviewedBy: null,
        ReviewedAt: null,
        OrgID: orgStored ?? existing.OrgID ?? null,
        SubscriptionID: subscriptionId ?? existing.SubscriptionID ?? null,
        UpdatedAt: nowIso,
      })
      .eq('EnrollmentID', existing.EnrollmentID)
      .select()
      .single();
    if (upErr) throw upErr;
    return { ok: true, enrollment: updated };
  }

  const insertPayload = {
    StudentID: studentId,
    ExamID: examId,
    OrgID: orgStored,
    SubscriptionID: subscriptionId ?? null,
    Status: 'Withdrawn',
    Source: sourceRow,
    RequestedByType: requestedByTypeRow,
    RequestedAt: nowIso,
    WithdrawnAt: nowIso,
    WithdrawalInitiatedBy: initiatedBy,
    WithdrawalActorUserID: actorUserId ?? null,
    WithdrawalReason: reason ?? null,
    CreatedAt: nowIso,
    UpdatedAt: nowIso,
  };

  const { data: inserted, error: insErr } = await supabase
    .from('StudentExamEnrollments')
    .insert(insertPayload)
    .select()
    .single();
  if (insErr) throw insErr;
  return { ok: true, enrollment: inserted };
}

export async function upsertStudentExamActivation({
  studentId,
  examId,
  orgId,
  subscriptionId,
  approvePendingAsOrg = false,
  reviewerOrgUserId = null,
}) {
  const nowIso = new Date().toISOString();
  const orgStored = normalizeOrgIdForEnrollment(orgId);
  if (!orgStored) {
    throw new Error('OrgID is required for exam enrollment updates');
  }

  const { data: existing, error: exErr } = await supabase
    .from('StudentExamEnrollments')
    .select('*')
    .eq('StudentID', studentId)
    .eq('ExamID', examId)
    .eq('OrgID', orgStored)
    .maybeSingle();
  if (exErr) throw exErr;

  const clearWithdrawal = {
    WithdrawnAt: null,
    WithdrawalInitiatedBy: null,
    WithdrawalActorUserID: null,
    WithdrawalReason: null,
  };

  if (!existing) {
    if (!approvePendingAsOrg) {
      return { ok: false, code: 'ORG_APPROVAL_REQUIRED', enrollment: null };
    }
    const insertPayload = {
      StudentID: studentId,
      ExamID: examId,
      OrgID: orgStored,
      SubscriptionID: subscriptionId ?? null,
      Status: 'Approved',
      Source: 'DirectAssign',
      RequestedByType: approvePendingAsOrg ? 'OrgAdmin' : 'Student',
      RequestedAt: nowIso,
      ApprovedAt: nowIso,
      ReviewNote: null,
      ReviewedBy: approvePendingAsOrg ? reviewerOrgUserId ?? null : null,
      ReviewedAt: approvePendingAsOrg ? nowIso : null,
      ...clearWithdrawal,
      CreatedAt: nowIso,
      UpdatedAt: nowIso,
    };
    const { data: inserted, error: insErr } = await supabase
      .from('StudentExamEnrollments')
      .insert(insertPayload)
      .select()
      .single();
    if (insErr) throw insErr;
    return { ok: true, enrollment: inserted };
  }

  const stLower = String(existing.Status ?? '').trim().toLowerCase();

  if (stLower === 'pending') {
    if (!approvePendingAsOrg) {
      return { ok: false, code: 'PENDING_APPROVAL', enrollment: existing };
    }
    const { data: updated, error: upErr } = await supabase
      .from('StudentExamEnrollments')
      .update({
        Status: 'Approved',
        ApprovedAt: nowIso,
        ReviewedBy: reviewerOrgUserId ?? null,
        ReviewedAt: nowIso,
        SubscriptionID: subscriptionId ?? existing.SubscriptionID ?? null,
        ...clearWithdrawal,
        UpdatedAt: nowIso,
      })
      .eq('EnrollmentID', existing.EnrollmentID)
      .select()
      .single();
    if (upErr) throw upErr;
    return { ok: true, enrollment: updated };
  }

  if (enrollmentRecordAllowsExamAccess(existing.Status)) {
    return { ok: true, enrollment: existing, noop: true };
  }

  const { data: updated, error: upErr } = await supabase
    .from('StudentExamEnrollments')
    .update({
      Status: 'Approved',
      ApprovedAt: nowIso,
      ReviewNote: null,
      ReviewedBy: approvePendingAsOrg ? reviewerOrgUserId ?? null : null,
      ReviewedAt: approvePendingAsOrg ? nowIso : null,
      OrgID: orgStored ?? existing.OrgID ?? null,
      SubscriptionID: subscriptionId ?? existing.SubscriptionID ?? null,
      ...clearWithdrawal,
      UpdatedAt: nowIso,
    })
    .eq('EnrollmentID', existing.EnrollmentID)
    .select()
    .single();
  if (upErr) throw upErr;
  return { ok: true, enrollment: updated };
}

/**
 * OrgAdmin direct assign when approval mode is manual: row stays Pending until approved in requests queue.
 */
export async function upsertStudentExamPendingDirectAssign({
  studentId,
  examId,
  orgId,
  subscriptionId,
}) {
  const nowIso = new Date().toISOString();
  const orgStored = normalizeOrgIdForEnrollment(orgId);
  if (!orgStored) {
    throw new Error('OrgID is required for exam enrollment updates');
  }

  const { data: existing, error: exErr } = await supabase
    .from('StudentExamEnrollments')
    .select('*')
    .eq('StudentID', studentId)
    .eq('ExamID', examId)
    .eq('OrgID', orgStored)
    .maybeSingle();
  if (exErr) throw exErr;

  const pendingPayload = {
    Status: 'Pending',
    Source: 'DirectAssign',
    RequestedByType: 'OrgAdmin',
    RequestedAt: nowIso,
    ApprovedAt: null,
    ReviewNote: null,
    ReviewedBy: null,
    ReviewedAt: null,
    WithdrawnAt: null,
    WithdrawalInitiatedBy: null,
    WithdrawalActorUserID: null,
    WithdrawalReason: null,
    SubscriptionID: subscriptionId ?? existing?.SubscriptionID ?? null,
    UpdatedAt: nowIso,
  };

  if (!existing) {
    const { data: inserted, error: insErr } = await supabase
      .from('StudentExamEnrollments')
      .insert({
        StudentID: studentId,
        ExamID: examId,
        OrgID: orgStored,
        ...pendingPayload,
        CreatedAt: nowIso,
      })
      .select()
      .single();
    if (insErr) throw insErr;
    return { ok: true, enrollment: inserted };
  }

  const stLower = String(existing.Status ?? '').trim().toLowerCase();
  if (stLower === 'pending') {
    return { ok: true, enrollment: existing, noop: true };
  }
  if (enrollmentRecordAllowsExamAccess(existing.Status)) {
    return { ok: true, enrollment: existing, noop: true };
  }

  const { data: updated, error: upErr } = await supabase
    .from('StudentExamEnrollments')
    .update(pendingPayload)
    .eq('EnrollmentID', existing.EnrollmentID)
    .select()
    .single();
  if (upErr) throw upErr;
  return { ok: true, enrollment: updated };
}

/** OrgAdmin assign/activate — respects OrgEnrollmentSettings approval mode. */
export async function orgAssignExamEnrollment({
  studentId,
  examId,
  orgId,
  subscriptionId,
  reviewerOrgUserId = null,
}) {
  const settings = await getOrgEnrollmentSettings(orgId);
  if (shouldAutoApproveDirectAssign(settings)) {
    return upsertStudentExamActivation({
      studentId,
      examId,
      orgId,
      subscriptionId,
      approvePendingAsOrg: true,
      reviewerOrgUserId,
    });
  }
  return upsertStudentExamPendingDirectAssign({
    studentId,
    examId,
    orgId,
    subscriptionId,
  });
}

/**
 * Student submits enrollment access: Pending until OrgAdmin approves (Withdrawn / Rejected / Suspended).
 * Implicit-only access uses no row — student cannot POST activate/request until there is a row (leave creates Withdrawn).
 */
export async function studentSubmitEnrollmentAccessRequest({
  studentId,
  examId,
  orgId,
  subscriptionId,
  autoApproveRequest = false,
}) {
  const nowIso = new Date().toISOString();
  const orgStored = normalizeOrgIdForEnrollment(orgId);
  if (!orgStored) {
    throw new Error('OrgID is required for exam enrollment updates');
  }

  const { data: existing, error: exErr } = await supabase
    .from('StudentExamEnrollments')
    .select('*')
    .eq('StudentID', studentId)
    .eq('ExamID', examId)
    .eq('OrgID', orgStored)
    .maybeSingle();
  if (exErr) throw exErr;

  if (!existing) {
    return { ok: false, code: 'NO_ENROLLMENT_ROW', enrollment: null };
  }

  const stLower = String(existing.Status ?? '').trim().toLowerCase();

  if (enrollmentRecordAllowsExamAccess(existing.Status)) {
    return { ok: true, enrollment: existing, noop: true };
  }
  if (stLower === 'pending') {
    return { ok: true, enrollment: existing, noop: true, alreadyPending: true };
  }

  if (stLower !== 'withdrawn' && stLower !== 'rejected' && stLower !== 'suspended') {
    return { ok: false, code: 'INVALID_STATE', enrollment: existing };
  }

  const approved = autoApproveRequest === true;
  const { data: updated, error: upErr } = await supabase
    .from('StudentExamEnrollments')
    .update({
      Status: approved ? 'Approved' : 'Pending',
      Source: 'StudentRequest',
      RequestedByType: 'Student',
      RequestedAt: nowIso,
      ReviewNote: null,
      ReviewedBy: null,
      ReviewedAt: approved ? nowIso : null,
      ApprovedAt: approved ? nowIso : null,
      WithdrawnAt: null,
      WithdrawalInitiatedBy: null,
      WithdrawalActorUserID: null,
      WithdrawalReason: null,
      SubscriptionID: subscriptionId ?? existing.SubscriptionID ?? null,
      UpdatedAt: nowIso,
    })
    .eq('EnrollmentID', existing.EnrollmentID)
    .select()
    .single();
  if (upErr) throw upErr;
  return { ok: true, enrollment: updated, autoApproved: approved };
}

export async function orgRejectStudentExamEnrollment({
  studentId,
  examId,
  orgId,
  reviewerOrgUserId,
  reviewNote,
}) {
  const nowIso = new Date().toISOString();
  const orgStored = normalizeOrgIdForEnrollment(orgId);
  if (!orgStored) {
    throw new Error('OrgID is required for exam enrollment updates');
  }

  const note =
    reviewNote != null && String(reviewNote).trim() !== ''
      ? String(reviewNote).trim().slice(0, 4000)
      : null;

  const { data: existing, error: exErr } = await supabase
    .from('StudentExamEnrollments')
    .select('*')
    .eq('StudentID', studentId)
    .eq('ExamID', examId)
    .eq('OrgID', orgStored)
    .maybeSingle();
  if (exErr) throw exErr;

  if (!existing) {
    return { ok: false, code: 'NO_ROW', enrollment: null };
  }

  const stLower = String(existing.Status ?? '').trim().toLowerCase();
  if (stLower !== 'pending') {
    return { ok: false, code: 'NOT_PENDING', enrollment: existing };
  }

  const { data: updated, error: upErr } = await supabase
    .from('StudentExamEnrollments')
    .update({
      Status: 'Rejected',
      ReviewNote: note,
      ReviewedBy: reviewerOrgUserId ?? null,
      ReviewedAt: nowIso,
      ApprovedAt: null,
      UpdatedAt: nowIso,
    })
    .eq('EnrollmentID', existing.EnrollmentID)
    .select()
    .single();
  if (upErr) throw upErr;
  return { ok: true, enrollment: updated };
}

export async function buildStudentExamEnrollmentListPayload(studentId, orgId = null) {
  const oid = normalizeOrgIdForEnrollment(orgId);
  if (!oid) return { exams: [], planExamCount: 0 };

  const planMap = await buildPlanExamEligibilityMap(studentId, null, orgId);
  const examIds = [...planMap.keys()];
  if (examIds.length === 0) return { exams: [], planExamCount: 0 };

  const [{ data: exams, error: exErr }, { data: enrollRows, error: enErr }] = await Promise.all([
    supabase.from('Exams').select('ExamID, ExamName').in('ExamID', examIds),
    supabase
      .from('StudentExamEnrollments')
      .select('*')
      .eq('StudentID', studentId)
      .eq('OrgID', oid)
      .in('ExamID', examIds),
  ]);
  if (exErr) throw exErr;
  if (enErr) throw enErr;

  const nameById = new Map((exams || []).map((e) => [e.ExamID, e.ExamName]));
  const rowByExam = new Map((enrollRows || []).map((r) => [r.ExamID, r]));

  const rows = examIds
    .map((examId) => {
      const meta = planMap.get(examId);
      const row = rowByExam.get(examId);
      const status = row ? String(row.Status ?? '').trim() : '';
      const accessActive = !row || enrollmentRecordAllowsExamAccess(status);
      const enrollmentLabel = row ? status : 'Implicit';
      const statusHint = row ? enrollmentStatusHint(status) : null;
      const statusHintOrg = enrollmentStatusHintOrg(!!row, status);
      return {
        examId,
        examName: nameById.get(examId) || 'Exam',
        subscriptionId: meta?.subscriptionId ?? null,
        enrollmentStatus: enrollmentLabel,
        accessActive,
        statusHint,
        statusHintOrg,
        enrollment: row || null,
      };
    })
    .sort((a, b) => String(a.examName).localeCompare(String(b.examName)));

  return { exams: rows, planExamCount: rows.length };
}

export async function isScheduledModeEnabledForTest(test) {
  const subscriptionId = test?.SubscriptionID ?? test?.subscriptionId ?? null;
  if (!subscriptionId) return false;
  const { data: subscription, error: subErr } = await supabase
    .from('Subscriptions')
    .select('PlanID')
    .eq('SubscriptionID', subscriptionId)
    .single();
  if (subErr || !subscription?.PlanID) return false;
  return await isPlanModeEnabled(supabase, subscription.PlanID, 'isScheduledEnabled');
}

/**
 * NOTE: This router is mounted for BOTH:
 * - /api/student        (student-facing dashboard & assignments)
 * - /api/org/students   (OrgAdmin-facing student management)
 *
 * Student-facing routes live under /dashboard/... and /assignments
 * OrgAdmin CRUD routes live at the root path (/), /bulk, /:studentId
 */

export function scoreQuestionAttempt(selectedSet, correctOptionIds, marks, negative) {
  const m = Number(marks) || 0;
  const neg = Number(negative) || 0;
  if (!selectedSet || selectedSet.size === 0) {
    return { status: 'skipped', marksEarned: 0, marksAvailable: m };
  }
  let exact = selectedSet.size === correctOptionIds.size;
  if (exact) {
    for (const id of selectedSet) {
      if (!correctOptionIds.has(id)) {
        exact = false;
        break;
      }
    }
  } else {
    exact = false;
  }
  if (exact) return { status: 'correct', marksEarned: m, marksAvailable: m };
  if (neg > 0) return { status: 'incorrect', marksEarned: -neg, marksAvailable: m };
  return { status: 'incorrect', marksEarned: 0, marksAvailable: m };
}

export function bulkRegisterRowIssue({ index, studentRow, code, reason, help, extra = {} }) {
  return {
    csvRow: index + 2,
    index,
    email: studentRow?.email != null ? String(studentRow.email).trim() : null,
    fullName: studentRow?.fullName != null ? String(studentRow.fullName).trim() : null,
    code,
    reason,
    help: help || reason,
    ...extra,
  };
}

export function isDuplicateKeyInsertError(insertError) {
  if (!insertError) return false;
  const code = insertError.code || insertError.errorCode;
  const msg = String(insertError.message || insertError.details || '');
  return code === '23505' || /duplicate|unique|already exists/i.test(msg);
}

/** Case-insensitive email lookup map for bulk CSV rows (exact .in batch + ilike fallback). */
export async function loadExistingStudentsByEmails(emails) {
  const byLower = new Map();
  const trimmed = [...new Set(emails.map((e) => String(e).trim()).filter(Boolean))];
  if (trimmed.length === 0) return byLower;

  const CHUNK_SIZE = 80;
  for (let i = 0; i < trimmed.length; i += CHUNK_SIZE) {
    const chunk = trimmed.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('Students')
      .select('StudentID, OrgID, FullName, Email')
      .in('Email', chunk);
    if (error) {
      console.error('Bulk register email batch lookup error:', error);
      continue;
    }
    for (const row of data || []) {
      if (row?.Email) byLower.set(String(row.Email).toLowerCase(), row);
    }
  }

  for (const em of trimmed) {
    if (byLower.has(em.toLowerCase())) continue;
    const { data: rows, error } = await supabase
      .from('Students')
      .select('StudentID, OrgID, FullName, Email')
      .ilike('Email', em)
      .limit(1);
    if (!error && rows?.[0]?.Email) {
      byLower.set(String(rows[0].Email).toLowerCase(), rows[0]);
    }
  }

  return byLower;
}

export const DIRECTORY_STATUS_VALUES = ['Pending', 'Approved', 'Rejected', 'Withdrawn', 'Suspended', 'Implicit'];

export function directoryDtoFromEnrollmentRecord(
  r,
  studentName,
  studentEmail,
  examName,
  orgUserById = new Map()
) {
  const reviewer = r.ReviewedBy ? orgUserById.get(r.ReviewedBy) : null;
  const reviewerName = reviewer?.FullName || reviewer?.Email || null;
  return {
    enrollmentId: r.EnrollmentID,
    isImplicit: false,
    studentId: r.StudentID,
    examId: r.ExamID,
    subscriptionId: r.SubscriptionID ?? null,
    status: r.Status,
    source: r.Source,
    requestedByType: r.RequestedByType ?? null,
    requestedAt: r.RequestedAt ?? null,
    reviewedBy: r.ReviewedBy ?? null,
    reviewedByName: reviewerName,
    reviewedAt: r.ReviewedAt ?? null,
    reviewNote: r.ReviewNote ?? null,
    approvedAt: r.ApprovedAt ?? null,
    withdrawnAt: r.WithdrawnAt ?? null,
    withdrawalInitiatedBy: r.WithdrawalInitiatedBy ?? null,
    withdrawalActorUserId: r.WithdrawalActorUserID ?? null,
    withdrawalReason: r.WithdrawalReason ?? null,
    createdAt: r.CreatedAt ?? null,
    updatedAt: r.UpdatedAt ?? null,
    studentName,
    studentEmail,
    examName,
  };
}
