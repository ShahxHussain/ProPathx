-- =============================================================================
-- StudentAnswers.OptionID: integer (OptionNumber) -> uuid -> Options.OptionID
-- =============================================================================
-- Run in Supabase SQL Editor (or psql) after a backup.
-- Prerequisites: public."Options"."OptionID" uuid UNIQUE; PK (QuestionID, OptionNumber).
--
-- Order: run this migration, then deploy app code that inserts uuid OptionID.
-- =============================================================================

BEGIN;

ALTER TABLE public."StudentAnswers" DROP CONSTRAINT IF EXISTS "StudentAnswers_pkey";

ALTER TABLE public."StudentAnswers" RENAME COLUMN "OptionID" TO "OptionNumber";

ALTER TABLE public."StudentAnswers" ADD COLUMN "OptionID" uuid;

UPDATE public."StudentAnswers" AS sa
SET "OptionID" = o."OptionID"
FROM public."Options" AS o
WHERE o."QuestionID" = sa."QuestionID"
  AND o."OptionNumber" = sa."OptionNumber";

-- If this returns rows, fix data before continuing (bad QuestionID / OptionNumber).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."StudentAnswers" WHERE "OptionID" IS NULL) THEN
    RAISE EXCEPTION 'migrate_studentanswers_optionid_to_uuid: backfill left NULL OptionID rows; fix or delete them before re-running';
  END IF;
END $$;

ALTER TABLE public."StudentAnswers" DROP COLUMN "OptionNumber";

ALTER TABLE public."StudentAnswers" ALTER COLUMN "OptionID" SET NOT NULL;

ALTER TABLE public."StudentAnswers"
  ADD CONSTRAINT "StudentAnswers_pkey" PRIMARY KEY ("AttemptID", "QuestionID", "OptionID");

ALTER TABLE public."StudentAnswers"
  ADD CONSTRAINT "StudentAnswers_OptionID_fkey"
  FOREIGN KEY ("OptionID") REFERENCES public."Options"("OptionID")
  ON DELETE RESTRICT;

COMMIT;

-- Rollback (manual, only if no new uuid-backed rows yet): not provided; restore from backup.
