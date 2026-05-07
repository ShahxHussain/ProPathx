# ProPath SaaS Domain and Hosting Strategy

This document gives a practical recommendation for domain purchase and hosting architecture for ProPath as a SaaS product, especially with image/figure-based MCQ content and potentially high concurrent users.

---

## 1) Product context and constraints

- MCQs can include images/figures, so static asset delivery must be fast and cheap.
- SaaS model means tenant growth can be uneven (sudden onboarding spikes possible).
- Test attempts are latency sensitive: auth, assignment check, start attempt, submit.
- Uptime and data safety are critical for exam workflows.

---

## 2) Domain recommendation

## Primary domain strategy

- Buy one clean brand domain for app + website, for example:
  - `propath.pk` (Pakistan-first)
  - `propath.ai` (AI/edtech branding)
  - `propath.app` (product-centric)
- If budget allows, also buy nearby variants to prevent brand confusion:
  - `propath.com`, `propath.co`, typo variants.

## Registrar recommendation (priority order)

1. Cloudflare Registrar (best long-term if available for chosen TLD)
2. Namecheap
3. GoDaddy (only if needed for specific TLD/promotions)

## DNS and routing layout

- `app.yourdomain` -> Frontend app
- `api.yourdomain` -> Backend API
- `assets.yourdomain` -> CDN/media bucket
- `www.yourdomain` -> Marketing/landing

Use Cloudflare DNS + WAF in front for DDoS/basic bot protection.

---

## 3) Recommended hosting architecture

## Recommended stack (balanced for growth + operations)

- Frontend (React): Vercel or Netlify
- Backend (Node/Express): Render / Railway / Fly.io (start), move to AWS ECS if needed
- Database/Auth: Supabase Postgres (already aligned with current codebase)
- Media storage (MCQ images): S3-compatible object storage + CDN
  - AWS S3 + CloudFront (enterprise standard), or
  - Cloudflare R2 + Cloudflare CDN (cost efficient egress)
- Caching/session/rate-limit store: Redis (Upstash/ElastiCache)
- Logs/monitoring: Sentry + uptime monitor + provider logs

## Why this is suitable for image-heavy MCQ SaaS

- Images are served from object storage/CDN, not from backend server disk.
- API servers remain focused on auth/business logic and can scale independently.
- CDN reduces latency for users across regions and controls bandwidth cost.

---

## 4) Region and performance guidance

- If your primary users are in Pakistan, keep DB and backend in nearest low-latency region:
  - AWS Bahrain (`me-south-1`) or Mumbai (`ap-south-1`) - choose based on real latency tests from Karachi/Lahore/Islamabad.
- Do a small benchmark before finalizing region:
  - run 24-hour p95 latency checks from Pakistan ISPs to both candidate regions.
- Keep frontend global via CDN edge.
- Keep media bucket and CDN in same geography strategy as backend to reduce origin latency.

Target baseline SLO:

- API p95 < 400ms for regular routes
- Start attempt p95 < 600ms
- Image load p95 < 1.5s (optimized/compressed)
- Uptime >= 99.9%

---

## 5) Security and compliance baseline

- Enforce HTTPS everywhere.
- Use signed upload URLs for question/media uploads.
- Validate MIME type and file size server-side.
- Malware scan for uploaded files (at least async scanning for public access files).
- Add rate limiting on:
  - login
  - start attempt
  - submit attempt
  - media upload
- Enable DB backups + point-in-time recovery.
- Keep secrets in hosting secret manager (never in repo).

---

## 6) Multi-tenant SaaS readiness

- Keep tenant/org isolation strict at query level (`OrgID` checks).
- Add per-tenant usage limits (tests, storage, attempts/day) in DB-backed counters.
- Store media paths with tenant prefixes:
  - `org/{orgId}/questions/{questionId}/...`
- Add queue/worker for heavy jobs (image processing, report generation, notifications).

---

## 7) Cost-aware phased rollout

## Phase 1 (0 to 2k monthly active users)

- Frontend: Vercel Pro
- Backend: Render/Railway single service + autoscaling
- DB/Auth: Supabase Pro
- Storage/CDN: Cloudflare R2 + CDN
- Monitoring: Sentry + basic uptime checks

## Phase 2 (2k to 20k MAU, more orgs and concurrent tests)

- Backend split:
  - API service
  - async worker service
- Add Redis cache/rate limit store
- Add read-optimized queries and indexes for assignments/attempts
- Add alerting dashboard (latency, error rate, queue depth)

## Phase 3 (20k+ MAU or high-stakes exam peaks)

- Move backend to AWS ECS/EKS (if needed)
- Managed Redis + managed queue
- Multi-AZ DB with stronger backup policy
- Blue/green deployment for zero-downtime releases

---

## 8) Final recommendation (what to do now)

1. Buy domain:
   - Primary: `propath.pk` (or your preferred brand equivalent)
   - Reserve: `propath.com` if budget allows.
2. Use Cloudflare for DNS, SSL, and WAF.
3. Keep current Supabase-centric backend architecture.
4. Host frontend on Vercel and backend on Render/Railway initially.
5. Move all MCQ image uploads to object storage + CDN immediately.
6. Add Redis rate limiting before scaling marketing/sales.

---

## 9) Quick decision matrix

| Area | Start now | Scale later |
|------|-----------|-------------|
| Domain | Cloudflare Registrar + `.pk/.com` | Buy defensive variants |
| Frontend | Vercel | Keep (usually no migration needed) |
| Backend | Render/Railway/Fly | AWS ECS/EKS when ops maturity needed |
| DB/Auth | Supabase | Supabase scaling tier or dedicated Postgres |
| Media | R2/S3 + CDN | Same pattern, larger bucket/CDN policy |
| Cache | Optional at very small load | Redis required at moderate load |

---

## 11) Pakistan-specific notes

- Payment stack planning:
  - Keep global option ready (Stripe Atlas route or international entity), but for local onboarding also evaluate local rails/gateways (for example bank transfer + manual verification initially).
- Legal/privacy:
  - Add clear terms for data retention and exam attempt logs, especially for institutions.
- Ops:
  - Keep WhatsApp/email incident communication runbook for exam windows (local expectation is fast support response).

---

## 10) Implementation checklist (next 2 weeks)

- [ ] Domain purchase and DNS setup
- [ ] `app`, `api`, `assets` subdomain mapping
- [ ] Object storage bucket + private/public policy design
- [ ] Signed upload endpoint for question images
- [ ] Image optimization pipeline (resize/compress/webp)
- [ ] CDN cache headers for media assets
- [ ] Basic rate limiting on auth/attempt routes
- [ ] Backup and restore drill (at least one test restore)
- [ ] Monitoring alerts: 5xx spikes, high latency, failed logins

---

If needed, create a separate `Deployment_Runbook.md` with provider-by-provider exact steps (Cloudflare + Vercel + Render + Supabase) and environment variable templates.
