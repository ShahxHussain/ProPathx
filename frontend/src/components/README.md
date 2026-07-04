# Shared components

Reusable UI used across role portals. Feature-specific pages live under `src/features/*/pages/`; only cross-cutting UI belongs here.

```
components/
  admin/       SuperAdmin-only (login form, oversight notice)
  auth/        Public login & signup forms (org + student)
  billing/     Subscription checkout (simulated payment step)
  common/      Shell chrome (profile menu, notifications, announcements, avatar)
  expert/      Subject Expert shared widgets (bulk CSV upload)
  latex/       LaTeX editor, preview, and renderer
  layouts/     Role portal shells (sidebar, header, outlet)
  org/         OrgAdmin shared widgets (assign test panel)
```

Import by folder, e.g. `import LaTeXRenderer from '../../components/latex/LaTeXRenderer'`.
