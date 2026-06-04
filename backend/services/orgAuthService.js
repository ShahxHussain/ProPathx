import { generateToken } from '../utils/jwt.js';
import { resolveMustChangePassword } from '../utils/orgMustChangePassword.js';

/** JWT + client user object for an organization portal user */
export function buildOrgUserLoginPayload(orgUser, organization) {
  const mustChangePassword = resolveMustChangePassword(orgUser, organization);
  const token = generateToken({
    actorType: 'OrgUser',
    orgId: organization.OrgID,
    orgUserId: String(orgUser.OrgUserID),
    org_user_id: String(orgUser.OrgUserID),
    role: orgUser.Role,
    mustChangePassword,
  });
  return {
    token,
    user: {
      userId: orgUser.OrgUserID,
      fullName: orgUser.FullName,
      email: orgUser.Email,
      role: orgUser.Role,
      orgId: organization.OrgID,
      orgName: organization.OrgName,
      userType: 'Organization',
      mustChangePassword,
    },
  };
}
