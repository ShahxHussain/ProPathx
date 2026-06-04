# ProPath Frontend

React SPA (Create React App) for the ProPath exam platform.

## Setup

```bash
npm install
```

Create `.env.local`:

```env
REACT_APP_API_URL=http://localhost:3001
```

All data goes through the Express API (`../backend/`). The browser does not connect to Supabase directly.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Dev server (port 3000) |
| `npm run build` | Production build → `build/` |
| `npm test` | Jest tests |

From the **repo root**, you can also run `npm start` (delegates to this folder).

API server: see `../backend/README.md`.

## Source layout

```
src/
  api/           Domain API modules (barrel: services/api.js)
  app/           Router shell (AppRoutes composes feature routes)
  features/      Domain modules — see features/README.md
  pages/         Legacy page paths (re-exports during migration)
  components/    Shared UI and layouts
```

## Org Admin UI

Design patterns, CSS imports, and page templates for the organization portal:

**[docs/ORG_ADMIN_UI.md](docs/ORG_ADMIN_UI.md)**
