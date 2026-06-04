/**
 * Whether an org portal user must set their own password before using the app.
 * Uses MustChangePassword when present; falls back for first login when the column
 * is missing or was not persisted on insert.
 */
export function resolveMustChangePassword(orgUser, organization = null) {
  if (!orgUser) return false;

  if (orgUser.MustChangePassword === true) return true;
  if (orgUser.MustChangePassword === false) return false;

  // Already logged in at least once without the flag — do not force welcome retroactively
  if (orgUser.LastLogin) return false;

  const role = orgUser.Role;

  // SuperAdmin-created organization: first OrgAdmin login only for new accounts
  if (role === 'OrgAdmin' && organization?.CreatedBy) {
    const createdAt = orgUser.CreatedAt ? new Date(orgUser.CreatedAt).getTime() : NaN;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (!Number.isNaN(createdAt) && Date.now() - createdAt > sevenDaysMs) {
      return false;
    }
    return true;
  }

  // OrgAdmin-created Reviewer / Subject Expert (first login)
  if (role === 'Reviewer' || role === 'Subject Expert') {
    return true;
  }

  return false;
}
