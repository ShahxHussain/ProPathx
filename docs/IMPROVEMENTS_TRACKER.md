# ProPath — Improvements Tracker

Single place to track **what is done**, **what is planned**, and **what we are not doing yet**.  
Update this file when you finish or start work — do not refactor the whole repo without checking here first.

**Last updated:** 2026-05-21 (Phases F + D — client handoff complete)

---

## Status legend

| Status | Meaning |
|--------|---------|
| **Done** | Shipped and in use |
| **In progress** | Someone is actively working on it |
| **Planned** | Agreed improvement, not started |
| **Low priority** | Nice to have; do after higher items |
| **Won't do** | Explicitly out of scope (with reason) |

**Priority:** High → Medium → Low

---

## 1. Architecture (overall)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| React → Express → Supabase (no direct DB from browser) | **Done** | — | All live data via `frontend/src/services/api.js` → `backend/` |
| JWT auth on API | **Done** | — | Token in `localStorage`, middleware in `backend/middleware/auth.js` |
| Monorepo: `frontend/` + `backend/` | **Done** | — | Root `npm start` runs frontend |
| Remove unused `frontend/src/supabaseClient.js` | **Done** | Low | Removed 2026-05-21; `@supabase/supabase-js` uninstalled from frontend |
| Fix `frontend/README.md` (remove misleading Supabase env for app runtime) | **Done** | Low | Only `REACT_APP_API_URL` documented |
| Document architecture in `tech.md` | **Done** | — | Stack + env vars |
| Legacy duplicate `src/` at repo root (if present) | **Done** | Low | Removed — active app is `frontend/src` only |

---

## 2. Backend folder structure

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Basic layers: `routes/`, `middleware/`, `utils/`, `config/` | **Done** | — | Standard Express layout |
| Split `routes/admin.js` (~4k lines) by domain | **Done** | High | `routes/admin/*` — auth, dashboard, health, orgs, users, exams, plans, settings, questions, logs, subscriptions |
| Split `routes/students.js` (~4.5k lines) | **Done** | High | `routes/student/portal.js` + `routes/org/students.js` + `routes/students/shared.js` |
| Split `routes/tests.js` (~2.5k lines) | **Done** | **High** | `routes/org/tests/*` — Phase B 2026-05-21 |
| Split `routes/auth.js` (~1.8k lines) | **Done** | Medium | `routes/org/auth.js` + `routes/student/auth.js` + `routes/auth/helpers.js` |
| Add `services/` layer (business logic off routes) | **Done** | Medium | `testsService`, `profileService` added Phase C 2026-05-21 |
| Add `controllers/` (thin req/res handlers) | **Won't do** | Low | Skip for v1 — `routes` + `services` is enough for this team size |
| Consolidate org routes under `routes/org/` | **Done** | **High** | `users`, `groups`, `settings` moved 2026-05-21 — Phase A |
| Move cross-portal routes to `routes/shared/` | **Done** | Medium | `profile`, `questions`, `notifications`, `reviewers` — Phase A |
| Remove root re-export barrels (`admin.js`, `auth.js`, `students.js`, `tests.js`) | **Done** | Low | Phase D 2026-05-21 — `routes/index.js` imports folders only |
| Rename `scripts/*.sql` → `db/migrations/` | **Done** | Phase E — copies in `backend/db/migrations/` |
| `server.js` route registry in `routes/index.js` | **Done** | Low | `registerApiRoutes(app)` in `backend/routes/index.js` |

### Backend route files (current size — refactor targets)

| File | ~Lines | Target location | Split? |
|------|--------|-----------------|--------|
| `admin/` (split) | — | `routes/admin/*` | **Done** |
| `student/portal.js` + `org/students.js` | — | split from `students.js` | **Done** |
| `org/auth.js` + `student/auth.js` | — | split from `auth.js` | **Done** |
| `tests.js` | 2500+ | `routes/org/tests/*` | **Done** — Phase B |
| `questions.js` | 900 | `routes/shared/questions.js` | **Done** — Phase A |
| `notifications.js` | 775 | `routes/shared/notifications.js` | **Done** — Phase A |
| `reviewers.js` | 540 | `routes/shared/reviewers.js` | **Done** — Phase A |
| `orgSettings.js` | 493 | `routes/org/settings.js` | **Done** — Phase A |
| `groups.js` | 445 | `routes/org/groups.js` | **Done** — Phase A |
| `profile.js` | 400 | `routes/shared/profile.js` | **Done** — Phase A |
| `users.js` | 260 | `routes/org/users.js` | **Done** — Phase A |

---

## 3. Frontend folder structure

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| Pages grouped by role (`pages/admin`, `org`, `student`, …) | **Done** | — | Good baseline |
| Shared layouts in `components/layouts/` | **Done** | — | `DashboardLayout.css` shared |
| Split monolithic API client | **Done** | **High** | `frontend/src/api/*` + barrel in `services/api.js` |
| `App.js` routes (~650 lines) | **Done** | **High** | `app/AppRoutes.jsx`, `app/routes/guards.jsx`, `app/AuthPage.jsx` |
| Empty `hooks/` folder — use or remove | **Planned** | Low | e.g. `useProfile`, `useAuth` |
| `features/` module layout (auth, org, student, …) | **Done** | Medium | `features/auth`, `profile`, portal `routes.jsx`; pages migrate gradually |
| Migrate `pages/org/*` → `features/org/pages/*` | **Done** | Medium | Phase F 2026-05-21 — re-exports in `pages/org/` |
| Migrate `pages/student/*`, `admin/*`, etc. | **Planned** | Low | After org pages pilot |
| Shared UI in `shared/components/` | **Planned** | Low | Avatar, ProfileMenu, NotificationBell — optional v1 |
| Co-located page CSS (`.jsx` + `.css`) | **Done** | — | Keep this pattern |

### Frontend API modules (under `frontend/src/api/`)

| Module | Status | Notes |
|--------|--------|-------|
| `api/client.js` (fetch + token) | **Done** | Shared `request()` + `API_BASE_URL` |
| `api/org/auth.js` | **Done** | Org/staff auth |
| `api/org/*.js` | **Done** | dashboard, users, tests, students, groups, exams, settings |
| `api/student/*.js` | **Done** | auth, dashboard |
| `api/admin.js` | **Done** | SuperAdmin API |
| `api/profile.js` | **Done** | Profile + `syncStoredUser` |
| `api/questions.js`, `reviewers.js`, `notifications.js` | **Done** | Cross-portal APIs |
| `services/api.js` re-exports only | **Done** | Backward-compatible imports unchanged |

---

## 4. Product features (recent / notable)

| Feature | Status | Area | Notes |
|---------|--------|------|-------|
| Profile page (all roles) | **Done** | Frontend + `backend/routes/shared/profile.js` | `/org/profile`, `/student/profile`, etc. |
| OrgAdmin profile — org account details block | **Done** | Profile | Read-only org fields; admin full name label |
| OrgAdmin — no avatar URL on profile | **Done** | Profile | |
| First-login password (`MustChangePassword`) | **Done** | Auth + welcome page | SQL: `org_users_must_change_password.sql` |
| Last login display + log fallback | **Done** | Profile + `utils/lastLogin.js` | |
| Mobile header — bell + profile row | **Done** | `DashboardLayout.css` + layouts | All portals |
| Individual student subscription UI | **Done** | `pages/student/SubscriptionPlans.jsx` | Uses org-plans layout + student theme |
| Org subscription plans UI refresh | **Done** | `pages/org/SubscriptionPlans.jsx` | Stats, filters, cards |
| Org enrollment settings | **Done** | `orgSettings` + Settings page | |
| SuperAdmin Create Organization / Platform User forms | **Done** | Admin pages | |
| Subject Expert My Questions — query optimization (view/edit) | **Done** | `questions.js` + `expert/Questions.jsx` | See `docs/QUERY_OPTIMIZATION.md` |
| Query optimization rollout (Admin, Org, Reviewer, Student) | **Planned** | Backend + frontend | Apply pattern from `QUERY_OPTIMIZATION.md` |

---

## 5. Documentation

| Doc | Status | Notes |
|-----|--------|-------|
| `Reference_Documents/Database_Schema.md` | **Done** | Keep in sync when columns change |
| `backend/README.md` | **Done** | API setup |
| `frontend/docs/ORG_ADMIN_UI.md` | **Done** | Org UI patterns |
| `tech.md` | **Done** | Stack handoff |
| **`docs/IMPROVEMENTS_TRACKER.md`** | **Done** | This file |
| **`docs/ARCHITECTURE.md`** | **Done** | Phase E — 2026-05-21 |
| **`docs/API_OVERVIEW.md`** | **Done** | Phase E — endpoint map + admin sub-routes |
| **`docs/DEPLOYMENT.md`** | **Done** | Phase E — local + prod checklist |
| **`docs/QUERY_OPTIMIZATION.md`** | **Done** | Bulk queries, embed children, prefetch — expert Questions reference |
| Profile feature doc (user-facing) | **Planned** | Low |
| Architecture diagram (React → Express → DB) | **Done** | In `ARCHITECTURE.md` (mermaid) |

---

## 6. Database / SQL scripts

| Script | Status | Purpose |
|--------|--------|---------|
| `org_users_must_change_password.sql` | **Done** | First-login password flag |
| `org_users_profile_image_url.sql` | **Done** | Avatar on OrgUsers |
| `org_users_last_login.sql` | **Done** | LastLogin column |
| `org_enrollment_settings.sql` | **Done** | Org enrollment settings table |
| Run all scripts on Supabase before prod | **Planned** | Ops checklist — see `docs/DEPLOYMENT.md` |
| `backend/db/migrations/` with ordered README | **Done** | Phase E — 001–007 + README |

---

## 7. Code quality & ops

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| ESLint / Prettier shared config | **Planned** | Low | |
| Env example files (`.env.example`) | **Done** | `backend/.env.example` + `frontend/.env.example` — Phase E |
| CI (GitHub Actions): lint + build | **Done** | **High** | `.github/workflows/ci.yml` — Phase G 2026-05-21 |
| API integration tests | **Done** | Medium | `backend/tests/smoke.mjs` — health + auth guard; optional login via secrets |
| Payment checkout (subscriptions) | **Planned** | Product | UI shows “coming soon” footnote |

---

## 8. Recommended order of work

Do **not** big-bang refactor. Suggested sequence:

| Step | Task | Status |
|------|------|--------|
| 1 | Keep using this tracker; update statuses when you ship | **Ongoing** |
| 2 | Remove `supabaseClient.js` + fix `frontend/README.md` | **Done** |
| 3 | Split `api.js` (re-export from `services/api.js`) | **Done** |
| 4 | Split `App.js` routes | **Done** |
| 5 | Split `backend/routes/students.js` and `auth.js` | **Done** |
| 6 | Split `backend/routes/admin.js` | **Done** |
| 7 | Introduce `backend/services/` for new code | **Done** |
| 8 | Gradual `features/` folder on frontend | **Done** |

**Steps 1–8 complete.** Continue with **§10 Client handoff plan** (Phases A–G) before delivering to client.

---

## 10. Client handoff plan (SaaS delivery standard)

Goal: a **new developer or client team** can run, deploy, and extend ProPath without guessing where code lives.  
Rule: **no big-bang** — one phase at a time; update statuses in this file when each phase ships.

### 10.1 Definition of done (client-ready)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Every API mount documented in `docs/API_OVERVIEW.md` | **Done** |
| 2 | Target folder layout matches §10.2 (no orphan 2k+ line route files) | **Done** | `tests.js` split — root barrel remains until Phase D |
| 3 | SQL migrations in `backend/db/migrations/` with run order | **Done** |
| 4 | `.env.example` for frontend + backend | **Done** |
| 5 | `docs/ARCHITECTURE.md` + diagram (React → Express → Supabase) | **Done** |
| 6 | `docs/DEPLOYMENT.md` (local + prod checklist) | **Done** |
| 7 | CI: frontend build + backend smoke test | **Done** |
| 8 | Legacy root `src/` removed or archived | **Done** |
| 9 | `npm run build` (frontend) passes; backend starts with documented env | **Done** |

---

### 10.2 Target folder layout

#### Backend (target)

```
backend/
  config/                 # Supabase client, env
  middleware/             # auth, validation
  services/               # Business logic (expand per domain)
    README.md
    systemSettingsService.js
    logsService.js
    orgAuthService.js
    healthMetricsService.js
    testsService.js         # Org test rules (binding, weightage, counters)
    profileService.js       # Profile load/update/password
    …
  routes/
    index.js                # ONLY registry — registerApiRoutes(app)
    org/
      auth.js               # Done
      students.js           # Done
      users.js              # Done
      tests/                # Done — crud, questions, assignments, shared
        index.js
        crud.js
        assignments.js
        questions.js
        shared.js
      groups.js             # Done
      settings.js           # Done
    student/
      auth.js               # Done
      portal.js             # Done
    admin/
      index.js              # Done
      …                     # Done
    shared/                 # Phase A — cross-portal APIs
      profile.js
      questions.js
      notifications.js
      reviewers.js
    students/
      shared.js             # Done — helpers for student/org student routes
  db/
    migrations/             # Phase E — ordered SQL
      README.md             # Run order + idempotency notes
      001_….
      002_….
    seeds/                  # createSuperAdmin.js, etc.
  utils/
  server.js
```

**Root `routes/` after Phase D:** only `index.js` and domain folders (no deprecated barrels).

#### Frontend (target)

```
frontend/src/
  api/                      # Done — domain API modules
  services/api.js           # Done — re-export barrel
  app/
    App.js
    AppRoutes.jsx           # Done — composes feature routes
  features/                 # Done — expand pages into here
    README.md
    auth/                   # Done
    profile/                # Done
    org/
      routes.jsx            # Done
      pages/                # Done — Phase F
    student/
      routes.jsx            # Done
      pages/                # Phase F (later)
    admin/
      routes.jsx            # Done
      pages/                # Phase F (later)
    reviewer/ | expert/     # routes Done; pages later
  components/               # Shared UI + layouts (keep)
  pages/                    # Thin re-exports (org → features/org/pages); migrate other portals later
  utils/
```

---

### 10.3 API mount map (for `docs/API_OVERVIEW.md`)

| Prefix | Role(s) | Route module (target) |
|--------|---------|------------------------|
| `/api/org/auth` | OrgAdmin, Reviewer, Expert, public | `routes/org/auth.js` |
| `/api/student/auth` | Student, public signup | `routes/student/auth.js` |
| `/api/org/users` | OrgAdmin | `routes/org/users.js` |
| `/api/org/tests` | OrgAdmin | `routes/org/tests/` |
| `/api/org/students` | OrgAdmin | `routes/org/students.js` |
| `/api/org/groups` | OrgAdmin | `routes/org/groups.js` |
| `/api/org/settings` | OrgAdmin | `routes/org/settings.js` |
| `/api/student` | Student | `routes/student/portal.js` |
| `/api/admin` | SuperAdmin | `routes/admin/index.js` |
| `/api/profile` | All authenticated | `routes/shared/profile.js` |
| `/api/questions` | Org + platform | `routes/shared/questions.js` |
| `/api/notifications` | All | `routes/shared/notifications.js` |
| `/api/reviewers` | Reviewer | `routes/shared/reviewers.js` |

Auth: `Authorization: Bearer <JWT>` on protected routes. Frontend stores token in `localStorage.authToken`.

---

### 10.4 Implementation phases (do in order)

| Phase | Task | Priority | Status | Notes |
|-------|------|----------|--------|-------|
| **A** | Move org + shared routes into folders (`users`, `groups`, `orgSettings`→`settings`, `profile`, `questions`, `notifications`, `reviewers`); update `routes/index.js` | **High** | **Done** | 2026-05-21 |
| **B** | Split `tests.js` → `routes/org/tests/` (crud, assignments, test-questions) + `services/testsService.js` for heavy logic | **High** | **Done** | Split 2026-05-21; `testsService` deferred to Phase C |
| **C** | Migrate business logic from moved routes into `services/` (tests, profile, org settings) | **Medium** | **Done** | `testsService.js`, `profileService.js` — 2026-05-21 |
| **D** | Remove root barrels: `routes/admin.js`, `auth.js`, `students.js`, `tests.js` — `index.js` imports folders only | **Low** | **Done** | 2026-05-21 |
| **E** | Client docs + ops: `ARCHITECTURE.md`, `API_OVERVIEW.md`, `DEPLOYMENT.md`; `db/migrations/`; `.env.example` ×2 | **High** | **Done** | 2026-05-21 |
| **F** | Frontend: move `pages/org/*` → `features/org/pages/*`; re-export from `pages/org/` | **Medium** | **Done** | 2026-05-21 |
| **G** | CI (build + API smoke) + minimal integration tests (login, profile GET) | **Medium** | **Done** | `.github/workflows/ci.yml` + `backend/tests/smoke.mjs` — 2026-05-21 |

#### Phase A — file move checklist

| From | To | Status |
|------|-----|--------|
| `routes/users.js` | `routes/org/users.js` | **Done** |
| `routes/groups.js` | `routes/org/groups.js` | **Done** |
| `routes/orgSettings.js` | `routes/org/settings.js` | **Done** |
| `routes/profile.js` | `routes/shared/profile.js` | **Done** |
| `routes/questions.js` | `routes/shared/questions.js` | **Done** |
| `routes/notifications.js` | `routes/shared/notifications.js` | **Done** |
| `routes/reviewers.js` | `routes/shared/reviewers.js` | **Done** |

#### Phase B — `tests.js` split (proposed modules)

| Module | Responsibility |
|--------|----------------|
| `routes/org/tests/crud.js` | List/create/update/delete tests, wizard metadata |
| `routes/org/tests/assignments.js` | Test assignments to students/groups |
| `routes/org/tests/questions.js` | Questions on a test, link from bank |
| `routes/org/tests/index.js` | `router.use()` merges sub-routers |

#### Phase E — SQL migration order (initial)

| Order | File (from `scripts/`) | Purpose |
|-------|------------------------|---------|
| 1 | `org_users_must_change_password.sql` | First-login flag |
| 2 | `org_users_profile_image_url.sql` | Avatar column |
| 3 | `org_users_last_login.sql` | LastLogin column |
| 4 | `org_enrollment_settings.sql` | Enrollment settings table |
| 5 | `add_attempt_ordinal_columns.sql` | Attempt ordinals |
| 6 | `migrate_studentanswers_optionid_to_uuid.sql` | OptionID UUID |
| 7 | `createSuperAdmin.sql` | Ops — not always in prod migrate |

Copy to `backend/db/migrations/` with numeric prefix; keep `backend/scripts/` as deprecated pointer until Phase D.

---

### 10.5 Route handler standard (for all new / migrated code)

```javascript
// routes/org/example.js — thin handler
import { someService } from '../../services/someService.js';

router.get('/', authenticate, requireRole(['OrgAdmin']), async (req, res) => {
  try {
    const result = await someService.list(req.user.orgId, req.query);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Internal server error',
      details: error.details,
    });
  }
});
```

- **No** direct 100+ line handlers in routes after Phase C.
- **Yes** shared validation via `middleware/validation.js`.
- **Yes** audit logs via `utils/logger.js` from services where appropriate.

---

### 10.6 What we explicitly skip for v1 client handoff

| Item | Reason |
|------|--------|
| TypeScript migration | Cost vs benefit |
| `controllers/` layer | `routes` + `services` sufficient |
| Full `pages/` removal on frontend | Re-exports OK until Phase F completes |
| OpenAPI / Swagger | Optional post-v1; `API_OVERVIEW.md` first |
| Next.js / microservices | Out of scope |

---

### 10.7 Suggested implementation order (next sessions)

1. ~~**Phase E (partial)**~~ — **Done** 2026-05-21
2. ~~**Phase A**~~ — **Done** 2026-05-21
3. ~~**Phase B**~~ — **Done** 2026-05-21
4. ~~**Phase C**~~ — **Done** 2026-05-21
6. ~~**Phase G**~~ — **Done** 2026-05-21
7. ~~**Phase F**~~ — **Done** 2026-05-21
8. ~~**Phase D**~~ — **Done** 2026-05-21

**Phases A–G complete.** Client handoff structure is in place.

Mark each phase **In progress** → **Done** in §10.4 when starting/finishing.

---

## 9. Won't do (for now)

| Item | Reason |
|------|--------|
| Frontend direct Supabase access | Security; Express is the API layer |
| Full rewrite to TypeScript | Large cost; not required for current team size |
| Next.js migration | CRA works; migration is separate project |
| Monolith merge frontend+backend into one folder | Current split is correct |

---

## How to update this file

1. Pick a row → change **Status** (`Planned` → `In progress` → `Done`).
2. Add a row if you discover new debt or finish a feature.
3. Put your initials or date in **Notes** when closing an item (optional).
4. Link PR or commit in Notes for big items.

**Example note after completion:**  
`Done 2026-05-21 — split api.js into org/student/admin (PR #42)`
