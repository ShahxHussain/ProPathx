# Frontend features

Domain-oriented modules. Each feature can own **pages**, **routes**, and (over time) hooks/components for that area.

## Current features

| Folder | Contents | Pages still in `pages/` |
|--------|----------|-------------------------|
| `auth/` | Login, route guards, first-password welcome | — (migrated) |
| `profile/` | Cross-portal profile page | re-export at `pages/Profile.jsx` |
| `org/` | OrgAdmin route tree + all org screens | `features/org/pages/*` (canonical) |
| `student/` | Student route tree | student pages |
| `admin/` | SuperAdmin route tree | admin pages |
| `reviewer/` | Reviewer route tree | reviewer pages |
| `expert/` | Expert route tree | expert pages |

## Conventions

1. **New UI** for a domain → add under `features/<domain>/pages/`.
2. **Route trees** live in `features/<domain>/routes.jsx` and are composed in `app/AppRoutes.jsx`. Call them as `{OrgFeatureRoutes()}` — not `<OrgFeatureRoutes />` — so React Router receives `<Route>` children directly.
3. **API calls** use `src/api/*` (not inline fetch).
4. Keep co-located `.css` next to the page component.
5. OrgAdmin pages live under `features/org/pages/` only — do not add new files under `pages/org/`.

## Example layout

```
features/  org/
    routes.jsx          # Route definitions for /org/*
    pages/              # OrgAdmin screens (CSS co-located)
  components/         # (future) org-only UI
```

## Related

- Shared layouts: `components/layouts/`
- Shared chrome: `components/common/` (ProfileMenu, NotificationBell, AnnouncementBanner, UserAvatar)
- LaTeX: `components/latex/` · Auth forms: `components/auth/` · Billing: `components/billing/`
- API client: `api/` + barrel `services/api.js`
