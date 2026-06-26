-- Drop Questions.IsVerified after Status enum is live (migration 009).
--
-- ⚠️  DO NOT RUN on shared dev/staging DB while client is still testing
--     or before ALL app code uses Questions.Status only.
--
-- PREREQUISITES (all must be true):
--   1) 009_questions_status_draft.sql already applied.
--   2) Application deployed everywhere (your env + client) using Status, not IsVerified.
--   3) Dedicated maintenance window — no mixed old/new app versions hitting the DB.
--
-- Until then: KEEP IsVerified. Write both columns in sync (see Database_Schema.md).
--
-- Safe to re-run: DROP COLUMN IF EXISTS is idempotent.
-- VerifiedBy / VerifiedAt are KEPT (who verified, when).

-- ---------------------------------------------------------------------------
-- A) One-time rename if enum still has 'Approved' instead of 'Verified'
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- B) Ensure Status column exists (in case 009 was skipped)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_questions_enum') THEN
    CREATE TYPE public.status_questions_enum AS ENUM (
      'Draft', 'Pending', 'Verified', 'Rejected'
    );
  END IF;
END $$;

ALTER TABLE public."Questions"
  ADD COLUMN IF NOT EXISTS "Status" public.status_questions_enum NOT NULL DEFAULT 'Pending';

ALTER TABLE public."Questions"
  ADD COLUMN IF NOT EXISTS "SubmittedAt" timestamptz NULL;

-- ---------------------------------------------------------------------------
-- C) Final backfill from IsVerified + ReviewerComments (last sync before drop)
-- ---------------------------------------------------------------------------
UPDATE public."Questions"
SET "Status" = 'Verified'::public.status_questions_enum
WHERE "IsVerified" = true;

UPDATE public."Questions"
SET "Status" = 'Rejected'::public.status_questions_enum
WHERE "IsVerified" = false
  AND "ReviewerComments" IS NOT NULL
  AND "Status" <> 'Draft'::public.status_questions_enum;

UPDATE public."Questions"
SET "Status" = 'Pending'::public.status_questions_enum,
    "SubmittedAt" = COALESCE("SubmittedAt", "CreatedAt")
WHERE "IsVerified" = false
  AND "ReviewerComments" IS NULL
  AND "Status" = 'Pending'::public.status_questions_enum
  AND "SubmittedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- D) Safety check — abort if legacy flags disagree with Status
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM public."Questions"
  WHERE
    ("IsVerified" = true AND "Status" IS DISTINCT FROM 'Verified'::public.status_questions_enum)
    OR (
      "IsVerified" = false
      AND "ReviewerComments" IS NOT NULL
      AND "Status" IS DISTINCT FROM 'Rejected'::public.status_questions_enum
      AND "Status" IS DISTINCT FROM 'Draft'::public.status_questions_enum
    );

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION
      'Cannot drop IsVerified: % row(s) still mismatch Status vs IsVerified/ReviewerComments. Inspect with the diagnostic query in Database_Schema.md.',
      mismatch_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- E) Drop redundant column
-- ---------------------------------------------------------------------------
ALTER TABLE public."Questions"
  DROP COLUMN IF EXISTS "IsVerified";

COMMENT ON COLUMN public."Questions"."Status" IS
  'Canonical workflow: Draft | Pending | Verified | Rejected. Use instead of removed IsVerified.';
