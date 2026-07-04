# Backend ops scripts

One-off utilities for local setup. Database schema changes belong in **`backend/db/migrations/`** (run in numeric order).

| Script | Purpose |
|--------|---------|
| `generateHash.js` | Generate a bcrypt hash for manual SQL or config (`node backend/scripts/generateHash.js`) |
| `createSuperAdmin.js` | Interactive SuperAdmin bootstrap via Supabase (`node backend/scripts/createSuperAdmin.js`) |

See [db/migrations/README.md](../db/migrations/README.md) and [Reference_Documents/DEPLOYMENT.md](../../Reference_Documents/DEPLOYMENT.md).
