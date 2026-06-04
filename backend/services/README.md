# Backend services layer

Business logic lives here. **Routes** should stay thin: parse request, call a service, map result to HTTP status/body.

## Layout

| Module | Responsibility |
|--------|----------------|
| `systemSettingsService.js` | `SystemSettings` read/write, maintenance defaults |
| `orgAuthService.js` | Org user login payload (JWT + client user object) |
| `logsService.js` | Audit log queries, actor enrichment |
| `healthMetricsService.js` | Pure health SLI helpers (percentile, request buckets) |
| `testsService.js` | Org test domain rules (binding, weightage, usage counters, assignments eligibility) |
| `profileService.js` | Load/update profile and password for all actor types |

Add new domains as `somethingService.js` under this folder — not inside `routes/`.

## Conventions

1. Services **do not** import `express` or touch `req` / `res`.
2. Throw errors with `status` and optional `details` for routes to forward.
3. Use `config/database.js` (Supabase service role) for DB access.
4. Reusable low-level helpers stay in `utils/`; orchestration and domain rules stay in `services/`.
5. When migrating old routes, move logic into a service and leave a small handler in the route file.

## Example route handler

```javascript
import { listLogs } from '../../services/logsService.js';

router.get('/logs', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await listLogs(req.query);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Internal server error',
      details: error.details,
    });
  }
});
```
