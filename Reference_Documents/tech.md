# ProPath Technical Stack (AWS Handoff) - FUTURE PLAN(next)

## Repository layout
- `frontend/` — React SPA (Create React App, `react-scripts`)
- `backend/` — Express API

## Core Stack
- Frontend: React (JavaScript), Create React App (`react-scripts`) in `frontend/`
- Backend: Node.js + Express.js (ES Modules) in `backend/`
- Database: Supabase (PostgreSQL)
- Auth: JWT bearer auth + role-based access

## Key Libraries
- Frontend: `react-router-dom`, `lucide-react`, `framer-motion`, `recharts`, `katex`
- Backend: `@supabase/supabase-js`, `bcrypt`, `express-validator`, `cors`

## Runtime / Ports
- Frontend (dev): `3000` (CRA default)
- Backend: `3001` (or `PORT`)
- Package manager: `npm`
- Recommended Node version: `20 LTS`

## Required Environment Variables
**Backend** (`backend/.env`):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `PORT`
- `NODE_ENV`

**Frontend** (`frontend/.env.local`):
- `REACT_APP_API_URL`

## Main Roles
- SuperAdmin
- OrgAdmin
- Reviewer
- Subject Expert
- Student

## Deployment Shape
- Frontend static app
- Backend API service
- Supabase as managed DB/backend service