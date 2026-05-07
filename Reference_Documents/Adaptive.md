# Adaptive Learning Control System (Sprint Blueprint)

## 1) Purpose

This document defines a controlled and dynamic adaptive learning system for ProPath where:

- SuperAdmin controls platform-level strategy, guardrails, and defaults.
- OrgAdmin controls organization-level behavior within platform guardrails.
- Adaptive logic works for both student types:
  - Organization student (`Students.OrgID` set)
  - Individual/platform student (`Students.OrgID` null)
- Test creation supports different test natures (fixed/custom, auto, hybrid, adaptive).
- Adaptive attempts are treated as an independent feature track from scheduled exam attempts.

This is a planning and architecture document for a full sprint, aligned with the current data model and route behavior.

## 1.1 Review highlights (what stays strong)

- **Governance:** The three-tier control hierarchy (SuperAdmin → OrgAdmin → test-level) with explicit precedence is the right model for multi-tenant SaaS; it avoids permission and policy sprawl later.
- **Separate tracks:** Treating adaptive and scheduled attempts as fully separate flows prevents subtle production bugs from mixed semantics.
- **Measurement:** The three-dimension framework (accuracy, difficulty handling, pace) is grounded in data the product already captures, before committing to IRT or heavy ML.

## 1.2 Design-time pushback (addressed in this document)

- **ConfigJSON everywhere:** Flexible but risky (schema drift, silent misconfigs). Mitigation: versioned JSON Schema (or Zod) per config type from day one, plus `SchemaVersion` on every JSON-heavy row (see §6 and §7.4).
- **Analytics at scale:** Materialized or derived analytics rebuilt only on finalize can bottleneck at volume. Mitigation: async job queue, incremental updates, or batch rebuild (see §6.3 / `StudentAttemptAnalytics`).
- **Sprint 2 scope:** Runtime + mastery + logging + multi-module in one sprint is heavy for small teams. Mitigation: split into Sprint 2a and 2b (see §13).
- **Cold start:** Mentioned as a risk but must be **specified** before first adaptive ship. Mitigation: concrete default policy in §3.2.

## 1.3 SaaS-first scope

Adaptive is a subscription product capability, not just a test setting.
The system must support packaging, entitlement, and limits by subscription plan for both:

- Organization subscriptions (`EntityType = Organization`)
- Individual student subscriptions (`EntityType = Student`)

---

## 2) Current System Understanding (Baseline)

## 2.1 Existing strengths

- Academic hierarchy is already strong: `Exam -> Subject -> Chapter -> Topic -> Question`.
- Question metadata for adaptation exists partially:
  - `Questions.DifficultyLevel` (`Easy`, `Medium`, `Hard`)
  - `TimesUsed`, `TimesCorrect`, `TimesIncorrect` (global quality/performance signals)
- Student outcome data exists:
  - `StudentAttempts`
  - `StudentAnswers` (`IsCorrect`)
  - `ResultDetails` (subject/topic result summary)
- Access and business controls exist:
  - Subscription limits (`SubscriptionPlanExams`, `UsageCounters`)
  - Assignment controls (`TestAssignments`)
  - Comprehensive audit (`Logs`)

## 2.2 Existing gaps for adaptive system

- No persistent rule configuration for adaptive behavior (platform or organization scope).
- No per-student mastery profile table.
- No adaptive session state/history (why question was selected, sequence, estimator progression).
- Test binding mode (`custom/auto/hybrid`) is currently in-memory in routes, not database persistent.
- No formal policy precedence model (global -> organization -> test override).

---

## 3) Adaptive Measurement Framework (3 Assessment Dimensions)

For MCQ-driven adaptation, use these three dimensions:

1. Accuracy
- Source: `StudentAnswers.IsCorrect`, score outcomes.
- Meaning: conceptual correctness and retention.

2. Difficulty Handling
- Source: `Questions.DifficultyLevel` combined with student correctness.
- Meaning: whether student can sustain performance at medium/hard levels.

3. Pace/Consistency
- Source: attempt and response timing (`StudentAttempts.StartTime/EndTime`, plus per-question timing once added).
- Meaning: speed-quality balance and stability across sessions.

The adaptive engine should calculate a weighted mastery/proficiency score from these three dimensions at topic level (and optionally chapter/subject rollups).

## 3.1 Dynamic syllabus granularity (Chapter optional, Topic mandatory)

Because some exams have chapter structure and some do not, adaptive targeting must be dynamic:

- Always treat `Topic` as the minimum unit for adaptation.
- Use `Chapter` only when chapter mapping exists for that exam/subject.
- Support three adaptive targeting modes:
  1. `TopicOnly`
  2. `ChapterAndTopic`
  3. `ChapterOnly` (for remediation blocks)

Practical rule:
- If a subject has no chapters configured, engine auto-falls back to `TopicOnly`.
- If chapters exist, policy can choose chapter-aware targeting.

This avoids rigid dependencies and keeps adaptive behavior usable for both chapter-based and non-chapter exams.

## 3.2 Cold-start policy (concrete — decide before Sprint 2)

Students with **no mastery history** must not leave the selector in an undefined state. Default approach (tunable by SuperAdmin, bounded for OrgAdmin):

1. **Calibration phase (first N questions, e.g. N = 10):**
   - Fixed difficulty mix: **40% Easy, 40% Medium, 20% Hard** (or platform default from guardrails).
   - Topics/chapters sampled with **uniform or syllabus-weighted** distribution within the selected module scope (single subject, bundle, or blueprint).
2. **Handoff:** After N questions (or sooner if minimum signal thresholds are met), switch to full adaptive selection using the policy resolver.
3. **Logging:** Every selection in this phase uses `SelectionReason = ColdStart` or `Calibration` (enum — see §6.1) so analytics and explainability stay clean.

Org/product may optionally expose a short **“diagnostic”** step-up UI (see §11.3.1) so students understand the first block is for calibration, not graded stakes.

## 3.3 Question pool exhaustion

When the eligible pool for a weak topic/chapter is **empty or fully exhausted** (all questions recently seen, or none exist):

- **Prefer:** Resurface questions with a flag `RepeatExposure = true` in `AdaptiveQuestionEvents` / session meta, after caps and spacing rules.
- **If still blocked:** End session gracefully with `CompletionReason = ContentExhausted` (or equivalent) and surface **“Content coming soon”** / contact admin — never hang or loop silently.
- **Product:** Track exhaustion rate per topic; alerts for content gaps.

---

## 4) Governance Model (Controlled + Dynamic)

## 4.1 Control levels

- Level 1: SuperAdmin (platform strategy owner)
  - Defines global defaults, algorithm policy, hard boundaries, compliance, and allowed feature flags.
- Level 2: OrgAdmin (organization optimizer)
  - Tunes selected parameters inside allowed ranges for their org.
- Level 3: Test-level config (per exam/test behavior)
  - Optional scoped override, only when allowed by level 1 and level 2.

## 4.2 Precedence rules

1. Hard platform guardrails (cannot be overridden)
2. Organization-level policy (within guardrails)
3. Test-level override (if enabled)
4. Runtime fallback to nearest parent default

## 4.3 Policy examples

- SuperAdmin sets:
  - Minimum and maximum question difficulty jump per step
  - Max retries per concept
  - Allowed adaptive models (`rule_based`, `bandit`, future `irt`)
- OrgAdmin sets:
  - Org-specific mastery threshold (e.g., 0.70 or 0.80)
  - Topic focus intensity
  - Remediation frequency
- Test-level sets:
  - Adaptive mode ON/OFF for that test
  - Stopping criteria profile
  - Question distribution constraints for this test

---

## 5) Roles and Responsibilities

## 5.1 SuperAdmin responsibilities

- Define global adaptive policy templates.
- Define immutable compliance guardrails.
- Enable/disable features by tenant type and subscription plan.
- Monitor cross-org quality and fairness metrics.
- Approve algorithm version rollout and rollback.
- Manage global taxonomy health (exam/subject/chapter/topic standards).

## 5.2 OrgAdmin responsibilities

- Select policy template for their organization.
- Configure org-level dynamic rules (within allowed ranges).
- Configure adaptive behavior per exam or test type.
- Monitor cohort-level performance and intervention outcomes.
- Maintain organization question pool quality and review workflows.

## 5.3 Student-facing behavior

- Students do not control algorithm rules.
- Students receive adaptive paths based on:
  - assigned tests (org students)
  - subscribed/available tests (individual students)
- Same engine, different policy scope source.

---

## 6) Proposed Database Changes

These changes keep current schema intact and add adaptive control layers.

## 6.1 New enums (recommended)

- `adaptive_scope_enum`: `Platform`, `Organization`, `Test`
- `adaptive_mode_enum`: `Off`, `Guided`, `Adaptive`
- `adaptive_algorithm_enum`: `RuleBased`, `Bandit`, `IRT` (future-ready)
- `adaptive_session_status_enum`: `InProgress`, `Completed`, `Abandoned`, `TimedOut`
- `adaptive_selection_reason_enum` (for `AdaptiveQuestionEvents.SelectionReason` — **not free text**):
  - `ColdStart`, `Calibration`, `WeakTopic`, `DifficultyRamp`, `BalanceConstraint`, `Remediation`, `RandomExplore`, `PoolExhaustionFallback`, `TimeoutFallback`, `CachedFallback`

## 6.2 New tables

### A) `AdaptivePolicyConfigs`

Purpose: persistent policy configuration at platform/org/test scope.

Key columns:
- `PolicyID` (PK)
- `ScopeType` (`Platform`/`Organization`/`Test`)
- `ScopeID` (nullable for platform; OrgID or TestID for scoped rows)
- `PolicyName`
- `AdaptiveMode`
- `Algorithm`
- `ConfigJSON` (all tunable parameters)
- `SchemaVersion` (integer or semver string; must match validated contract — see §7.4)
- `IsActive`
- `Version`
- `CreatedBy`, `UpdatedBy`, timestamps

Important indexes:
- (`ScopeType`, `ScopeID`, `IsActive`)
- (`PolicyName`, `Version`)

### A2) `AdaptiveModulesCatalog`

Purpose: defines sellable adaptive module types and delivery templates.

Key columns:
- `AdaptiveModuleID` (PK)
- `ModuleName`
- `ModuleType` (`SingleSubject`, `CustomExamBundle`, `FullExamBlueprint`)
- `DefaultConfigJSON`
- `DefaultConfigSchemaVersion`
- `Status` (`Active`, `Inactive`)
- `CreatedAt`, `UpdatedAt`

### A3) `SubscriptionPlanAdaptiveModules`

Purpose: maps subscription plans to allowed adaptive modules and limits.

Key columns:
- `PlanID` FK
- `AdaptiveModuleID` FK
- `IsEnabled` boolean
- `MaxSessionsPerMonth` nullable
- `MaxQuestionsPerSession` nullable
- `ExtraConfig` jsonb
- `ExtraConfigSchemaVersion` (nullable; if `ExtraConfig` used)

Constraint:
- Unique (`PlanID`, `AdaptiveModuleID`)

### B) `StudentTopicMastery`

Purpose: persistent mastery profile for each student-topic pair.

Key columns:
- `StudentID` FK
- `TopicID` FK
- `MasteryScore` (numeric, e.g. 0.000 to 1.000)
- `ConfidenceScore` (optional)
- `AttemptsCount`
- `CorrectCount`
- `AvgResponseSeconds`
- `LastPracticedAt`
- `UpdatedAt`
- **Decay:** `MasteryScoreEffective` (optional computed column or app-maintained) and/or `LastDecayAppliedAt`, `DecayFactor` (0–1) so stale mastery does not drive bad decisions; decay policy is part of `ConfigJSON` guardrails.

Constraint:
- Unique (`StudentID`, `TopicID`)

### B2) `StudentChapterMastery` (optional but recommended)

Purpose: chapter-level rollup when chapter taxonomy exists.

Key columns:
- `StudentID` FK
- `ChapterID` FK
- `MasteryScore`
- `AttemptsCount`
- `CorrectCount`
- `AvgResponseSeconds`
- `UpdatedAt`

Constraint:
- Unique (`StudentID`, `ChapterID`)

Note:
- This table is optional; if omitted, chapter mastery can be computed from `StudentTopicMastery` + topic-chapter mapping.

### C) `AdaptiveSessions`

Purpose: adaptive runtime context per active attempt.

Key columns:
- `AdaptiveSessionID` (PK)
- `AttemptID` FK to `StudentAttempts`
- `StudentID`, `TestID`, `OrgID` (nullable for individual)
- `PolicyID` FK
- `Status`
- `InitialEstimate`, `CurrentEstimate`
- `StartedAt`, `EndedAt`
- `SessionMetaJSON` (estimator state, stopping reason, diagnostics)
- `SchemaVersion` (for `SessionMetaJSON` shape)

### D) `AdaptiveQuestionEvents`

Purpose: question selection and outcome trace for explainability/audit.

Key columns:
- `EventID` (PK)
- `AdaptiveSessionID` FK
- `QuestionID` FK
- `SequenceNo`
- `SelectionReason` **`adaptive_selection_reason_enum`** (analytics and explainability depend on a fixed vocabulary; optional `SelectionDetail` text for debug only)
- `DifficultyAtSelection`
- `ResponseSeconds`
- `IsCorrect`
- `EstimateBefore`, `EstimateAfter`
- `CreatedAt`

Indexes:
- (`AdaptiveSessionID`, `SequenceNo`)
- (`QuestionID`)

### E) `QuestionAdaptiveStats` (optional but valuable)

Purpose: stable/calibrated question quality metrics for adaptive selection.

Key columns:
- `QuestionID` PK/FK
- `ExposureCount`
- `RecentCorrectRate`
- `DiscriminationProxy`
- `CalibratedDifficulty` (optional numeric scale)
- `UpdatedAt`

## 6.3 Existing table extensions

### `Tests`

Add:
- `DeliveryMode` (`Fixed`, `Auto`, `Hybrid`, `Adaptive`)
- `AdaptivePolicyID` nullable FK
- `AdaptiveEnabled` boolean default false
- `AdaptiveConfigJSON` nullable (lightweight per-test override)
- `AdaptiveTrack` text default `PracticeAdaptive` (for future tracks such as `RemediationAdaptive`)
- `IsScheduled` boolean default false
- `ScheduleGroupID` nullable (only for scheduled/non-adaptive flow if needed)
- `AdaptiveModuleType` nullable (`SingleSubject`, `CustomExamBundle`, `FullExamBlueprint`)
- `AdaptiveBlueprintJSON` nullable (stores subject split, question targets, and exam-bundle map)
- `AdaptiveConfigSchemaVersion` / `AdaptiveBlueprintSchemaVersion` (nullable but required when JSON populated)

### `StudentAttempts`

Add:
- `AdaptiveSessionID` nullable FK
- `AttemptStatus` text/enum
- `TotalResponseSeconds` nullable
- `AdaptiveSummaryJSON` nullable
- `AdaptiveSummarySchemaVersion` nullable (pairs with `AdaptiveSummaryJSON`)
- `AttemptTrack` text default `Standard` (`Standard` or `Adaptive`)
- `CompletionReason` nullable (`ConfidenceReached`, `QuestionCapReached`, `TimeCapReached`, `ManualSubmit`, `SystemSubmit`)
- `StartedFrom` nullable (`Web`, `Mobile`, `Tablet`)
- `DeviceMetaJSON` nullable (OS/browser/app version)
- `BehavioralSignalsJSON` nullable (rapid-guessing flags, idle bursts, revisit count)

### `StudentAnswers`

Add:
- `ResponseSeconds` nullable
- `SelectedAt` timestamptz nullable
- `ChangedAnswerCount` int default 0
- `ConfidenceLevel` nullable (if UI captures confidence)
- `AnswerSource` nullable (`FirstPass`, `ReviewPass`, `AutoSubmit`)

### `ResultDetails` (deepen for decision quality)

Add:
- `ChapterID` nullable FK
- `DifficultyBand` nullable (`Easy`, `Medium`, `Hard`)
- `AttemptTrack` nullable (`Standard`, `Adaptive`)
- `MasteryDelta` nullable (before/after change snapshot for this scope)
- `DecisionTags` jsonb nullable (e.g., `["weak-topic","needs-remediation"]`)

### F) `StudentAttemptAnalytics` (derived table/materialized view)

Purpose: fast decision support for admin dashboards and adaptive tuning.

Suggested fields:
- `AttemptID`, `StudentID`, `TestID`, `OrgID`, `AttemptTrack`
- `AccuracyPercent`, `AvgResponseSeconds`, `ConsistencyScore`
- `EasyAccuracy`, `MediumAccuracy`, `HardAccuracy`
- `TopicCoverageCount`, `ChapterCoverageCount`
- `WeakTopicCount`, `StrongTopicCount`
- `StoppedByRule`, `RecommendedNextModule`
- `ComputedAt`

Recommended refresh strategy:
- **Low volume:** recompute on finalize synchronously.
- **Scale:** enqueue async job on finalize; use incremental rollups or partial updates; optional nightly full rebuild for drift checks.
- **Never** block the student-facing `finalize` response on heavy analytics if latency SLA is at risk — return core result inline (see §10.6) and fill analytics asynchronously.

## 6.4 Recommended SQL migration sequence

1. Create enums
2. Create new adaptive tables
3. Add nullable columns to existing tables
4. Backfill defaults (`DeliveryMode = 'Fixed'`, `AdaptiveEnabled = false`)
5. Add indexes
6. Add data integrity checks
7. Deploy read paths first, then write paths

---

## 7) Business Rules Engine Design

All adaptive behavior should be parameterized through `ConfigJSON`, but **never without** formal contracts and versioning (§7.4).

## 7.1 Core config contract (example)

```json
{
  "masteryThreshold": 0.75,
  "minQuestions": 15,
  "maxQuestions": 40,
  "moduleType": "SingleSubject",
  "subjectSelectionMode": "single",
  "allowCrossExamTopics": false,
  "targetDifficultyMix": {"Easy": 20, "Medium": 50, "Hard": 30},
  "difficultyStepLimit": 1,
  "weakTopicBoost": 1.4,
  "strongTopicCooldown": 0.7,
  "maxConsecutiveWrong": 3,
  "stopConditions": {
    "confidenceReached": true,
    "maxQuestionsReached": true,
    "timeBudgetMinutes": 45
  }
}
```

Module-specific extension examples:
- `SingleSubject`: one subject focus with topic/chapter targeting.
- `CustomExamBundle`: selected 1..N exams with custom weights per exam/subject.
- `FullExamBlueprint`: complete exam pattern (example: MDCAT 200 MCQs across 4 subjects with configured distribution).

## 7.2 Rule sources

- Hard guardrails from SuperAdmin (non-overridable)
- Tunables from OrgAdmin (bounded by guardrails)
- Per-test optional overrides (if feature enabled)

## 7.3 Rule evaluation points

- Test creation time validation
- Attempt start policy resolution
- Every question selection step
- Attempt submit/finalize

## 7.4 Formal config contracts (mandatory)

Every `ConfigJSON` / blueprint / `SessionMetaJSON` / `AdaptiveSummaryJSON` shape must have:

- A **named contract** per type: e.g. `AdaptivePolicyConfigV1`, `FullExamBlueprintV1`, `AdaptiveSessionMetaV1`.
- A **JSON Schema** document in-repo (or equivalent **Zod** schemas in code) validated at:
  - API write time (admin/org save)
  - policy activation
  - attempt start (defensive)
- **`SchemaVersion`** column on each persisted JSON blob (see §6); migrations upgrade old rows when shapes change.

This prevents two orgs from storing incompatible structures and silently breaking the policy resolver.

## 7.5 Policy resolver as a pure, stateless service

The resolver that merges guardrails + org policy + test overrides should be:

- **Pure:** `(context) => ResolvedPolicy` with no hidden DB reads inside — pass in all IDs and preloaded rows as arguments.
- **Unit-testable:** large fixture suite for precedence edge cases.
- **Cacheable:** key by `(tenant, plan, policy ids, test id)` with TTL.

The adaptive **selector** (pick next question) may call DB for pools; the **resolver** should remain deterministic given inputs.

---

## 8) Test Creation Analysis and Adaptive-Compatible Modes

## 8.1 Supported test natures

1. Fixed/Custom test
- Questions explicitly linked in `TestQuestions`.
- Best for formal/internal controlled exams.

2. Auto-generated test
- System pulls from eligible question pool based on exam/subject/topic filters and constraints.
- Best for practice and scale.

3. Hybrid test
- Mix of fixed and auto-selected portions.
- Best for balancing syllabus coverage with personalization.

4. Adaptive test (new, separate flow)
- Next question chosen at runtime based on student state.
- Best for diagnostics, personalized practice, and rapid leveling.
- Not treated as a standard scheduled test attempt.

## 8.1.1 Adaptive module types (new)

1. `SingleSubject` Adaptive
- Student practices only one selected subject.
- Best for remediation and focused mastery jumps.

2. `CustomExamBundle` Adaptive
- Admin or student selects a custom combination of exams (e.g., 1 or 2 exams).
- Engine merges allowed topics by exam constraints and configured weights.

3. `FullExamBlueprint` Adaptive
- Adaptive session follows a full exam pattern blueprint.
- Example: MDCAT-like 200 MCQs across 4 subjects with configurable split.
- Keeps adaptive sequencing while respecting total question target and subject proportions.

## 8.2 Creation-time validations (must-have)

- Subscription constraints (`MaxQuestionsPerTest`, `MaxTests`, `MaxTestsPerDay`)
- Content scope validation (`Exam -> Subject -> Topic` consistency; chapter optional)
- Difficulty availability checks (avoid empty hard/medium pool)
- Assignment model compatibility (single/group/all)
- Adaptive policy presence if `DeliveryMode = Adaptive`
- Chapter/topic mode compatibility:
  - If policy requires chapter-aware adaptation, verify chapter mapping exists.
  - Otherwise enforce fallback to topic-only mode.
- Module-type validation:
  - `SingleSubject` requires exactly one subject.
  - `CustomExamBundle` requires at least one exam and per-exam weight map.
  - `FullExamBlueprint` requires total MCQ target and valid subject distribution sum.

## 8.3 Runtime behavior by mode

- Fixed: deterministic list from `TestQuestions`.
- Auto/Hybrid: selected once per attempt and persisted.
- Adaptive: selected iteratively; every decision logged in `AdaptiveQuestionEvents`.

## 8.4 Clear separation: Scheduled vs Adaptive attempts

Scheduled and adaptive attempts must be handled as two distinct tracks:

1. Scheduled Attempt Track (`AttemptTrack = Standard`)
- Works with time window (`StartTime`, `EndTime`) and assignment lifecycle.
- Uses existing constraints and status flow for scheduled exams.
- Suitable for formal mock/final tests.

2. Adaptive Attempt Track (`AttemptTrack = Adaptive`)
- Session-driven runtime with iterative question selection.
- Not dependent on scheduled exam window semantics.
- Uses adaptive stopping criteria (confidence, max questions, time budget).
- Suitable for practice, diagnosis, and remediation journeys.

Design rule:
- A test cannot execute both tracks in the same attempt session.
- If `DeliveryMode = Adaptive`, start adaptive track endpoints only.

---

## 9) Platform vs Organization Delivery Model

## 9.1 Platform-level students (individual)

- Policy source:
  - SuperAdmin platform default
  - Optional segment policy (future)
- No OrgAdmin scope
- Subscription entity type is `Student`

## 9.2 Organization-level students

- Policy source precedence:
  - Platform guardrails
  - Org policy
  - Test override (optional)
- Subscription entity type is `Organization`
- Works with assignment pipeline (`TestAssignments`)

## 9.3 Common engine, different policy resolution

Adaptive engine remains single; only policy resolver differs by student context.

## 9.4 Subscription entitlement resolution (SaaS control)

Before adaptive session start:
- Resolve active subscription and plan.
- Verify plan has adaptive entitlement (`SubscriptionPlanAdaptiveModules`).
- Verify selected module type is enabled for that plan.
- Enforce module/session limits (monthly/session caps).
- Reject start with explicit upgrade-required error when entitlement is missing.

---

## 10) APIs and Service Layer Plan

**Versioning:** Prefix adaptive routes with **`/api/v1/adaptive/...`** and **`/api/v1/student/...`** (or equivalent global API version) from day one so v1 and v2 can run in parallel when the algorithm changes.

## 10.1 SuperAdmin APIs (new)

- `GET/PUT /api/v1/admin/adaptive/global-policy`
- `POST /api/v1/admin/adaptive/policies` (versioned templates)
- `GET /api/v1/admin/adaptive/policies`
- `POST /api/v1/admin/adaptive/policies/:id/activate`
- `POST /api/v1/admin/adaptive/modules` (catalog create/update)
- `GET /api/v1/admin/adaptive/modules`
- `PUT /api/v1/admin/subscription-plans/:planId/adaptive-modules`

## 10.2 OrgAdmin APIs (new)

- `GET/PUT /api/v1/org/adaptive/policy`
- `GET /api/v1/org/adaptive/policy/effective` (resolved policy with inherited values)
- `POST /api/v1/org/adaptive/policy/resolve-preview` (or `/simulate`) — **dry-run:** “what resolved policy applies to student X + test Y (and optional module)?” before go-live; reduces support tickets.
- `PUT /api/v1/org/tests/:testId/adaptive-config`
- `GET /api/v1/org/adaptive/modules/eligible` (based on org subscription)
- `POST /api/v1/org/adaptive/sessions/blueprint/validate` (pre-flight validation)

## 10.3 Student APIs (new/extended)

- `POST /api/v1/student/tests/:testId/adaptive/attempts/start`
  - resolve effective policy
  - initialize `AdaptiveSessions` if adaptive test
- `POST /api/v1/student/tests/:testId/adaptive/attempts/:attemptId/next-question`
  - adaptive selection and event logging
  - **SLA contract:** respond within **P95 ≤ X ms** (define X per environment); on timeout return **503 + retryable** or a **fallback question** with `SelectionReason = TimeoutFallback` or `CachedFallback` (never hang the client).
- `POST /api/v1/student/tests/:testId/adaptive/attempts/:attemptId/submit-answer`
  - update session estimator and event
- `POST /api/v1/student/tests/:testId/adaptive/attempts/:attemptId/finalize`
  - finalize attempt, update mastery profile
  - **Rich response (required):** return `masteryDeltas`, `stoppingReason`, `recommendedNextModule`, `summary`, `weakAreas` inline so the result screen loads without a mandatory second round-trip (optional `GET .../insights` for heavier detail).
- `GET /api/v1/student/attempts/:attemptId/insights`
  - return deep attempt analytics, weak/strong map, and next recommendations
- `GET /api/v1/student/adaptive/profile`
  - return current mastery state by subject/chapter/topic and learning trajectory

## 10.4 Scheduled flow APIs remain separate

- Keep existing/standard scheduled attempt endpoints for non-adaptive tests.
- Adaptive endpoints should validate `DeliveryMode = Adaptive` before execution.
- Scheduled endpoints should reject adaptive tests to avoid mixed semantics.

## 10.5 Non-adaptive compatibility

All existing fixed/custom flows remain functional when adaptive mode is off.

---

## 11) UI Flow Blueprint (Role-wise)

## 11.1 SuperAdmin UI flow

1. Adaptive Control Center
- Global toggle: enable adaptive by tenant type (organization/student).
- Guardrails panel: min/max bounds for org-level tunables.
- Algorithm registry: active model/version and rollout scope.
- Adaptive SaaS packaging:
  - define module catalog (`SingleSubject`, `CustomExamBundle`, `FullExamBlueprint`)
  - attach module entitlements to subscription plans
  - set plan-level limits (sessions/month, max questions/session)

2. Policy Templates
- Create and version policy templates.
- Mark template as default for:
  - Platform individual students
  - Organization baseline
- Preview resolved policy before activation.

3. Governance and Monitoring
- Violations dashboard (attempted out-of-range org overrides).
- Cross-org analytics:
  - learning impact
  - fairness signals
  - question exposure distribution

## 11.2 OrgAdmin UI flow

1. Organization Adaptive Settings
- Select inherited template.
- Tune allowed values (thresholds, difficulty mix, remediation cadence).
- Save as org policy version.

2. Test Creation (dynamic chapter/topic aware)
- Select delivery mode: `Fixed | Auto | Hybrid | Adaptive`.
- If adaptive selected:
  - choose module type: `SingleSubject | CustomExamBundle | FullExamBlueprint`
  - choose targeting mode: `TopicOnly` or `ChapterAndTopic`
  - system validates chapter availability; fallback warning shown if needed
  - choose policy source: org default or test override
  - if `CustomExamBundle`: select 1..N exams and define weights
  - if `FullExamBlueprint`: select exam pattern (example MDCAT 200) and subject distribution

3. Operational Monitoring
- Cohort mastery board by subject/chapter/topic.
- Adaptive funnel:
  - started
  - completed
  - stopped by confidence/time/question cap

## 11.3 Student UI flow (separate tracks)

A) Scheduled tests tab
- Shows assigned/scheduled standard tests.
- Standard start/resume/submit journey.

B) Adaptive practice (distinct product surface — not “just a tab”)
- **Branding:** Dedicated layout, color, and copy distinct from scheduled exams — communicate *practice / growth / low stakes* vs *assessment*.
- Shows adaptive-enabled learning paths.
- Shows only subscription-entitled module cards:
  - Single Subject
  - Custom Exam Bundle
  - Full Exam Blueprint
- Student starts adaptive session (not scheduled exam flow).
- **Cold-start / calibration:** First session (or first N questions) should have explicit copy: e.g. “We’re calibrating to your level” so the experience is not confused with a scored exam.
- During the attempt, show **topic/chapter focus** and **progress through the session** (questions answered, time).
- **Confidence / “mastery meter”:** Prefer showing **after the session** on the results screen, not as a live meter during the attempt — reduces anxiety and gaming (slowing down to manipulate the meter). If any live signal is shown, use neutral wording (e.g. “Building your profile…”) not a numeric confidence score.
- For full blueprint mode also show:
  - total target MCQs
  - subject-wise progress bar (e.g., Bio/Chem/Physics/English)
- Session ends on adaptive stopping criteria.
- Result screen shows:
  - strengths
  - weak topics/chapters
  - recommended next path
  - confidence and pace insights (post-session)
  - difficulty-wise accuracy split
  - compare with previous sessions — **with explicit empty states:**
    - After session 1: “This is your baseline — comparisons will appear after your next practice.”
    - After session 2: “Compared to your last session: …”
    - After 3+: show trend as designed

## 11.4 UX safeguards

- Never mix scheduled and adaptive attempts in one UI screen action.
- Badge every test card with explicit type (`Scheduled`, `Adaptive Practice`).
- In attempt screen header, always show active track and rule source.
- Keep a dedicated "Attempt Insights" screen for deep analytics (not mixed with simple score page).

---

## 12) Audit, Explainability, and Compliance

## 12.1 Auditability

- Every policy create/update/activate action logged in `Logs`.
- Every adaptive question decision logged in `AdaptiveQuestionEvents`.
- Include actor metadata (`ActorType`, `ActorID`, `IPAddress`, `UserAgent`) where applicable.

## 12.2 Explainability

At attempt review, system should be able to explain:
- why this question was selected
- what skill/topic was targeted
- how student estimate changed after the response

## 12.3 Fairness and safeguards

- Enforce exposure caps to avoid repetitive overuse of same question.
- Enforce minimum syllabus breadth for high-stakes tests.
- Keep adaptive optional for formal final exams if policy requires.

---

## 13) Sprint-Wise Implementation Plan

## Sprint 1 - Foundation and Persistence

- Add DB schema for policies, sessions, events, mastery.
- Add dynamic chapter/topic targeting support in policy config.
- Add adaptive SaaS catalog and plan-module entitlement mapping tables.
- Persist test `DeliveryMode` and adaptive flags.
- Add policy resolver service (platform/org/test precedence) — **pure, stateless, unit-tested** (§7.5).
- Add formal **JSON Schema / Zod** contracts and `SchemaVersion` columns (§7.4).
- Add admin/org policy CRUD APIs (versioned paths — §10).
- **QA swim lane (starts Sprint 1):** test cases for policy precedence, schema validation rejections, and resolver fixtures; define who owns regression of adaptive vs scheduled routes.

Deliverable:
- Configuration-ready system with no adaptive runtime yet.

## Sprint 2a - Adaptive Runtime (narrow MVP)

- **`SingleSubject` only** — start / next-question / submit-answer / finalize (versioned APIs §10).
- Cold-start policy (§3.2) implemented end-to-end.
- Rule-based selector + basic `AdaptiveQuestionEvents` with **enum** `SelectionReason`.
- Mastery update on finalize (and/or per-answer per policy).
- Strict separation from scheduled attempt endpoints.
- `finalize` returns **rich payload** (mastery deltas, stopping reason, recommendation — §10.3).

Deliverable:
- One adaptive module type working end-to-end for pilot cohorts.

## Sprint 2b - Multi-module + hardening

- `CustomExamBundle` and `FullExamBlueprint` module types.
- Multi-subject tracking and blueprint validation.
- Pool exhaustion behavior (§3.3).
- Next-question **timeout/fallback** contract tested under load.
- Optional: async pipeline for `StudentAttemptAnalytics` if volume warrants.

Deliverable:
- Full module catalog operational; ready for broader rollout.

## Sprint 3 - Controls, Analytics, Shadow mode

- SuperAdmin dashboards: policy adoption, model effectiveness, fairness.
- OrgAdmin dashboards: weak topics, cohort mastery, intervention success.
- Add policy versioning with safe rollout/canary by org/exam.
- Add UI for adaptive module, dynamic topic/chapter controls, **branded** adaptive surface (§11.3).
- **Shadow mode milestone:** run adaptive selector in parallel with fixed tests — log what adaptive *would* have chosen vs what was served — **without** affecting student-facing scoring until validated.

Deliverable:
- Fully controlled, observable, business-ready adaptive platform with low-risk algorithm validation.

## Sprint 4 - Hardening and Scale

- Performance tuning (indexes, batching, cache layer for policy resolution).
- Anti-cheat and anomaly detection extensions.
- Optional calibrated difficulty model (`IRT` entry mode).
- Add adaptive content quality QA workflows (taxonomy drift checks).
- **QA:** full regression suite for adaptive flows, shadow-mode comparison metrics, and load tests for `next-question` SLA.

Deliverable:
- Production hardening with long-term scaling path.

---

## 14) Success Metrics (KPIs)

- Learning impact:
  - mastery gain per student per week
  - weak-topic recovery rate
  - weak-chapter recovery rate (where chapters exist)
- Product effectiveness:
  - completion rate
  - drop-off rate by test type
  - median time-to-mastery
  - adaptive decision precision (recommended next module accepted/completed)
  - session-to-session improvement slope
- SaaS effectiveness:
  - adaptive module activation rate per plan
  - conversion to higher plans for full blueprint access
  - entitlement rejection rate (upgrade prompts)
- Business/admin control:
  - policy override usage
  - policy violation count (blocked by guardrails)
  - org-level adoption rate
  - decision latency (time from attempt finalize to actionable insight availability)

---

## 15) Risks and Mitigations

- Risk: low-quality question tagging (topic/chapter mismatch)
  - Mitigation: validation tools and reviewer workflows before adaptive usage.
- Risk: mixed attempts (scheduled flow accidentally calling adaptive endpoints)
  - Mitigation: strict route guards and UI-level mode segregation.
- Risk: overfitting to easy questions
  - Mitigation: enforce target difficulty mix and breadth constraints.
- Risk: high variance in small data students
  - Mitigation: **concrete** cold-start policy (§3.2) + confidence-aware stopping; not vague “defaults.”
- Risk: policy complexity for admins
  - Mitigation: template-based configuration and safe presets.
- Risk: **unversioned JSON blobs** (`ConfigJSON`, blueprints, session meta)
  - Mitigation: JSON Schema/Zod per type, `SchemaVersion`, validate on write, migration playbook when shapes change (§7.4).
- Risk: **stale mastery** driving wrong next steps
  - Mitigation: decay fields or time-weighted effective mastery (§6.2 `StudentTopicMastery`).
- Risk: **analytics layer** becomes a throughput bottleneck
  - Mitigation: async recompute, incremental aggregates, never block `finalize` on heavy analytics (§6.3).
- Risk: **free-text** selection reasons in events
  - Mitigation: enum `SelectionReason` + optional debug text only (§6.1, §6.2).

---

## 16) Final Recommendation

Build adaptive as a policy-driven control plane, not as hardcoded route logic.
This allows:

- centralized governance by SuperAdmin,
- bounded flexibility for OrgAdmin,
- consistent behavior for both student types,
- and long-term extensibility from simple rule-based adaptation to advanced models.

This document should be used as the sprint reference for product, backend, frontend, and QA alignment.

External review feedback (governance strength, separate tracks, pragmatic measurement, JSON/schema risks, sprint weight, cold-start gap) is incorporated above — see §1.1–§1.2, §3.2–§3.3, §6–§7.4–§7.5, §10–§11, §13–§15.

