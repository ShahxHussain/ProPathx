-- Questions: explicit Status enum (Draft | Pending | Verified | Rejected)
-- Run in Supabase SQL Editor after 008.
-- IsVerified is NOT dropped here — keep it for shared dev/client DB until migration 010.
-- 0) If you already created the enum with 'Approved', rename it once:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_questions_enum' AND e.enumlabel = 'Approved'
  ) THEN
    ALTER TYPE public.status_questions_enum RENAME VALUE 'Approved' TO 'Verified';
  END IF;
END $$;

-- 1) Enum type (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_questions_enum') THEN
    CREATE TYPE public.status_questions_enum AS ENUM (
      'Draft',
      'Pending',
      'Verified',
      'Rejected'
    );
  END IF;
END $$;

-- 2) Status column on Questions
ALTER TABLE public."Questions"
  ADD COLUMN IF NOT EXISTS "Status" public.status_questions_enum NOT NULL DEFAULT 'Pending';

COMMENT ON COLUMN public."Questions"."Status" IS
  'Draft = expert saved, not submitted; Pending = in reviewer queue; Verified/Rejected = review outcome.';

-- 3) When expert submits Draft → Pending
ALTER TABLE public."Questions"
  ADD COLUMN IF NOT EXISTS "SubmittedAt" timestamptz NULL;

COMMENT ON COLUMN public."Questions"."SubmittedAt" IS
  'Set when Status moves from Draft (or Rejected resubmit) to Pending. NULL while Draft.';

COMMENT ON COLUMN public."Questions"."ReviewerComments" IS
  'Reviewer rejection feedback. Non-null only when Status = Rejected. Cleared on verify or expert resubmit.';

-- 4) Backfill from legacy flags (safe to re-run)
UPDATE public."Questions"
SET "Status" = 'Verified'::public.status_questions_enum
WHERE "IsVerified" = true
  AND (
    "Status" IS NULL
    OR "Status" = 'Pending'::public.status_questions_enum
  );

UPDATE public."Questions"
SET "Status" = 'Rejected'::public.status_questions_enum
WHERE "IsVerified" = false
  AND "ReviewerComments" IS NOT NULL
  AND (
    "Status" IS NULL
    OR "Status" = 'Pending'::public.status_questions_enum
  );

UPDATE public."Questions"
SET "Status" = 'Pending'::public.status_questions_enum,
    "SubmittedAt" = COALESCE("SubmittedAt", "CreatedAt")
WHERE "IsVerified" = false
  AND "ReviewerComments" IS NULL
  AND "Status" IS NULL;

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_questions_status
  ON public."Questions" ("Status");

CREATE INDEX IF NOT EXISTS idx_questions_org_status
  ON public."Questions" ("OrgID", "Status")
  WHERE "OrgID" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_questions_created_by_status
  ON public."Questions" ("CreatedBy", "Status")
  WHERE "CreatedBy" IS NOT NULL;
