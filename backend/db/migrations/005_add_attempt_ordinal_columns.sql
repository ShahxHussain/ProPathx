-- Run once on Supabase SQL editor (or psql). Tracks how many full submit cycles
-- a student finished for a test so re-assignments can show "2nd attempt", etc.

ALTER TABLE "TestAssignments"
  ADD COLUMN IF NOT EXISTS "CompletedCycleCount" integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN "TestAssignments"."CompletedCycleCount" IS
  'Number of times this student fully submitted this test on this assignment row; carried forward when org replaces assignment.';

ALTER TABLE "StudentAttempts"
  ADD COLUMN IF NOT EXISTS "AttemptOrdinal" integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN "StudentAttempts"."AttemptOrdinal" IS
  '1-based attempt number for this student+test session (CompletedCycleCount+1 at start).';
