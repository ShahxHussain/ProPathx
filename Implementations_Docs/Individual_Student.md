# Individual Student Subscriptions & Self-Service Access

## 1. Overview

Today the platform is primarily **organization-centric**: organizations subscribe to plans, org admins create tests, and students are usually linked to an organization.

This feature introduces a parallel flow where a **student can use ProPath as an individual**:

- Sign up directly on the platform (no organization).
- Purchase and manage **their own subscription**.
- Access exams/tests allowed by that subscription.
- Attempt tests and see results, certificates, and analytics — completely independent from any organization.

We will reuse as much of the existing schema as possible:

- `Students` with `OrgID` **nullable** (already supported).
- `Subscriptions` with `EntityType ENUM('Student','Organization')`.
- `UsageCounters`, `Payments`, `StudentAttempts`, `StudentAnswers`, `ResultDetails`.

Only minimal schema additions are proposed.

---

## 2. Goals & Non-Goals

### Goals

- Allow a student to:
  - Sign up and log in **without an organization**.
  - Purchase a subscription plan that is **specifically intended for individual students**.
  - Access exams / tests defined for that student plan.
  - Attempt tests, view results, receive certificates, and get notifications.

- Keep the **org and individual worlds cleanly separated**:
  - An individual student should not see any org-internal tests or data.
  - Org students remain under their org subscriptions as before.

### Non-Goals (for this phase)

- No sharing of an individual’s subscription with other users.
- No cross-upgrade logic (e.g., converting individual account into org-managed account) in this phase.
- No changes to existing org subscription logic besides clearly separating audiences at the plan level.

---

## 3. Existing Schema – How it helps

### 3.1 Students

From `Database_Schema.md`:

- `Students`:
  - `StudentID` (PK)
  - `OrgID` FK → `Organizations.OrgID, Nullable`
  - `FullName`, `Email` (UNIQUE), `PasswordHash`, etc.
  - `Status ENUM('Active','Inactive','Suspended')`

> **Important:** `OrgID` is nullable → we can already support **self-registered students** (OrgID = NULL).

### 3.2 Subscriptions & Plans

- `subscription_entity_enum`:
  - `('Student','Organization')`

- `SubscriptionPlans`:
  - `PlanID`, `PlanName`, `Price`, `DurationMonths`, `Features JSON`, `Status status_subscriptionplans_enum`

- `Subscriptions`:
  - `SubscriptionID`
  - `EntityType ENUM('Student','Organization')`
  - `EntityID UUID`
  - `PlanID FK → SubscriptionPlans.PlanID`
  - `StartDate`, `EndDate`
  - `Status ENUM('Active','Expired','Cancelled')` (in Final Complete DB)

- `UsageCounters`:
  - `SubscriptionID` FK → `Subscriptions.SubscriptionID`
  - `ExamID` FK → `Exams.ExamID`
  - Per-month counts: students enrolled, tests created, questions created, AIQuestionsGenerated, StudentAttempts, etc.

> **Good news:** The schema already supports **student-level subscriptions** via `EntityType = 'Student'`.

### 3.3 Tests & Attempts

- `Tests`:
  - `TestID`
  - `SubscriptionID` FK → `Subscriptions.SubscriptionID`
  - `ExamID`, `OrgID (Nullable)`, etc.

- `StudentAttempts`, `StudentAnswers`, `ResultDetails` already work per student and test.

This means we can attach tests to either an **organization subscription** or an **individual student subscription**, depending on who owns that test.

---

## 4. High-Level Behavior

### 4.1 Student Types

We support **two types of students** in the same `Students` table:

1. **Org-Managed Student**
   - `Students.OrgID` = some `OrgID`.
   - Access tests assigned by that organization.
   - Covered by the **organization’s subscription**.

2. **Individual Student**
   - `Students.OrgID` = `NULL`.
   - Signs up directly on ProPath.
   - Purchases **their own subscription** (`Subscriptions.EntityType = 'Student', EntityID = StudentID`).
   - Accesses tests linked to their own subscription.

> Both types use the same login mechanism, but **authorization logic** will check:
> - `OrgID` (null vs non-null)
> - Whether there is an **active Subscriptions row** for that student for individual mode.

---

## 5. Subscription Plan Design for Students

We do **not** create a separate table for student plans. Instead we:

### 5.1 Extend `SubscriptionPlans`

Add a column to `SubscriptionPlans`:

```sql
ALTER TABLE "SubscriptionPlans"
ADD COLUMN "Audience" text CHECK ("Audience" IN ('Organization','Student','Both')) DEFAULT 'Organization';
```

- `Audience = 'Organization'`:
  - Visible only to org admins.
- `Audience = 'Student'`:
  - Visible only on the **individual student pricing / purchase** pages.
- `Audience = 'Both'`:
  - Can be used by both orgs and students (if business later needs this).

### 5.2 Exams per Student Plan

We continue to use `SubscriptionPlanExams`:

- For each student plan, we specify:
  - Which `Exams` are included.
  - Optional limits:
    - `MaxTestsPerDay`, `AIQuestionsGenerated`, etc.

No schema change needed here — only data and business rules.

---

## 6. Flows

### 6.1 Individual Student Signup

**Step-by-step:**

1. Student opens public signup page.
2. Enters:
   - FullName, Email, Password, DateOfBirth, Gender (optional), etc.
3. Backend:
   - Creates a `Students` row with:
     - `OrgID = NULL`
     - `Email` UNIQUE
     - `Status = 'Active'` (or `'Inactive'` if email verification is required).
   - Optionally logs an entry in `Logs` with `ActorType = 'Student'`, `ActionType = 'Create'`.

4. Student receives email verification (optional; can be phase 2).

> **DB impact:** None beyond using existing `Students` table with `OrgID = NULL`.

### 6.2 Individual Student Login

Reuse existing auth pattern (similar to org student login) but:

- JWT payload clearly marks:
  - `actorType = 'Student'`
  - `studentId = StudentID`
  - `orgId = null` (for individual students)

Middleware will:

- Allow access to individual-student APIs if:
  - `actorType = 'Student'` and `OrgID IS NULL`.

### 6.3 Purchase Student Subscription

**Steps:**

1. Logged-in individual student opens “Plans for Students” page.
2. Frontend calls:
   - `GET /api/subscription-plans?audience=Student&status=Active`.
3. Student selects a plan and confirms purchase.
4. Backend:
   - Creates a `Subscriptions` row:
     - `EntityType = 'Student'`
     - `EntityID = StudentID`
     - `PlanID = chosen plan`
     - `StartDate`, `EndDate`, `Status = 'Active'` (or `'Pending'` until payment succeeds).
   - Creates a `Payments` row:
     - `EntityType = 'Student'`
     - `EntityID = StudentID`
     - `SubscriptionID` = new subscription
     - `Amount`, `PaymentMethod`, `PaymentStatus`, etc.
   - Optionally initializes `UsageCounters` rows per `Exam` included in this plan.

### 6.4 Test Access for Individual Students

We define **two ways** an individual student can use the system:

1. **Platform-created practice/mock tests for students**
   - `Tests.SubscriptionID` points to a **student plan template** (or special internal subscription).
   - Tests are marked as:
     - `OrgID = NULL`
     - Target audience: `Student`
   - Individual students see a list of tests allowed by:
     - Their active `Subscriptions` row(s)
     - `SubscriptionPlanExams` for that plan.

2. **Student-specific generated tests (Phase 2+)**
   - For adaptive learning, system can generate tests per student:
     - `Tests.SubscriptionID` = student’s `Subscriptions.SubscriptionID`
     - `OrgID = NULL`
   - Attempt rules:
     - Only that `StudentID` can see/attempt that test.

> For this md, we focus on **Phase 1**: accessing platform-created tests that are allowed for their plan.

---

## 7. Authorization Rules

### 7.1 Individual Student

- Can only access:
  - Their own profile (`Students.StudentID`).
  - Their own `Subscriptions` (EntityType = 'Student', EntityID = StudentID).
  - Tests that:
    - Are marked for student audience (OrgID = NULL, or a `TargetAudience` flag), and
    - Belong to exams included in their plan (`SubscriptionPlanExams`), and
    - Are within their usage limits according to `UsageCounters`.

### 7.2 Org Student vs Individual Student

- Org student:
  - `OrgID` != NULL
  - Access tests assigned via `TestAssignments` tied to organization’s subscription.
- Individual student:
  - `OrgID` = NULL
  - Access tests tied to their own student subscriptions.

Backend must ensure queries **always filter** by:

- `OrgID` parity and `EntityType` on `Subscriptions`.
- JWT `actorType` and `studentId`.

---

## 8. Database Changes Required

Most of the core tables already support this use case. Only **one explicit schema change** is proposed.

### 8.1 `SubscriptionPlans` — Audience Column

```sql
ALTER TABLE "SubscriptionPlans"
ADD COLUMN "Audience" text CHECK ("Audience" IN ('Organization','Student','Both')) DEFAULT 'Organization';
```

- Populate existing rows with `'Organization'` (current behavior).
- Create new student-focused plans with `'Student'`.

### 8.2 Optional – Test Target Audience

If you want to be explicit about which tests can be seen by individual students:

```sql
ALTER TABLE "Tests"
ADD COLUMN "TargetAudience" text CHECK ("TargetAudience" IN ('Organization','Student','Both')) DEFAULT 'Organization';
```

- `TargetAudience = 'Organization'`:
  - Only org-scoped flows can use it.
- `TargetAudience = 'Student'`:
  - Only individual students (with valid subscriptions) can see/attempt.
- `TargetAudience = 'Both'`:
  - Shared tests (later if business wants).

(You can skip this in Phase 1 and just use `OrgID IS NULL` vs non-null + subscription checks, but `TargetAudience` makes things clearer and safer.)

No other mandatory DB changes are needed because:

- `Students.OrgID` is already nullable.
- `Subscriptions` already supports `EntityType = 'Student'`.
- `Payments` and `UsageCounters` already support `EntityType = 'Student'`.

---

## 9. API Endpoints (High-Level)

Just listing the main ones; exact signatures can go into a separate API doc:

- `POST /api/students/auth/signup`
- `POST /api/students/auth/login`
- `GET /api/subscription-plans?audience=Student`
- `POST /api/students/subscriptions` (create student subscription + initiate payment)
- `GET /api/students/subscriptions` (list active/expired student subscriptions)
- `GET /api/students/tests` (list tests accessible to this student based on their plans)
- `GET /api/students/tests/:testId`
- `POST /api/students/tests/:testId/attempts` (start attempt)
- `PUT /api/students/attempts/:attemptId/submit`
- `GET /api/students/attempts/:attemptId/result`

Authorization middleware:

- Ensures `actorType = 'Student'`.
- For subscription/test endpoints:
  - Ensures `OrgID IS NULL` for individual-student flows.
  - Ensures `Subscriptions.EntityType = 'Student'` and `EntityID = StudentID`.

---

## 10. UI / UX Notes (Short)

- Public **“For Students”** landing page:
  - Explains student plans.
  - “Sign up as Student” CTA.

- Student dashboard (individual mode):
  - Current plan & expiry.
  - Exams available under the plan.
  - List of available tests (Practice, Mock, maybe Final).
  - Attempt history, results, certificates.

- Clear separation in UI between:
  - Org student portal (invited by Org).
  - Individual student portal (self-serve).

---

