-- Remove legacy Tests.TestType (Practice / Mock / Final).
-- Delivery is controlled via SubscriptionPlan modes (SelfTestBuilder, Scheduled, Adaptive)
-- and Tests.ScheduleMode (open / scheduled).

ALTER TABLE public."Tests"
  DROP COLUMN IF EXISTS "TestType";
