# Database migrations

Ordered SQL scripts for Supabase (PostgreSQL). Run **in numeric order** on each new environment.

## How to run

1. Open Supabase Dashboard → **SQL Editor**.
2. Run each file below in order (001 → 006 for schema; 007 is ops-only).
3. Confirm no errors; scripts use `IF NOT EXISTS` where applicable.

## Run order

| # | File | Purpose |
|---|------|---------|
| 001 | `001_org_users_must_change_password.sql` | `MustChangePassword` on OrgUsers |
| 002 | `002_org_users_profile_image_url.sql` | Avatar URL column |
| 003 | `003_org_users_last_login.sql` | LastLogin column |
| 004 | `004_org_enrollment_settings.sql` | Org enrollment settings table |
| 005 | `005_add_attempt_ordinal_columns.sql` | Attempt ordinal columns |
| 006 | `006_migrate_studentanswers_optionid_to_uuid.sql` | OptionID UUID migration |
| 007 | `007_createSuperAdmin.sql` | **Ops only** — bootstrap SuperAdmin; edit credentials before prod |

## Idempotency

- Prefer `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, etc.
- If a migration partially applied, inspect Supabase schema before re-running.
- Always test on **staging** before production.

## Legacy location

Older copies live in `backend/scripts/`. New deployments should use this folder only.

See also: [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and [Reference_Documents/Database_Schema.md](../../Reference_Documents/Database_Schema.md).
