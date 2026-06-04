-- OrgUsers: force password change on first login for admin-provisioned accounts
-- Run in Supabase SQL editor before using first-login password flow.

ALTER TABLE "OrgUsers"
  ADD COLUMN IF NOT EXISTS "MustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "OrgUsers"."MustChangePassword" IS
  'When true, user must set a new password via POST /api/org/auth/first-password before using the portal.';

-- Existing accounts are unchanged (default false). New SuperAdmin / OrgAdmin-created users set true in API.

-- Re-test welcome flow for an org admin that already logged in once:
-- UPDATE "OrgUsers" SET "MustChangePassword" = true, "LastLogin" = NULL WHERE "Email" = 'your@org.email';
