-- Optional profile image URL for organization portal users (matches Users / Students pattern)
ALTER TABLE "OrgUsers"
  ADD COLUMN IF NOT EXISTS "ProfileImageURL" text NULL;

COMMENT ON COLUMN "OrgUsers"."ProfileImageURL" IS
  'HTTPS URL to avatar image. Managed via /api/profile by the user.';
