import { supabase } from '../config/database.js';

export const ENROLLMENT_APPROVAL_MODES = [
  'manual',
  'auto_direct_assign',
  'auto_student_requests',
];

const DEFAULTS = {
  allowStudentRequests: true,
  enrollmentApprovalMode: 'auto_direct_assign',
};

function normalizeMode(mode) {
  const m = String(mode || '').trim();
  return ENROLLMENT_APPROVAL_MODES.includes(m) ? m : DEFAULTS.enrollmentApprovalMode;
}

export function mapEnrollmentSettingsRow(row) {
  if (!row) return { ...DEFAULTS };
  return normalizeEnrollmentPair({
    allowStudentRequests: row.AllowStudentRequests !== false,
    enrollmentApprovalMode: normalizeMode(
      row.EnrollmentApprovalMode ?? row.enrollmentApprovalMode
    ),
  });
}

/**
 * auto_student_requests only applies when students may submit requests.
 * When requests are off, coerce to auto_direct_assign (preserves admin workflow).
 */
export function normalizeEnrollmentPair({ allowStudentRequests, enrollmentApprovalMode }) {
  const allow = allowStudentRequests !== false;
  let mode = normalizeMode(enrollmentApprovalMode);
  if (!allow && mode === 'auto_student_requests') {
    mode = 'auto_direct_assign';
  }
  return {
    allowStudentRequests: allow,
    enrollmentApprovalMode: mode,
  };
}

/**
 * Load org enrollment settings; returns defaults if row missing.
 */
export async function getOrgEnrollmentSettings(orgId) {
  if (!orgId) return { ...DEFAULTS };
  const { data, error } = await supabase
    .from('OrgEnrollmentSettings')
    .select('AllowStudentRequests, EnrollmentApprovalMode')
    .eq('OrgID', orgId)
    .maybeSingle();
  if (error) throw error;
  return mapEnrollmentSettingsRow(data);
}

export function shouldAutoApproveDirectAssign(settings) {
  return settings?.enrollmentApprovalMode === 'auto_direct_assign';
}

export function shouldAutoApproveStudentRequests(settings) {
  return (
    settings?.allowStudentRequests !== false &&
    settings?.enrollmentApprovalMode === 'auto_student_requests'
  );
}

/**
 * Ensure settings row exists (signup / lazy init).
 */
export async function ensureOrgEnrollmentSettings(orgId, updatedBy = null) {
  const { data: existing } = await supabase
    .from('OrgEnrollmentSettings')
    .select('OrgID')
    .eq('OrgID', orgId)
    .maybeSingle();
  if (existing) return;
  const { error } = await supabase.from('OrgEnrollmentSettings').insert({
    OrgID: orgId,
    AllowStudentRequests: true,
    EnrollmentApprovalMode: 'auto_direct_assign',
    UpdatedBy: updatedBy,
    UpdatedAt: new Date().toISOString(),
  });
  if (error && error.code !== '23505') throw error;
}
