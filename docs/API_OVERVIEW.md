# ProPath — API Overview

Express API base URL: `http://localhost:3001` (dev) or your deployed API origin.

All JSON APIs are under `/api/*`. Unauthenticated health: `GET /health`.

**Auth header (protected routes):**

```
Authorization: Bearer <JWT>
```

Frontend reads/writes the token in `localStorage.authToken` via `frontend/src/api/client.js`.

---

## Route registry

Single mount point: `backend/routes/index.js` → `registerApiRoutes(app)`.

| Prefix | Roles | Route module |
|--------|-------|--------------|
| `/api/org/auth` | OrgAdmin, Reviewer, Expert; public signup/login | `routes/org/auth.js` |
| `/api/student/auth` | Student; public signup/login | `routes/student/auth.js` |
| `/api/org/users` | OrgAdmin | `routes/org/users.js` |
| `/api/org/tests` | OrgAdmin | `routes/org/tests/` (`crud`, `questions`, `assignments`, `shared`) |
| `/api/org/students` | OrgAdmin | `routes/org/students.js` |
| `/api/org/groups` | OrgAdmin | `routes/org/groups.js` |
| `/api/org/settings` | OrgAdmin | `routes/org/settings.js` |
| `/api/student` | Student | `routes/student/portal.js` |
| `/api/admin` | SuperAdmin | `routes/admin/index.js` |
| `/api/profile` | All authenticated roles | `routes/shared/profile.js` |
| `/api/questions` | Org staff + platform | `routes/shared/questions.js` |
| `/api/notifications` | All authenticated roles | `routes/shared/notifications.js` |
| `/api/reviewers` | Reviewer | `routes/shared/reviewers.js` |

---

## Frontend API client map

Domain modules under `frontend/src/api/` mirror backend prefixes:

| Module | Backend prefix |
|--------|----------------|
| `api/org/auth.js` | `/api/org/auth` |
| `api/org/users.js`, `tests.js`, `students.js`, `groups.js`, `settings.js`, … | `/api/org/*` |
| `api/student/auth.js`, `dashboard.js` | `/api/student/auth`, `/api/student` |
| `api/admin.js` | `/api/admin` |
| `api/profile.js` | `/api/profile` |
| `api/questions.js` | `/api/questions` |
| `api/notifications.js` | `/api/notifications` |
| `api/reviewers.js` | `/api/reviewers` |

Import from `frontend/src/services/api.js` (barrel) or directly from `frontend/src/api/*`.

---

## SuperAdmin API (`/api/admin`)

Mounted via `routes/admin/index.js`. Sub-routers (all require SuperAdmin except login):

| Path under `/api/admin` | Module | Purpose |
|-------------------------|--------|---------|
| `POST /login` | `admin/auth.js` | SuperAdmin login (public) |
| `GET /dashboard/stats` | `admin/dashboard.js` | Dashboard metrics |
| `GET /health` | `admin/health.js` | System health (API + DB) |
| `GET/POST/PUT/DELETE /organizations` | `admin/organizations.js` | Tenant management |
| `GET/POST/PUT/DELETE /users` | `admin/users.js` | Platform + org user admin |
| `GET/POST/PUT/DELETE /exams` | `admin/exams.js` | Platform exam catalog |
| `GET/POST/PUT/DELETE /subscription-plans` | `admin/subscriptionPlans.js` | Plans + plan exams |
| `GET /subscriptions` | `admin/subscriptions.js` | Subscription records |
| `GET/PUT /settings/maintenance` | `admin/settings.js` | Maintenance mode |
| `GET/POST/PUT/DELETE /settings/announcements` | `admin/settings.js` | Platform announcements |
| `GET /questions` | `admin/questions.js` | Platform question bank |
| `GET /logs`, `GET /logs/stats` | `admin/logs.js` | Audit logs |

Detailed request/response examples for org auth: see `backend/README.md`.

---

## Org auth highlights (`/api/org/auth`)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/signup` | Public | Org self-registration |
| POST | `/login` | Public | Returns JWT |
| POST | `/first-password` | Bearer | First-login password change |
| GET | `/me` | Bearer | Current org user |
| POST | `/logout` | Bearer | Client-side token clear |

Student auth mirrors at `/api/student/auth` (signup, login, me).

---

## Error responses

Typical shape:

```json
{
  "error": "Human-readable message",
  "details": {}
}
```

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid JWT |
| 403 | Wrong role or org mismatch |
| 404 | Route or resource not found |
| 422 | Validation failed |
| 500 | Server error (stack trace in development only) |

---

## Conventions for new endpoints

1. Register mount in `routes/index.js` only — do not mount ad hoc in `server.js`.
2. Use `authenticate` + `requireRole([...])` on protected routes.
3. Prefer `services/` for non-trivial logic (see `backend/services/README.md`).
4. Log sensitive actions via `utils/logger.js`.
5. Update this file when adding a new top-level `/api/*` prefix.

OpenAPI/Swagger is **not** in v1 scope; this document is the source of truth until then.
