# Test Attempts — Student Flow & Constraints

**Scope:** High‑level design for how a student sees assigned/available tests and attempts them, including backend/DB contracts, constraints, and integration with existing **Tests**, **TestAssignments**, **StudentAttempts**, and **MCQs binding** logic.

This document is **design‑only**. No code is implemented yet.

---

## 1. Goals

- **G1. Student visibility:** A student should see only the tests that are:
  - Explicitly assigned to them (via `TestAssignments`), and
  - Currently available (time window, status, subscription, etc.).
- **G2. Attempt flow:** A student can start a test, answer questions, and submit; the system creates and updates `StudentAttempts` safely and idempotently.
- **G3. Constraints:** Enforce all business rules around:
  - Test configuration (date/time, status, duration, question count)
  - Assignment status (Pending, InProgress, Completed, Expired, Cancelled)
  - Attempt rules (e.g. single attempt vs. multiple attempts)
  - Subscription limits (per plan, per exam)
- **G4. Reuse and completeness:** Reuse existing binding and assignment mechanics, and plug any missing pieces in:
  - **Test creation** (required fields, activation rules)
  - **Assignment** (status updates, duplicate prevention)
  - **Attempt‑time question selection** for Custom / Auto / Hybrid.

---

## 2. Data Model (Existing + Needed)

### 2.1 Core Tables (existing)

- **Tests**
  - `TestID`, `OrgID`, `ExamID`
  - `TestName`, `TestType`
  - `DurationMinutes`, `TotalQuestions`, `TotalMarks`
  - Date/time: `TestDate`, `StartTime`, `EndTime`
  - `Status` (likely: Draft, Active, Inactive, Completed, Cancelled)

- **TestQuestions**
  - `TestID`, `QuestionID`
  - `Marks`, `TimeLimit`, `NegativeMarks`, `DisplayOrder`

- **Questions / Options** (see `mcqs_binding.md`)
  - Question metadata + options; used by Custom & Hybrid tests.

- **TestAssignments** (described in assignment docs and `tests.js`)
  - `AssignmentID` (PK)
  - `TestID` (FK)
  - `StudentID` (FK)
  - `GroupID` (optional FK for group‑based assignment)
  - `AssignmentType` (`Single`, `Multiple`, `Group`, `Groups`, `All`)
  - `AssignedBy` (OrgUser)
  - `AssignedAt`, `DueDate` (optional)
  - `Status` (`Pending`, `InProgress`, `Completed`, `Expired`, `Cancelled`)

- **StudentAttempts** (see schema doc)
  - `AttemptID` (PK)
  - `StudentID`, `TestID`
  - `StartTime`, `EndTime`
  - `ObtainedMarks`, `TotalMarks`
  - Possibly `Status` (`InProgress`, `Completed`, `Abandoned`) and per‑question responses.

### 2.2 Derived Views

For test attempts we conceptually need two “views”:

- **Assigned tests for a student** (what they *can* attempt):
  - Join `TestAssignments` → `Tests`
  - Filter by time, test status, and assignment status.
- **Attempts for a student/test** (what they *have done*):
  - Join `StudentAttempts` → `Tests` (+ assignments for context).

---

## 3. Student — Available Tests

### 3.1 Backend endpoint (to be implemented)

**Route:** `GET /api/student/tests`

**Auth:** Student JWT → `req.user.studentId`, `req.user.orgId`.

**Purpose:** Return tests that the logged‑in student can currently see on “Available Tests” or “My Assignments” screen.

**Core query (see `TEST_ASSIGNMENT_IMPLEMENTATION_PLAN.md`):**

```sql
SELECT t.*, ta."AssignmentID", ta."Status" AS "AssignmentStatus", ta."DueDate"
FROM "TestAssignments" ta
JOIN "Tests" t ON t."TestID" = ta."TestID"
WHERE ta."StudentID" = <studentId>
  AND t."OrgID" = <orgId>
  AND t."Status" = 'Active'
  AND NOW() BETWEEN t."StartTime" AND t."EndTime"
  AND ta."Status" IN ('Pending', 'InProgress');
```

### 3.2 Filters & status mapping

Backend should return a **normalized DTO** for each available test:

- `testId`, `testName`, `description`
- `examName` (optional), `testType`
- `durationMinutes`, `totalQuestions`, `totalMarks`
- `startTime`, `endTime`, `dueDate` (from assignment if present)
- `assignmentId`, `assignmentStatus` (`Pending`, `InProgress`, `Completed`, `Expired`)
- `latestAttemptSummary` (if any): `{ attemptId, status, obtainedMarks, totalMarks }`

On the **student UI**, we will map this into categories:

- **Pending** — `assignmentStatus = 'Pending'`, time window started, not expired, no completed attempt.
- **In Progress** — `assignmentStatus = 'InProgress'` and there is an open attempt.
- **Completed** — `assignmentStatus = 'Completed'` or latest attempt is `Completed`.
- **Expired** — due date or test end time passed without completion → `assignmentStatus = 'Expired'`.

### 3.3 Edge cases

- Test **deactivated** after assignment → `Tests.Status <> 'Active'`
  - Should be hidden from “Available Tests” (but history still visible via attempts/results UI).
- Test **time window not started**:
  - `StartTime` in the future → show as **Upcoming** but not “Startable”.
- Test **time window ended** without attempt → mark assignment `Expired` (see §5.3).

---

## 4. Attempt Flow — End‑to‑End

### 4.1 High‑level flow

1. Student opens **Available Tests** (or **My Assignments**)
2. Backend returns assigned tests via `GET /api/student/tests`
3. Student clicks **Start** on a test row
4. Backend validates constraints and creates (or resumes) a `StudentAttempt`
5. Student answers questions and submits
6. Backend finalizes attempt, computes score, updates:
   - `StudentAttempts` (marks, status, timestamps)
   - `TestAssignments.Status` (`Completed`)
   - Optional aggregates on `Tests` / `Questions` (TimesUsed, correctness stats)

### 4.2 Start attempt endpoint

**Route (proposal):** `POST /api/student/tests/:testId/attempts`

**Behavior:**

1. **Auth & assignment check**
   - Ensure `req.user.studentId` is set.
   - Ensure there is a `TestAssignments` row:  
     `TestAssignments.TestID = :testId AND StudentID = :studentId`.
   - Assignment `Status` must be `Pending` or `InProgress`.
2. **Test state & time window check**
   - `Tests.Status = 'Active'`.
   - `now` within `[StartTime, EndTime]` (and optional `DueDate` not past for this student).
3. **Attempt‑limit policy**
   - Baseline: **single attempt per assignment**:
     - If there is a `StudentAttempts` row with `Status = 'Completed'`, reject with “You have already completed this test.”
   - Extension (future): per‑test `MaxAttempts` config.
4. **Create or resume attempt**
   - If there is an existing `StudentAttempts` with `Status = 'InProgress'`, **resume** that attempt (return same `AttemptID` and prior answers).
   - Otherwise, create new `StudentAttempts` row:
     - `StudentID`, `TestID`, `StartTime = now`, `Status = 'InProgress'`, `TotalMarks` derived from questions.
   - Update `TestAssignments.Status = 'InProgress'`.
5. **Generate question set**
   - Use binding logic from `mcqs_binding.md`:
     - **Custom**: use `TestQuestions` rows ordered by `DisplayOrder`.
     - **Auto**: randomly select `TotalQuestions` from platform MCQs pool based on Exam/Subject/Topic + subscription constraints.
     - **Hybrid**: combine `autoPercent%` from platform pool and remaining from `TestQuestions`.
   - For Auto/Hybrid, the **attempt‑time selection** must be deterministic per attempt (e.g. store selected `QuestionIDs` in attempt metadata).
6. **Response payload**
   - `attemptId`
   - `testSummary` (name, duration, timeLeft, etc.)
   - `questions`: array of `{ questionId, questionText, options[] }` (no correct flags).

### 4.3 Submit attempt endpoint

**Route (proposal):** `POST /api/student/tests/:testId/attempts/:attemptId/submit`

**Behavior:**

1. Validate ownership: `StudentAttempts.StudentID = req.user.studentId`.
2. Validate test and assignment are still valid:
   - Test not deactivated.
   - Time window not exceeded (or apply late/force submit rules).
3. Accept payload:

```json
{
  "answers": [
    {
      "questionId": "uuid",
      "selectedOptionIds": ["uuid", "uuid"]
    }
  ]
}
```

4. For each question:
   - Compare submitted options to true correct options in `Options`.
   - Compute per‑question marks using `Marks` and `NegativeMarks` from `TestQuestions` if present; otherwise default scheme.
5. Aggregate:
   - `ObtainedMarks`, `TotalMarks` (reconfirm from test config).
6. Persist:
   - Update `StudentAttempts`:
     - `Status = 'Completed'`
     - `EndTime = now`
     - `ObtainedMarks`, `TotalMarks`
     - Optionally store raw responses in a separate `StudentResponses` table.
   - Update `TestAssignments.Status = 'Completed'` (or keep assignment separate if multiple attempts allowed in future).
   - Update `Questions.TimesUsed`, `TimesCorrect`, `TimesIncorrect` as in `mcqs_binding.md` (for analytics).

7. Response:
   - `score`, `maxScore`, `percentage`, `passFail` (if passing criteria exist), basics for review.

### 4.4 In‑progress auto‑save (optional future)

- Endpoint: `PUT /api/student/tests/:testId/attempts/:attemptId`
- Saves partial answers and current timeSpent; does **not** finalize attempt.

---

## 5. Constraints & Validation

### 5.1 Test creation / activation (pre‑attempt)

Ensure the following are validated when a test is **created/updated** and when it is **activated** (i.e., can be assigned):

- **Required fields:**
  - `OrgID`, `ExamID`, `TestName`, `TestType`
  - Time window: `StartTime`, `EndTime` (or `TestDate` + times)
  - `DurationMinutes`, `TotalQuestions`, `TotalMarks`
- **Time window logic:**
  - `EndTime > StartTime`.
  - Optional: enforce that activation cannot set `StartTime` in the past.
- **Question binding constraints** (see `mcqs_binding.md`):
  - **MinQuestionsPerTest**: must have ≥ configured minimum before activation.
  - **MaxQuestionsPerTest**: respect subscription `MaxQuestionsPerTest` for exam.
  - **Exam scope, org scope, question status** as already documented.
- **Status transitions:**
  - `Draft → Active` only if constraints satisfied.
  - `Active → Completed/Inactive/Cancelled` allowed under rules (e.g. cannot modify after attempts exist, or require special handling).

### 5.2 Assignment constraints

Enforced at `/api/org/tests/:testId/assign/*` (see assignment plan and `tests.js`):

- Test must be **Active** and bound to at least the minimum number of questions.
- Subscription must allow assignments for that exam (if applicable).
- **Duplicate prevention:**
  - No duplicate `TestAssignments` for same `(TestID, StudentID)` pair.
  - When assigning groups, handle overlaps and report already‑assigned students (as implemented in `tests.js`).
- **Status semantics:**
  - New assignment: `Status = 'Pending'`.
  - On first start: `Status → 'InProgress'`.
  - On completion: `Status → 'Completed'`.
  - On expiry job: `Status → 'Expired'` if no completed attempt and window passed.

### 5.3 Expiry & background jobs

We should add (in a separate design/cron doc, but referenced here):

- A scheduled job (or on‑demand maintenance endpoint) that:
  - Finds assignments where:
    - `Status IN ('Pending', 'InProgress')`
    - AND (`DueDate` < now OR `Tests.EndTime` < now)
  - Updates `TestAssignments.Status = 'Expired'`.
- Optionally, if an attempt exists with `Status = 'InProgress'` and the window passed, mark attempt as `Completed` with zero marks or `Abandoned` (policy decision).

---

## 6. Student UI Flows (High‑Level)

### 6.1 Available Tests (Dashboard + Assignments page)

- Use `GET /api/student/tests` to populate:
  - Cards / rows for each test showing:
    - Test name, type, exam, duration
    - Status badge (`Pending`, `In Progress`, `Upcoming`, `Expired`, `Completed`)
    - Due date (from assignment) and test window.
- **Actions:**
  - **Start Test** button if:
    - `assignmentStatus = 'Pending'`
    - test is active and within time window.
  - **Resume Test** if `InProgress` with open attempt.
  - **View Results** if `Completed` and review is allowed.

### 6.2 Attempt UI

During attempt (future UI implementation):

- Show:
  - Timer (based on `DurationMinutes` and `StartTime`)
  - Question navigation (list, next/prev)
  - Question text + options (respect LaTeX capabilities if extended to student view)
- On submit:
  - Confirm dialog, then call submit endpoint.
  - Show score and navigate to results/summary screen.

---

## 7. Gaps to Address Before Implementing

### 7.1 Clear attempt policy

- Decide and document:
  - **Single vs multiple attempts** per test/assignment.
  - How re‑attempts affect `TestAssignments.Status` and analytics.
  - Whether orgs can configure `MaxAttempts` per test.

### 7.2 Passing criteria & result visibility

- Define fields on `Tests` (or related config) for:
  - Passing percentage or marks.
  - Whether students can see detailed feedback (correct answers, explanations) and when.

### 7.3 Auto / Hybrid randomness

- Decide:
  - Whether all students assigned to the same test should see **same** random questions, or each attempt gets its own random set.
  - How to store that selection so score audit is reproducible.

### 7.4 Time‑zone handling

- Ensure `StartTime`, `EndTime`, `DueDate` comparisons are done in a consistent timezone (`timestamptz`, UTC in DB, converted in UI).

### 7.5 Backward compatibility

- If any existing code still lets students see tests without assignments, ensure:
  - Once `GET /api/student/tests` is implemented, the UI migrates fully to the assignment‑based model.
  - Legacy visibility (by `OrgID` only) is removed or guarded behind a feature flag.

---

## 8. Implementation Checklist (Future Work)

When we implement this design, we should follow roughly:

1. **Backend**
   - [ ] Implement `GET /api/student/tests` (visibility rules in §3).
   - [ ] Implement `POST /api/student/tests/:testId/attempts` (start/resume).
   - [ ] Implement `POST /api/student/tests/:testId/attempts/:attemptId/submit`.
   - [ ] Wire Auto/Hybrid question selection using `mcqs_binding.md` behavior.
   - [ ] Implement expiry job for assignments.
2. **Frontend — Student**
   - [ ] Use `GET /api/student/tests` for dashboard + assignments list.
   - [ ] Build Attempt UI using returned `questions` payload.
   - [ ] Show results/summary after submission.
3. **Testing**
   - [ ] Unit tests for backend rules (time window, statuses, limits).
   - [ ] E2E tests for full flow: assign → see test → attempt → complete.
   - [ ] Load tests for Auto/Hybrid selection performance.

This document (`test_attempts.md`) should be kept in sync with `mcqs_binding.md` and the assignment plan as the implementation evolves.

