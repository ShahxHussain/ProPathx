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
  "Features" jsonb
);

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

CREATE TABLE "Topics" (
  "TopicID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "SubjectID" uuid REFERENCES "Subjects"("SubjectID") ON DELETE CASCADE,
  "TopicName" text,
  "Description" text,
  "CreatedBy" uuid REFERENCES "Users"("UserID"),
  "CreatedAt" timestamptz DEFAULT now()
);

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
  "Status" status_organizations_enum
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
  "IsVerified" boolean DEFAULT false,
  "VerifiedBy" uuid REFERENCES "Users"("UserID"),
  "ReviewerComments" text,
  "UpdatedBy" uuid REFERENCES "Users"("UserID"),
  "UpdatedAt" timestamptz,
  "VerifiedAt" timestamptz,
  "Source" question_source_enum,
  "TimesUsed" int DEFAULT 0,
  "TimesCorrect" int DEFAULT 0,
  "TimesIncorrect" int DEFAULT 0,
  "LastUpdated" timestamptz,
  "OrgID" uuid NULL
);

ALTER TABLE "Questions"
ADD CONSTRAINT fk_questions_org
FOREIGN KEY ("OrgID")
REFERENCES "Organizations"("OrgID")
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_orgid
ON "Questions"("OrgID");

CREATE TABLE "Options" (
  "OptionID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "QuestionID" uuid REFERENCES "Questions"("QuestionID") ON DELETE CASCADE,
  "OptionNumber" int,
  "OptionText" text,
  "IsCorrect" boolean DEFAULT false,
  CONSTRAINT uq_options_optionid UNIQUE ("OptionID")
);

CREATE TABLE "TestQuestions" (
  "TestID" uuid REFERENCES "Tests"("TestID") ON DELETE CASCADE,
  "QuestionID" uuid REFERENCES "Questions"("QuestionID") ON DELETE CASCADE,
  "Marks" numeric,
  "TimeLimit" int,
  "NegativeMarks" numeric DEFAULT 0,
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

CREATE TABLE "StudentAnswers" (
  "AttemptID" uuid REFERENCES "StudentAttempts"("AttemptID") ON DELETE CASCADE,
  "QuestionID" uuid REFERENCES "Questions"("QuestionID") ON DELETE CASCADE,
  "OptionID" uuid REFERENCES "Options"("OptionID"), -- references Options.OptionID (nullable)
  "IsCorrect" boolean,
  PRIMARY KEY ("AttemptID","QuestionID","OptionID")
);

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
