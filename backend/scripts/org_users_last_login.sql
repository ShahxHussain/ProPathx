-- Ensure OrgUsers.LastLogin exists (profile + login tracking)
ALTER TABLE "OrgUsers"
  ADD COLUMN IF NOT EXISTS "LastLogin" timestamptz;

COMMENT ON COLUMN "OrgUsers"."LastLogin" IS
  'Timestamp of the user''s most recent successful portal login.';
