# ProPath GCP Migration Runbook

This runbook explains how to migrate ProPath to Google Cloud safely, with two practical options:

1. **Hybrid (recommended first):** App on GCP, DB stays on Supabase.
2. **Full migration:** App + DB on GCP (Cloud SQL for PostgreSQL).

---

## 1) Current context (ProPath)

ProPath currently relies on:
- React frontend
- Node/Express backend
- Supabase Postgres data model (core source of truth)
- Role-based and subscription-heavy business logic

Because of this, the safest strategy is phased migration with verification gates.

---

## 2) Decision options

## Option A: Hybrid (fastest + lowest risk)

### What moves
- Frontend -> GCP hosting
- Backend -> GCP Cloud Run
- Database -> remains Supabase Postgres

### Why choose this first
- No DB cutover risk
- Fast stakeholder progress toward GCP
- Lets team stabilize infra/CI/CD before touching data plane

---

## Option B: Full GCP migration

### What moves
- Frontend + backend -> GCP
- Supabase Postgres -> Cloud SQL PostgreSQL

### Why/when
- Enterprise governance and centralized cloud ops
- Cost/control optimization at scale
- Reduced cross-provider dependencies

---

## 3) Recommended phased plan

### Phase 1: Move compute to GCP (Hybrid)
1. Deploy backend to Cloud Run.
2. Keep existing Supabase DB connection string.
3. Deploy frontend to Firebase Hosting or Cloud Run static setup.
4. Confirm all critical flows (auth, subscriptions, tests, attempts, results).

### Phase 2: Prepare DB migration (staging)
1. Create Cloud SQL PostgreSQL staging instance.
2. Dump Supabase DB and restore into Cloud SQL staging.
3. Point staging backend to Cloud SQL.
4. Validate schema/data and run QA.

### Phase 3: Production DB cutover
1. Schedule maintenance window.
2. Freeze writes.
3. Take final incremental dump + restore.
4. Switch production backend `DATABASE_URL`.
5. Unfreeze writes and monitor.

---

## 4) GCP target architecture

- **Frontend:** Firebase Hosting (or Cloud Run static)
- **Backend APIs:** Cloud Run (Node/Express container)
- **DB:** Cloud SQL for PostgreSQL
- **Secrets:** Secret Manager
- **Observability:** Cloud Logging + Cloud Monitoring + alerting
- **Media (recommended):** Cloud Storage + Cloud CDN
- **Optional async jobs:** Pub/Sub + Cloud Run jobs

---

## 5) Full DB migration - command-level checklist

> Use a disposable machine/runner with secure network access.  
> Replace placeholders like `<...>` before running.

## 5.1 Prerequisites
- Install:
  - `gcloud`
  - `psql`
  - `pg_dump`
  - `pg_restore`
- Access:
  - Supabase DB credentials
  - GCP project IAM with Cloud SQL Admin + Secret access

## 5.2 Create Cloud SQL PostgreSQL
1. Create instance in preferred region (close to users).
2. Create database `propath`.
3. Create DB user with strong password.
4. Configure private IP / authorized networks per security policy.

## 5.3 Export from Supabase
```bash
pg_dump "<SUPABASE_DATABASE_URL>" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file=propath.dump
```

## 5.4 Import into Cloud SQL
```bash
pg_restore \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --dbname="<CLOUDSQL_DATABASE_URL>" \
  propath.dump
```

## 5.5 Validate restore
```bash
psql "<CLOUDSQL_DATABASE_URL>" -c "\dt"
psql "<CLOUDSQL_DATABASE_URL>" -c "SELECT COUNT(*) FROM \"Users\";"
psql "<CLOUDSQL_DATABASE_URL>" -c "SELECT COUNT(*) FROM \"Students\";"
psql "<CLOUDSQL_DATABASE_URL>" -c "SELECT COUNT(*) FROM \"Tests\";"
psql "<CLOUDSQL_DATABASE_URL>" -c "SELECT COUNT(*) FROM \"Questions\";"
```

Compare with Supabase counts.

---

## 6) App cutover steps

1. Put app in maintenance mode (or write lock).
2. Take final sync dump from Supabase.
3. Restore final sync to Cloud SQL.
4. Update backend env:
   - `DATABASE_URL=<CLOUDSQL_DATABASE_URL>`
5. Redeploy backend Cloud Run revision.
6. Smoke-test:
   - login
   - subscription plan listing
   - test create/attempt/result
   - student self-test flow
7. Disable maintenance mode.

---

## 7) Rollback plan (must be ready before cutover)

If P1/P2 issue appears within initial window:
1. Re-enable maintenance mode.
2. Revert backend `DATABASE_URL` to Supabase.
3. Redeploy previous stable revision.
4. Run smoke tests again.
5. Keep Cloud SQL snapshot for diff investigation.

Rollback must be executable within minutes.

---

## 8) Validation matrix (ProPath critical)

Run these after each migration stage:

1. **Auth**
- Org login
- Student login
- Role-based route access

2. **Subscriptions**
- Fetch plans
- Subscribe/unsubscribe
- Audience filtering correctness (Org/Student/Both)

3. **Assessments**
- Create test
- Assign test
- Attempt test
- Submit + result consistency

4. **Student flows**
- Dashboard load
- Assignments load
- Individual self-test options/preview/create

5. **Admin**
- Dashboard stats
- Subscription plans and exams linking
- Logs and maintenance settings

---

## 9) Security and ops baseline

- Do not store DB passwords in repo.
- Use Secret Manager for connection strings.
- Enable automated backups + point-in-time recovery.
- Set CPU/memory and connection limits for Cloud SQL.
- Add alerts for:
  - high DB CPU
  - connection saturation
  - API 5xx spikes
  - p95 latency regression

---

## 10) Suggested timeline

- **Week 1:** Hybrid GCP deployment (no DB move)
- **Week 2:** Staging DB migration + QA pass
- **Week 3:** Production cutover window + hypercare monitoring

---

## 11) Final recommendation

For ProPath, start with **Hybrid** now to reduce risk and show immediate GCP progress.  
Then move DB with a controlled Cloud SQL cutover once staging validation is clean.

