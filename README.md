**API Health** · [https://propath-r4tw.onrender.com/health](https://propath-r4tw.onrender.com/health)

# ProPath – The Intelligent Assessment & Learning Platform

**GitHub** · [ShahxHussain/ProPathx](https://github.com/ShahxHussain/ProPathx) · **Live Demo** · *[Add your Vercel URL]* · **API** · [propath-r4tw.onrender.com](https://propath-r4tw.onrender.com)

PostgreSQL (Supabase) · Node.js · Express.js · React.js · RESTful APIs · JWT · RBAC · Recharts · KaTeX/LaTeX · CSV automation

---

ProPath is a modern **AI-powered assessment and learning platform** built to help educational institutions, training organizations, certification providers, and independent learners create, deliver, and continuously improve high-quality assessments at scale. Combining intelligent automation with enterprise-grade infrastructure, ProPath transforms the traditional examination process into a personalized, data-driven learning experience.

Whether you're conducting nationwide entrance exams, managing institutional assessments, delivering corporate training, or preparing for competitive certifications, ProPath provides everything needed in a single, unified platform—from content creation and AI-assisted question generation to secure test delivery, performance analytics, certifications, and learner engagement.

Built on a **scalable multi-tenant SaaS architecture**, ProPath enables multiple organizations to operate independently while benefiting from a centralized, secure, and highly available platform. Every organization has its own isolated workspace—users, students, question banks, tests, analytics, and subscription management—ensuring complete data privacy and operational flexibility.

### Our vision

ProPath is more than an online examination system—it is an **intelligent learning ecosystem**.

Our vision is to build a platform where assessments continuously improve learning rather than simply measuring it. By combining artificial intelligence, educational analytics, and modern cloud technologies, ProPath helps institutions make better academic decisions while empowering learners with personalized guidance throughout their educational journey.

---

## Highlights

- **Multi-tenant SaaS** with strict tenant isolation supporting unlimited organizations; **JWT-based RBAC** across **five role portals**, **32+ PostgreSQL tables**, a **two-tier user model** (platform vs. organization), and **audit logging** across authentication, CRUD, subscriptions, and operational events.
- **Automated bulk operations**: CSV **student** registration with row-level validation; bulk exam-enrollment assignment; **audit log export** (CSV/JSON); bulk attach of verified questions to tests. *(Bulk MCQ creation via file upload — planned.)*
- **Test delivery engine**: **four assignment modes** (individual, group, multi-group, org-wide); **three question-binding strategies** (Custom / Auto / Hybrid); **two org schedules** (open vs. time-windowed scheduled); **Self-Test Builder** for student-driven practice from subscription question pools; plan-gated Scheduled and Adaptive modes.
- **Four-stage MCQ workflow** — Draft → Pending → Verified → Rejected — over a **four-level exam hierarchy** (exam → subject → chapter → topic), from SuperAdmin catalogs and subscription plans through student attempts, scoring, and results.
- **150+ REST API endpoints** serving React clients end-to-end; the browser never talks to Supabase directly—all data flows through the Express API.

---

## Architecture at a glance

```
┌─────────────────┐     HTTPS / JSON      ┌─────────────────┐     service role     ┌─────────────────┐
│  React SPA      │  ──────────────────►  │  Express API    │  ─────────────────►  │  Supabase       │
│  frontend/      │  Authorization:       │  backend/       │  (PostgreSQL)        │  (managed DB)   │
│  port 3000      │  Bearer <JWT>         │  port 3001      │                      │                 │
└─────────────────┘                       └─────────────────┘                      └─────────────────┘
```

| Layer | Path | Responsibility |
|-------|------|----------------|
| Frontend | `frontend/` | React SPA, role portals, Recharts analytics, LaTeX MCQ rendering |
| API | `backend/` | Express routes, JWT auth, RBAC, business rules, audit logs |
| Data | Supabase | PostgreSQL, migrations in `backend/db/migrations/` |

Detailed design: [frontend/Reference_Documents/ARCHITECTURE.md](./frontend/Reference_Documents/ARCHITECTURE.md) · Schema: [Database_Schema.md](./frontend/Reference_Documents/Database_Schema.md)

---

## Two-tier operating model

| Tier | Who | Data scope | Typical responsibilities |
|------|-----|------------|---------------------------|
| **Platform** | SuperAdmin, platform Subject Expert, platform Reviewer | Global exams, plans, organizations, platform question bank | Catalog management, subscriptions, maintenance, announcements, system logs |
| **Organization** | OrgAdmin, org Subject Expert, org Reviewer, org students | Single `OrgID` — students, groups, tests, org questions | Day-to-day exam operations under subscription quotas |

**Individual students** (no org) can register separately and subscribe to plans with `Audience` **Student** or **Both**, enabling self-service practice via Self-Test Builder where the plan allows it.

---

## Role portals

| Role | UI prefix | Primary capabilities |
|------|-----------|-------------------|
| **SuperAdmin** | `/admin/*` | Organizations, platform users, exam catalog, subscription plans, subscriptions, platform questions, notifications, system health, audit logs, maintenance mode, global announcements |
| **OrgAdmin** | `/org/*` | Org users (Reviewer, Subject Expert), students & groups, test wizard, assignments, question bank, exam enrollments, org notifications, org logs, org settings |
| **Subject Expert** | `/expert/*` | Create/edit MCQs (LaTeX), drafts, submit for review; platform experts work globally, org experts within subscribed exams |
| **Reviewer** | `/reviewer/*` | Verify or reject pending questions with comments; platform vs org scope same as experts |
| **Student** | `/student/*` | Assigned tests, attempts, results, reports, subscription plans, Self-Test Builder (plan-gated) |

---

## Platform-level features (SuperAdmin)

### Governance & tenants
- Organization lifecycle: onboarding, approval, status, visibility
- Platform user management (`Users`): admins, support, platform experts/reviewers
- Dashboard KPIs and platform analytics (Recharts)

### Exam & content catalog
- Global exam hierarchy: **Exam → Subject → Chapter → Topic**
- Platform-wide question bank oversight
- Exam setup wizard for structured content authoring

### Subscriptions & monetization
- **Subscription plans** with pricing, duration, features, and per-exam limits via `SubscriptionPlanExams`
- Plan **audience**: Organization · Student · Both
- Plan **delivery modes**: Scheduled · Adaptive · Self-Test Builder (per-plan toggles)
- View all active subscriptions and usage

### Operations
- **Maintenance mode** — scoped by role (all / students / orgs / admins) with allow-lists
- **Global announcements** — role-targeted banner and modal
- **Notifications** — broadcast to organizations, roles, or individuals
- **System logs** — filterable audit trail with CSV/JSON export
- **System health** — API latency, DB checks, resource metrics

---

## Organization-level features (OrgAdmin & staff)

### People & access
- Create and manage **OrgUsers** (Reviewer, Subject Expert)
- **Students**: manual register, edit, deactivate; **bulk CSV import** (validated rows, per-row error report, cap per upload)
- **Student groups** for cohort-based assignment
- **Exam enrollments** — roster per exam, bulk assign, enrollment status

### Question bank
- Org-scoped MCQs with LaTeX/KaTeX in question, options, and explanation
- Filters by exam, subject, status, difficulty
- Duplicate detection on submit
- Four-stage workflow aligned with reviewer portal

### Tests & delivery
- **Test wizard** (step-gated): basics → binding → questions → schedule → review → assign
- **Question binding**:
  - **Custom** — hand-pick linked questions from org/platform bank
  - **Auto** — draw at attempt time from eligible verified pool
  - **Hybrid** — configurable auto % + custom remainder
- **Schedule modes**:
  - **Open** — available once active and assigned
  - **Scheduled** — fixed start/end window (subscription-gated)
- Tests created **Inactive** until explicitly activated at review
- **Assignment modes**: single student · one group · multiple groups · entire org (eligible, enrollment-aware)
- Bulk add existing verified questions to a test

### Org operations
- Org-scoped **notifications** and **activity logs**
- Org **settings** (enrollment rules, profile policies)
- Dashboard: students, tests, assignments, subscription context

---

## Student experience

- Secure login (org-linked or individual)
- **Assignments** — tests assigned by org or self-built
- **Timed attempts** with navigation, skip/revisit, auto-submit on expiry
- **Results & reports** — scores, breakdowns, attempt history
- **Subscription plans** — browse and subscribe (student-audience plans)
- **Self-Test Builder** — build practice tests from subscription question pools when plan allows

---

## MCQ content lifecycle

```
Draft ──► Pending ──► Verified ──► (used in tests)
              │
              └──► Rejected (with reviewer comments)
```

| Field layer | Details |
|-------------|---------|
| Context | Exam, subject, chapter (optional), topic (optional) |
| Question | Text, difficulty, type (single/multiple correct), source, explanation |
| Options | 2–6 options, `IsCorrect` flags with type validation |
| Rich text | LaTeX via `$...$` / `$$...$$` delimiters |

---

## Tech stack

| Area | Technology |
|------|------------|
| Frontend | React 19, React Router, Create React App, Lucide icons, Framer Motion, Recharts, KaTeX |
| Backend | Node.js 20, Express (ES modules), bcrypt, express-validator |
| Database | PostgreSQL via Supabase (`@supabase/supabase-js`, service role server-side only) |
| Auth | JWT bearer tokens, role middleware, first-login password change for org users |
| CI | GitHub Actions — frontend production build + backend smoke tests (see `.github/workflows/ci.yml`) |
| Deploy | Frontend static (Vercel); API on [Render](https://propath-r4tw.onrender.com) · health: [`/health`](https://propath-r4tw.onrender.com/health) |

---

## Repository structure

```text
propath/
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── api/              # Domain API clients
│   │   ├── components/       # Shared UI, layouts, LaTeX editor
│   │   ├── features/         # Domain modules (org, student, admin, auth, …)
│   │   └── pages/            # Role portals (admin, expert, reviewer, student, landing)
│   ├── Reference_Documents/  # Product & schema documentation (published)
│   └── vercel.json
├── backend/
│   ├── config/               # Supabase client
│   ├── middleware/           # Auth, validation
│   ├── routes/
│   │   ├── admin/            # SuperAdmin APIs
│   │   ├── org/              # OrgAdmin APIs (auth, students, groups, tests, settings)
│   │   ├── student/          # Student portal APIs
│   │   └── shared/           # Questions, reviewers, notifications, profile
│   ├── services/             # Business logic
│   ├── utils/                # JWT, logging, subscriptions, helpers
│   ├── db/migrations/        # Ordered SQL migrations
│   └── tests/smoke.mjs       # API smoke tests
└── .github/workflows/        # CI pipeline
```

---

## Getting started

### Prerequisites

- **Node.js 20 LTS** and **npm**
- **Supabase project** (URL + service role key)
- Git

### 1. Clone and install

```bash
git clone https://github.com/ShahxHussain/ProPathx.git
cd propath
npm run install:all
```

### 2. Environment variables

**Backend** — `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
JWT_SECRET=your_secure_random_string_at_least_32_characters_long
JWT_EXPIRES_IN=7d
PORT=3001
NODE_ENV=development
```

**Frontend** — `frontend/.env.local`:

```env
REACT_APP_API_URL=http://localhost:3001
```

> **Security:** Never commit `.env` files or expose `SUPABASE_SERVICE_ROLE_KEY` / `JWT_SECRET` in the frontend or public repos. CI uses **placeholder** values for smoke tests only — not real credentials.

### 3. Database migrations

Run scripts in **order** from `backend/db/migrations/` in the Supabase SQL editor. See [backend/db/migrations/README.md](./backend/db/migrations/README.md) and [frontend/Reference_Documents/DEPLOYMENT.md](./frontend/Reference_Documents/DEPLOYMENT.md).

### 4. Bootstrap SuperAdmin

1. Generate a bcrypt hash: `node backend/scripts/generateHash.js`
2. Run `backend/db/migrations/007_createSuperAdmin.sql` with your email and hash
3. Log in at `/admin/login` and change the default password immediately

### 5. Run locally

**Terminal 1 — API:**

```bash
npm run start:backend
# http://localhost:3001/health
```

**Terminal 2 — Frontend:**

```bash
npm run start:frontend
# http://localhost:3000
```

From repo root, `npm start` runs the frontend only; start the backend separately.

### 6. Verify production build

```bash
cd frontend && npm run build
```

Or with CI strictness: `CI=true npm run build` (treats ESLint warnings as errors).

### 7. Smoke tests (optional)

```bash
npm run test:smoke
```

Runs health + auth guard checks without a live database. Full auth smoke requires repository secrets — see [frontend/Reference_Documents/DEPLOYMENT.md](./frontend/Reference_Documents/DEPLOYMENT.md).

---

## API overview

| Prefix | Consumers | Purpose |
|--------|-----------|---------|
| `/api/admin/*` | SuperAdmin | Platform governance |
| `/api/org/*` | OrgAdmin, org staff | Tenant operations |
| `/api/questions/*` | Experts, reviewers, admins | MCQ CRUD & workflow |
| `/api/reviewers/*` | Reviewers | Verification queue |
| `/api/student/*` | Students | Attempts, results, self-tests |
| `/api/notifications/*` | All roles | In-app notifications |
| `/api/profile/*` | All roles | Profile & password |
| `GET /health` | Public | Liveness check |

Org auth examples: [backend/README.md](./backend/README.md) · Per-role UI catalog: [USER_ROLES_AND_FEATURES.md](./frontend/Reference_Documents/USER_ROLES_AND_FEATURES.md)

---

## Documentation

Published documentation lives in **[frontend/Reference_Documents/](./frontend/Reference_Documents/)**:

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./frontend/Reference_Documents/ARCHITECTURE.md) | System design, request flow, repository layers |
| [Database_Schema.md](./frontend/Reference_Documents/Database_Schema.md) | PostgreSQL tables, enums, relationships (source of truth) |
| [Main_Implementation.md](./frontend/Reference_Documents/Main_Implementation.md) | Feature ↔ schema alignment |
| [USER_ROLES_AND_FEATURES.md](./frontend/Reference_Documents/USER_ROLES_AND_FEATURES.md) | Complete per-role feature catalog |
| [DEPLOYMENT.md](./frontend/Reference_Documents/DEPLOYMENT.md) | Local setup, env vars, production checklist |

Backend quick reference: [backend/README.md](./backend/README.md) · [backend/SETUP.md](./backend/SETUP.md)

---

## Security

- **Server-side RBAC** on every protected route; UI route guards are not a security boundary
- **Tenant isolation** — org routes scope queries by `OrgID` from the JWT
- **Subscription enforcement** — plans, per-exam limits, and delivery modes checked before create/assign/attempt
- **Audit logging** — actor, action, entity type, IP, and user agent on sensitive operations
- **Maintenance mode** — blocks non-allowed roles during platform maintenance windows

---

## Roadmap (selected)

- Bulk MCQ creation (CSV + wizard + preview)
- Deeper **adaptive learning** (topic mastery, difficulty shaping across attempts)
- **RAG-assisted question generation** aligned to exam syllabi
- **AI explanations** on incorrect answers for remediation

---

## License

Private — ProPath platform. All rights reserved.
