# SuperAdmin Settings – Feature Plan (ProPath)

## 1. High-Level Goals

SuperAdmin `Settings` ka main purpose:

- **Platform behavior control** (maintenance, feature toggles, limits) – bina code deploy kiye.
- **Per-audience configuration** (Organizations vs Individual Students).
- **Safety & transparency** (banners, notifications, audit).
- **Future AI modules ke liye hooks** (RAG, adaptive learning, explanations).

Settings UI ko logically sections mein split karna better rahega.

---

## 1.1 Implementation Tracking Table

Is table se hum track karenge ke kaun sa feature implement ho chuka hai, aur uske liye DB changes required / done hain ya nahi.  
`Status` aur `DB Changes` columns manual update ke liye hain jab implementation aage bade.

| # | Feature / Setting Area | Short Description | Status (Not Started / In Progress / Done) | DB Changes Required? (Yes/No + summary) |
|---|------------------------|-------------------|--------------------------------------------|------------------------------------------|
| 1 | Maintenance Mode | Global maintenance toggle + scope | Not Started | Yes – central `Settings`/`Config` table or JSON config store |
| 2 | Global Announcement Banner | Dismissible banner for roles / time window | Not Started | Maybe – can be in `Settings` or separate `Announcements` table |
| 3 | Global MCQ Toggles | Enable/disable MCQ creation/review (platform + org) | Not Started | Yes – global flags + optional per-org feature flags |
| 4 | Test Creation & Binding Toggles | Enable/disable test creation and binding modes | Not Started | Yes – flags for binding types; can share feature flags infra |
| 5 | Individual Student Mode Toggles | Signup, subscriptions, tests for individuals | In Progress | Partially – `SubscriptionPlans.Audience` added; more flags needed |
| 6 | Auto Notification Rules | Matrix of events × channels × roles | Not Started | Yes – config table for notification rules |
| 7 | Notification Templates | Editable templates with placeholders | Not Started | Yes – `NotificationTemplates` table |
| 8 | Default Limits & Quotas | Global default exam & AI quotas | Not Started | Maybe – can be JSON config; optional dedicated table |
| 9 | AI Question Generation (RAG) Settings | Enable RAG + limits | Not Started | Yes – RAG config & usage tracking once implemented |
| 10 | Adaptive Learning Settings | Enable + parameters | Not Started | Yes – adaptive config tables later |
| 11 | Explanation Engine Settings | Enable explanation on wrong answers | Not Started | Maybe – simple flags initially |
| 12 | Auth & Session Policies | Password rules, session timeouts | Not Started | Maybe – config + enforcement in backend/middleware |
| 13 | Data Retention & Cleanup | Logs/notifications retention, archival | Not Started | Yes – retention config + background jobs |
| 14 | Org Defaults & Onboarding | Default plan, feature flags, notifications per new org | Not Started | Maybe – default config, some reuse of feature flags |
| 15 | Branding Settings | Logo, colors, email “from” names | Not Started | Maybe – assets + config entries |
| 16 | Settings Audit Trail | Log every settings change with before/after | Not Started | Yes – ensure `Logs` covers Settings with structured `PreviousData`/`NewData` |

---

## 2. Platform Maintenance & Banners

### 2.1 Maintenance Mode

- **Toggle:** `PlatformMaintenance.Enabled` (ON / OFF)
- **Scope options:**
  - Entire platform
  - Only student portals (org + individual)
  - Only org admin / subject expert tools
- **Fields:**
  - Global maintenance message (multi-lang support later)
  - Expected resume time (datetime)
  - Allowlist of roles/users who can still access (e.g. SuperAdmin, Support)

**Behavior:**
- If enabled:
  - All affected UIs show a **banner** and block core actions with a friendly message.
  - All APIs for blocked areas return `503` with maintenance payload.

### 2.2 Global Announcement Banner

- Configurable **dismissible banner** for:
  - All users, or
  - Specific roles (OrgAdmin, Students, Subject Experts, etc.)
- Fields:
  - Title, message, link (e.g. to docs or status page)
  - Target roles
  - Start & end time
  - Priority (in case multiple banners)

---

## 3. Feature Toggles (Platform & Org-Level)

### 3.1 MCQ Creation & Review Toggles

- **Global toggles:**
  - `AllowPlatformMCQCreation` (platform-level experts)
  - `AllowOrgMCQCreation` (org-level subject experts)
  - `AllowMCQReview` (reviewer workflows)
- **Org-level override:**
  - Per-organization flags (in `Organizations` or an `OrgFeatureFlags` table):
    - `OrgMCQCreationEnabled`
    - `OrgMCQReviewEnabled`

**Use cases:**
- Temporarily **freeze MCQ uploading** for:
  - Whole system, or
  - Specific orgs (e.g. compliance reason, unpaid org).

### 3.2 Test Creation & Binding Toggles

- Toggles:
  - `AllowTestCreation` (global)
  - `AllowCustomBinding`, `AllowAutoBinding`, `AllowHybridBinding`
  - Per-org override for specific binding modes.

**Behavior:**
- UI hides disabled options, API refuses calls with clear messages.

### 3.3 Individual Student Mode Toggles

- Toggles:
  - `AllowIndividualStudentSignup`
  - `AllowIndividualStudentSubscriptions`
  - `AllowIndividualStudentTests` (access to platform-created tests)

**Per-plan behavior:**
- Combine with `SubscriptionPlans.Audience`:
  - If individual mode is OFF, Student-audience plans are not visible.

---

## 4. Notifications & Communication Settings

### 4.1 Automatic Notification Rules

Define which events auto-trigger notifications and for whom:

- Events:
  - New subscription created / expiring / expired (Org + Student)
  - New test assigned
  - Test starting soon / ending soon
  - MCQ approved / rejected
  - Payment success / failure
- Controls:
  - Checkboxes per event:
    - In-app notification
    - Email notification
    - (Future) Push / SMS

### 4.2 Notification Templates

- Template library (IDs):
  - `ORG_SUBSCRIPTION_EXPIRE_SOON`
  - `ORG_SUBSCRIPTION_EXPIRED`
  - `STUDENT_TEST_ASSIGNED`
  - `STUDENT_RESULT_PUBLISHED`
  - `MCQ_REJECTED_WITH_COMMENTS`
- Fields per template:
  - Subject
  - Body (with placeholders like `{{OrgName}}`, `{{StudentName}}`, `{{TestName}}`)

### 4.3 Quiet Hours / Rate Limits

- Quiet hours per timezone (optional, phase 2).
- Max notifications per user per hour/day to avoid spam.

---

## 5. Default Limits & Quotas (Global Defaults)

Settings jahan se default values pick hoti hain (per-plan override still valid):

- Default per-exam quota guidelines:
  - `DefaultMaxStudentsPerExam`
  - `DefaultMaxTestsPerExam`
  - `DefaultMaxQuestionsPerTest`
  - `DefaultMaxTestsPerDay`
- Default AI usage caps:
  - `DefaultMaxAIQuestionsPerMonthPerSubscription`
  - `DefaultMaxStudentAttemptsPerDay`

**Behavior:**
- Jab SuperAdmin naya `SubscriptionPlanExam` create karta hai, UI in defaults se prefill kare.

---

## 6. AI / RAG / Adaptive Learning Settings (Future-Ready)

### 6.1 AI Question Generation (RAG)

- Global switches:
  - `EnableAIQuestionGeneration`
  - `EnableOrgRAGPipelines` (per org later)
- Config:
  - Maximum AI questions per month per subscription.
  - Allowed exams for AI generation.
  - Source priorities: Org questions, PastExam, Platform bank.

### 6.2 Adaptive Learning Engine

- Toggles:
  - `EnableAdaptiveTestsForOrgStudents`
  - `EnableAdaptiveTestsForIndividualStudents`
- Parameters (later use):
  - Minimum attempts required before adaptivity kicks in.
  - Difficulty adjustment sensitivity.
  - Topic mastery thresholds.

### 6.3 Explanation Engine

- `EnableAIExplanationsOnWrongAnswers`
- Per-role control:
  - Available in student portals only, not in teacher views.

---

## 7. Security, Access & Compliance Settings

### 7.1 Auth & Session Policies

- Password policy (min length, complexity).
- Session timeout for:
  - Admin / OrgAdmin / Reviewer / Subject Expert / Student.
- 2FA requirement (future):
  - For SuperAdmin / OrgAdmin roles.

### 7.2 IP / Region Controls (Phase 2+)

- Optional IP allow/block lists for:
  - SuperAdmin panel.
  - Org dashboards (e.g., restrict to institute networks).

### 7.3 Data Export / Privacy

- Enable/disable:
  - Student data export feature per org.
  - Test result exports (CSV / PDF).

---

## 8. Data Retention & Cleanup

Global policies jo background jobs follow karenge:

- Logs retention:
  - e.g., 90 days detailed logs, 1 year summary logs.
- Notifications retention:
  - Auto-delete read notifications older than X days.
- Soft-delete vs hard-delete rules:
  - Students, Questions, Tests (how long before permanent removal).
- Archival:
  - Option to archive old tests/attempts (read-only mode).

---

## 9. Organization Defaults & Onboarding

### 9.1 Default Settings For New Orgs

- When new `Organization` is created:
  - Default subscription plan suggestion (e.g. “Starter Org Plan”).
  - Default org-level feature flags:
    - MCQ creation enabled
    - MCQ review enabled
    - Student dashboard analytics basic/advanced
  - Default notification rules for that org.

### 9.2 Email / Branding Settings

- Platform branding:
  - Logo, primary color, accent color (for emails and basic UI theming).
- Email “from” name & reply-to for:
  - System emails.
  - Org-branded emails (phase 2).

---

## 10. Audit & Observability Around Settings

- Every change in Settings:
  - Logged to `Logs` with:
    - ActorType = `User` (SuperAdmin)
    - ActionType = `Update`
    - EntityType = `System` or `Setting`
    - PreviousData / NewData JSON snapshot for that setting group.
- Optional “Recent Critical Changes” panel in the Settings page:
  - Last N changes to:
    - Maintenance mode
    - Feature toggles
    - Notification policies
    - Security / password / session rules

---

## 11. UI Structure Proposal (for Settings Tab)

Suggested tabs/sections inside SuperAdmin `Settings`:

1. **General**
   - Maintenance mode
   - Global banners
   - Branding (logo, colors)
2. **Features & Toggles**
   - MCQ creation/review
   - Test creation & binding modes
   - Individual student mode
3. **Notifications**
   - Auto-notification matrix (events × channels × roles)
   - Templates
4. **Limits & Quotas**
   - Default quotas for exams & AI usage
5. **AI & Adaptive**
   - RAG question generation
   - Adaptive learning
   - Explanations
6. **Security & Compliance**
   - Auth/session policies, 2FA, IP controls (future)
7. **Data & Retention**
   - Logs, notifications, archival rules

Ye file SuperAdmin `Settings` module ka **design spec** hai.  
Implementation ke time pe har section ko separate API + UI components mein break kiya ja sakta hai. 

