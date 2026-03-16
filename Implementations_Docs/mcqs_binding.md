# MCQs Binding to Tests — Design & Implementation

**Purpose:** Let OrgAdmin (or authorized role) add/remove questions to/from a test in an easy and flexible way, while respecting min/max and subscription limits. Support three binding types: **Custom**, **Auto**, and **Hybrid**.

---

## Binding types

| Type | Description |
|------|-------------|
| **Custom** | You pick every question from **your organization’s question bank only** (org-created MCQs). Add, remove, and reorder via the Questions in Tests page. Subject/Topic and other filters apply; subject weightage is enforced so per-subject counts do not exceed exam weightage. |
| **Auto** | Questions are drawn **randomly** from **platform MCQs** for the test’s exam at **attempt time**, following exam criteria (subjects/topics) from the org’s subscription. No questions are added on the Questions in Tests page; set the test’s *Total questions* when creating/editing the test. |
| **Hybrid** | Mix of Auto + Custom. At attempt time: a configurable **%** of questions come from the random platform pool; the rest come from the questions you add (Custom). The % is set on the Questions in Tests page (e.g. 60% auto, 40% custom). |

Binding type and Hybrid % are stored **in server memory only** (no database change). Config is lost on server restart. Backend: `GET/PUT /api/org/tests/:testId/binding-config`; test details response includes `bindingType` and `autoPercent`.

---

## Implementation status

| Item | Status |
|------|--------|
| **Binding types (Custom / Auto / Hybrid)** | Done (UI + in-memory config; attempt-time logic for Auto/Hybrid to be wired when student attempt flow exists) |
| **Max questions per test** (subscription enforced) | Done |
| **Exam scope** (only questions for test's exam) | Done |
| **Org scope** (org + platform questions) | Done |
| **Question status** (optional "Approved only" filter) | Done |
| **Pick from bank (search & select)** | Done (filters: search, difficulty, approved only; checkboxes, add selected) |
| **Remove question from test** | Done |
| **Test aggregates** (TotalQuestions updated on add/remove) | Done |
| **Min questions per test** (block activate/assign if below min) | Done |
| **Bulk add by topic/criteria** ("Add N from Topic X") | Done |
| **Drag-and-drop** UI | Done (reorder via drag in test list) |
| **Import by IDs** | Removed |
| **Copy from another test** | Done |
| **Reorder** (DisplayOrder / Sequence) | Done |

**Backend:** `GET /api/org/tests/:testId`, `GET/PUT /api/org/tests/:testId/binding-config` (in-memory; no DB). `GET /api/org/tests/:testId/questions/available` (query: `subjectId`, `topicId`, `difficulty`, `approvedOnly`, `search`, `customOnly`, `questionType`, `page`, `limit`; when `customOnly=1` only org questions are returned). `POST /api/org/tests/:testId/questions` (body: `questionIds`; validates subject weightage and returns `weightageExceeded` on 400 if exceeded). `POST .../questions/bulk` (body: `topicId`, `subjectId`, `difficulty`, `approvedOnly`, `count`, `customOnly`; when `customOnly` true only org questions are picked; weightage validated). `DELETE .../questions/:questionId`, `POST .../questions/copy-from`, `PUT .../questions/reorder`. Min-questions check on activate and all assign routes. `TestQuestions.DisplayOrder` (migration: `backend/scripts/add_testquestions_displayorder.sql`).  
**Frontend:** Dedicated page **Questions in Tests** (sidebar + route `/org/test-questions`, optional `/org/test-questions/:testId`). Section **2. How questions are bound** with three options: Custom, Auto, Hybrid (with Auto % input for Hybrid). For **Custom** and **Hybrid**: two-panel layout (questions in test + add from bank). **Custom binding:** only the organization’s questions are shown in the bank; filters include Subject, Topic, search, difficulty, question type, approved only. Add selected or bulk add by topic; subject weightage is enforced (add may fail with a clear message if weightage would be exceeded). Copy from another test. For **Auto**: info card only (no question management). See `src/pages/org/TestQuestions.jsx`, `TestQuestions.css`.

**Attempt-time behavior (to be wired when student attempt flow exists):** For **Auto**, the backend should draw `TotalQuestions` random platform (OrgID null) questions for the test’s exam (within subscription). For **Hybrid**, draw `autoPercent%` from that same pool and `(100 − autoPercent)%` from `TestQuestions`, then combine. For **Custom**, use only `TestQuestions`. Binding config is read from in-memory `testBindingConfig.get(testId)` in `backend/routes/tests.js`.

---

## Constraints to Enforce

| Constraint | Source | Rule |
|------------|--------|------|
| **Min questions per test** | Test config / plan | Test must have ≥ configured minimum (e.g. 5) before it can be activated or assigned. |
| **Max questions per test** | Subscription (e.g. `SubscriptionPlanExams.MaxQuestionsPerTest`) | Total questions in test ≤ plan limit for that exam. |
| **Exam scope** | Test.ExamID | Only questions whose Topic → Subject → Exam matches the test’s exam can be added. |
| **Org scope** | Test.OrgID | For org tests, only questions belonging to that org (or platform-shared) can be added. **Custom binding:** only that org’s questions (OrgID = org) are shown and allowed. |
| **Subject weightage** | Subjects.Weightage, Test.TotalQuestions | Per-subject question count must not exceed (TotalQuestions × Subject.Weightage / 100). Enforced on add and bulk add. |
| **Question status** | Optional | Only “Approved” questions may be allowed in live tests. |

---

## Ways to Add Questions (Ideas)

1. **Pick from question bank (search & select)** — Done  
   Filter by **Subject**, **Topic**, search, difficulty, question type (Single/Multiple Correct), approved only; show list with checkboxes; add selected in one go. Respects current count vs max and subject weightage. For **Custom** binding, only the organization’s own MCQs are listed.

2. **Bulk add by topic/criteria**  
   “Add N questions from Topic X” or “Add 10 Easy + 5 Medium from Subject Y.” System picks randomly (or by order) from available pool; user sees count and can refresh selection.

3. **Drag-and-drop**  
   Two panels: “Available questions” (filtered) and “Test questions.” Drag from available into test; show running total and block when max reached.

4. **Import by IDs**  
   Paste or upload a list of QuestionIDs (e.g. from export). Validate exam/org and limits, then bind in one request.

5. **Copy from another test**  
   “Copy questions from Test T” — select source test (same org/exam), choose all or subset, add to current test. Deduplicate by QuestionID; enforce max.

---

## Remove / Reorder

- **Remove:** Done — Unbind QuestionID from TestID (delete from `TestQuestions`). Recompute test’s `TotalQuestions` / `TotalMarks` (and duration if derived).
- **Reorder:** Optional `DisplayOrder` (or `Sequence`) column on `TestQuestions` so questions appear in a fixed order when students take the test.

---

## Validation Flow (High Level)

- On **add**: Check exam match → org/visibility → question status (if enforced) → (current count + add count) ≤ max → persist `TestQuestions`, then update test aggregates.
- On **remove**: Delete row(s) from `TestQuestions`, then update test aggregates; optionally warn if new total &lt; min.
- **Subscription:** Before add, resolve org’s (or student’s) active subscription and plan; read `MaxQuestionsPerTest` for test’s exam and enforce.

---

## Data Touch Points

- **Tables:** `Tests`, `TestQuestions`, `Questions`, `Topics`, `Subjects`, `Exams`, `SubscriptionPlans` / `SubscriptionPlanExams` (or plan features), `Subscriptions`.
- **Derived:** `TotalQuestions`, `TotalMarks` on `Tests` should stay in sync with `TestQuestions` (and optional per-question `Marks`/`TimeLimit`/`NegativeMarks`).

---

Validation flow: On add — exam match, org, status, count vs max, then persist and update aggregates. On remove — delete then update aggregates. Subscription MaxQuestionsPerTest enforced on add.
