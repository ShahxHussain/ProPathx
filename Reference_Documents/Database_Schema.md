# 📘 Database Schema (PostgreSQL / Supabase)

- Details of already implemented Database

## 🛠 Extensions

```sql
-- Enable uuid generation function (Supabase / Postgres)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUM / domain types (keeps your original values)
CREATE TYPE role_users_enum AS ENUM ('SuperAdmin','Admin','Reviewer','AI','Support','Subject Expert');
CREATE TYPE status_users_enum AS ENUM ('Active','Inactive','Suspended');

CREATE TYPE role_orgusers_enum AS ENUM ('OrgAdmin','Reviewer','Subject Expert');
CREATE TYPE status_orgusers_enum AS ENUM ('Active','Inactive','Suspended');

CREATE TYPE status_organizations_enum AS ENUM ('Active','Inactive');

CREATE TYPE status_subscriptionplans_enum AS ENUM ('Active','Inactive');

CREATE TYPE gender_enum AS ENUM ('Male','Female','Other');

CREATE TYPE certificate_type_enum AS ENUM ('Completion','Merit','Participation','Achievement');
CREATE TYPE certificate_status_enum AS ENUM ('Issued','Revoked','Expired');

CREATE TYPE feedback_entity_enum AS ENUM ('Test','Question','Platform');
CREATE TYPE feedback_status_enum AS ENUM ('New','Reviewed','Resolved');

CREATE TYPE subscription_entity_enum AS ENUM ('Student','Organization');
CREATE TYPE payment_method_enum AS ENUM ('CreditCard','BankTransfer','JazzCash','PayPal','Stripe');
CREATE TYPE payment_status_enum AS ENUM ('Pending','Completed','Failed','Refunded');

CREATE TYPE test_type_enum AS ENUM ('Practice','Mock','Final');

CREATE TYPE difficulty_level_enum AS ENUM ('Easy','Medium','Hard');
CREATE TYPE question_type_enum AS ENUM ('Single Correct','Multiple Correct');
CREATE TYPE question_source_enum AS ENUM ('Self','AI','PastExam');

-- Question workflow (migration 009): Draft → Pending → Verified | Rejected
-- During transition (shared dev/client DB): KEEP IsVerified; sync with Status (see comments below).
CREATE TYPE status_questions_enum AS ENUM ('Draft','Pending','Verified','Rejected');

CREATE TYPE media_context_enum AS ENUM ('Question','Option','Explanation');
CREATE TYPE media_type_enum AS ENUM ('Image','Diagram','Chart');

CREATE TYPE notification_entity_enum AS ENUM ('User','Organization','Student');
CREATE TYPE notification_type_enum AS ENUM ('System','Payment','Exam','Result','Reminder','Alert');

CREATE TYPE actor_type_enum AS ENUM ('User','Organization','OrgUser','Student','System');
CREATE TYPE action_type_enum AS ENUM ('Login','Logout','Create','Update','Delete','View','Payment','Attempt','Verification','Subscription','ResultGeneration','AIQuestionGeneration');
CREATE TYPE entity_type_enum AS ENUM ('User','Organization','Student','Test','Question','Subscription','Payment','Result','System');

-- 1. User & Organization Management

CREATE TABLE "Users" (
  "UserID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "FullName" text,
  "Email" text UNIQUE,
  "PasswordHash" text,
  "Role" role_users_enum,
  "Phone" text,
  "CreatedAt" timestamptz DEFAULT now(),
  "LastLogin" timestamptz,
  "ProfileImageURL" text,
  "Status" status_users_enum
);

CREATE TABLE "Organizations" (
  "OrgID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "OrgName" text,
  "OrgEmail" text,
  "Address" text,
  "Phone" text,
  "CreatedBy" uuid REFERENCES "Users"("UserID"),
  "CreatedAt" timestamptz DEFAULT now(),
  "Status" status_organizations_enum
);

CREATE TABLE "OrgUsers" (
  "OrgUserID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "OrgID" uuid REFERENCES "Organizations"("OrgID") ON DELETE CASCADE,
  "FullName" text,
  "Email" text UNIQUE,
  "PasswordHash" text,
  "Role" role_orgusers_enum,
  "Phone" text,
  "CreatedAt" timestamptz DEFAULT now(),
  "LastLogin" timestamptz,
  "Status" status_orgusers_enum
);

-- OrgID: set when the organization registers the student (OrgAdmin). NULL = individual / self-registered platform student (same login endpoint).
CREATE TABLE "Students" (
  "StudentID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "OrgID" uuid REFERENCES "Organizations"("OrgID"),
  "IdentityNo" text, -- (NIC,PassportNo, OrgReg, Nullable)
  "FullName" text,
  "FatherName" text,
  "Email" text UNIQUE,
  "PasswordHash" text,
  "Gender" gender_enum,
  "DateOfBirth" date,
  "Address" text,
  "Phone" text,
  "ProfileImageURL" text,
  "CreatedAt" timestamptz DEFAULT now(),
  "Status" status_users_enum
);

CREATE TABLE "StudentGroups" (
  "GroupID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "OrgID" uuid REFERENCES "Organizations"("OrgID"),
  "GroupName" text,
  "Description" text,
  "CreatedBy" uuid REFERENCES "OrgUsers"("OrgUserID"),
  "CreatedAt" timestamptz DEFAULT now(),
  "Status" status_organizations_enum
);

CREATE TABLE "StudentGroupMembers" (
  "GroupID" uuid REFERENCES "StudentGroups"("GroupID") ON DELETE CASCADE,
  "StudentID" uuid REFERENCES "Students"("StudentID") ON DELETE CASCADE,
  "JoinedAt" timestamptz DEFAULT now(),
  PRIMARY KEY ("GroupID","StudentID")
);

CREATE TABLE "Certificates" (
  "CertificateID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "StudentID" uuid REFERENCES "Students"("StudentID"),
  "AttemptID" uuid, -- FK to StudentAttempts.AttemptID (defined later)
  "OrgID" uuid REFERENCES "Organizations"("OrgID"),
  "CertificateType" certificate_type_enum,
  "IssueDate" date,
  "CertificateURL" text,
  "IssuedBy" uuid REFERENCES "OrgUsers"("OrgUserID"),
  "Remarks" text,
  "Status" certificate_status_enum
);

CREATE TABLE "Feedback" (
  "FeedbackID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "EntityType" feedback_entity_enum,
  "EntityID" uuid, -- nullable per spec
  "StudentID" uuid REFERENCES "Students"("StudentID"),
  "Rating" int,
  "Comment" text,
  "CreatedAt" timestamptz DEFAULT now(),
  "ReviewedBy" uuid REFERENCES "OrgUsers"("OrgUserID"),
  "Status" feedback_status_enum
);

-- Leaderboard implemented as a view later (depends on Tests and StudentAttempts)
-- We'll create a placeholder view name "Leaderboard" after related tables.

-- 2. Subscription & Usage Management

CREATE TABLE "SubscriptionPlans" (
  "PlanID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "PlanName" text,
  "Price" numeric,
  "DurationMonths" int,
  "Features" jsonb,
  "Status" status_subscriptionplans_enum NOT NULL DEFAULT 'Active'
);
-- Status: Active = available for new subscriptions. Inactive = hidden from org selection; existing org subscriptions are unaffected.

-- Audience: defines which type of entity this plan is intended for.
-- 'Organization' = only org admins can see/use this plan.
-- 'Student' = only individual students can see/use this plan.
-- 'Both' = plan can be used by both (if business needs).
ALTER TABLE "SubscriptionPlans"
ADD COLUMN "Audience" text
  CHECK ("Audience" IN ('Organization','Student','Both'))
  DEFAULT 'Organization';

CREATE TABLE "Subscriptions" (
  "SubscriptionID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "EntityType" subscription_entity_enum,
  "EntityID" uuid,
  "PlanID" uuid REFERENCES "SubscriptionPlans"("PlanID"),
  "StartDate" date,
  "EndDate" date,
  "Status" text  -- kept free-form per spec 'Active','Expired','Cancelled' if desired to be constrained
);

-- If desired, create an enum for subscription status; left as text to preserve original wording.

CREATE TABLE "UsageCounters" (
  "UsageID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "SubscriptionID" uuid REFERENCES "Subscriptions"("SubscriptionID") ON DELETE CASCADE,
  "EntityType" subscription_entity_enum,
  "EntityID" uuid,
  "MonthKey" text,
  "StudentsCount" int,
  "TestsGenerated" int,
  "QuestionsGenerated" int,
  "UpdatedAt" timestamptz DEFAULT now()
);

-- 2.a System Settings & Announcements

-- Central key/value store for global platform settings (maintenance, AI config, defaults, etc.)
CREATE TABLE "SystemSettings" (
  "Key" text PRIMARY KEY,
  "Value" jsonb NOT NULL,
  "UpdatedAt" timestamptz DEFAULT now(),
  "UpdatedBy" uuid REFERENCES "Users"("UserID")
);

-- Global announcements / banners shown across the platform
CREATE TABLE "Announcements" (
  "AnnouncementID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "Title" text NOT NULL,
  "Message" text NOT NULL,
  "Link" text,
  "TargetRoles" text[], -- e.g. {'OrgAdmin','Student'}
  "StartsAt" timestamptz,
  "EndsAt" timestamptz,
  "IsActive" boolean DEFAULT true,
  "CreatedAt" timestamptz DEFAULT now(),
  "CreatedBy" uuid REFERENCES "Users"("UserID")
);

-- 3. Exam & Content Management

CREATE TABLE "Exams" (
  "ExamID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ExamName" text,
  "CreatedBy" uuid REFERENCES "Users"("UserID"),
  "CreatedAt" timestamptz DEFAULT now(),
  "Description" text,
  "Syllabus" text
);

CREATE TABLE "Subjects" (
  "SubjectID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ExamID" uuid REFERENCES "Exams"("ExamID") ON DELETE CASCADE,
  "SubjectName" text,
  "Description" text,
  "CreatedBy" uuid REFERENCES "Users"("UserID"),
  "CreatedAt" timestamptz DEFAULT now()
);

-- Chapters: optional grouping under a Subject. One chapter can have many topics.
-- Both ChapterNumber and ChapterName are optional. Created by platform User or OrgUser (one set, other null).
CREATE TABLE "Chapters" (
  "ChapterID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "SubjectID" uuid NOT NULL REFERENCES "Subjects"("SubjectID") ON DELETE CASCADE,
  "ChapterNumber" int NULL,
  "ChapterName" text NULL,
  "CreatedBy" uuid NULL REFERENCES "Users"("UserID") ON DELETE SET NULL,
  "CreatedByOrgUserID" uuid NULL REFERENCES "OrgUsers"("OrgUserID") ON DELETE SET NULL,
  "CreatedAt" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chapters_subjectid ON "Chapters"("SubjectID");
CREATE INDEX IF NOT EXISTS idx_chapters_createdby_orguser ON "Chapters"("CreatedByOrgUserID");

CREATE TABLE "Topics" (
  "TopicID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "SubjectID" uuid REFERENCES "Subjects"("SubjectID") ON DELETE CASCADE,
  "ChapterID" uuid NULL REFERENCES "Chapters"("ChapterID") ON DELETE SET NULL,
  "TopicName" text,
  "Description" text,
  "CreatedBy" uuid REFERENCES "Users"("UserID"),
  "CreatedAt" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_topics_chapterid ON "Topics"("ChapterID");
-- Question→Topic→Chapter: Questions.TopicID → Topics.ChapterID. Use this join to know "topic is under which
-- chapter" and for adaptive learning (filter by chapter only, topic only, or both). See Main_Implementation.md.
-- If Topics previously had ChapterNumber/ChapterName columns, drop them after adding Chapters + ChapterID:
-- ALTER TABLE "Topics" DROP COLUMN IF EXISTS "ChapterNumber", DROP COLUMN IF EXISTS "ChapterName";

CREATE TABLE "Tests" (
  "TestID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "CreatedBy" uuid REFERENCES "Users"("UserID"),
  "OrgID" uuid REFERENCES "Organizations"("OrgID"),
  "ExamID" uuid REFERENCES "Exams"("ExamID"),
  "TestName" text,
  "TestType" test_type_enum,
  "DurationMinutes" int,
  "TotalQuestions" int,
  "TotalMarks" numeric,
  "TestDate" date,
  "StartTime" timestamptz,
  "EndTime" timestamptz,
  "CreatedAt" timestamptz DEFAULT now(),
  "Status" status_organizations_enum,
  -- Question sourcing + schedule: see Reference_Documents/schedule_or_opentiime_assigned.md and backend/scripts/add_tests_binding_schedule.sql
  "QuestionBindingMode" text DEFAULT 'custom',
  CONSTRAINT "Tests_QuestionBindingMode_check" CHECK ("QuestionBindingMode" IN ('custom','auto','hybrid')),
  "HybridAutoPercent" numeric DEFAULT 0,
  CONSTRAINT "Tests_HybridAutoPercent_check" CHECK ("HybridAutoPercent" >= 0 AND "HybridAutoPercent" <= 100),
  "ScheduleMode" text DEFAULT 'open',
  CONSTRAINT "Tests_ScheduleMode_check" CHECK ("ScheduleMode" IN ('open','scheduled'))
);

CREATE TABLE "Questions" (
  "QuestionID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "TopicID" uuid REFERENCES "Topics"("TopicID"),
  "QuestionText" text,
  "DifficultyLevel" difficulty_level_enum,
  "Explanation" text,
  "QuestionType" question_type_enum,
  "CreatedBy" uuid REFERENCES "Users"("UserID"),
  "CreatedAt" timestamptz DEFAULT now(),
  "Status" status_questions_enum NOT NULL DEFAULT 'Pending',
  "SubmittedAt" timestamptz NULL,
  "IsVerified" boolean DEFAULT false,  -- KEEP until migration 010 (optional drop after full rollout)
  "VerifiedBy" uuid REFERENCES "Users"("UserID"),
  "ReviewerComments" text,
  "VerifiedAt" timestamptz,
  "UpdatedBy" uuid REFERENCES "Users"("UserID"),
  "UpdatedAt" timestamptz,
  "Source" question_source_enum,
  "TimesUsed" int DEFAULT 0,
  "TimesCorrect" int DEFAULT 0,
  "TimesIncorrect" int DEFAULT 0,
  "LastUpdated" timestamptz,
  "OrgID" uuid NULL,
  "CreatedByOrgUserID" uuid NULL
);

ALTER TABLE "Questions"
ADD CONSTRAINT fk_questions_org
FOREIGN KEY ("OrgID")
REFERENCES "Organizations"("OrgID")
ON DELETE SET NULL;

ALTER TABLE "Questions"
ADD CONSTRAINT fk_questions_createdby_orguser
FOREIGN KEY ("CreatedByOrgUserID")
REFERENCES "OrgUsers"("OrgUserID")
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_orgid
ON "Questions"("OrgID");

CREATE INDEX IF NOT EXISTS idx_questions_createdby_orguser
ON "Questions"("CreatedByOrgUserID");

-- Question status + ReviewerComments (see § below). Indexes: migration 009.
CREATE INDEX IF NOT EXISTS idx_questions_status ON "Questions"("Status");
CREATE INDEX IF NOT EXISTS idx_questions_org_status ON "Questions"("OrgID", "Status") WHERE "OrgID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_questions_created_by_status ON "Questions"("CreatedBy", "Status") WHERE "CreatedBy" IS NOT NULL;

-- ### Questions — Status & ReviewerComments (workflow)
--
-- | Status     | ReviewerComments | VerifiedBy / VerifiedAt | Who sets it |
-- |------------|------------------|-------------------------|-------------|
-- | Draft      | NULL             | NULL                    | Subject Expert — Save Draft |
-- | Pending    | NULL             | NULL                    | Subject Expert — Submit |
-- | Verified   | NULL             | set on verify           | Reviewer — Approve |
-- | Rejected   | **text required**| NULL                    | Reviewer — Reject |
--
-- IsVerified: kept during transition (shared dev + client on one DB). Do NOT run 010 yet.
-- Sync rule when writing from app:
--   Status = 'Verified'  → IsVerified = true
--   Status = anything else → IsVerified = false
-- Read: prefer Status; fall back to IsVerified only in old code paths until refactor done.
--
-- Migration 010 (DROP IsVerified): only after client + your app both use Status everywhere.
-- ReviewerComments = rejection feedback only (not a status column).
--
-- On resubmit: Status → Pending, ReviewerComments → NULL, SubmittedAt → now().
-- On verify: Status → Verified, ReviewerComments → NULL, VerifiedBy/VerifiedAt set.
--
-- Migrations: 009 (add Status) → deploy code → 010 (drop IsVerified)
-- App behaviour: Reference_Documents/Question_Draft_Status.md

-- Natural key (QuestionID, OptionNumber); OptionID uuid is the stable id for FKs (StudentAnswers, QuestionMedia).
CREATE TABLE "Options" (
  "QuestionID" uuid NOT NULL REFERENCES "Questions"("QuestionID") ON DELETE CASCADE,
  "OptionNumber" int NOT NULL,
  "OptionText" text,
  "IsCorrect" boolean DEFAULT false,
  "OptionID" uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  PRIMARY KEY ("QuestionID", "OptionNumber")
);

CREATE TABLE "TestQuestions" (
  "TestID" uuid REFERENCES "Tests"("TestID") ON DELETE CASCADE,
  "QuestionID" uuid REFERENCES "Questions"("QuestionID") ON DELETE CASCADE,
  "Marks" numeric,
  "TimeLimit" int,
  "NegativeMarks" numeric DEFAULT 0,
  "DisplayOrder" int NOT NULL DEFAULT 0,
  PRIMARY KEY ("TestID","QuestionID")
);

CREATE TABLE "QuestionMedia" (
  "MediaID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "QuestionID" uuid NOT NULL REFERENCES "Questions"("QuestionID") ON DELETE CASCADE,
  "Context" media_context_enum NOT NULL,
  "OptionID" uuid NULL REFERENCES "Options"("OptionID") ON DELETE CASCADE,
  "FilePath" varchar(500) NOT NULL,
  "Caption" text,
  "DisplayOrder" int DEFAULT 1,
  "MediaType" media_type_enum NOT NULL,
  "UploadedAt" timestamptz DEFAULT now(),
  CONSTRAINT chk_option_context CHECK (
    ("Context" = 'Option' AND "OptionID" IS NOT NULL)
    OR
    ("Context" <> 'Option' AND "OptionID" IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_questionmedia_questionid ON "QuestionMedia"("QuestionID");
CREATE INDEX IF NOT EXISTS idx_questionmedia_optionid ON "QuestionMedia"("OptionID");
CREATE INDEX IF NOT EXISTS idx_questionmedia_context ON "QuestionMedia"("Context");

-- 4. Student Participation & Results

CREATE TABLE "StudentAttempts" (
  "AttemptID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "StudentID" uuid REFERENCES "Students"("StudentID"),
  "TestID" uuid REFERENCES "Tests"("TestID"),
  "StartTime" timestamptz,
  "EndTime" timestamptz,
  "ObtainedMarks" numeric,
  "Grade" text,
  "Percentile" numeric
);

-- Explicit test assignments (selective visibility)
CREATE TABLE "TestAssignments" (
  "AssignmentID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "TestID" uuid REFERENCES "Tests"("TestID") ON DELETE CASCADE,
  "StudentID" uuid REFERENCES "Students"("StudentID") ON DELETE CASCADE,
  "GroupID" uuid REFERENCES "StudentGroups"("GroupID") ON DELETE SET NULL,
  "AssignmentType" text NOT NULL, -- 'Single','Group','All','Multiple'
  "AssignedBy" uuid REFERENCES "OrgUsers"("OrgUserID"),
  "AssignedAt" timestamptz DEFAULT now(),
  "Status" text DEFAULT 'Pending', -- 'Pending','InProgress','Completed','Expired'
  "DueDate" timestamptz,
  UNIQUE("TestID","StudentID")
);

CREATE INDEX IF NOT EXISTS idx_testassignments_testid ON "TestAssignments"("TestID");
CREATE INDEX IF NOT EXISTS idx_testassignments_studentid ON "TestAssignments"("StudentID");
CREATE INDEX IF NOT EXISTS idx_testassignments_groupid ON "TestAssignments"("GroupID");
CREATE INDEX IF NOT EXISTS idx_testassignments_status ON "TestAssignments"("Status");

-- Update Certificates.AttemptID FK now that StudentAttempts exists
ALTER TABLE "Certificates"
  ADD CONSTRAINT fk_cert_attempt
  FOREIGN KEY ("AttemptID") REFERENCES "StudentAttempts"("AttemptID");

-- -----------------------------------------------------------------------------
-- StudentAnswers: one persisted row per selected option for an attempt.
-- -----------------------------------------------------------------------------
-- OptionID: uuid FK -> Options."OptionID" (stable row id for that answer choice).
--   Not the display slot (Options."OptionNumber"); client/API use the same uuid as
--   QuestionMedia."OptionID" when pointing at an option.
-- Primary key (AttemptID, QuestionID, OptionID): supports "Multiple Correct" by
--   allowing several OptionID values for the same question in one attempt.
-- IsCorrect: optional denormalized flag at insert time for reporting (nullable).
-- Legacy: some databases stored integer OptionID (= OptionNumber). Migrate with:
--   backend/scripts/migrate_studentanswers_optionid_to_uuid.sql
CREATE TABLE "StudentAnswers" (
  "AttemptID" uuid NOT NULL REFERENCES "StudentAttempts"("AttemptID") ON DELETE CASCADE,
  "QuestionID" uuid NOT NULL REFERENCES "Questions"("QuestionID") ON DELETE CASCADE,
  "OptionID" uuid NOT NULL REFERENCES "Options"("OptionID") ON DELETE RESTRICT,
  "IsCorrect" boolean,
  PRIMARY KEY ("AttemptID","QuestionID","OptionID")
);

CREATE INDEX IF NOT EXISTS idx_studentanswers_attemptid ON "StudentAnswers"("AttemptID");
CREATE INDEX IF NOT EXISTS idx_studentanswers_questionid ON "StudentAnswers"("QuestionID");

CREATE TABLE "ResultDetails" (
  "AttemptID" uuid REFERENCES "StudentAttempts"("AttemptID") ON DELETE CASCADE,
  "SubjectID" uuid REFERENCES "Subjects"("SubjectID"),
  "TopicID" uuid REFERENCES "Topics"("TopicID"),
  "ObtainedMarks" numeric,
  "MaxMarks" numeric,
  "Percentile" numeric
);

-- 5. Payments & Transactions

CREATE TABLE "Payments" (
  "PaymentID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "SubscriptionID" uuid REFERENCES "Subscriptions"("SubscriptionID"),
  "EntityType" subscription_entity_enum,
  "EntityID" uuid,
  "Amount" numeric,
  "Currency" text,
  "PaymentDate" timestamptz,
  "PaymentMethod" payment_method_enum,
  "TransactionID" text,
  "PaymentStatus" payment_status_enum,
  "CreatedAt" timestamptz DEFAULT now(),
  "Remarks" text
);

-- 6. Notifications

CREATE TABLE "Notifications" (
  "NotificationID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "EntityType" notification_entity_enum,
  "EntityID" uuid,
  "Title" text,
  "Message" text,
  "NotificationType" notification_type_enum,
  "IsRead" boolean DEFAULT FALSE,
  "CreatedAt" timestamptz DEFAULT now(),
  "ReadAt" timestamptz
);

-- 7. Logs (Comprehensive Audit System)

CREATE TABLE "Logs" (
  "LogID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ActorType" actor_type_enum,
  "ActorID" uuid,
  "ActionType" action_type_enum,
  "EntityType" entity_type_enum,
  "EntityID" uuid,
  "Description" text,
  "IPAddress" text,
  "UserAgent" text,
  "Timestamp" timestamptz DEFAULT now(),
  "PreviousData" jsonb,
  "NewData" jsonb
);

-- 8. Leaderboard view (example based on StudentAttempts and Tests)
CREATE VIEW "Leaderboard" AS
SELECT
  sa."TestID",
  sa."StudentID",
  sa."ObtainedMarks",
  sa."Percentile",
  ROW_NUMBER() OVER (PARTITION BY sa."TestID" ORDER BY sa."ObtainedMarks" DESC) AS "RankPosition",
  sa."Grade",
  t."OrgID",
  now() AS "GeneratedAt"
FROM "StudentAttempts" sa
LEFT JOIN "Tests" t ON t."TestID" = sa."TestID";

-- Indexes for common lookups (optional but useful)
CREATE INDEX IF NOT EXISTS idx_students_orgid ON "Students"("OrgID");
CREATE INDEX IF NOT EXISTS idx_tests_examid ON "Tests"("ExamID");
CREATE INDEX IF NOT EXISTS idx_questions_topicid ON "Questions"("TopicID");
CREATE INDEX IF NOT EXISTS idx_options_questionid ON "Options"("QuestionID");


-- Adding attributes for consistency to create exams with proper no of subjects which can be further utilized by subject expert for adding or creating MCQs to it

ALTER TABLE "Exams"
ADD COLUMN "NoOfSubjects" INT;

ALTER TABLE "Subjects"
ADD COLUMN "Weightage" NUMERIC(5,2);  


-- Subcription Table is added
CREATE TABLE public."SubscriptionPlanExams" (
    "PlanID" UUID NOT NULL,
    "ExamID" UUID NOT NULL,

    "IsMandatory" BOOLEAN DEFAULT FALSE,
    "MaxStudents" INTEGER NULL,
    "MaxTests" INTEGER NULL,
    "MaxQuestionsPerTest" INTEGER NULL,
    "MaxTestsPerDay" INTEGER NULL,
    "AISupport" BOOLEAN NULL,
    "ExtraConfig" JSONB NULL,

    CONSTRAINT "SubscriptionPlanExams_pkey"
        PRIMARY KEY ("PlanID", "ExamID"),

    CONSTRAINT "SubscriptionPlanExams_PlanID_fkey"
        FOREIGN KEY ("PlanID")
        REFERENCES public."SubscriptionPlans"("PlanID")
        ON DELETE CASCADE,

    CONSTRAINT "SubscriptionPlanExams_ExamID_fkey"
        FOREIGN KEY ("ExamID")
        REFERENCES public."Exams"("ExamID")
        ON DELETE CASCADE
);

-- Plan-level test mode entitlements (which test natures are included in a plan)
CREATE TABLE IF NOT EXISTS public."SubscriptionPlanTestModes" (
  "PlanID" uuid PRIMARY KEY,
  "IsScheduledEnabled" boolean NOT NULL DEFAULT false,
  "IsAdaptiveEnabled" boolean NOT NULL DEFAULT false,
  "IsSelfTestBuilderEnabled" boolean NOT NULL DEFAULT false,
  "CreatedAt" timestamptz NOT NULL DEFAULT now(),
  "UpdatedAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "SubscriptionPlanTestModes_PlanID_fkey"
    FOREIGN KEY ("PlanID")
    REFERENCES public."SubscriptionPlans"("PlanID")
    ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- StudentExamEnrollments (canonical / scalable) — PHASE: organization students ONLY
-- One row per (OrgID, StudentID, ExamID). OrgID is REQUIRED; individual / self-registered students
-- (Students.OrgID IS NULL) do NOT use this table in the current phase — they rely on student-level
-- subscription + SubscriptionPlanExams only (no per-exam enrollment workflow here).
-- Rows are not deleted: terminal states use Rejected / Withdrawn; Suspended = pause without losing history.
-- Keeps subscription linkage (SubscriptionID) + withdrawal audit + request/review workflow for org governance.
-- Future: optional extension to individuals (would require nullable OrgID + partial unique indexes again).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE public.student_exam_enrollment_status_enum AS ENUM (
    'Pending', 'Approved', 'Rejected', 'Withdrawn', 'Suspended'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.student_exam_enrollment_requester_enum AS ENUM (
    'Student', 'OrgAdmin', 'System'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.student_exam_enrollment_source_enum AS ENUM (
    'DirectAssign', 'StudentRequest'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public."StudentExamEnrollments" (
  "EnrollmentID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "OrgID" uuid NOT NULL,
  "StudentID" uuid NOT NULL,
  "ExamID" uuid NOT NULL,
  "SubscriptionID" uuid NULL,
  "Status" public.student_exam_enrollment_status_enum NOT NULL DEFAULT 'Pending',
  "Source" public.student_exam_enrollment_source_enum NOT NULL DEFAULT 'DirectAssign'::public.student_exam_enrollment_source_enum,
  "RequestedByType" public.student_exam_enrollment_requester_enum NOT NULL DEFAULT 'OrgAdmin'::public.student_exam_enrollment_requester_enum,
  "RequestedAt" timestamptz NOT NULL DEFAULT now(),
  "ReviewedBy" uuid NULL,
  "ReviewedAt" timestamptz NULL,
  "ReviewNote" text NULL,
  "ApprovedAt" timestamptz NULL,
  "WithdrawnAt" timestamptz NULL,
  "WithdrawalInitiatedBy" public.student_exam_enrollment_requester_enum NULL,
  "WithdrawalActorUserID" uuid NULL,
  "WithdrawalReason" text NULL,
  "CreatedAt" timestamptz NOT NULL DEFAULT now(),
  "UpdatedAt" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "StudentExamEnrollments_StudentID_fkey"
    FOREIGN KEY ("StudentID") REFERENCES public."Students"("StudentID") ON DELETE CASCADE,
  CONSTRAINT "StudentExamEnrollments_ExamID_fkey"
    FOREIGN KEY ("ExamID") REFERENCES public."Exams"("ExamID") ON DELETE CASCADE,
  CONSTRAINT "StudentExamEnrollments_OrgID_fkey"
    FOREIGN KEY ("OrgID") REFERENCES public."Organizations"("OrgID") ON DELETE CASCADE,
  CONSTRAINT "StudentExamEnrollments_SubscriptionID_fkey"
    FOREIGN KEY ("SubscriptionID") REFERENCES public."Subscriptions"("SubscriptionID") ON DELETE SET NULL,
  CONSTRAINT "StudentExamEnrollments_ReviewedBy_fkey"
    FOREIGN KEY ("ReviewedBy") REFERENCES public."OrgUsers"("OrgUserID") ON DELETE SET NULL,

  CONSTRAINT "StudentExamEnrollments_review_note_len" CHECK (
    "ReviewNote" IS NULL OR char_length("ReviewNote") <= 4000
  ),
  CONSTRAINT "StudentExamEnrollments_withdraw_reason_len" CHECK (
    "WithdrawalReason" IS NULL OR char_length("WithdrawalReason") <= 4000
  ),

  CONSTRAINT "StudentExamEnrollments_unique_org_student_exam" UNIQUE ("OrgID", "StudentID", "ExamID")
);

CREATE INDEX IF NOT EXISTS idx_student_exam_enrollments_student ON public."StudentExamEnrollments" ("StudentID");
CREATE INDEX IF NOT EXISTS idx_student_exam_enrollments_exam ON public."StudentExamEnrollments" ("ExamID");
CREATE INDEX IF NOT EXISTS idx_student_exam_enrollments_org_status ON public."StudentExamEnrollments" ("OrgID", "Status");
CREATE INDEX IF NOT EXISTS idx_student_exam_enrollments_status ON public."StudentExamEnrollments" ("Status");
CREATE INDEX IF NOT EXISTS idx_student_exam_enrollments_pending_org ON public."StudentExamEnrollments" ("OrgID", "RequestedAt")
  WHERE "Status" = 'Pending';

COMMENT ON TABLE public."StudentExamEnrollments" IS
  'Org-scoped exam participation (organization-enrolled students only in current phase). Request/review + withdrawal audit; rows retained (no hard delete).';

-- ---------------------------------------------------------------------------
-- Migrating + backfill (copy-paste once): Reference_Documents/sql/student_exam_enrollments_migrate_and_backfill.sql
-- Covers enums, nullable OrgID → backfill from Students, drop individual-only rows, text Status → enum
-- (Active→Approved), WithdrawalInitiatedBy text→enum, ApprovedAt backfill, old UNIQUE swap, indexes.
-- Greenfield still uses: Reference_Documents/sql/student_exam_enrollments.sql (or run migrate script only — it CREATE IF NOT EXISTS).
-- After migration: align API/UI — legacy code used Status text 'Active'; canonical enum is 'Approved'.
-- ---------------------------------------------------------------------------
-- Implementation alignment: Align backend/routes/students.js and UI after DB migration.

ALTER TABLE public."Subscriptions"
ADD COLUMN IF NOT EXISTS "ActivatedAt" TIMESTAMP WITH TIME ZONE;

ALTER TABLE public."Subscriptions"
ADD COLUMN IF NOT EXISTS "AutoRenew" BOOLEAN DEFAULT FALSE;

ALTER TABLE public."Subscriptions"
ADD COLUMN IF NOT EXISTS "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT now();


ALTER TABLE public."Tests"
ADD COLUMN IF NOT EXISTS "SubscriptionID" UUID;

ALTER TABLE public."Tests"
ADD CONSTRAINT "Tests_SubscriptionID_fkey"
FOREIGN KEY ("SubscriptionID")
REFERENCES public."Subscriptions"("SubscriptionID")
ON DELETE RESTRICT;

-- Binding + schedule (aligns with Reference_Documents/schedule_or_opentiime_assigned.md). Safe to re-run.
ALTER TABLE public."Tests"
  ADD COLUMN IF NOT EXISTS "QuestionBindingMode" text DEFAULT 'custom';
ALTER TABLE public."Tests"
  DROP CONSTRAINT IF EXISTS "Tests_QuestionBindingMode_check";
ALTER TABLE public."Tests"
  ADD CONSTRAINT "Tests_QuestionBindingMode_check"
  CHECK ("QuestionBindingMode" IN ('custom','auto','hybrid'));

ALTER TABLE public."Tests"
  ADD COLUMN IF NOT EXISTS "HybridAutoPercent" numeric DEFAULT 0;
ALTER TABLE public."Tests"
  DROP CONSTRAINT IF EXISTS "Tests_HybridAutoPercent_check";
ALTER TABLE public."Tests"
  ADD CONSTRAINT "Tests_HybridAutoPercent_check"
  CHECK ("HybridAutoPercent" >= 0 AND "HybridAutoPercent" <= 100);

ALTER TABLE public."Tests"
  ADD COLUMN IF NOT EXISTS "ScheduleMode" text DEFAULT 'open';
ALTER TABLE public."Tests"
  DROP CONSTRAINT IF EXISTS "Tests_ScheduleMode_check";
ALTER TABLE public."Tests"
  ADD CONSTRAINT "Tests_ScheduleMode_check"
  CHECK ("ScheduleMode" IN ('open','scheduled'));

ALTER TABLE public."UsageCounters"
ADD COLUMN IF NOT EXISTS "ExamID" UUID;

ALTER TABLE public."UsageCounters"
ADD CONSTRAINT "UsageCounters_ExamID_fkey"
FOREIGN KEY ("ExamID")
REFERENCES public."Exams"("ExamID")
ON DELETE CASCADE;


ALTER TABLE public."UsageCounters"
ADD COLUMN IF NOT EXISTS "ExamID" UUID;

ALTER TABLE public."UsageCounters"
ADD COLUMN IF NOT EXISTS "StudentsEnrolled" INTEGER DEFAULT 0;

ALTER TABLE public."UsageCounters"
ADD COLUMN IF NOT EXISTS "TestsCreated" INTEGER DEFAULT 0;

ALTER TABLE public."UsageCounters"
ADD COLUMN IF NOT EXISTS "TestsCreatedToday" INTEGER DEFAULT 0;

ALTER TABLE public."UsageCounters"
ADD COLUMN IF NOT EXISTS "AIQuestionsGenerated" INTEGER DEFAULT 0;

ALTER TABLE public."UsageCounters"
ADD COLUMN IF NOT EXISTS "StudentAttempts" INTEGER DEFAULT 0;

ALTER TABLE public."UsageCounters"
ADD COLUMN IF NOT EXISTS "LastResetAt" TIMESTAMP WITH TIME ZONE;


-- SubscriptionPlans Status: enum status_subscriptionplans_enum ('Active', 'Inactive')
-- Full script: backend/scripts/add_subscriptionplans_status.sql
-- Step 1 creates the enum (run once). Step 2a adds the column if missing; step 2b converts existing text column to enum.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_subscriptionplans_enum') THEN
    CREATE TYPE public.status_subscriptionplans_enum AS ENUM ('Active', 'Inactive');
  END IF;
END $$;

ALTER TABLE public."SubscriptionPlans"
ADD COLUMN IF NOT EXISTS "Status" public.status_subscriptionplans_enum NOT NULL DEFAULT 'Active';

-- ---------------------------------------------------------------------------
-- Questions.Status + SubmittedAt (migration 009)
-- Script: backend/db/migrations/009_questions_status_draft.sql
-- ReviewerComments: unchanged column — stores rejection text when Status = 'Rejected'; NULL otherwise.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_questions_enum') THEN
    CREATE TYPE public.status_questions_enum AS ENUM ('Draft','Pending','Verified','Rejected');
  END IF;
END $$;

-- If enum was created earlier with 'Approved', run once:
-- ALTER TYPE public.status_questions_enum RENAME VALUE 'Approved' TO 'Verified';

ALTER TABLE public."Questions"
  ADD COLUMN IF NOT EXISTS "Status" public.status_questions_enum NOT NULL DEFAULT 'Pending';

ALTER TABLE public."Questions"
  ADD COLUMN IF NOT EXISTS "SubmittedAt" timestamptz NULL;

COMMENT ON COLUMN public."Questions"."Status" IS
  'Draft | Pending | Verified | Rejected. Canonical workflow state.';

COMMENT ON COLUMN public."Questions"."ReviewerComments" IS
  'Reviewer rejection feedback. Non-null only when Status = Rejected. Cleared on verify or expert resubmit.';

-- Backfill existing rows (safe to re-run)
UPDATE public."Questions"
SET "Status" = 'Verified'::public.status_questions_enum
WHERE "IsVerified" = true
  AND ("Status" IS NULL OR "Status" = 'Pending'::public.status_questions_enum);

UPDATE public."Questions"
SET "Status" = 'Rejected'::public.status_questions_enum
WHERE "IsVerified" = false
  AND "ReviewerComments" IS NOT NULL
  AND ("Status" IS NULL OR "Status" = 'Pending'::public.status_questions_enum);

UPDATE public."Questions"
SET "Status" = 'Pending'::public.status_questions_enum,
    "SubmittedAt" = COALESCE("SubmittedAt", "CreatedAt")
WHERE "IsVerified" = false
  AND "ReviewerComments" IS NULL
  AND "Status" IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_status ON public."Questions" ("Status");
CREATE INDEX IF NOT EXISTS idx_questions_org_status ON public."Questions" ("OrgID", "Status") WHERE "OrgID" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_questions_created_by_status ON public."Questions" ("CreatedBy", "Status") WHERE "CreatedBy" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Questions: drop IsVerified (migration 010) — DEFER if shared dev/client DB
-- Run only after full Status rollout. Script: 010_drop_questions_isverified.sql
-- ---------------------------------------------------------------------------

-- ALTER TABLE public."Questions" DROP COLUMN IF EXISTS "IsVerified";  -- do not run yet

-- ---------------------------------------------------------------------------
-- OrgEnrollmentSettings (OrgAdmin Settings → Exam enrollments)
-- One row per organization. Script: backend/scripts/org_enrollment_settings.sql
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE public.org_enrollment_approval_mode_enum AS ENUM (
    'manual',
    'auto_direct_assign',
    'auto_student_requests'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public."OrgEnrollmentSettings" (
  "OrgID" uuid PRIMARY KEY
    REFERENCES public."Organizations"("OrgID") ON DELETE CASCADE,
  "AllowStudentRequests" boolean NOT NULL DEFAULT true,
  "EnrollmentApprovalMode" public.org_enrollment_approval_mode_enum
    NOT NULL DEFAULT 'auto_direct_assign',
  "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
  "UpdatedBy" uuid NULL REFERENCES public."OrgUsers"("OrgUserID") ON DELETE SET NULL
);

