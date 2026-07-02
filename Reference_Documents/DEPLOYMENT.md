# ProPath — Deployment Guide

Local development setup and production checklist for client handoff.

---

## Prerequisites

- **Node.js 20 LTS** (recommended)
- **npm**
- **Supabase project** (PostgreSQL + project URL and service role key)

---

## Local development

### 1. Clone and install

```bash
git clone <repo-url>
cd propath
npm run install:all
```

Or install each app separately:

```bash
npm install --prefix frontend
npm install --prefix backend
```

### 2. Environment variables

**Backend** — copy and edit:

```bash
cp backend/.env.example backend/.env
```

**Frontend** — copy and edit:

```bash
cp frontend/.env.example frontend/.env.local
```

See [Environment variables](#environment-variables) below.

### 3. Database migrations

Run SQL scripts **in order** in the Supabase SQL editor (or via your CI migration runner):

```
backend/db/migrations/
  README.md
  001_org_users_must_change_password.sql
  002_org_users_profile_image_url.sql
  003_org_users_last_login.sql
  004_org_enrollment_settings.sql
  005_add_attempt_ordinal_columns.sql
  006_migrate_studentanswers_optionid_to_uuid.sql
```

Scripts use `IF NOT EXISTS` / idempotent patterns where possible. Re-running is generally safe; always test on a staging project first.

**SuperAdmin bootstrap:** run `007_createSuperAdmin.sql` manually in ops environments only (contains placeholder credentials — change before use).

Legacy copies also exist in `backend/scripts/`; prefer `backend/db/migrations/` for new deployments.

### 4. Create SuperAdmin (first time)

1. Run migration `007_createSuperAdmin.sql` **or** use `backend/scripts/createSuperAdmin.js` if present.
2. Log in at `/admin/login` with the configured credentials.
3. Change the default password immediately.

### 5. Start services

Terminal 1 — API:

```bash
npm run start:backend
# listens on http://localhost:3001
# verify: curl http://localhost:3001/health
```

Terminal 2 — frontend:

```bash
npm run start:frontend
# opens http://localhost:3000
```

From repo root, `npm start` runs **frontend only**; backend must be started separately.

### 6. Verify build

```bash
npm run build
```

Production static files output to `frontend/build/`.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (server only — never expose to browser) |
| `JWT_SECRET` | Yes | Min 32 characters; signs session tokens |
| `JWT_EXPIRES_IN` | No | Default `7d` |
| `PORT` | No | Default `3001` |
| `NODE_ENV` | No | `development` or `production` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `REACT_APP_API_URL` | Yes | Backend origin, e.g. `https://api.yourdomain.com` |

No Supabase keys are required in the frontend.

---

## CI (GitHub Actions)

On every push/PR to `main` or `master`, [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs:

| Job | What it checks |
|-----|----------------|
| **Frontend build** | `npm ci` + `npm run build` in `frontend/` |
| **Backend smoke** | Starts API with placeholder Supabase env; asserts `GET /health` and `GET /api/profile` → 401 without token |

### Run smoke tests locally

```bash
npm run test:smoke          # from repo root
# or
cd backend && npm run test:smoke
```

### Optional full auth smoke

With real Supabase + SuperAdmin credentials:

```bash
cd backend
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
SMOKE_ADMIN_EMAIL=admin@example.com SMOKE_ADMIN_PASSWORD=... \
npm run test:smoke
```

For GitHub Actions, add repository **Secrets**:

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Real project URL (full smoke only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (full smoke only) |
| `SMOKE_ADMIN_EMAIL` | SuperAdmin email for login smoke |
| `SMOKE_ADMIN_PASSWORD` | SuperAdmin password |

If these secrets are not set, CI still passes the basic smoke job.

---

## Production checklist

### Infrastructure

- [ ] Supabase project provisioned (prod)
- [ ] All migrations in `backend/db/migrations/` applied in order
- [ ] SuperAdmin created; default passwords rotated
- [ ] Backend deployed (Node service, e.g. EC2, ECS, Railway, Render)
- [ ] Frontend built (`npm run build`) and served as static files (S3 + CloudFront, Nginx, etc.)
- [ ] `REACT_APP_API_URL` points to production API at **build time**
- [ ] HTTPS on both frontend and API
- [ ] CORS: confirm API allows your frontend origin (currently open `cors()` — tighten for prod if needed)

### Secrets

- [ ] `JWT_SECRET` is unique per environment and stored in secrets manager
- [ ] `SUPABASE_SERVICE_ROLE_KEY` never committed or exposed to client
- [ ] `.env` files in `.gitignore` (never commit real secrets)

### Smoke tests (manual)

- [ ] `GET /health` returns `{ "status": "ok" }`
- [ ] SuperAdmin login → admin dashboard loads
- [ ] Org signup or org login → org dashboard loads
- [ ] Student login → student portal loads
- [ ] Profile page loads for logged-in user
- [ ] Notifications bell loads without 401

### Automated (CI)

- [x] GitHub Actions: frontend build on every PR — see [DEPLOYMENT.md § CI](../docs/DEPLOYMENT.md#ci-github-actions)
- [x] API smoke: `/health` + unauthenticated `/api/profile` guard
- [ ] Optional: full login + profile smoke (add GitHub secrets)

---

## AWS-shaped deployment (reference)

Typical handoff layout (adjust to your account):

| Component | Suggestion |
|-----------|------------|
| Frontend | S3 bucket + CloudFront |
| API | ECS Fargate or EC2 + ALB |
| Database | Supabase (managed) or RDS if migrating off Supabase |
| Secrets | AWS Secrets Manager → injected as env at runtime |
| DNS | Route 53 → CloudFront (app) + ALB (API) |

See [tech.md](../tech.md) for stack summary.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| API 401 on all routes | Token missing/expired; login again |
| API 500 on DB calls | `SUPABASE_URL` / service key; Supabase project paused |
| Frontend calls wrong host | Rebuild after changing `REACT_APP_API_URL` |
| CORS errors | API URL must match; backend must be reachable |
| First-login loop | Run migration `001_*`; check `MustChangePassword` on user row |

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design
- [API_OVERVIEW.md](./API_OVERVIEW.md) — endpoint map
- [IMPROVEMENTS_TRACKER.md](./IMPROVEMENTS_TRACKER.md) — refactor phases
- [../Reference_Documents/Database_Schema.md](../Reference_Documents/Database_Schema.md) — table reference
