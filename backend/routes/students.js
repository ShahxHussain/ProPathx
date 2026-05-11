import express from 'express';
import { supabase } from '../config/database.js';
import { authenticate, requireRole, verifyActiveStatus } from '../middleware/auth.js';
import { getClientIP, getUserAgent, createLog } from '../utils/logger.js';
import { hashPassword } from '../utils/password.js';
import {
  filterPlansForStudentAudience,
  enrichPlansWithExams,
  getPlanTestModesMap,
  isPlanModeEnabled,
} from '../utils/subscriptionPlanCatalog.js';

/** Supabase/PostgREST may return PascalCase or camelCase column keys depending on config. */
function testNameFromRow(t) {
  if (!t) return null;
  return t.TestName ?? t.testName ?? null;
}

function testIdFromRow(t) {
  if (!t) return null;
  return t.TestID ?? t.testId ?? null;
}

/** PostgREST may return OrgID or orgId. */
function orgIdFromRow(t) {
  if (!t) return null;
  return t.OrgID ?? t.orgId ?? null;
}

function testStatusFromRow(t) {
  if (!t) return null;
  return t.Status ?? t.status ?? null;
}

/** StudentAttempts has no Status column in schema — completion is indicated by EndTime. */
function attemptCompletedFromRow(a) {
  if (!a) return false;
  const end = a.EndTime ?? a.endTime;
  return end != null && end !== '';
}

function attemptStatusFromRow(a) {
  return attemptCompletedFromRow(a) ? 'Completed' : 'InProgress';
}

/** Normalize UUID / id strings for consistent Map/Set lookups (PostgREST casing varies). */
function canonEntityId(id) {
  if (id == null || id === '') return null;
  return String(id).trim().toLowerCase();
}

/** Unwrap PostgREST embedded resource: object, single-element array, or null. */
function unwrapEmbedded(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === 'object') return value;
  return null;
}

/** First non-empty column (PascalCase, camelCase, or snake_case from PostgREST / DB drivers). */
function pickCol(row, keys) {
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
function totalMarksConfiguredOnTest(test) {
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
const PG_OPTIONS_BY_QUESTION_FK = 'Options!Options_QuestionID_fkey';

/** True if string looks like a UUID (for option keys / StudentAnswers.OptionID). */
function isUuidLike(raw) {
  if (raw == null || raw === '') return false;
  const s = String(raw).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Legacy: integer option slot (Options.OptionNumber) from client or old rows.
 * Prefer UUID OptionID everywhere; this remains for backward-compatible submits.
 */
function asAnswerOptionId(raw) {
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
function canonOptionRowId(raw) {
  if (raw == null || raw === '') return null;
  return isUuidLike(raw) ? canonEntityId(raw) : null;
}

/**
 * Resolve one client selection to Options.OptionID (canonical lowercase uuid) for this question.
 * Accepts Options.OptionID (uuid string) or legacy OptionNumber (int).
 */
function resolveSelectedOptionCanon(raw, opts) {
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
function assignmentWorkflowStatusRaw(row) {
  return pickCol(row, ['Status', 'status']);
}

function assignmentRowAllowsStart(row) {
  const raw = assignmentWorkflowStatusRaw(row);
  if (raw == null || String(raw).trim() === '') return true;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  return s === 'pending' || s === 'inprogress';
}

/** Merge derived Status and max marks from Tests for API consumers (UI expects these fields). */
function enrichAttemptDto(attempt, testTotalMarks) {
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

const router = express.Router();

function requireStudentActor(req, res, next) {
  if (req.user?.actorType !== 'Student' || !req.user?.studentId) {
    return res.status(403).json({ error: 'Student access only' });
  }
  next();
}

function isIndividualStudentUser(user) {
  if (!user || user.actorType !== 'Student' || !user.studentId) return false;
  const enrollmentType = String(user.enrollmentType ?? user.EnrollmentType ?? '').trim().toLowerCase();
  const orgId = user.orgId ?? user.OrgID ?? null;
  return enrollmentType === 'individual' || orgId == null || orgId === '';
}

function requireIndividualStudent(req, res, next) {
  if (!isIndividualStudentUser(req.user)) {
    return res.status(403).json({
      error:
        'This feature is available for individual students only. Organization-enrolled students should use assigned tests.',
    });
  }
  next();
}

async function getActiveStudentSubscriptions(studentId) {
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

async function getActiveSubscriptionsForStudentContext(studentId, orgId = null) {
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

function applyQuestionPoolScope(query, orgId = null) {
  if (orgId) return query.or(`OrgID.is.null,OrgID.eq.${orgId}`);
  return query.is('OrgID', null);
}

function allocateQuestionsBySubject(subjects, requestedTotal) {
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
async function buildPlanExamEligibilityMap(studentId, allowedPlanIds = null, orgId = null) {
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
function enrollmentRecordAllowsExamAccess(statusRaw) {
  const s = String(statusRaw ?? '').trim();
  if (!s) return true;
  const u = s.toLowerCase();
  return u === 'approved' || u === 'active';
}

function enrollmentStatusHint(statusRaw) {
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
function enrollmentStatusHintOrg(hasEnrollmentRow, statusRaw) {
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
async function applyStudentEnrollmentGate(studentId, examMap, orgId = null) {
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

async function getEligibleStudentExamMap(studentId, allowedPlanIds = null, orgId = null) {
  const out = await buildPlanExamEligibilityMap(studentId, allowedPlanIds, orgId);
  await applyStudentEnrollmentGate(studentId, out, orgId);
  return out;
}

async function getStudentEnrollmentBlockedExamIdsSet(studentId, examIds, orgId = null) {
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

async function isStudentExamAccessAllowed(studentId, examId, orgId = null) {
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

function normalizeOrgIdForEnrollment(orgId) {
  if (orgId == null || orgId === '') return null;
  return String(orgId);
}

async function upsertStudentExamWithdrawal({
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

async function upsertStudentExamActivation({
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
 * Student submits enrollment access: Pending until OrgAdmin approves (Withdrawn / Rejected / Suspended).
 * Implicit-only access uses no row — student cannot POST activate/request until there is a row (leave creates Withdrawn).
 */
async function studentSubmitEnrollmentAccessRequest({ studentId, examId, orgId, subscriptionId }) {
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

  const { data: updated, error: upErr } = await supabase
    .from('StudentExamEnrollments')
    .update({
      Status: 'Pending',
      Source: 'StudentRequest',
      RequestedByType: 'Student',
      RequestedAt: nowIso,
      ReviewNote: null,
      ReviewedBy: null,
      ReviewedAt: null,
      ApprovedAt: null,
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
  return { ok: true, enrollment: updated };
}

async function orgRejectStudentExamEnrollment({
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

async function buildStudentExamEnrollmentListPayload(studentId, orgId = null) {
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

async function isScheduledModeEnabledForTest(test) {
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

/**
 * GET /api/student/subscription-plans
 * Plans with Audience Student or Both (all enrolled students, including individual)
 */
router.get(
  '/subscription-plans',
  authenticate,
  verifyActiveStatus,
  requireStudentActor,
  requireIndividualStudent,
  async (req, res) => {
    try {
      const { data: plans, error: plansError } = await supabase
        .from('SubscriptionPlans')
        .select('*')
        .eq('Status', 'Active')
        .order('PlanName', { ascending: true });

      if (plansError) {
        return res.status(500).json({ error: 'Failed to fetch subscription plans', details: plansError.message });
      }

      const filtered = filterPlansForStudentAudience(plans || []);
      const plansWithExams = await enrichPlansWithExams(supabase, filtered);
      const visible = (plansWithExams || []).filter((p) => p?.testModes?.isSelfTestBuilderEnabled === true);
      res.json({ plans: visible });
    } catch (error) {
      console.error('Get student subscription plans error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/student/subscriptions
 */
router.get(
  '/subscriptions',
  authenticate,
  verifyActiveStatus,
  requireStudentActor,
  requireIndividualStudent,
  async (req, res) => {
  const { studentId } = req.user;

  try {
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('Subscriptions')
      .select(
        `
        *,
        SubscriptionPlans (
          PlanID,
          PlanName,
          Price,
          DurationMonths,
          Features
        )
      `
      )
      .eq('EntityType', 'Student')
      .eq('EntityID', studentId)
      .order('CreatedAt', { ascending: false });

    if (subscriptionsError) {
      return res.status(500).json({ error: 'Failed to fetch subscriptions', details: subscriptionsError.message });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const updatedSubscriptions = (subscriptions || []).map((sub) => {
      if (sub.Status === 'Active' && sub.EndDate) {
        try {
          const dateStr = String(sub.EndDate).split('T')[0];
          const [year, month, day] = dateStr.split('-').map(Number);
          if (year && month && day) {
            const endDateOnly = new Date(year, month - 1, day);
            if (endDateOnly < today) {
              supabase
                .from('Subscriptions')
                .update({ Status: 'Expired' })
                .eq('SubscriptionID', sub.SubscriptionID)
                .then(() => {});
              return { ...sub, Status: 'Expired' };
            }
          }
        } catch (e) {
          console.error('Error checking subscription expiry:', e);
        }
      }
      return sub;
    });

    res.json({ subscriptions: updatedSubscriptions || [] });
  } catch (error) {
    console.error('Get student subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
  }
);

/**
 * POST /api/student/subscriptions
 * Subscribe as a student (EntityType Student). Plan must be Audience Student or Both.
 */
router.post(
  '/subscriptions',
  authenticate,
  verifyActiveStatus,
  requireStudentActor,
  requireIndividualStudent,
  async (req, res) => {
  const { planId, autoRenew = false } = req.body || {};
  const { studentId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    if (!planId) {
      return res.status(400).json({ error: 'PlanID is required' });
    }

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
    if (planAudience === 'Organization') {
      return res.status(400).json({
        error: 'This plan is for organizations only. Choose a student or dual-audience plan.',
      });
    }
    if (planAudience !== 'Student' && planAudience !== 'Both') {
      return res.status(400).json({ error: 'This plan is not available for students' });
    }

    const selfTestAllowed = await isPlanModeEnabled(supabase, plan.PlanID, 'isSelfTestBuilderEnabled');
    const adaptiveAllowed = await isPlanModeEnabled(supabase, plan.PlanID, 'isAdaptiveEnabled');
    if (!selfTestAllowed && !adaptiveAllowed) {
      return res.status(400).json({
        error: 'This plan currently has no enabled student test modes (Self-Test Builder / Adaptive).',
      });
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (plan.DurationMonths || 1));

    const { data: newSubscription, error: subscriptionError } = await supabase
      .from('Subscriptions')
      .insert({
        EntityType: 'Student',
        EntityID: studentId,
        PlanID: planId,
        StartDate: startDate.toISOString().split('T')[0],
        EndDate: endDate.toISOString().split('T')[0],
        ActivatedAt: new Date().toISOString(),
        AutoRenew: !!autoRenew,
        Status: 'Active',
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (subscriptionError) {
      console.error('Error creating student subscription:', subscriptionError);
      return res.status(500).json({ error: 'Failed to create subscription', details: subscriptionError.message });
    }

    const { data: planExams, error: planExamsError } = await supabase
      .from('SubscriptionPlanExams')
      .select('ExamID')
      .eq('PlanID', planId);

    if (planExamsError) {
      console.error('Error fetching plan exams:', planExamsError);
    }

    if (planExams && planExams.length > 0) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const usageCounterInserts = planExams.map((pe) => ({
        SubscriptionID: newSubscription.SubscriptionID,
        ExamID: pe.ExamID,
        EntityType: 'Student',
        EntityID: studentId,
        MonthKey: currentMonth,
        StudentsEnrolled: 0,
        TestsCreated: 0,
        TestsCreatedToday: 0,
        AIQuestionsGenerated: 0,
        StudentAttempts: 0,
        LastResetAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
      }));

      const { error: usageError } = await supabase.from('UsageCounters').insert(usageCounterInserts);
      if (usageError) {
        console.error('[POST /student/subscriptions] Usage counters:', usageError);
      }
    }

    await createLog({
      actorType: 'Student',
      actorID: studentId,
      actionType: 'Subscription',
      entityType: 'Subscription',
      entityID: newSubscription.SubscriptionID,
      description: `Student subscribed to plan: ${plan.PlanName}`,
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
    console.error('Create student subscription error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
  }
);

/**
 * DELETE /api/student/subscriptions/:subscriptionId
 */
router.delete(
  '/subscriptions/:subscriptionId',
  authenticate,
  verifyActiveStatus,
  requireStudentActor,
  requireIndividualStudent,
  async (req, res) => {
    const { subscriptionId } = req.params;
    const { studentId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      const { data: subscription, error: fetchError } = await supabase
        .from('Subscriptions')
        .select(
          `
        *,
        SubscriptionPlans (
          PlanID,
          PlanName
        )
      `
        )
        .eq('SubscriptionID', subscriptionId)
        .eq('EntityType', 'Student')
        .eq('EntityID', studentId)
        .single();

      if (fetchError || !subscription) {
        return res.status(404).json({ error: 'Subscription not found or you do not have permission to cancel it' });
      }

      const { error: updateError } = await supabase
        .from('Subscriptions')
        .update({
          Status: 'Cancelled',
          AutoRenew: false,
        })
        .eq('SubscriptionID', subscriptionId);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to cancel subscription', details: updateError.message });
      }

      await createLog({
        actorType: 'Student',
        actorID: studentId,
        actionType: 'Update',
        entityType: 'Subscription',
        entityID: subscriptionId,
        description: `Student cancelled subscription: ${subscription.SubscriptionPlans?.PlanName || subscriptionId}`,
        ipAddress,
        userAgent,
        previousData: subscription,
        newData: { Status: 'Cancelled', AutoRenew: false },
      });

      res.json({ message: 'Subscription cancelled successfully' });
    } catch (error) {
      console.error('Cancel student subscription error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/student/exam-enrollments
 * Exams included in the student's active subscription(s), with enrollment row + access flag.
 */
router.get(
  '/exam-enrollments',
  authenticate,
  verifyActiveStatus,
  requireStudentActor,
  async (req, res) => {
    try {
      const { studentId } = req.user;
      const orgId = req.user?.orgId ?? req.user?.OrgID ?? null;
      if (!normalizeOrgIdForEnrollment(orgId)) {
        return res.status(403).json({
          error: 'Exam enrollment is available for organization students only.',
          code: 'ORG_STUDENTS_ONLY',
        });
      }
      const payload = await buildStudentExamEnrollmentListPayload(studentId, orgId);
      res.json(payload);
    } catch (error) {
      console.error('Get student exam enrollments error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/student/exam-enrollments/:examId/withdraw
 * Student leaves an exam (row retained with Status = Withdrawn).
 */
router.post(
  '/exam-enrollments/:examId/withdraw',
  authenticate,
  verifyActiveStatus,
  requireStudentActor,
  async (req, res) => {
    try {
      const { studentId } = req.user;
      const orgId = req.user?.orgId ?? req.user?.OrgID ?? null;
      const examId = req.params.examId != null ? String(req.params.examId).trim() : null;
      if (!examId) return res.status(400).json({ error: 'Exam ID is required' });
      if (!normalizeOrgIdForEnrollment(orgId)) {
        return res.status(403).json({
          error: 'Exam enrollment is available for organization students only.',
          code: 'ORG_STUDENTS_ONLY',
        });
      }

      const planMap = await buildPlanExamEligibilityMap(studentId, null, orgId);
      if (!planMap.has(examId)) {
        return res.status(400).json({
          error: 'This exam is not included in your active subscription.',
          code: 'EXAM_NOT_IN_PLAN',
        });
      }
      const meta = planMap.get(examId);
      const actorUserId = req.user.userId ?? req.user.UserID ?? null;
      const reason = req.body?.reason != null ? String(req.body.reason).slice(0, 2000) : null;

      const result = await upsertStudentExamWithdrawal({
        studentId,
        examId,
        orgId,
        subscriptionId: meta?.subscriptionId ?? null,
        initiatedBy: 'Student',
        actorUserId,
        reason,
      });

      if (!result.ok && result.code === 'ALREADY_WITHDRAWN') {
        return res.status(409).json({
          error: 'You have already left this exam.',
          enrollment: result.enrollment,
          code: 'ALREADY_WITHDRAWN',
        });
      }

      res.json({
        message: 'You have left this exam. Your history stays on record; you can re-enroll anytime while the exam remains on your plan.',
        enrollment: result.enrollment,
      });
    } catch (error) {
      console.error('Student withdraw exam error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/student/exam-enrollments/:examId/activate
 * Student submits an enrollment request → Pending until OrgAdmin approves (no self-service Approved).
 */
router.post(
  '/exam-enrollments/:examId/activate',
  authenticate,
  verifyActiveStatus,
  requireStudentActor,
  async (req, res) => {
    try {
      const { studentId } = req.user;
      const orgId = req.user?.orgId ?? req.user?.OrgID ?? null;
      const examId = req.params.examId != null ? String(req.params.examId).trim() : null;
      if (!examId) return res.status(400).json({ error: 'Exam ID is required' });
      if (!normalizeOrgIdForEnrollment(orgId)) {
        return res.status(403).json({
          error: 'Exam enrollment is available for organization students only.',
          code: 'ORG_STUDENTS_ONLY',
        });
      }

      const planMap = await buildPlanExamEligibilityMap(studentId, null, orgId);
      if (!planMap.has(examId)) {
        return res.status(400).json({
          error: 'This exam is not included in your active subscription.',
          code: 'EXAM_NOT_IN_PLAN',
        });
      }
      const meta = planMap.get(examId);

      const result = await studentSubmitEnrollmentAccessRequest({
        studentId,
        examId,
        orgId,
        subscriptionId: meta?.subscriptionId ?? null,
      });

      if (!result.ok && result.code === 'NO_ENROLLMENT_ROW') {
        return res.status(400).json({
          error:
            'There is no enrollment record yet — you already have access through your subscription. Leave this exam first if you need to submit a request.',
          code: 'NO_ENROLLMENT_ROW',
        });
      }

      if (!result.ok && result.code === 'INVALID_STATE') {
        return res.status(400).json({
          error: 'Cannot submit an enrollment request for this exam in its current state.',
          code: 'INVALID_STATE',
          enrollment: result.enrollment,
        });
      }

      let message =
        'Request submitted. Your organization must approve before you can access this exam.';
      if (result.noop && result.alreadyPending) {
        message = 'Your request is already waiting for approval.';
      } else if (result.noop) {
        message = 'You already have access to this exam.';
      }

      res.json({
        message,
        enrollment: result.enrollment,
        noop: !!result.noop,
      });
    } catch (error) {
      console.error('Student activate exam error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/student/exam-enrollments/:examId/request
 * Same as activate — student submits Pending until OrgAdmin approves (alias).
 */
router.post(
  '/exam-enrollments/:examId/request',
  authenticate,
  verifyActiveStatus,
  requireStudentActor,
  async (req, res) => {
    try {
      const { studentId } = req.user;
      const orgId = req.user?.orgId ?? req.user?.OrgID ?? null;
      const examId = req.params.examId != null ? String(req.params.examId).trim() : null;
      if (!examId) return res.status(400).json({ error: 'Exam ID is required' });
      if (!normalizeOrgIdForEnrollment(orgId)) {
        return res.status(403).json({
          error: 'Exam enrollment is available for organization students only.',
          code: 'ORG_STUDENTS_ONLY',
        });
      }

      const planMap = await buildPlanExamEligibilityMap(studentId, null, orgId);
      if (!planMap.has(examId)) {
        return res.status(400).json({
          error: 'This exam is not included in your active subscription.',
          code: 'EXAM_NOT_IN_PLAN',
        });
      }
      const meta = planMap.get(examId);

      const result = await studentSubmitEnrollmentAccessRequest({
        studentId,
        examId,
        orgId,
        subscriptionId: meta?.subscriptionId ?? null,
      });

      if (!result.ok && result.code === 'INVALID_STATE') {
        return res.status(400).json({
          error:
            'You can only request access after withdrawal, rejection, or suspension — not while already pending or approved.',
          code: 'INVALID_STATE',
          enrollment: result.enrollment,
        });
      }

      if (!result.ok && result.code === 'NO_ENROLLMENT_ROW') {
        return res.status(400).json({
          error:
            'There is no enrollment record yet — you already have access through your subscription.',
          code: 'NO_ENROLLMENT_ROW',
        });
      }

      let message =
        'Your request was sent. You will regain access after your organization approves.';
      if (result.noop && result.alreadyPending) {
        message = 'Your request is already waiting for approval.';
      } else if (result.noop) {
        message = 'You already have access to this exam.';
      }

      res.json({
        message,
        enrollment: result.enrollment,
        noop: !!result.noop,
      });
    } catch (error) {
      console.error('Student request exam enrollment error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/student/individual/self-test/options
 * Student self-test options: list subscribed exams with subject pools and availability.
 */
router.get(
  '/individual/self-test/options',
  authenticate,
  verifyActiveStatus,
  requireStudentActor,
  async (req, res) => {
    try {
      const { studentId } = req.user;
      const orgId = req.user?.orgId ?? req.user?.OrgID ?? null;
      const activeSubs = await getActiveSubscriptionsForStudentContext(studentId, orgId);
      if (!activeSubs.length) {
        return res.json({
          exams: [],
          reason: {
            code: 'NO_ACTIVE_SUBSCRIPTION',
            message:
              orgId
                ? 'No active organization subscription found for your account. Contact your organization admin.'
                : 'No active student subscription found. Please subscribe (or renew) a student plan to build a self-test.',
          },
        });
      }

      const modeMap = await getPlanTestModesMap(
        supabase,
        activeSubs.map((s) => s.PlanID).filter(Boolean)
      );
      const selfTestSubs = activeSubs.filter(
        (s) => modeMap.get(s.PlanID)?.isSelfTestBuilderEnabled === true
      );
      if (!selfTestSubs.length) {
        return res.json({
          exams: [],
          reason: {
            code: 'SELF_TEST_DISABLED_IN_PLAN',
            message:
              orgId
                ? 'Self-Test Builder is not included in your organization subscription. Please contact your organization admin.'
                : 'Self-Test Builder is disabled in your active plan. Please switch plan or contact support.',
          },
        });
      }

      const eligibleExamMap = await getEligibleStudentExamMap(
        studentId,
        selfTestSubs.map((s) => s.PlanID),
        orgId
      );
      const examIds = [...eligibleExamMap.keys()];
      if (examIds.length === 0) {
        return res.json({
          exams: [],
          reason: {
            code: 'NO_EXAMS_IN_PLAN',
            message:
              'Your active subscription has no linked exams yet. Please choose another plan or contact support.',
          },
        });
      }

      const { data: exams, error: exErr } = await supabase
        .from('Exams')
        .select('ExamID, ExamName, Description')
        .in('ExamID', examIds);
      if (exErr) {
        return res.status(500).json({ error: 'Failed to load exams', details: exErr.message });
      }

      const { data: subjects, error: subjErr } = await supabase
        .from('Subjects')
        .select('SubjectID, SubjectName, ExamID')
        .in('ExamID', examIds);
      if (subjErr) {
        return res.status(500).json({ error: 'Failed to load subjects', details: subjErr.message });
      }

      const subjectByExam = new Map();
      for (const s of subjects || []) {
        if (!subjectByExam.has(s.ExamID)) subjectByExam.set(s.ExamID, []);
        subjectByExam.get(s.ExamID).push(s);
      }

      const topicIds = [];
      const subjectByTopic = new Map();
      const { data: topics, error: topicErr } = await supabase
        .from('Topics')
        .select('TopicID, SubjectID')
        .in('SubjectID', (subjects || []).map((s) => s.SubjectID));
      if (topicErr) {
        return res.status(500).json({ error: 'Failed to load topics', details: topicErr.message });
      }
      for (const t of topics || []) {
        topicIds.push(t.TopicID);
        subjectByTopic.set(t.TopicID, t.SubjectID);
      }

      const subjectQuestionCount = new Map();
      if (topicIds.length > 0) {
        const scopedQ = applyQuestionPoolScope(
          supabase
            .from('Questions')
            .select('QuestionID, TopicID')
            .eq('IsVerified', true)
            .in('TopicID', topicIds),
          orgId
        );
        const { data: qRowsScoped, error: qErrScoped } = await scopedQ;
        if (qErrScoped) {
          return res.status(500).json({ error: 'Failed to load question pool', details: qErrScoped.message });
        }
        for (const q of qRowsScoped || []) {
          const sid = subjectByTopic.get(q.TopicID);
          if (!sid) continue;
          subjectQuestionCount.set(sid, (subjectQuestionCount.get(sid) || 0) + 1);
        }
      }

      const examOut = (exams || [])
        .map((exam) => {
          const subjectsForExam = (subjectByExam.get(exam.ExamID) || []).map((s) => ({
            subjectId: s.SubjectID,
            subjectName: s.SubjectName,
            availableCount: subjectQuestionCount.get(s.SubjectID) || 0,
          }));
          const totalAvailable = subjectsForExam.reduce((sum, s) => sum + s.availableCount, 0);
          const eligibility = eligibleExamMap.get(exam.ExamID);
          return {
            examId: exam.ExamID,
            examName: exam.ExamName,
            description: exam.Description ?? null,
            maxQuestionsPerTest: eligibility?.maxQuestionsPerTest ?? null,
            totalAvailableQuestions: totalAvailable,
            subjects: subjectsForExam,
          };
        })
        .filter((e) => e.totalAvailableQuestions > 0)
        .sort((a, b) => a.examName.localeCompare(b.examName));

      if (examOut.length === 0) {
        return res.json({
          exams: [],
          reason: {
            code: 'NO_VERIFIED_POOL',
            message:
              'Your subscribed exams currently have no verified question pool available for self-tests.',
          },
          diagnostics: {
            subscribedExamCount: examIds.length,
            subscribedExamNames: (exams || []).map((e) => e.ExamName).filter(Boolean),
          },
        });
      }

      res.json({ exams: examOut, reason: null });
    } catch (error) {
      console.error('Individual self-test options error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/student/individual/self-test/preview
 * Returns subject-wise auto distribution for requested question count.
 */
router.post(
  '/individual/self-test/preview',
  authenticate,
  verifyActiveStatus,
  requireStudentActor,
  async (req, res) => {
    try {
      const { studentId } = req.user;
      const orgId = req.user?.orgId ?? req.user?.OrgID ?? null;
      const { examId, totalQuestions } = req.body || {};
      const parsedTotal = Math.max(1, Math.trunc(Number(totalQuestions) || 0));
      if (!examId || !parsedTotal) {
        return res.status(400).json({ error: 'examId and totalQuestions are required' });
      }

      const activeSubs = await getActiveSubscriptionsForStudentContext(studentId, orgId);
      const modeMap = await getPlanTestModesMap(
        supabase,
        activeSubs.map((s) => s.PlanID).filter(Boolean)
      );
      const enabledPlanIds = activeSubs
        .filter((s) => modeMap.get(s.PlanID)?.isSelfTestBuilderEnabled === true)
        .map((s) => s.PlanID);
      if (!enabledPlanIds.length) {
        return res.status(403).json({
          error: orgId
            ? 'Self-Test Builder is not included in your organization subscription. Please contact your organization admin.'
            : 'Self-Test Builder is disabled in your active subscription plan.',
        });
      }

      const eligibleExamMap = await getEligibleStudentExamMap(studentId, enabledPlanIds, orgId);
      const eligibility = eligibleExamMap.get(examId);
      if (!eligibility) {
        return res.status(403).json({ error: 'Exam is not available in your active subscription plans.' });
      }
      if (eligibility.maxQuestionsPerTest != null && parsedTotal > Number(eligibility.maxQuestionsPerTest)) {
        return res.status(400).json({
          error: 'Requested questions exceed your plan limit for this exam.',
          limit: Number(eligibility.maxQuestionsPerTest),
          requested: parsedTotal,
        });
      }

      const { data: subjects, error: subjErr } = await supabase
        .from('Subjects')
        .select('SubjectID, SubjectName')
        .eq('ExamID', examId);
      if (subjErr) {
        return res.status(500).json({ error: 'Failed to load subject pool', details: subjErr.message });
      }
      if (!subjects || subjects.length === 0) {
        return res.status(400).json({ error: 'No subjects are configured for this exam.' });
      }

      const { data: topics, error: topicErr } = await supabase
        .from('Topics')
        .select('TopicID, SubjectID')
        .in('SubjectID', subjects.map((s) => s.SubjectID));
      if (topicErr) {
        return res.status(500).json({ error: 'Failed to load topics', details: topicErr.message });
      }
      const subjectByTopic = new Map((topics || []).map((t) => [t.TopicID, t.SubjectID]));
      const topicIds = (topics || []).map((t) => t.TopicID);
      if (topicIds.length === 0) {
        return res.status(400).json({ error: 'No topics found for this exam subjects.' });
      }

      const scopedQ = applyQuestionPoolScope(
        supabase
          .from('Questions')
          .select('QuestionID, TopicID')
          .eq('IsVerified', true)
          .in('TopicID', topicIds),
        orgId
      );
      const { data: qRows, error: qErr } = await scopedQ;
      if (qErr) {
        return res.status(500).json({ error: 'Failed to load question pool', details: qErr.message });
      }

      const countBySubject = new Map();
      for (const q of qRows || []) {
        const sid = subjectByTopic.get(q.TopicID);
        if (!sid) continue;
        countBySubject.set(sid, (countBySubject.get(sid) || 0) + 1);
      }

      const poolSubjects = subjects.map((s) => ({
        subjectId: s.SubjectID,
        subjectName: s.SubjectName,
        availableCount: countBySubject.get(s.SubjectID) || 0,
      }));
      const alloc = allocateQuestionsBySubject(poolSubjects, parsedTotal);
      if (!alloc.ok) {
        return res.status(400).json({
          error: alloc.reason,
          maxAvailableQuestions: alloc.maxAllowed ?? poolSubjects.reduce((sum, s) => sum + s.availableCount, 0),
        });
      }

      res.json({
        examId,
        totalQuestions: parsedTotal,
        maxQuestionsPerTest: eligibility.maxQuestionsPerTest ?? null,
        distribution: alloc.allocated,
      });
    } catch (error) {
      console.error('Individual self-test preview error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/student/individual/self-test/create
 * Creates a personal practice test and assignment, ready for /student/test/:testId attempt flow.
 */
router.post(
  '/individual/self-test/create',
  authenticate,
  verifyActiveStatus,
  requireStudentActor,
  async (req, res) => {
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);
    try {
      const { studentId } = req.user;
      const orgId = req.user?.orgId ?? req.user?.OrgID ?? null;
      const { examId, totalQuestions, durationMinutes } = req.body || {};
      const parsedTotal = Math.max(1, Math.trunc(Number(totalQuestions) || 0));
      const parsedDuration = Math.max(5, Math.min(300, Math.trunc(Number(durationMinutes) || 30)));
      if (!examId || !parsedTotal) {
        return res.status(400).json({ error: 'examId and totalQuestions are required' });
      }

      const activeSubs = await getActiveSubscriptionsForStudentContext(studentId, orgId);
      const modeMap = await getPlanTestModesMap(
        supabase,
        activeSubs.map((s) => s.PlanID).filter(Boolean)
      );
      const enabledPlanIds = activeSubs
        .filter((s) => modeMap.get(s.PlanID)?.isSelfTestBuilderEnabled === true)
        .map((s) => s.PlanID);
      if (!enabledPlanIds.length) {
        return res.status(403).json({
          error: orgId
            ? 'Self-Test Builder is not included in your organization subscription. Please contact your organization admin.'
            : 'Self-Test Builder is disabled in your active subscription plan.',
        });
      }

      const eligibleExamMap = await getEligibleStudentExamMap(studentId, enabledPlanIds, orgId);
      const eligibility = eligibleExamMap.get(examId);
      if (!eligibility) {
        return res.status(403).json({ error: 'Exam is not available in your active subscription plans.' });
      }
      if (eligibility.maxQuestionsPerTest != null && parsedTotal > Number(eligibility.maxQuestionsPerTest)) {
        return res.status(400).json({
          error: 'Requested questions exceed your plan limit for this exam.',
          limit: Number(eligibility.maxQuestionsPerTest),
          requested: parsedTotal,
        });
      }

      const { data: exam, error: examErr } = await supabase
        .from('Exams')
        .select('ExamID, ExamName')
        .eq('ExamID', examId)
        .single();
      if (examErr || !exam) return res.status(404).json({ error: 'Exam not found' });

      const { data: subjects, error: subjErr } = await supabase
        .from('Subjects')
        .select('SubjectID, SubjectName')
        .eq('ExamID', examId);
      if (subjErr) return res.status(500).json({ error: 'Failed to load subjects', details: subjErr.message });
      if (!subjects || subjects.length === 0) return res.status(400).json({ error: 'No subjects configured for this exam.' });

      const { data: topics, error: topicErr } = await supabase
        .from('Topics')
        .select('TopicID, SubjectID')
        .in('SubjectID', subjects.map((s) => s.SubjectID));
      if (topicErr) return res.status(500).json({ error: 'Failed to load topics', details: topicErr.message });
      const topicIds = (topics || []).map((t) => t.TopicID);
      if (topicIds.length === 0) return res.status(400).json({ error: 'No topics configured for this exam.' });
      const subjectByTopic = new Map((topics || []).map((t) => [t.TopicID, t.SubjectID]));

      const scopedQ = applyQuestionPoolScope(
        supabase
          .from('Questions')
          .select('QuestionID, TopicID, DifficultyLevel, CreatedAt')
          .eq('IsVerified', true)
          .in('TopicID', topicIds)
          .order('CreatedAt', { ascending: false }),
        orgId
      );
      const { data: questionPool, error: qErr } = await scopedQ;
      if (qErr) return res.status(500).json({ error: 'Failed to load question pool', details: qErr.message });

      const bySubject = new Map();
      for (const s of subjects) bySubject.set(s.SubjectID, []);
      for (const q of questionPool || []) {
        const sid = subjectByTopic.get(q.TopicID);
        if (!sid || !bySubject.has(sid)) continue;
        bySubject.get(sid).push(q);
      }

      const poolSubjects = subjects.map((s) => ({
        subjectId: s.SubjectID,
        subjectName: s.SubjectName,
        availableCount: (bySubject.get(s.SubjectID) || []).length,
      }));
      const alloc = allocateQuestionsBySubject(poolSubjects, parsedTotal);
      if (!alloc.ok) {
        return res.status(400).json({
          error: alloc.reason,
          maxAvailableQuestions: alloc.maxAllowed ?? poolSubjects.reduce((sum, s) => sum + s.availableCount, 0),
        });
      }

      // Select per-subject questions with a soft difficulty mix and randomized order.
      const chosenQuestionIds = [];
      for (const dist of alloc.allocated) {
        const src = [...(bySubject.get(dist.subjectId) || [])];
        // light randomization without DB RAND() cost
        src.sort(() => Math.random() - 0.5);
        const easy = src.filter((q) => String(q.DifficultyLevel || '').toLowerCase() === 'easy');
        const medium = src.filter((q) => String(q.DifficultyLevel || '').toLowerCase() === 'medium');
        const hard = src.filter((q) => String(q.DifficultyLevel || '').toLowerCase() === 'hard');
        const rest = src.filter(
          (q) => !['easy', 'medium', 'hard'].includes(String(q.DifficultyLevel || '').toLowerCase())
        );
        const ordered = [...medium, ...easy, ...hard, ...rest];
        const picked = ordered.slice(0, dist.questionCount).map((q) => q.QuestionID);
        if (picked.length < dist.questionCount) {
          return res.status(400).json({
            error: `Not enough questions available in subject ${dist.subjectName}.`,
          });
        }
        chosenQuestionIds.push(...picked);
      }

      if (chosenQuestionIds.length !== parsedTotal) {
        return res.status(500).json({ error: 'Question selection mismatch. Please try again.' });
      }

      const nowIso = new Date().toISOString();
      const testName = `Self Practice - ${exam.ExamName} - ${new Date().toLocaleDateString()}`;
      const { data: newTest, error: createTestErr } = await supabase
        .from('Tests')
        .insert({
          SubscriptionID: eligibility.subscriptionId,
          ExamID: examId,
          OrgID: orgId || null,
          CreatedBy: null,
          TestName: testName,
          TestType: 'Practice',
          DurationMinutes: parsedDuration,
          TotalQuestions: parsedTotal,
          TotalMarks: parsedTotal,
          Status: 'Active',
          ScheduleMode: 'open',
          QuestionBindingMode: 'auto',
          HybridAutoPercent: 0,
          CreatedAt: nowIso,
        })
        .select('TestID, TestName')
        .single();
      if (createTestErr || !newTest) {
        return res.status(500).json({ error: 'Failed to create self-test', details: createTestErr?.message });
      }

      const tqRows = chosenQuestionIds.map((qid) => ({
        TestID: newTest.TestID,
        QuestionID: qid,
        Marks: 1,
        NegativeMarks: 0,
        TimeLimit: null,
      }));
      const { error: tqInsertErr } = await supabase.from('TestQuestions').insert(tqRows);
      if (tqInsertErr) {
        return res.status(500).json({ error: 'Failed to configure self-test questions', details: tqInsertErr.message });
      }

      const { error: assignErr } = await supabase.from('TestAssignments').insert({
        TestID: newTest.TestID,
        StudentID: studentId,
        AssignmentType: 'Single',
        AssignedBy: null,
        AssignedAt: nowIso,
        Status: 'Pending',
        DueDate: null,
      });
      if (assignErr) {
        return res.status(500).json({ error: 'Failed to assign self-test', details: assignErr.message });
      }

      await createLog({
        actorType: 'Student',
        actorID: studentId,
        actionType: 'Create',
        entityType: 'Test',
        entityID: newTest.TestID,
        description: `Self-test created: ${newTest.TestName}`,
        ipAddress,
        userAgent,
        newData: {
          examId,
          totalQuestions: parsedTotal,
          durationMinutes: parsedDuration,
          source: orgId ? 'OrgStudentSelfTestBuilder' : 'IndividualSelfTestBuilder',
        },
      });

      res.status(201).json({
        message: 'Self-test created successfully',
        test: {
          testId: newTest.TestID,
          testName: newTest.TestName,
          examId,
          totalQuestions: parsedTotal,
          durationMinutes: parsedDuration,
        },
        distribution: alloc.allocated,
      });
    } catch (error) {
      console.error('Individual self-test create error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/student/dashboard/stats
 * Get student dashboard statistics
 */
router.get('/dashboard/stats', authenticate, async (req, res) => {
  try {
    const { studentId, orgId } = req.user;

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }

    // Get total test assignments
    const { count: totalAssignments, error: assignmentsError } = await supabase
      .from('TestAssignments')
      .select('*', { count: 'exact', head: true })
      .eq('StudentID', studentId);

    // Get completed attempts (EndTime set = submitted / completed)
    const { count: completedTests, error: completedError } = await supabase
      .from('StudentAttempts')
      .select('*', { count: 'exact', head: true })
      .eq('StudentID', studentId)
      .not('EndTime', 'is', null);

    // Get pending assignments (not yet attempted)
    const { data: allAssignments, error: allAssignmentsError } = await supabase
      .from('TestAssignments')
      .select('AssignmentID, TestID, DueDate')
      .eq('StudentID', studentId);

    const now = new Date();
    let pendingTests = 0;
    let expiredTests = 0;

    if (allAssignments) {
      for (const assignment of allAssignments) {
        // Check if student has attempted this test
        const { count: attempts } = await supabase
          .from('StudentAttempts')
          .select('*', { count: 'exact', head: true })
          .eq('StudentID', studentId)
          .eq('TestID', assignment.TestID);

        if (!attempts || attempts === 0) {
          // Not attempted yet
          if (assignment.DueDate) {
            const dueDate = new Date(assignment.DueDate);
            if (dueDate < now) {
              expiredTests++;
            } else {
              pendingTests++;
            }
          } else {
            pendingTests++;
          }
        }
      }
    }

    // Average score: denominator comes from Tests.TotalMarks (not stored on StudentAttempts)
    const { data: scoredAttempts } = await supabase
      .from('StudentAttempts')
      .select('ObtainedMarks, TestID, EndTime')
      .eq('StudentID', studentId)
      .not('EndTime', 'is', null)
      .not('ObtainedMarks', 'is', null);

    let averageScore = 0;
    if (scoredAttempts && scoredAttempts.length > 0) {
      const testIds = [...new Set(scoredAttempts.map((a) => a.TestID))];
      const { data: testsForAvg } = await supabase
        .from('Tests')
        .select('TestID, TotalMarks')
        .in('TestID', testIds);
      const tmByTest = new Map(
        (testsForAvg || []).map((t) => {
          const tid = pickCol(t, ['TestID', 'testId', 'test_id']);
          const cfg = totalMarksConfiguredOnTest(t);
          return [tid, cfg != null ? cfg : 0];
        })
      );
      let totalPct = 0;
      let n = 0;
      for (const att of scoredAttempts) {
        const tm = tmByTest.get(att.TestID) || 0;
        if (tm > 0) {
          totalPct += (Number(att.ObtainedMarks) / tm) * 100;
          n += 1;
        }
      }
      averageScore = n > 0 ? totalPct / n : 0;
    }

    // Get recent test assignments
    const { data: recentAssignments, error: recentError } = await supabase
      .from('TestAssignments')
      .select('*')
      .eq('StudentID', studentId)
      .order('AssignedAt', { ascending: false })
      .limit(5);

    // Fetch test details for each assignment
    const enrichedRecentAssignments = await Promise.all(
      (recentAssignments || []).map(async (assignment) => {
        const { data: test, error: testErr } = await supabase
          .from('Tests')
          .select('TestID, TestName, TestDate, StartTime, EndTime, DurationMinutes, Status')
          .eq('TestID', assignment.TestID)
          .maybeSingle();

        if (testErr) {
          console.error('Dashboard recent assignment test fetch:', testErr);
        }
        const tn = testNameFromRow(test);
        const tid = testIdFromRow(test);
        const testDto = test
          ? {
              ...test,
              TestID: tid,
              TestName: tn,
              testId: tid,
              testName: tn,
              StartTime: test.StartTime ?? test.startTime ?? null,
              EndTime: test.EndTime ?? test.endTime ?? null,
              TestDate: test.TestDate ?? test.testDate ?? null,
              startTime: test.StartTime ?? test.startTime,
              endTime: test.EndTime ?? test.endTime,
              testDate: test.TestDate ?? test.testDate,
            }
          : null;
        const testForArray = test
          ? {
              ...test,
              TestID: tid,
              TestName: tn,
              testId: tid,
              testName: tn,
              StartTime: test.StartTime ?? test.startTime ?? null,
              EndTime: test.EndTime ?? test.endTime ?? null,
            }
          : null;

        return {
          ...assignment,
          test: testDto,
          Tests: testForArray ? [testForArray] : [],
        };
      })
    );

    res.json({
      stats: {
        totalAssignments: totalAssignments || 0,
        completedTests: completedTests || 0,
        pendingTests,
        expiredTests,
        averageScore: Math.round(averageScore * 10) / 10,
      },
      recentAssignments: enrichedRecentAssignments || [],
    });
  } catch (error) {
    console.error('Get student dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/student/assignments
 * Get all test assignments for the student
 */
router.get('/assignments', authenticate, async (req, res) => {
  try {
    const { studentId, orgId: rawOrg } = req.user;
    const orgId = rawOrg ?? req.user?.OrgID ?? null;

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }

    const { data: assignments, error } = await supabase
      .from('TestAssignments')
      .select('*')
      .eq('StudentID', studentId)
      .order('AssignedAt', { ascending: false });

    if (error) {
      console.error('Error fetching assignments:', error);
      return res.status(500).json({ error: 'Failed to fetch assignments', details: error.message });
    }

    // Enrich with test details and attempt status
    const enrichedAssignments = await Promise.all(
      (assignments || []).map(async (assignment) => {
        // Fetch test details (Tests table: TestDate, StartTime, EndTime — not StartDate/EndDate)
        const { data: test, error: testErr } = await supabase
          .from('Tests')
          .select(
            'TestID, ExamID, TestName, TestDate, StartTime, EndTime, DurationMinutes, Status, TotalQuestions, TotalMarks, SubscriptionID'
          )
          .eq('TestID', assignment.TestID)
          .maybeSingle();

        if (testErr) {
          console.error('GET /assignments test fetch:', assignment.TestID, testErr);
        }

        // Fetch attempt status (schema: no Status/TotalMarks on StudentAttempts)
        const { data: attempts } = await supabase
          .from('StudentAttempts')
          .select('AttemptID, ObtainedMarks, StartTime, EndTime')
          .eq('StudentID', studentId)
          .eq('TestID', assignment.TestID)
          .order('StartTime', { ascending: false })
          .limit(1);

        const scheduledAllowed = test ? await isScheduledModeEnabledForTest(test) : false;
        const tn = testNameFromRow(test);
        const tid = testIdFromRow(test);
        const testDto = test
          ? {
              ...test,
              TestID: tid,
              TestName: tn,
              testId: tid,
              testName: tn,
              StartTime: test.StartTime ?? test.startTime ?? null,
              EndTime: test.EndTime ?? test.endTime ?? null,
              TestDate: test.TestDate ?? test.testDate ?? null,
              startTime: test.StartTime ?? test.startTime,
              endTime: test.EndTime ?? test.endTime,
              testDate: test.TestDate ?? test.testDate,
            }
          : null;
        const testForArray = test
          ? {
              ...test,
              TestID: tid,
              TestName: tn,
              testId: tid,
              testName: tn,
              StartTime: test.StartTime ?? test.startTime ?? null,
              EndTime: test.EndTime ?? test.endTime ?? null,
            }
          : null;

        const testTotalMarks = test ? totalMarksConfiguredOnTest(test) : null;
        const latestRaw = attempts && attempts.length > 0 ? attempts[0] : null;

        const completedCycles =
          Number(
            pickCol(assignment, ['CompletedCycleCount', 'completed_cycle_count']) ?? 0
          ) || 0;

        return {
          ...assignment,
          test: testDto,
          Tests: testForArray ? [testForArray] : [],
          isScheduledModeAllowed: scheduledAllowed,
          latestAttempt: enrichAttemptDto(latestRaw, testTotalMarks),
          hasAttempted: attempts && attempts.length > 0,
          completedCycleCount: completedCycles,
        };
      })
    );

    const examIdsForGate = enrichedAssignments
      .map((a) => pickCol(a.test ?? {}, ['ExamID', 'examId']))
      .filter(Boolean);
    let enrollmentBlockedSet = new Set();
    try {
      enrollmentBlockedSet = await getStudentEnrollmentBlockedExamIdsSet(studentId, examIdsForGate, orgId);
    } catch (gateErr) {
      console.error('GET /assignments enrollment gate:', gateErr);
    }

    const assignmentsOut = enrichedAssignments.map((a) => {
      const examId = pickCol(a.test ?? {}, ['ExamID', 'examId']);
      const examBlocked = !!(examId && enrollmentBlockedSet.has(examId));
      const scheduledAllowed = a.isScheduledModeAllowed;
      let unavailableReason = null;
      if (!scheduledAllowed) {
        unavailableReason = 'Scheduled test mode is not included in your subscription plan.';
      } else if (examBlocked) {
        unavailableReason =
          'You are not enrolled in this exam (withdrawn or suspended). Open My Exams to re-enroll while your plan includes it.';
      }
      return {
        ...a,
        unavailableReason,
        isExamEnrollmentAllowed: !examBlocked,
      };
    });

    res.json({
      assignments: assignmentsOut,
      total: assignmentsOut.length,
    });
  } catch (error) {
    console.error('Get student assignments error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * Per-question scoring aligned with POST .../submit (exact match → full marks; else optional negative).
 * @param {Set<string>} selectedSet
 * @param {Set<string>} correctOptionIds
 * @param {number} marks
 * @param {number} negative
 */
function scoreQuestionAttempt(selectedSet, correctOptionIds, marks, negative) {
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

/**
 * GET /api/student/tests/:testId/result-detail
 * Rich result + analytics for the student's latest completed attempt on this test.
 * Data model: StudentAttempts, StudentAnswers (OptionID = Options.OptionID uuid),
 * TestAssignments, Tests, TestQuestions, Questions, Options, Topics, ResultDetails (optional),
 * Certificates (optional). Cohort stats approximate Leaderboard-style ranking.
 */
router.get('/tests/:testId/result-detail', authenticate, async (req, res) => {
  try {
    const { studentId: rawStudentId, orgId, actorType, userId } = req.user;
    const studentId =
      rawStudentId != null
        ? String(rawStudentId).trim()
        : actorType === 'Student' && userId != null
          ? String(userId).trim()
          : null;
    const testId = req.params.testId != null ? String(req.params.testId).trim() : null;

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }
    if (!testId) {
      return res.status(400).json({ error: 'Test ID is required' });
    }

    const { data: assignment, error: assignErr } = await supabase
      .from('TestAssignments')
      .select('*')
      .eq('StudentID', studentId)
      .eq('TestID', testId)
      .maybeSingle();

    if (assignErr) {
      console.error('result-detail assignment:', assignErr);
      return res.status(500).json({ error: 'Failed to load assignment', details: assignErr.message });
    }
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const { data: attemptsRaw, error: attErr } = await supabase
      .from('StudentAttempts')
      .select('*')
      .eq('StudentID', studentId)
      .eq('TestID', testId)
      .order('StartTime', { ascending: false });

    if (attErr) {
      return res.status(500).json({ error: 'Failed to load attempts', details: attErr.message });
    }

    const completedAttempts = (attemptsRaw || []).filter((a) => attemptCompletedFromRow(a));
    if (completedAttempts.length === 0) {
      return res.status(404).json({ error: 'No completed attempt found for this test' });
    }
    completedAttempts.sort((a, b) => {
      const endB = new Date(b.EndTime ?? b.endTime ?? 0).getTime();
      const endA = new Date(a.EndTime ?? a.endTime ?? 0).getTime();
      if (endB !== endA) return endB - endA;
      const startB = new Date(b.StartTime ?? b.startTime ?? 0).getTime();
      const startA = new Date(a.StartTime ?? a.startTime ?? 0).getTime();
      return startB - startA;
    });
    const attempt = completedAttempts[0];

    const attemptId = pickCol(attempt, ['AttemptID', 'attemptId', 'attempt_id']);
    if (!attemptId) {
      return res.status(500).json({ error: 'Attempt record is missing AttemptID' });
    }

    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select(
        'TestID, OrgID, ExamID, TestName, TestType, DurationMinutes, TotalQuestions, TotalMarks, TestDate, StartTime, EndTime, Status, ScheduleMode, QuestionBindingMode'
      )
      .eq('TestID', testId)
      .maybeSingle();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const rowOrgId = orgIdFromRow(test);
    if (orgId != null) {
      if (rowOrgId == null || String(rowOrgId) !== String(orgId)) {
        return res.status(404).json({ error: 'Test not found' });
      }
    }

    let orgName = null;
    const oid = orgIdFromRow(test);
    if (oid) {
      const { data: orgRow } = await supabase
        .from('Organizations')
        .select('OrgName')
        .eq('OrgID', oid)
        .maybeSingle();
      orgName = orgRow?.OrgName ?? orgRow?.orgName ?? null;
    }

    let examName = null;
    const exId = test.ExamID ?? test.examId;
    if (exId) {
      const { data: ex } = await supabase.from('Exams').select('ExamName').eq('ExamID', exId).maybeSingle();
      examName = ex?.ExamName ?? ex?.examName ?? null;
    }

    const { data: testQuestions, error: tqError } = await supabase
      .from('TestQuestions')
      .select(
        `
        QuestionID,
        Marks,
        NegativeMarks,
        Questions (
          QuestionID,
          QuestionText,
          QuestionType,
          DifficultyLevel,
          TopicID,
          Topics ( TopicID, TopicName, SubjectID, Subjects ( SubjectID, SubjectName ) ),
          ${PG_OPTIONS_BY_QUESTION_FK} (
            OptionID,
            OptionNumber,
            OptionText,
            IsCorrect
          )
        )
      `
      )
      .eq('TestID', testId)
      .order('QuestionID', { ascending: true });

    if (tqError) {
      console.error('result-detail test questions:', tqError);
      return res.status(500).json({ error: 'Failed to load questions', details: tqError.message });
    }

    const { data: answerRows, error: ansErr } = await supabase
      .from('StudentAnswers')
      .select('*')
      .eq('AttemptID', attemptId);

    if (ansErr) {
      return res.status(500).json({ error: 'Failed to load answers', details: ansErr.message });
    }

    const selectedByQuestion = new Map();
    for (const row of answerRows || []) {
      const qid = canonEntityId(pickCol(row, ['QuestionID', 'questionId', 'question_id']));
      const oidCanon = canonOptionRowId(pickCol(row, ['OptionID', 'optionId', 'option_id']));
      if (!qid || !oidCanon) continue;
      if (!selectedByQuestion.has(qid)) selectedByQuestion.set(qid, new Set());
      selectedByQuestion.get(qid).add(oidCanon);
    }

    const questionsOut = [];
    const topicAgg = new Map();
    const difficultyAgg = new Map();

    /** TopicID (canonical) → display names for ResultDetails roll-up (same source as question review). */
    const topicRollupNames = new Map();

    let order = 0;
    for (const row of testQuestions || []) {
      const q = unwrapEmbedded(row.Questions ?? row.questions) || {};
      const qIdRaw =
        pickCol(row, ['QuestionID', 'questionId', 'question_id']) ??
        pickCol(q, ['QuestionID', 'questionId', 'question_id']);
      if (qIdRaw == null || qIdRaw === '') continue;
      order += 1;
      const qId = canonEntityId(qIdRaw);
      const marks = Number(row.Marks ?? row.marks) || 0;
      const neg = Number(row.NegativeMarks ?? row.negativeMarks) || 0;
      let opts = q.Options ?? q.options;
      if (!Array.isArray(opts)) opts = opts == null ? [] : [opts];
      const correctOptionIds = new Set(
        opts
          .filter((o) => o.IsCorrect === true || o.isCorrect === true)
          .map((o) => canonOptionRowId(pickCol(o, ['OptionID', 'optionId', 'option_id'])))
          .filter((k) => k != null)
      );
      const selectedSet = (qId && selectedByQuestion.get(qId)) || new Set();
      const outcome = scoreQuestionAttempt(selectedSet, correctOptionIds, marks, neg);

      let topic = unwrapEmbedded(q.Topics ?? q.topics);
      if (!topic || typeof topic !== 'object') topic = {};
      const topicId = q.TopicID ?? q.topicId ?? null;
      const topicName = topic.TopicName ?? topic.topicName ?? (topicId ? 'Topic' : 'General');
      const subjectNested = unwrapEmbedded(topic.Subjects ?? topic.subjects) || {};
      const subjectNameFromTopic =
        subjectNested.SubjectName ??
        subjectNested.subjectName ??
        (typeof subjectNested === 'object' && subjectNested !== null
          ? pickCol(subjectNested, ['SubjectName', 'subjectName'])
          : null);
      const topicIdCanon = topicId != null && topicId !== '' ? canonEntityId(topicId) : null;
      if (topicIdCanon && !topicRollupNames.has(topicIdCanon)) {
        topicRollupNames.set(topicIdCanon, {
          topicName,
          subjectName: subjectNameFromTopic || null,
        });
      }

      const diffRaw = q.DifficultyLevel ?? q.difficultyLevel ?? 'Unspecified';
      const diffLabel = diffRaw || 'Unspecified';

      if (!topicAgg.has(topicName)) {
        topicAgg.set(topicName, { correct: 0, incorrect: 0, skipped: 0, marksEarned: 0, marksAvailable: 0 });
      }
      const tEntry = topicAgg.get(topicName);
      tEntry.marksEarned += outcome.marksEarned;
      tEntry.marksAvailable += outcome.marksAvailable;
      if (outcome.status === 'correct') tEntry.correct += 1;
      else if (outcome.status === 'skipped') tEntry.skipped += 1;
      else tEntry.incorrect += 1;

      if (!difficultyAgg.has(diffLabel)) {
        difficultyAgg.set(diffLabel, { correct: 0, total: 0 });
      }
      const dEntry = difficultyAgg.get(diffLabel);
      dEntry.total += 1;
      if (outcome.status === 'correct') dEntry.correct += 1;

      const selectedOptionIdsRaw = [...selectedSet].map((canon) => {
        const match = opts.find(
          (o) => canonOptionRowId(pickCol(o, ['OptionID', 'optionId', 'option_id'])) === canon
        );
        return match ? pickCol(match, ['OptionID', 'optionId', 'option_id']) : canon;
      });
      const correctOptionIdsRaw = opts
        .filter((o) => o.IsCorrect === true || o.isCorrect === true)
        .map((o) => pickCol(o, ['OptionID', 'optionId', 'option_id']))
        .filter(Boolean);

      questionsOut.push({
        order,
        questionId: qIdRaw ?? qId,
        questionText: q.QuestionText ?? q.questionText ?? '',
        questionType: q.QuestionType ?? q.questionType,
        difficultyLevel: diffLabel,
        topicId,
        topicName,
        marksAvailable: outcome.marksAvailable,
        marksEarned: outcome.marksEarned,
        status: outcome.status,
        selectedOptionIds: selectedOptionIdsRaw,
        correctOptionIds: correctOptionIdsRaw,
        options: opts.map((o) => {
          const oidC = canonOptionRowId(pickCol(o, ['OptionID', 'optionId', 'option_id']));
          return {
            optionId: pickCol(o, ['OptionID', 'optionId', 'option_id']),
            optionNumber: o.OptionNumber ?? o.optionNumber,
            optionText: o.OptionText ?? o.optionText,
            isCorrect: !!(o.IsCorrect === true || o.isCorrect === true),
            wasSelected: oidC != null && selectedSet.has(oidC),
          };
        }),
      });
    }

    const totalQ = questionsOut.length;
    const correctCount = questionsOut.filter((x) => x.status === 'correct').length;
    const incorrectCount = questionsOut.filter((x) => x.status === 'incorrect').length;
    const skippedCount = questionsOut.filter((x) => x.status === 'skipped').length;

    const obtained = Number(attempt.ObtainedMarks ?? attempt.obtainedMarks ?? 0);
    const sumQuestionMarks = questionsOut.reduce((s, q) => s + q.marksAvailable, 0);
    const configuredMax = totalMarksConfiguredOnTest(test);
    const testTotalMarks = configuredMax != null ? configuredMax : sumQuestionMarks;
    const pct =
      testTotalMarks > 0 ? Math.round((obtained / testTotalMarks) * 1000) / 10 : null;

    const startMs = new Date(attempt.StartTime ?? attempt.startTime).getTime();
    const endMs = new Date(attempt.EndTime ?? attempt.endTime).getTime();
    const durationSeconds =
      !Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs
        ? Math.round((endMs - startMs) / 1000)
        : null;
    const allowedMinutes = test.DurationMinutes ?? test.durationMinutes ?? null;

    let resultDetails = [];
    const { data: rdRows, error: rdErr } = await supabase
      .from('ResultDetails')
      .select('AttemptID, SubjectID, TopicID, ObtainedMarks, MaxMarks, Percentile')
      .eq('AttemptID', attemptId);
    if (!rdErr && rdRows?.length) {
      const subjectIds = [
        ...new Set(
          rdRows.map((r) => r.SubjectID ?? r.subjectId).filter((id) => id != null && String(id).trim() !== '')
        ),
      ];
      const topicIds = [
        ...new Set(
          rdRows.map((r) => r.TopicID ?? r.topicId).filter((id) => id != null && String(id).trim() !== '')
        ),
      ];
      const subjectNameById = new Map();
      const topicNameById = new Map();
      if (subjectIds.length) {
        const { data: subjRows, error: subjErr } = await supabase
          .from('Subjects')
          .select('SubjectID, SubjectName')
          .in('SubjectID', subjectIds);
        if (subjErr) {
          console.warn('result-detail: Subjects name lookup failed', subjErr.message);
        }
        for (const s of subjRows || []) {
          const id = pickCol(s, ['SubjectID', 'subjectId', 'subject_id']);
          if (id == null) continue;
          const key = canonEntityId(id);
          if (key) subjectNameById.set(key, s.SubjectName ?? s.subjectName ?? null);
        }
      }
      if (topicIds.length) {
        const { data: topicRows, error: topErr } = await supabase
          .from('Topics')
          .select('TopicID, TopicName')
          .in('TopicID', topicIds);
        if (topErr) {
          console.warn('result-detail: Topics name lookup failed', topErr.message);
        }
        for (const t of topicRows || []) {
          const id = pickCol(t, ['TopicID', 'topicId', 'topic_id']);
          if (id == null) continue;
          const key = canonEntityId(id);
          if (key) topicNameById.set(key, t.TopicName ?? t.topicName ?? null);
        }
      }
      resultDetails = rdRows.map((rd) => {
        const sid = rd.SubjectID ?? rd.subjectId;
        const tid = rd.TopicID ?? rd.topicId;
        const sidKey = sid != null && sid !== '' ? canonEntityId(sid) : null;
        const tidKey = tid != null && tid !== '' ? canonEntityId(tid) : null;
        const fromQuestionTree = tidKey ? topicRollupNames.get(tidKey) : null;
        return {
          ...rd,
          subjectName:
            fromQuestionTree?.subjectName ??
            (sidKey ? subjectNameById.get(sidKey) ?? null : null),
          topicName: fromQuestionTree?.topicName ?? (tidKey ? topicNameById.get(tidKey) ?? null : null),
        };
      });
    }

    let certificate = null;
    const { data: certRow } = await supabase
      .from('Certificates')
      .select('CertificateID, CertificateType, IssueDate, Status, CertificateURL')
      .eq('AttemptID', attemptId)
      .maybeSingle();
    if (certRow) certificate = certRow;

    const { data: cohortAttempts, error: coErr } = await supabase
      .from('StudentAttempts')
      .select('AttemptID, StudentID, ObtainedMarks, EndTime')
      .eq('TestID', testId)
      .not('EndTime', 'is', null);

    let cohort = { size: 0, rank: null, standingPercentile: null };
    if (!coErr && cohortAttempts?.length) {
      const sorted = [...cohortAttempts].sort(
        (a, b) => Number(b.ObtainedMarks ?? 0) - Number(a.ObtainedMarks ?? 0)
      );
      cohort.size = sorted.length;
      const strictlyHigher = sorted.filter(
        (a) => Number(a.ObtainedMarks ?? 0) > obtained
      ).length;
      cohort.rank = strictlyHigher + 1;
      if (sorted.length > 1) {
        cohort.standingPercentile =
          Math.round(((sorted.length - cohort.rank) / (sorted.length - 1)) * 1000) / 10;
      }
    }

    const testTotalMarksFinal =
      typeof testTotalMarks === 'number' && Number.isFinite(testTotalMarks) && testTotalMarks >= 0
        ? testTotalMarks
        : null;

    res.json({
      schemaVersion: 1,
      assignment: {
        assignmentId: assignment.AssignmentID,
        status: assignment.Status,
        dueDate: assignment.DueDate,
        assignedAt: assignment.AssignedAt,
        assignmentType: assignment.AssignmentType,
        completedCycleCount:
          Number(pickCol(assignment, ['CompletedCycleCount', 'completed_cycle_count']) ?? 0) || 0,
      },
      test: {
        testId: testIdFromRow(test),
        testName: testNameFromRow(test),
        testType: test.TestType ?? test.testType,
        durationMinutes: allowedMinutes,
        totalQuestions: test.TotalQuestions ?? test.totalQuestions ?? totalQ,
        totalMarks: testTotalMarksFinal,
        scheduleMode: test.ScheduleMode ?? test.scheduleMode ?? 'open',
        questionBindingMode: test.QuestionBindingMode ?? test.questionBindingMode ?? 'custom',
        testDate: test.TestDate ?? test.testDate,
        windowStart: test.StartTime ?? test.startTime,
        windowEnd: test.EndTime ?? test.endTime,
        orgName,
        examName,
      },
      attempt: enrichAttemptDto(attempt, testTotalMarksFinal),
      timing: {
        startTime: attempt.StartTime ?? attempt.startTime,
        endTime: attempt.EndTime ?? attempt.endTime,
        durationSeconds,
        allowedMinutes,
      },
      scoreSummary: {
        obtainedMarks: obtained,
        totalMarks: testTotalMarksFinal,
        percentage: pct,
        grade: attempt.Grade ?? attempt.grade ?? null,
        percentile: attempt.Percentile ?? attempt.percentile ?? null,
      },
      analytics: {
        questionCounts: { total: totalQ, correct: correctCount, incorrect: incorrectCount, skipped: skippedCount },
        byTopic: [...topicAgg.entries()].map(([name, v]) => ({
          topicName: name,
          ...v,
          accuracy:
            v.correct + v.incorrect > 0
              ? Math.round((v.correct / (v.correct + v.incorrect)) * 1000) / 10
              : null,
        })),
        byDifficulty: [...difficultyAgg.entries()].map(([level, v]) => ({
          level,
          correct: v.correct,
          total: v.total,
          accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 1000) / 10 : null,
        })),
      },
      resultDetails,
      certificate,
      cohort,
      questions: questionsOut,
    });
  } catch (error) {
    console.error('GET result-detail error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/student/tests/:testId/attempts
 * Start or resume an attempt for the given test
 */
router.post('/tests/:testId/attempts', authenticate, async (req, res) => {
  try {
    // Resolve student identity: JWT uses studentId; fallback to userId when actorType is Student
    const { studentId: rawStudentId, orgId: rawOrgId, actorType, userId } = req.user;
    const orgId = rawOrgId ?? req.user?.OrgID ?? null;
    const studentId = rawStudentId != null ? String(rawStudentId).trim() : (actorType === 'Student' && userId != null ? String(userId).trim() : null);
    const { testId: rawTestId } = req.params;
    const testId = rawTestId != null ? String(rawTestId).trim() : null;

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }
    if (!testId) {
      return res.status(400).json({ error: 'Test ID is required' });
    }

    // All rows for this student+test (newest first). If duplicates exist, prefer one that still allows start.
    const { data: assignmentRows, error: assignmentError } = await supabase
      .from('TestAssignments')
      .select('*')
      .eq('StudentID', studentId)
      .eq('TestID', testId)
      .order('AssignedAt', { ascending: false });

    if (assignmentError) {
      console.error('Start attempt: assignment lookup failed', { studentId, testId, error: assignmentError });
      return res.status(500).json({
        error: 'Failed to verify assignment',
        ...(process.env.NODE_ENV === 'development' && { details: assignmentError.message }),
      });
    }
    const rows = assignmentRows || [];
    const assignment = rows.find((r) => assignmentRowAllowsStart(r)) ?? null;
    if (!assignment) {
      if (rows.length === 0) {
        console.warn('Start attempt: no assignment found', { studentId, testId });
        return res.status(404).json({
          error: 'Test is not assigned to this student',
          ...(process.env.NODE_ENV === 'development' && {
            hint: 'Check that TestAssignments has a row for this TestID and StudentID. StudentID in JWT must match Students.StudentID.',
          }),
        });
      }
      const st = assignmentWorkflowStatusRaw(rows[0]) ?? '';
      return res.status(400).json({
        error: 'This assignment is not available for attempt',
        ...(process.env.NODE_ENV === 'development' && {
          assignmentStatus: st,
          hint: 'No active assignment row (Pending/InProgress). If you already submitted, open results or ask your organization to reassign the test.',
        }),
      });
    }

    // Load test details
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select(
        'TestID, OrgID, ExamID, TestName, TestType, DurationMinutes, TotalQuestions, TotalMarks, StartTime, EndTime, Status, ScheduleMode, SubscriptionID'
      )
      .eq('TestID', testId)
      .single();

    if (testError || !test) {
      if (process.env.NODE_ENV === 'development' && testError) {
        console.warn('Start attempt: Tests row fetch', { testId, testError: testError.message });
      }
      return res.status(404).json({ error: 'Test not found' });
    }
    // Organization students: test must belong to their org. Individual students: assignment already links them to the test.
    const rowOrgId = orgIdFromRow(test);
    if (orgId != null) {
      if (rowOrgId == null || String(rowOrgId) !== String(orgId)) {
        return res.status(404).json({ error: 'Test not found' });
      }
    }

    if (testStatusFromRow(test) !== 'Active') {
      return res.status(400).json({ error: 'Test is not active' });
    }
    if (!(await isScheduledModeEnabledForTest(test))) {
      return res.status(403).json({
        error:
          'This assigned test is currently not available because Scheduled mode is not included in the linked subscription plan.',
        code: 'SCHEDULED_MODE_DISABLED',
      });
    }

    const examIdForEnrollment = pickCol(test, ['ExamID', 'examId']);
    if (
      examIdForEnrollment &&
      !(await isStudentExamAccessAllowed(studentId, examIdForEnrollment, orgId))
    ) {
      return res.status(403).json({
        error:
          'You are not enrolled in this exam (withdrawn or suspended). Re-enroll from My Exams if your subscription still includes this exam.',
        code: 'EXAM_ENROLLMENT_INACTIVE',
      });
    }

    const now = new Date();
    const startTs = test.StartTime ?? test.startTime;
    const endTs = test.EndTime ?? test.endTime;
    if (startTs) {
      const start = new Date(startTs);
      if (start > now) {
        return res.status(400).json({ error: 'Test has not started yet' });
      }
    }
    if (endTs) {
      const end = new Date(endTs);
      if (end < now) {
        return res.status(400).json({ error: 'Test has already ended' });
      }
    }
    if (assignment.DueDate) {
      const due = new Date(assignment.DueDate);
      if (due < now) {
        return res.status(400).json({ error: 'Assignment due date has passed' });
      }
    }

    // Check for existing attempts (omit optional columns not present on all DBs, e.g. AttemptOrdinal)
    const { data: existingAttempts } = await supabase
      .from('StudentAttempts')
      .select('AttemptID, StartTime, EndTime, ObtainedMarks')
      .eq('StudentID', studentId)
      .eq('TestID', testId)
      .order('StartTime', { ascending: false })
      .limit(1);

    const existingAttempt = existingAttempts && existingAttempts.length > 0 ? existingAttempts[0] : null;

    if (existingAttempt && attemptCompletedFromRow(existingAttempt)) {
      return res.status(400).json({ error: 'You have already completed this test' });
    }

    let attempt = existingAttempt;
    const completedCyclesForOrdinal =
      Number(pickCol(assignment, ['CompletedCycleCount', 'completed_cycle_count']) ?? 0) || 0;

    if (!attempt) {
      // Create new attempt — core columns only; AttemptOrdinal is optional (see backend/scripts/add_attempt_ordinal_columns.sql)
      const { data: newAttempt, error: insertError } = await supabase
        .from('StudentAttempts')
        .insert({
          StudentID: studentId,
          TestID: testId,
          StartTime: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating attempt:', insertError);
        return res.status(500).json({ error: 'Failed to start attempt', details: insertError.message });
      }

      attempt = newAttempt;

      // Mark assignment as InProgress when starting from Pending (or legacy null/blank status)
      const stStart = assignmentWorkflowStatusRaw(assignment);
      const stNorm =
        stStart == null || String(stStart).trim() === ''
          ? 'pending'
          : String(stStart).trim().toLowerCase().replace(/\s+/g, '');
      if (stNorm === 'pending') {
        await supabase
          .from('TestAssignments')
          .update({ Status: 'InProgress' })
          .eq('AssignmentID', assignment.AssignmentID);
      }
    }

    // Load questions for this test (Custom binding baseline)
    const { data: testQuestions, error: tqError } = await supabase
      .from('TestQuestions')
      .select(
        `
        QuestionID,
        Marks,
        NegativeMarks,
        Questions (
          QuestionID,
          QuestionText,
          QuestionType,
          DifficultyLevel,
          ${PG_OPTIONS_BY_QUESTION_FK} (
            OptionID,
            OptionNumber,
            OptionText
          )
        )
      `
      )
      .eq('TestID', testId)
      // Use QuestionID for ordering: older DBs may not have TestQuestions.DisplayOrder yet (PostgREST errors break the whole embed).
      .order('QuestionID', { ascending: true });

    if (tqError) {
      console.error('Error loading test questions for attempt:', tqError);
      return res
        .status(500)
        .json({ error: 'Failed to load questions for this test', details: tqError.message });
    }

    const questions = (testQuestions || [])
      .map((row) => {
        const q = unwrapEmbedded(row.Questions ?? row.questions) || {};
        const qid =
          pickCol(row, ['QuestionID', 'questionId', 'question_id']) ??
          pickCol(q, ['QuestionID', 'questionId', 'question_id']);
        let opts = q.Options ?? q.options;
        if (!Array.isArray(opts)) opts = opts == null ? [] : [opts];
        return {
          questionId: qid,
          questionText: q.QuestionText ?? q.questionText,
          questionType: q.QuestionType ?? q.questionType,
          difficultyLevel: q.DifficultyLevel ?? q.difficultyLevel,
          marks: row.Marks ?? row.marks,
          negativeMarks: row.NegativeMarks ?? row.negativeMarks,
          options: opts.map((opt) => ({
            optionId: pickCol(opt, ['OptionID', 'optionId', 'option_id']),
            optionNumber: opt.OptionNumber ?? opt.optionNumber,
            optionText: opt.OptionText ?? opt.optionText,
          })),
        };
      })
      .filter((item) => item.questionId != null && item.questionId !== '');

    if (questions.length === 0) {
      return res
        .status(400)
        .json({ error: 'This test has no questions configured. Please contact your organization.' });
    }

    res.json({
      attempt: {
        attemptId: attempt.AttemptID ?? attempt.attemptId,
        status: attemptStatusFromRow(attempt),
        startTime: attempt.StartTime ?? attempt.startTime,
        attemptOrdinal:
          pickCol(attempt, ['AttemptOrdinal', 'attemptOrdinal']) ?? completedCyclesForOrdinal + 1,
        completedCyclesBeforeThisAttempt: completedCyclesForOrdinal,
      },
      test: {
        testId: testIdFromRow(test),
        testName: testNameFromRow(test),
        description: null,
        testType: test.TestType ?? test.testType,
        durationMinutes: test.DurationMinutes ?? test.durationMinutes,
        totalQuestions: test.TotalQuestions ?? test.totalQuestions,
        totalMarks: totalMarksConfiguredOnTest(test),
        startTime: test.StartTime ?? test.startTime,
        endTime: test.EndTime ?? test.endTime,
        scheduleMode: test.ScheduleMode ?? test.scheduleMode ?? 'open',
      },
      assignment: {
        assignmentId: assignment.AssignmentID,
        status: assignment.Status,
        dueDate: assignment.DueDate,
      },
      questions,
    });
  } catch (error) {
    console.error('Start attempt error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/student/tests/:testId/attempts/:attemptId/submit
 * Submit answers for an attempt and finalize it
 */
router.post('/tests/:testId/attempts/:attemptId/submit', authenticate, async (req, res) => {
  try {
    const { studentId } = req.user;
    const { testId, attemptId } = req.params;
    const { answers } = req.body || {};

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'No answers provided' });
    }

    // Load attempt
    const { data: attempt, error: attemptError } = await supabase
      .from('StudentAttempts')
      .select('*')
      .eq('AttemptID', attemptId)
      .eq('StudentID', studentId)
      .eq('TestID', testId)
      .single();

    if (attemptError || !attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attemptCompletedFromRow(attempt)) {
      return res.status(400).json({ error: 'Attempt already completed' });
    }

    // Load test & questions with correct options
    const { data: test, error: testError } = await supabase
      .from('Tests')
      .select('TestID, TotalMarks')
      .eq('TestID', testId)
      .single();

    if (testError || !test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const { data: testQuestions, error: tqError } = await supabase
      .from('TestQuestions')
      .select(
        `
        QuestionID,
        Marks,
        NegativeMarks,
        Questions (
          QuestionID,
          QuestionType,
          TopicID,
          Topics (
            TopicID,
            SubjectID
          ),
          ${PG_OPTIONS_BY_QUESTION_FK} (
            OptionID,
            IsCorrect
          )
        )
      `
      )
      .eq('TestID', testId);

    if (tqError) {
      console.error('Error loading questions for scoring:', tqError);
      return res
        .status(500)
        .json({ error: 'Failed to load questions for scoring', details: tqError.message });
    }

    /** question canon id -> list of raw client selections (uuid or legacy option number) */
    const answerMap = new Map();
    for (const a of answers) {
      if (!a) continue;
      const qKey = canonEntityId(a.questionId ?? a.QuestionID ?? a.question_id);
      if (!qKey) continue;
      const selected = Array.isArray(a.selectedOptionIds) ? a.selectedOptionIds : [];
      const list = [];
      for (const id of selected) {
        if (id == null || id === '') continue;
        list.push(typeof id === 'number' ? id : String(id).trim());
      }
      answerMap.set(qKey, list);
    }

    let obtainedMarks = 0;
    let maxMarks = 0;

    // Clear previous answers for this attempt (if any)
    await supabase.from('StudentAnswers').delete().eq('AttemptID', attemptId);
    await supabase.from('ResultDetails').delete().eq('AttemptID', attemptId);

    const studentAnswersToInsert = [];
    /** @type {Map<string, { topicId: string|null, subjectId: string|null, obtained: number, max: number }>} */
    const topicAgg = new Map();

    for (const row of testQuestions || []) {
      const q = unwrapEmbedded(row.Questions ?? row.questions) || {};
      const qId =
        pickCol(row, ['QuestionID', 'questionId', 'question_id']) ??
        pickCol(q, ['QuestionID', 'questionId', 'question_id']);
      if (qId == null || qId === '') continue;
      const marks = Number(row.Marks ?? row.marks) || 0;
      const negative = Number(row.NegativeMarks ?? row.negativeMarks) || 0;

      maxMarks += marks;

      let opts = q.Options ?? q.options;
      if (!Array.isArray(opts)) opts = opts == null ? [] : [opts];

      const correctOptionIds = new Set(
        opts
          .filter((opt) => opt.IsCorrect === true || opt.isCorrect === true)
          .map((opt) => canonOptionRowId(pickCol(opt, ['OptionID', 'optionId', 'option_id'])))
          .filter((k) => k != null)
      );

      const rawSelected = answerMap.get(canonEntityId(qId)) || [];
      const selectedSet = new Set();
      for (const raw of rawSelected) {
        const c = resolveSelectedOptionCanon(raw, opts);
        if (c) selectedSet.add(c);
      }

      for (const opt of opts) {
        const optIdRaw = pickCol(opt, ['OptionID', 'optionId', 'option_id']);
        const optCanon = canonOptionRowId(optIdRaw);
        if (optCanon != null && selectedSet.has(optCanon)) {
          studentAnswersToInsert.push({
            AttemptID: attemptId,
            QuestionID: qId,
            OptionID: optIdRaw,
            IsCorrect: !!(opt.IsCorrect === true || opt.isCorrect === true),
          });
        }
      }

      let qObtained = 0;
      if (selectedSet.size === 0) {
        qObtained = 0;
      } else {
        let isExactMatch = true;
        if (selectedSet.size !== correctOptionIds.size) {
          isExactMatch = false;
        } else {
          for (const id of selectedSet) {
            if (!correctOptionIds.has(id)) {
              isExactMatch = false;
              break;
            }
          }
        }
        if (isExactMatch) {
          qObtained = marks;
          obtainedMarks += marks;
        } else if (negative > 0) {
          qObtained = -negative;
          obtainedMarks -= negative;
        }
      }

      const topicIdRaw = pickCol(q, ['TopicID', 'topicId']);
      const topicEmbed = unwrapEmbedded(q.Topics ?? q.topics) || {};
      const subjectFromTopic = pickCol(topicEmbed, ['SubjectID', 'subjectId']);
      const topicKey =
        topicIdRaw != null && topicIdRaw !== '' ? String(topicIdRaw) : '__no_topic__';
      if (!topicAgg.has(topicKey)) {
        topicAgg.set(topicKey, {
          topicId: topicIdRaw != null && topicIdRaw !== '' ? String(topicIdRaw) : null,
          subjectId: subjectFromTopic != null && subjectFromTopic !== '' ? String(subjectFromTopic) : null,
          obtained: 0,
          max: 0,
        });
      }
      const agg = topicAgg.get(topicKey);
      if (!agg.subjectId && subjectFromTopic) agg.subjectId = String(subjectFromTopic);
      agg.obtained += qObtained;
      agg.max += marks;
    }

    if (studentAnswersToInsert.length > 0) {
      const { error: saInsErr } = await supabase.from('StudentAnswers').insert(studentAnswersToInsert);
      if (saInsErr) {
        console.error('StudentAnswers insert failed:', saInsErr);
        return res.status(500).json({
          error: 'Failed to save your answers for this attempt',
          details: saInsErr.message,
        });
      }
    }

    const resultDetailRows = [];
    for (const agg of topicAgg.values()) {
      resultDetailRows.push({
        AttemptID: attemptId,
        SubjectID: agg.subjectId,
        TopicID: agg.topicId,
        ObtainedMarks: agg.obtained,
        MaxMarks: agg.max,
        Percentile: null,
      });
    }
    if (resultDetailRows.length > 0) {
      const { error: rdErr } = await supabase.from('ResultDetails').insert(resultDetailRows);
      if (rdErr) {
        console.error('ResultDetails insert failed:', rdErr);
        return res.status(500).json({
          error: 'Failed to save topic result breakdown',
          details: rdErr.message,
        });
      }
    }

    const configuredMax = totalMarksConfiguredOnTest(test);
    const finalTotalMarks =
      configuredMax != null
        ? configuredMax
        : Number.isFinite(maxMarks) && maxMarks >= 0
          ? maxMarks
          : null;

    // Finalize attempt
    const { data: updatedAttempt, error: updateError } = await supabase
      .from('StudentAttempts')
      .update({
        EndTime: new Date().toISOString(),
        ObtainedMarks: obtainedMarks,
      })
      .eq('AttemptID', attemptId)
      .select()
      .single();

    if (updateError) {
      console.error('Error finalizing attempt:', updateError);
      return res.status(500).json({ error: 'Failed to finalize attempt', details: updateError.message });
    }

    const { data: taPrior } = await supabase
      .from('TestAssignments')
      .select('CompletedCycleCount, completed_cycle_count')
      .eq('StudentID', studentId)
      .eq('TestID', testId)
      .maybeSingle();
    const prevCycles =
      Number(pickCol(taPrior ?? {}, ['CompletedCycleCount', 'completed_cycle_count']) ?? 0) || 0;

    await supabase
      .from('TestAssignments')
      .update({
        Status: 'Completed',
        CompletedCycleCount: prevCycles + 1,
      })
      .eq('StudentID', studentId)
      .eq('TestID', testId);

    res.json({
      message: 'Attempt submitted successfully',
      attempt: updatedAttempt,
      score: obtainedMarks,
      totalMarks: finalTotalMarks,
      percentage:
        finalTotalMarks && finalTotalMarks > 0
          ? Math.round((obtainedMarks / finalTotalMarks) * 1000) / 10
          : null,
    });
  } catch (error) {
    console.error('Submit attempt error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});
/**
 * GET /api/student/tests
 * Get tests currently available for the logged-in student
 * (assignment-based visibility)
 */
router.get('/tests', authenticate, async (req, res) => {
  try {
    const { studentId } = req.user;
    const orgId = req.user?.orgId ?? req.user?.OrgID ?? null;

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }

    // Load assignments for this student that are potentially available
    const { data: assignments, error } = await supabase
      .from('TestAssignments')
      .select('*')
      .eq('StudentID', studentId)
      .in('Status', ['Pending', 'InProgress', 'pending', 'inprogress']);

    if (error) {
      console.error('Error fetching assignments for available tests:', error);
      return res.status(500).json({ error: 'Failed to fetch assignments', details: error.message });
    }

    const now = new Date();

    const enriched = await Promise.all(
      (assignments || []).map(async (assignment) => {
        const { data: test } = await supabase
          .from('Tests')
          .select(
            'TestID, OrgID, ExamID, TestName, TestType, DurationMinutes, StartTime, EndTime, Status, TotalQuestions, TotalMarks, SubscriptionID'
          )
          .eq('TestID', assignment.TestID)
          .single();

        if (!test || testStatusFromRow(test) !== 'Active') {
          return null;
        }
        if (!(await isScheduledModeEnabledForTest(test))) {
          return null;
        }
        const examKey = pickCol(test, ['ExamID', 'examId']);
        if (examKey && !(await isStudentExamAccessAllowed(studentId, examKey, orgId))) {
          return null;
        }
        const availRowOrg = orgIdFromRow(test);
        if (orgId != null) {
          if (availRowOrg == null || String(availRowOrg) !== String(orgId)) {
            return null;
          }
        }

        // Time window check
        let withinWindow = true;
        const availStart = test.StartTime ?? test.startTime;
        const availEnd = test.EndTime ?? test.endTime;
        if (availStart) {
          const start = new Date(availStart);
          if (start > now) withinWindow = false;
        }
        if (availEnd) {
          const end = new Date(availEnd);
          if (end < now) withinWindow = false;
        }
        if (assignment.DueDate) {
          const due = new Date(assignment.DueDate);
          if (due < now) withinWindow = false;
        }

        if (!withinWindow) {
          return null;
        }

        // Latest attempt (if any)
        const { data: attempts } = await supabase
          .from('StudentAttempts')
          .select('AttemptID, ObtainedMarks, StartTime, EndTime')
          .eq('StudentID', studentId)
          .eq('TestID', assignment.TestID)
          .order('StartTime', { ascending: false })
          .limit(1);

        const latestRaw = attempts && attempts.length > 0 ? attempts[0] : null;
        const testTotalMarks = test ? totalMarksConfiguredOnTest(test) : null;
        const latestAttempt = enrichAttemptDto(latestRaw, testTotalMarks);
        const tn = testNameFromRow(test);
        const tid = testIdFromRow(test);

        return {
          assignmentId: assignment.AssignmentID,
          assignmentStatus: assignment.Status,
          dueDate: assignment.DueDate,
          assignedAt: assignment.AssignedAt,
          test: {
            ...test,
            TestID: tid,
            TestName: tn,
            testId: tid,
            testName: tn,
          },
          latestAttempt,
        };
      })
    );

    const availableTests = enriched.filter((item) => item !== null);

    res.json({
      tests: availableTests,
      total: availableTests.length,
    });
  } catch (error) {
    console.error('Get student available tests error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * ORG ADMIN STUDENT MANAGEMENT ROUTES
 *
 * These routes are mounted at /api/org/students and allow an OrgAdmin
 * to manage the Students table for their organization.
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
    const { orgId } = req.user;
    const { students } = req.body || {};

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'No students provided' });
    }

    try {
      const results = {
        created: 0,
        skipped: 0,
        errors: [],
      };

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
            results.errors.push({
              index,
              email,
              reason: 'Missing fullName or email',
            });
            continue;
          }

          const { data: existing } = await supabase
            .from('Students')
            .select('StudentID')
            .eq('Email', email)
            .maybeSingle();

          if (existing) {
            results.skipped++;
            results.errors.push({
              index,
              email,
              reason: 'Email already registered',
            });
            continue;
          }

          const plainPassword =
            typeof password === 'string' && password.trim().length > 0
              ? password.trim()
              : Math.random().toString(36).slice(-8);
          const passwordHash = await hashPassword(plainPassword);

          const { error: insertError } = await supabase.from('Students').insert({
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
          });

          if (insertError) {
            results.skipped++;
            results.errors.push({
              index,
              email,
              reason: insertError.message,
            });
          } else {
            results.created++;
          }
        } catch (error) {
          results.skipped++;
          results.errors.push({
            index,
            email: s?.email,
            reason: error.message,
          });
        }
      }

      res.json({
        message: 'Bulk registration completed',
        summary: results,
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
            const result = await upsertStudentExamActivation({
              studentId,
              examId,
              orgId,
              subscriptionId: meta?.subscriptionId ?? null,
              approvePendingAsOrg: true,
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
      for (const s of students) {
        const planMap = await buildPlanExamEligibilityMap(s.StudentID, null, orgId);
        const relevantExamIds = examIds.filter((eid) => planMap.has(eid));
        if (relevantExamIds.length === 0) continue;

        const { data: enrollRows, error: enErr } = await supabase
          .from('StudentExamEnrollments')
          .select('ExamID, Status')
          .eq('StudentID', s.StudentID)
          .eq('OrgID', orgId)
          .in('ExamID', relevantExamIds);
        if (enErr) throw enErr;
        const byExam = new Map((enrollRows || []).map((r) => [r.ExamID, r]));

        // Keep student visible if at least one selected exam still needs an enrollment action.
        let needsAny = false;
        for (const examId of relevantExamIds) {
          const row = byExam.get(examId);
          const isActive = !row || enrollmentRecordAllowsExamAccess(row.Status);
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

const DIRECTORY_STATUS_VALUES = ['Pending', 'Approved', 'Rejected', 'Withdrawn', 'Suspended', 'Implicit'];

function directoryDtoFromEnrollmentRecord(
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
            if (matchesStatusFilter(dto)) merged.push(dto);
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
            if (matchesStatusFilter(dto)) merged.push(dto);
          }
        }

        for (const r of enrollByStudent.get(student.StudentID) || []) {
          if (seenExamIds.has(r.ExamID)) continue;
          if (examIdFilter && r.ExamID !== examIdFilter) continue;
          const en = examById.get(r.ExamID)?.ExamName ?? null;
          const dto = directoryDtoFromEnrollmentRecord(r, sn, se, en, orgUserById);
          if (matchesStatusFilter(dto)) merged.push(dto);
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

      const result = await upsertStudentExamActivation({
        studentId,
        examId,
        orgId,
        subscriptionId: meta?.subscriptionId ?? null,
        approvePendingAsOrg: true,
        reviewerOrgUserId,
      });

      res.json({
        message: result.noop ? 'Student already active for this exam.' : 'Student re-enrolled in this exam.',
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
