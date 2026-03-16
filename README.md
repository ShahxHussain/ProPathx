# ProPath — Multi-Tenant Exam & Learning Platform (MERN + Supabase)

ProPath is a **multi-tenant examination platform** where organizations can subscribe to plans, create quota-enforced tests, manage an MCQ bank, and run student assessments with different question binding strategies (**Custom / Auto / Hybrid**).  

The system is built with:
- **Frontend**: React (SPA), React Router, Recharts, KaTeX/LaTeX rendering, Lucide icons
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Supabase)
- **Auth**: JWT + role-based access control (RBAC) with strict tenant isolation

> This repo also follows an “**.md-first**” workflow: system design + schema are documented and kept in sync with code. See the docs section below.

---

## Core concepts (what makes it non-trivial)

- **Multi-tenant isolation**: org-scoped data access is enforced across routes/queries.
- **Subscription + per-exam quotas**: plans can define per-exam limits (via `SubscriptionPlanExams`) and usage is tracked.
- **Two-layer expert/reviewer system (platform + organization)**:
  - **Platform-level** experts/reviewers live in `Users` and can work across **all exams** (no subscription gate).
  - **Org-level** experts/reviewers live in `OrgUsers` and are constrained by **Org subscription → Plan → `SubscriptionPlanExams`**.
- **Org-based + Individual-based product modes**:
  - **Organization mode**: Org subscribes, creates tests, assigns to org students.
  - **Individual mode (self-service)**: a student can sign up independently and use student-focused subscription plans (see `SubscriptionPlans.Audience`).
- **MCQ lifecycle**: creation → review/verification → usage in tests (org-scoped + platform-scoped questions supported).
- **Test composition modes**:
  - **Custom**: org selects questions from its own bank
  - **Auto**: platform draws questions at attempt time
  - **Hybrid**: mix of both (with UI and constraints)
- **Operational controls**: SuperAdmin Settings supports **Maintenance Mode** and **Global Announcements** targeted to roles.
- **Future direction (AI + adaptive learning)**: RAG-based question generation, adaptive tests, and per-question AI explanations to convert mistakes into learning moments.

---

## Project structure

```text
propath/
├── backend/                         # Node.js/Express API server
│   ├── config/                      # Supabase client
│   ├── middleware/                  # Auth/validation middleware
│   ├── routes/                      # API routes (admin/org/auth/questions/tests/etc)
│   ├── utils/                       # JWT, password, logs, subscription utilities
│   └── server.js                    # Server entry
├── src/                             # React frontend (SPA)
│   ├── components/                  # Shared UI components
│   ├── components/layouts/          # Layouts per role (AdminLayout/DashboardLayout/etc)
│   ├── pages/                       # Screens per role
│   └── services/                    # API client layer
├── Reference_Documents/             # System design & schema (source of truth)
├── Implementations_Docs/            # Feature-level implementation specs
└── settings.md                      # SuperAdmin settings feature plan
```

---

## Quick start (local development)

### 1) Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Update `backend/.env`:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
JWT_SECRET=your_secure_random_string_at_least_32_characters_long
JWT_EXPIRES_IN=7d
PORT=3001
NODE_ENV=development
```

Health check:

```bash
curl http://localhost:3001/health
```

### 2) Frontend

```bash
npm install
```

Create `.env.local` in repo root:

```env
REACT_APP_API_URL=http://localhost:3001
```

Start the app:

```bash
npm start
```

---

## Roles & capabilities (high-level)

### SuperAdmin (platform)
- **Platform governance**
  - Manage platform-wide users (`Users`) (admins, platform reviewer/expert, support, etc.)
  - Manage organizations lifecycle (onboarding/approval/status) and high-level visibility
- **Exams & content**
  - Create/manage exams → subjects → topics
  - Platform question bank: platform experts create questions usable across orgs (where allowed)
- **Subscriptions**
  - Create/enable/disable subscription plans and link exams to plans (`SubscriptionPlanExams`)
  - Plans support an `Audience`: **Organization / Student / Both** (enables org vs individual mode)
  - View all subscriptions and usage
- **Operations**
  - Create global notifications
  - View logs / audit trails and platform analytics
  - **Settings tab**:
    - Maintenance Mode (scope + allowed roles)
    - Global Announcements (role-targeted moving banner + modal)

### OrgAdmin (organization)
- **Org user management**
  - Create/manage org users (`OrgUsers`) such as org-level Reviewer and Subject Expert
- **Org students**
  - Create/manage students and student groups
  - Assign tests to: single student / group / all students (see assignment docs)
- **Tests**
  - Create tests under subscription quotas
  - Bind questions in **Custom / Auto / Hybrid** modes with constraints (weightage rules, org-scope rules)
- **Org operations**
  - Org notifications (to their users/students)
  - View org activity/logs for accountability

### Subject Expert
- Two types:
  - **Platform Subject Expert** (`Users`) → can create questions for any exam (platform-wide).
  - **Organization Subject Expert** (`OrgUsers`) → can create questions only for exams in their org subscription.
- Create MCQs (supports LaTeX/KaTeX rendering where applicable)
- Submit for review / verification

### Reviewer
- Two types:
  - **Platform Reviewer** (`Users`) → can review across all exams.
  - **Organization Reviewer** (`OrgUsers`) → can review only org-scoped questions / subscribed exams.
- Review pending MCQs, approve/reject with comments

### Student
- Two modes:
  - **Org student** (linked to an org) → sees assigned tests from that org.
  - **Individual student** (self-service) → uses student-audience subscription plans (planned/rolling).
- Attempt tests, view results, analytics, and learning progress (adaptive learning planned)

---

## Documentation (kept in sync with code)

### Source-of-truth design & schema
- `Reference_Documents/Database_Schema.md`
- `Reference_Documents/Main_Implementation.md`
- `Reference_Documents/System.md` (UI conventions, colors, icons)

### Feature implementation specs


### API docs
- `Implementations_Docs/API_Documentation.md`
- `backend/README.md` (backend-focused quick reference)
- `backend/SETUP.md` (backend env + troubleshooting)

---

## Security notes

- **Supabase service_role key** must stay in backend only (never expose to frontend).
- RBAC is enforced server-side; UI guards are not security.
- Logs are used for auditability (actions + actor + entity).

---

## Roadmap (selected)

- **Individual student subscriptions** (student-audience plans + purchase flow + student dashboard)
- **RAG-based question generation** (feed org + platform bank to generate exam-aligned MCQs)
- **Adaptive learning** (next test depends on previous attempts; topic mastery + difficulty shaping)
- **AI explanations** (why an answer is wrong + targeted remediation)

---

## License

Private — ProPath platform
