# ProPath — AI-First Engineering Story

> This is your **complete presentation script** for the 15–20 minute video. Every section has a speakable narrative, what to show on screen, and the exact .md files to reference. Read it once before you record; then speak naturally — don't read it word for word.

---

## What the job is actually evaluating — read this first

The AI-First Engineering Sprint looks for exactly these things in the video (from their official criteria):

| Their requirement | Where you cover it in this script |
|---|---|
| A real, non-trivial engineering problem with uncertainty | Section 2 — 5 interlocking problems; the dual Subject Expert auth bug is a **real authorization/security issue** they explicitly call out |
| Attempts and iterations before the final solution | Section 2 Problem 4 — first middleware looked correct on the surface; took iterations to find the privilege escalation |
| AI used to accelerate thinking and execution, with specific prompts | Section 3 — ChatGPT project for design, Cursor for spec-first implementation; 5-step workflow with exact prompts |
| At least one AI suggestion rejected or modified with a reason | Section 3 — in-memory filtering rejected; reason given (scale, memory, pagination) |
| Manual validation of the solution | Section 4 — API, DB, UI, three-step subscription gate auth check |
| Clear before vs after impact | Section 5 — per role, per feature, before there was nothing |
| Reflection on what you'd do differently | Section 7 — four concrete, specific points |
| Docs, structure, engineering process | .md-first section + Section 6 — this differentiates you from people who just use AI to generate code |

**Your strongest differentiator:** The dual Subject Expert / Reviewer authorization problem (Problem 4 in Section 2) is **exactly** the type of security bug / authorization issue they listed as a non-trivial challenge. It was non-obvious, it required iterations, it had real security consequences, and the fix required a structural change to how auth middleware works — not just a WHERE clause.

---

## My .md-first workflow — say this upfront, it sets everything

Before I explain the project, I want to explain **how I work** — because this is what makes the project maintainable and what made AI actually useful rather than just fast.

**I never go straight from a prompt to implementation.**

For every feature I write a dedicated `.md` file first. That file defines:
- what is **in scope** for this feature
- what is **out of scope** or deferred
- what could go **wrong** or be missed
- the **DB changes** needed (new tables, columns, enums)
- the **API contract** (endpoints, request/response shape, auth)
- the **UI behavior** (what the user sees, what errors look like)

Only after that `.md` is written do I ask the AI to implement. So the AI is implementing against a spec I control — not inventing behavior on its own.

On top of that I have two permanent reference documents that never go out of date:

- **`Related_Documents/Database_Schema.md`** — the full PostgreSQL schema: every table, every column, every enum, every foreign key, every index, and migration snippets. Before any new query, migration, or backend route is written — by me or by the AI — it is checked against this file.
- **`Related_Documents/Main_Implementation.md`** — the system design: entities, roles, subscription model, exam–test–question hierarchy, and how all the pieces connect.

When I make a change — a new column, a renamed enum, a new API behavior — I update the relevant `.md` files **before or immediately after** the code change. That way the docs are always the single source of truth. The AI never has to guess what the schema looks like; I just attach the `.md` and it has full context.

### Feature .md files I wrote for ProPath

| Feature | .md file | What it defined |
|---------|----------|-----------------|
| MCQ binding (Custom / Auto / Hybrid) | `Related_Documents/mcqs_binding.md` | Three binding modes, subject weightage constraints, org-scope rules, available-questions API |
| Test assignment to students | `TEST_ASSIGNMENT_IMPLEMENTATION_PLAN.md` | Why org-wide visibility was insufficient, TestAssignments table design, single/group/all assignment types |
| Org exam enrollment & test creation | `ORGANIZATION_EXAM_ENROLLMENT_AND_TEST_ASSIGNMENT.md` | Enrollment flow, subscription-based access, test creation under quota, assignment mechanisms |
| Notification system | `NOTIFICATION_SYSTEM_IMPLEMENTATION.md` | Notification service utilities, API routes, SuperAdmin vs OrgAdmin send scope, frontend bell component |
| Backlog & remaining features | `to_be_implemented.md` | MCQ review workflow, rejection rollback, student login, analytics, LaTeX support — all with requirements and priority |
| Test attempt flow | `Related_Documents/test_attempts.md` | How students start, answer, pause, and submit; how results are computed |

**One sentence for the video:**
> *"I always write the .md for the feature first — what's included, what's missed, what the schema and API look like — and I keep those docs updated so the AI always has full context and I never hit backend or DB compatibility issues."*

---

## Video structure

| Section | Time | Core message |
|---------|------|--------------|
| 1. What ProPath is | 0:00 – 1:30 | Not a simple CRUD app — a multi-tenant exam platform with real business rules |
| 2. The real complexity | 1:30 – 4:00 | 20+ tables, 5 roles, 3 binding modes, subscription quotas, dual-level auth bug, multi-tenant isolation |
| 3. How I used AI | 4:00 – 8:00 | Spec-first → AI implements → I validate and reject bad suggestions |
| 4. Manual validation | 8:00 – 10:00 | API, DB, UI, auth — all checked by hand |
| 5. Outcome | 10:00 – 12:00 | Before vs after; what the platform can actually do now |
| 6. .md workflow & Sprints | 12:00 – 13:30 | Docs as source of truth; structured iteration |
| 7. Reflection | 13:30 – 15:00 | What I'd do differently |

---

## Section 1 — What ProPath is (≈1 min 30 sec)

**Say:**

> "I'm presenting **ProPath** — a multi-tenant examination platform I built with AI assistance throughout. ProPath is for educational institutions: an organization subscribes to a plan, gets access to standardized exams like MDCAT or ECAT, creates tests under subscription quotas, and assigns them to students. Students take the tests, get scored, and can receive certificates.
>
> The stack is React on the frontend, Node/Express on the backend, PostgreSQL on Supabase, JWT auth, and role-based access across **five roles**: SuperAdmin, OrgAdmin, Reviewer, Subject Expert, and Student. The schema has over **20 tables** with enums, foreign keys, usage counters, and audit logs. This is not a simple CRUD app — there are real business rules around subscriptions, data isolation, question binding, subject weightage, and authorization that all have to stay consistent across the schema, API, and UI.
>
> And this is not a finished product — it's a growing platform. The current modules are the foundation. The next phase brings AI directly into the learning loop: RAG-based question generation, adaptive testing where each test is influenced by the student's previous performance, and per-question AI explanations that tell a student not just that they got something wrong but *why* — with reasoning tied to the specific concept. The architecture is being built to support that from the start."

**Show:** Project root in VS Code — let the viewer see the folder structure: `backend/routes/`, `src/pages/`, `Related_Documents/`. Then briefly open `Related_Documents/Database_Schema.md` and scroll — let them see the size of it.

---

## Section 2 — The real complexity (≈2 min 30 sec)

**Say:**

> "Let me be specific about what made this hard. There were five interlocking problems — and one of them was a non-obvious authorization design issue that I didn't see coming until I was deep into the role model.
>
> **Problem 1 — Multi-tenant data isolation.** Many organizations share the same database. An OrgAdmin must only see their own tests, students, questions, and subscription. A student at Organization A must never see a test from Organization B. This isn't just a WHERE clause — it's a constraint that has to be enforced in every route, in middleware, and in every Supabase query. If you miss it in one place, you have a data leak.
>
> **Problem 2 — Subscription quotas with per-exam limits.** Each organization subscribes to a plan. But a plan isn't just a flat limit — it has **per-exam limits**: max students, max tests, max questions per test, max tests per day. That's the `SubscriptionPlanExams` table. When an org creates a test, adds questions, or enrolls a student, the backend checks `UsageCounters` against the plan's limits for that specific exam. If you model this wrong — say, putting limits only on the plan — you can't support different quotas for MDCAT vs ECAT under the same plan.
>
> **Problem 3 — Three question binding modes with subject weightage.** Tests can be built three ways: **Custom** — the org picks every question from its own bank; **Auto** — questions are drawn randomly from the platform at attempt time; **Hybrid** — a mix. But it's not just mode selection. Each exam has subjects with a weightage percentage. When an org adds questions to a Custom or Hybrid test, the backend enforces that the per-subject count doesn't exceed `totalQuestions × subjectWeightage / 100`. So if a test has 100 questions and Physics is 30%, you can't add more than 30 Physics questions. That validation runs on every add-question and bulk-add call.
>
> **Problem 4 — The dual Subject Expert and Reviewer authorization problem.** This one caught me off guard. The system has two completely different types of Subject Experts and Reviewers — and they share the same role names but have entirely different authorization rules.
>
> A **platform-level Subject Expert** lives in the `Users` table, belongs to no organization, and can create questions for any exam across the entire platform regardless of subscriptions. They're managed by SuperAdmin. No subscription check — they're internal contributors.
>
> An **org-level Subject Expert** lives in the `OrgUsers` table, belongs to a specific organization, and can only create questions for exams that their organization has an active subscription to. Before they can interact with an exam, the backend has to verify: does their org have an active subscription? Does that subscription's plan include this exam via `SubscriptionPlanExams`? Is the subscription still within its end date?
>
> The same role name, two different tables, two completely different access models. The problem was that the initial middleware just checked the role string. It didn't check which table the user came from, which meant an org-level Subject Expert could potentially call the same question-creation endpoints as a platform-level expert — without the subscription gate. That was a privilege escalation bug hiding inside a role check that looked correct on the surface.
>
> The fix required splitting the auth flow: detect whether the token belongs to a `User` or an `OrgUser`, apply the right middleware path, and for `OrgUser` paths enforce the subscription and exam-access check on every relevant route. I wrote a dedicated middleware function for org-scoped expert access that pulls the org's active subscription, resolves the linked exams from `SubscriptionPlanExams`, and rejects the request with 403 if the target exam isn't in that list. That check runs before any route handler sees the request.
>
> **Problem 5 — Authorization consistency across five roles.** The same API routes serve SuperAdmin, OrgAdmin, and both types of Subject Experts and Reviewers — but with different permissions at every level. SuperAdmin can see all orgs; OrgAdmin only their own. Platform Reviewers can approve questions for any exam; org Reviewers only for subscribed exams. Students can only attempt tests assigned to them. A missing or incorrectly ordered check means privilege escalation. Getting all of this right across 20+ routes without gaps was the hardest consistency problem in the project.
>
> The hard part wasn't any one of these in isolation — it was that they were all load-bearing at the same time, and a mistake in any one of them had security consequences."

**Show:** `Related_Documents/Database_Schema.md` — scroll to `Users` vs `OrgUsers` tables, then `SubscriptionPlanExams`, `UsageCounters`. Then open `backend/routes/admin.js` or `auth.js` briefly to show the middleware structure — the split between platform user paths and org user paths.

---

## Section 3 — How I used AI to solve it (≈4 min)

**Say:**

> "I use two AI tools with a clear split of responsibility — **ChatGPT** for design and DB thinking, **Cursor** for implementation. Let me walk through exactly how that works.
>
> **Step 1 — ChatGPT for design and schema decisions.**
> I have a dedicated ChatGPT project called ProPath with full context loaded: the system design, the complete `Database_Schema.md`, all the feature .md files, and the implementation history. When I need to think through a new feature — how to model it, what DB changes are needed, what edge cases exist — I go to ChatGPT first. It already knows the full schema so I don't have to re-explain relationships every time. I describe what I want to build and ask it to reason through the design: what tables are affected, what new columns or tables are needed, what constraints to enforce, what could go wrong.
>
> For example, when I was designing the subscription quota model, I described the multi-tenant requirement and asked ChatGPT to propose a normalized schema. It suggested `SubscriptionPlans` with flat limits. I pushed back: a plan needs different limits per exam — MDCAT might allow 200 students, ECAT only 50 under the same plan. We went back and forth and landed on `SubscriptionPlanExams` as a join table with per-exam quota columns: `MaxStudents`, `MaxTests`, `MaxQuestionsPerTest`, `MaxTestsPerDay`, `AISupport`. That conversation happened in ChatGPT, not in Cursor, because it was a design decision — not an implementation task.
>
> **Step 2 — Update the .md files, then verify manually.**
> Once ChatGPT and I agree on a design, I update `Database_Schema.md` and the relevant feature .md with the new tables, columns, and behavior. If there's a DB migration, I run it in Supabase and manually verify the column types, constraints, and foreign keys match what's in the .md. Only after the schema is confirmed in the actual DB do I move to Cursor.
>
> **Step 3 — Tell Cursor what I'm about to build.**
> I open Cursor and say: *"I'm going to implement this feature. Here's the .md for it. Here's the current Database_Schema.md. Check the schema for compatibility — is there anything that would block this? Then help me refine the approach and tell me the best way to implement it."* Cursor reads both files, checks the existing schema, flags any conflicts, and suggests an implementation order. This step often surfaces things I missed — for example, a missing index, or a column that needs to be nullable for the first phase but not later.
>
> **Step 4 — Ask Cursor to generate the feature .md.**
> Before writing any code, I ask Cursor: *"Based on this feature description and the current schema, generate a detailed .md file for this feature — what's in scope, what's out of scope, edge cases, DB changes, API contract, and UI behavior."* Cursor produces a structured spec. I review it, adjust anything that doesn't match my intent, and then that .md becomes the contract for implementation.
>
> **Step 5 — Implementation with a sub-feature tracking table.**
> I ask Cursor to break the feature into sub-tasks and create a table in the .md listing each one. As each sub-feature is implemented, I mark it done in the table. When a sub-feature touches the schema, API, or existing behavior, I ask Cursor to update the relevant .md files at the same time — so `Database_Schema.md`, `Main_Implementation.md`, and the feature .md all stay in sync as implementation progresses. This is how complex features that would normally take days get done in a structured, trackable way.
>
> **A concrete example — the MCQ binding flow.**
> ChatGPT helped me design the three modes and the weightage formula. I updated `mcqs_binding.md` with the full spec. I ran the schema migration and verified it. Then I went to Cursor with that .md and said: implement the backend — available-questions endpoint with `customOnly` flag, subject/topic/difficulty filters, and the weightage validation helper. Cursor generated the Supabase queries, the filter logic, and the helper that counts current and incoming questions per subject and returns a structured error if any subject exceeds its cap. Then I asked for the frontend: three distinct UIs for Custom, Auto, and Hybrid. Cursor generated all three. I validated each against the spec.
>
> **A suggestion I rejected.**
> For the available-questions endpoint, Cursor once suggested fetching all questions for the exam and filtering in JavaScript. I rejected that — with a question bank of thousands of MCQs that doesn't scale. I kept server-side filtering with Supabase query parameters and pagination. The AI rewrote the query accordingly.
>
> **Debugging example.**
> The 'update subscription plan status' route was returning a generic 500. I pasted the route, the Supabase call, and the relevant section of `Database_Schema.md` into Cursor. It identified that the `Status` column had been changed from `text` to `status_subscriptionplans_enum` but the route was still passing a raw string. It also caught a syntax error: `return { valid: true });` — mismatched brace. Both fixed in one pass because the schema context was right there.
>
> **Example 4 — The dual Subject Expert authorization bug: how AI helped me find and fix it.**
> This is the example I'm most proud of — because it was a real security issue hiding inside code that looked correct.
>
> The system has two types of Subject Experts. A **platform-level Subject Expert** lives in the `Users` table, has no org, and can create questions for any exam on the platform. An **org-level Subject Expert** lives in `OrgUsers`, belongs to a specific organization, and should only be able to create questions for exams that their org has an active subscription to — checked through `SubscriptionPlanExams`.
>
> The initial middleware just checked the role string: if role is 'Subject Expert', allow. It didn't check which table the token came from. That meant an org-level Subject Expert could call the same question-creation routes as a platform expert — completely bypassing the subscription gate. It looked fine in testing because I was always logged in as the right user. The bug only became visible when I explicitly thought through: *what happens if an org expert calls a route for an exam their org hasn't subscribed to?*
>
> I took this to ChatGPT first. I described the two user types, the two tables, and the current middleware. I asked: *"What's the cleanest way to split these auth paths so the subscription check is enforced for OrgUsers without duplicating every route?"* ChatGPT suggested detecting the token type from a claim in the JWT payload — a `userType` field set at login time — and branching the middleware based on that. It also suggested a dedicated `requireOrgExpertAccess(examId)` middleware that resolves the subscription chain: `OrgUsers.OrgID` → `Subscriptions` (active, not expired) → `SubscriptionPlanExams` (exam in plan) → allow or 403.
>
> I then went to Cursor with that design and the current `Database_Schema.md`. I said: *"Implement this middleware. At login, set `userType: 'platform'` for Users and `userType: 'org'` for OrgUsers in the JWT. Write `requireOrgExpertAccess` that takes `examId` from the request, pulls the org's active subscription, checks `SubscriptionPlanExams` for that exam, and rejects with 403 if not found or if the subscription is expired."* Cursor generated the middleware, the JWT claim logic at login, and the updated route guards. I reviewed every line — the subscription expiry check was using `>=` where it should have been `>` for the end date boundary. I caught that and corrected it before merging.
>
> The fix required changes in three places: the login route (add `userType` to JWT), the auth middleware (branch on `userType`), and every question-creation and question-listing route for org experts (add `requireOrgExpertAccess`). Cursor tracked all three as a sub-feature table in the .md and updated `Database_Schema.md` with a note about the JWT claim. I validated with three calls: org expert + unsubscribed exam → 403, org expert + subscribed exam → 200, org expert + subscribed exam but expired subscription → 403. All three correct.
>
> **What AI got right:** the structural suggestion — `userType` in JWT + dedicated middleware — was clean and didn't require duplicating routes. **What I caught:** the off-by-one on the date boundary. That's exactly why you don't ship AI output without reading it.
>
> **Example 5 — Maintenance mode and the browser back bug.**
> I also hit a subtle UX bug when I implemented global maintenance mode. When maintenance was ON and an OrgAdmin signed in, the app correctly redirected them to a dedicated maintenance page with a hopeful message and a logout button. But if they clicked the browser back button, for a moment they would see their dashboard again — even though maintenance was still enabled. That’s not just ugly UX; it’s confusing and can make users think the system is half-broken.
>
> The root cause was that I was only checking maintenance in the login flow. React Router still had the previous dashboard route in the history stack, so a back navigation would render the dashboard layout before any guard kicked in. I took this to ChatGPT and described the behavior: the login redirect, the maintenance page, the back-button flash, and the existing ProtectedRoute/Layouts. We reasoned through React’s rendering order and the rules of hooks, and ChatGPT pushed me toward a pattern where the maintenance check happens inside a shared `ProtectedRoute` wrapper before any layout or dashboard content is rendered — and where the check itself is asynchronous but still respects `react-hooks/rules-of-hooks`.
>
> I then went to Cursor with that design and asked it to implement a new `ProtectedRoute` that (a) always runs its `useEffect` first, (b) calls a public `/maintenance-public` endpoint, (c) blocks rendering until the maintenance check completes, and (d) conditionally returns a `<Navigate>` to the maintenance page with settings in state. My first attempt triggered the “React Hook useEffect is called conditionally” ESLint error because I had early `return`s before the hook. Cursor fixed the structure so all hooks are at the top, and the auth/role checks and maintenance gating happen after the hook has run. I validated by logging in as OrgAdmin and Student with maintenance ON, hitting the back button, and confirming that the dashboard never appears — it just goes straight back to the maintenance page with no flash.
>
> **The split in one sentence:** ChatGPT thinks through design with full project context. Cursor implements against the spec I've already locked. Neither is used blindly — every output is checked against the .md before it goes into the codebase."

**Show:** Open the ChatGPT ProPath project (briefly — show it has context loaded). Then switch to Cursor — open `backend/routes/tests.js` and scroll to `getAvailableQuestions` and `validateWeightageForAdd`. Then open `backend/routes/auth.js` — show the JWT login section where `userType` is set. Then show the middleware that branches on `userType` and enforces the subscription check for org experts.

---

## Section 4 — What I validated manually (≈2 min)

**Say:**

> "I didn't trust AI output without verification. Here's what I checked by hand.
>
> **API validation.** I used the browser network tab and Postman to call endpoints directly. For available questions: GET with `customOnly=true` and a specific `subjectId` — confirmed the response only contained that org's questions from that subject. For weightage: I constructed a request that would push one subject over its cap and confirmed the API returned 400 with a clear error message naming the subject and the limit.
>
> **Database validation.** For every migration — adding `Status` to `SubscriptionPlans`, adding `DisplayOrder` to `TestQuestions`, adding the `TestAssignments` table — I ran the SQL in Supabase's editor and then queried the table to confirm the column, type, and constraints matched `Database_Schema.md`. For weightage I ran the math manually: a test with 10 total questions, Physics at 30% weightage, means max 3 Physics questions. I added 3, confirmed success. Added a 4th, confirmed the 400 error.
>
> **UI validation.** I clicked through every role. As OrgAdmin: created a test, switched binding to Custom, filtered by subject and topic, added questions, hit the weightage limit, saw the error on screen. Switched to Hybrid, moved the auto-percent slider, saved, refreshed — confirmed the value persisted. As SuperAdmin: created a subscription plan, set it Inactive, confirmed it disappeared from org selection but existing org subscriptions were unaffected. As Subject Expert: created questions, confirmed they only appeared under the correct exam and subject.
>
> **Authorization validation — including the dual-role bug.** Called SuperAdmin-only routes with an OrgAdmin token — confirmed 403. Called org-scoped routes with a token from a different org — confirmed the response was empty. But the most important auth check was the dual Subject Expert flow. I called the question-creation endpoint with an org-level Subject Expert token and a target exam that was *not* in their org's subscription plan — confirmed 403. Then called with an exam that *is* in the plan — confirmed 200. Then expired the subscription date manually in Supabase and called again — confirmed 403. That three-step check validated that the subscription gate was real and not just checking role string. Confirmed students can only see tests assigned to them, not all org tests."

**Show:** Network tab with a 400 response from the weightage endpoint, or Supabase table editor showing `SubscriptionPlans` with the `Status` enum column.

---

## Section 5 — Outcome: what the platform can actually do (≈2 min)

**Say:**

> "Before ProPath, there was no platform. Institutions had no way to subscribe to standardized exams, create quota-enforced tests, manage a question bank with review workflows, or run multi-mode tests with per-subject weightage.
>
> After: ProPath is a working system with real depth.
>
> **SuperAdmin** can create subscription plans with per-exam quotas, create and manage exams with subjects and topics, approve or reject organizations, manage platform users, send notifications to all orgs or specific users, and view audit logs.
>
> **OrgAdmin** subscribes to a plan, gets access to the exams in that plan, creates tests under quota, binds questions in Custom, Auto, or Hybrid mode with weightage enforcement, manages students and student groups, assigns tests to individuals, groups, or all students, and monitors usage counters.
>
> **Subject Expert** creates MCQs with LaTeX support for mathematical notation, assigns them to subjects and topics, and submits them for review.
>
> **Reviewer** approves or rejects MCQs with feedback; rejected questions can be sent back for revision.
>
> **Student** logs in, sees assigned tests, attempts them within the time window, gets scored, and can receive a certificate.
>
> The notification system sends targeted alerts — SuperAdmin to all orgs, OrgAdmin to their students — with an unread count badge and mark-all-read. The schema has audit logs tracking every login, create, update, delete, payment, and attempt with actor type and entity type. Certificates are issued per attempt with type (Completion, Merit, Participation, Achievement). Feedback is collected per test or question with a review workflow.
>
> This is not a demo project. It's a documented, multi-role, multi-tenant platform with enforced business rules at every layer.
>
> And this is only Phase 1. The platform is designed to grow into something much larger.
>
> **Phase 2 — AI-powered question generation via RAG.** Every organization builds a question bank. In the next module we'll feed that bank — plus past exam papers and syllabus content — into a RAG pipeline. The AI will generate new MCQs in the same style and difficulty distribution as the existing bank. Organizations won't just use our platform to manage questions; they'll use it to *grow* their question bank intelligently.
>
> **Phase 3 — Adaptive learning.** Right now a student takes a test and gets a score. In the next phase, each test is influenced by the student's performance on the previous one. If a student consistently struggles with a topic, the system increases the weight of that topic in the next test. If they've mastered a subject, it reduces it. The `StudentAttempts` and result data already being captured in the schema is the foundation for this — we're building the data layer now so the adaptive engine can read it later.
>
> **Phase 4 — Per-question AI explanation.** When a student gets a question wrong, instead of just showing the correct answer, the platform will call an AI model with the question, the student's answer, and the concept context. The AI returns a targeted explanation: not a generic definition, but a specific reason why the student's choice was wrong and what the correct reasoning is. This turns every wrong answer into a micro-learning moment.
>
> So what you're looking at now is a fully functional exam platform — but also the infrastructure for an AI-driven adaptive learning system. Every design decision, every table, every API is being made with that future in mind."

**Show:** Live demo — login as OrgAdmin → Tests → open a test → Questions in Test → switch between Custom / Auto / Hybrid. Then briefly show the notification bell, the subscription plan page, or the student attempt screen. If you have a diagram or notes for the RAG/adaptive module, show it briefly here.

---

## Section 6 — .md workflow and Sprints (≈1 min 30 sec)

*The full .md philosophy is at the top of this document. This section is the spoken version for the video.*

**Say:**

> "The reason this project stayed consistent across 20+ tables, five roles, and multiple features built over time is the .md workflow. Every feature started with a spec .md. `mcqs_binding.md` defined binding before a single line of backend was written. `TEST_ASSIGNMENT_IMPLEMENTATION_PLAN.md` explained why the existing schema was insufficient and designed the `TestAssignments` table before I touched the DB. `NOTIFICATION_SYSTEM_IMPLEMENTATION.md` defined the service utilities, API routes, and frontend component before implementation. `to_be_implemented.md` is the living backlog — every pending feature has requirements, DB changes, and API shape already written.
>
> `Database_Schema.md` and `Main_Implementation.md` are the permanent foundation. They don't go out of date because I update them when the code changes. When I ask the AI for anything involving the DB or API, I attach those files. The AI has full context — it doesn't invent column names or guess at relationships.
>
> I also keep Sprint details on Google Docs — each sprint has a scope, acceptance criteria, and order: schema first, then API, then UI, then validation. That gives me a clear sequence and prevents the AI from jumping ahead to UI before the schema is settled."

**Show:** Scroll through `Related_Documents/` folder — let the viewer see all the .md files. Then briefly show `to_be_implemented.md` — the backlog table.

---

## Section 7 — Reflection (≈1 min 30 sec)

**Say:**

> "If I rebuilt ProPath today, four things would be different.
>
> **First — integration tests from day one.** Right now validation is manual. I'd add tests that call the real API against a test DB and assert quota enforcement, weightage errors, and tenant isolation. That way refactors don't silently break rules and the AI can't accidentally break a constraint it doesn't know about.
>
> **Second — OpenAPI spec as the contract.** The .md files describe the API in prose. I'd replace that with an OpenAPI spec so the frontend can generate a typed client, the AI can generate route stubs from it, and mismatches between frontend and backend are caught at build time rather than in the network tab.
>
> **Third — design the student performance data model for adaptive learning from day one.** The `StudentAttempts` table captures attempts and scores. But for the adaptive learning module — where the next test is influenced by performance on the previous one — I need richer per-question response data: which option was chosen, how long the student spent on each question, confidence level. I'd add that granularity to the schema from the start instead of retrofitting it later.
>
> **Fourth — keep the .md-first workflow but add a linting step.** I'd write a small script that checks that every table in `Database_Schema.md` exists in the actual Supabase schema and that every endpoint in `API_Documentation.md` has a matching route in the backend. That closes the gap between docs and code automatically — especially important as the RAG and adaptive modules add new tables and endpoints.
>
> The core approach — ChatGPT for design thinking, Cursor for implementation against a spec, manual validation — I'd keep exactly as is. It's what made a system this complex buildable by one person, and it's what will keep it maintainable as the AI modules are added."

---

## What to show on screen — quick reference

| Section | What to show |
|---------|-------------|
| Intro | VS Code root — folder structure + open `Database_Schema.md` and scroll to show its size |
| Problem | `Database_Schema.md` → `Users` vs `OrgUsers` tables, `SubscriptionPlanExams`, `UsageCounters`; briefly show `backend/routes/` middleware split |
| AI usage | ChatGPT ProPath project (briefly — show context is loaded); then `backend/routes/tests.js` → `getAvailableQuestions`, `validateWeightageForAdd`; `mcqs_binding.md` → constraints + sub-feature table |
| Validation | Network tab: 400 from weightage endpoint; Supabase: `SubscriptionPlans` table with Status enum |
| Outcome | Live demo: OrgAdmin → Tests → Questions in Test → Custom/Auto/Hybrid; notification bell; subscription plan page; briefly mention RAG/adaptive roadmap |
| .md workflow | `Related_Documents/` folder listing; `to_be_implemented.md` backlog |
| Reflection | Speak to camera — no screen needed |

---

## Checklist before you record

- [ ] App or backend is running so you can show the UI or network tab live.
- [ ] You can open and scroll: `Database_Schema.md`, `Main_Implementation.md`, `mcqs_binding.md`, `to_be_implemented.md`.
- [ ] You have a test with Custom/Auto/Hybrid binding you can demo.
- [ ] You have a Supabase table view ready (SubscriptionPlans or TestQuestions).
- [ ] You can briefly show the ChatGPT ProPath project to demonstrate the two-AI-tool workflow.
- [ ] You covered: **problem → AI usage (ChatGPT design + Cursor implementation) → validation → outcome** in that order.
- [ ] You gave at least **one specific AI prompt**, **one suggestion you rejected**, and **one thing the AI got wrong or needed correcting**.
- [ ] You mentioned **manual validation** across API, DB, UI, and auth — including the three-step dual-role subscription gate check.
- [ ] You stated **before vs after** with specifics — not just "it works now."
- [ ] You explained the **.md-first workflow**: ChatGPT for design → update .md → verify DB → Cursor implements → sub-feature table tracks progress.
- [ ] You mentioned the **future AI modules**: RAG question generation, adaptive learning, per-question AI explanation.
- [ ] You included **reflection** with concrete improvements, not vague ones.
- [ ] Total length is **15–20 minutes** — don't rush the problem or AI usage sections, those are what show depth.
