# ProPath Frontend

React SPA (Create React App) for the ProPath exam platform.

## Setup

```bash
npm install
```

Create `.env.local`:

```env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Dev server (port 3000) |
| `npm run build` | Production build → `build/` |
| `npm test` | Jest tests |

From the **repo root**, you can also run `npm start` (delegates to this folder).

API server: see `../backend/README.md`.
