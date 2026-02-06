# ProPath - Multi-Tenant Exam Platform

Organization authentication and user management system for ProPath exam platform.

## Project Structure

```
propath/
├── backend/              # Node.js/Express API server
│   ├── config/          # Database configuration
│   ├── middleware/      # Auth & validation middleware
│   ├── routes/          # API routes
│   ├── utils/           # Utilities (JWT, password, logger)
│   └── server.js        # Express server entry point
├── src/                 # React frontend
│   ├── components/      # React components
│   ├── services/        # API service layer
│   └── utils/           # Frontend utilities
└── Related_Documents/  # Project documentation
```

## Quick Start

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your Supabase credentials:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   JWT_SECRET=your_secure_random_string_min_32_chars
   PORT=3001
   ```

4. **Start the server:**
   ```bash
   npm start
   # or for development:
   npm run dev
   ```

### Frontend Setup

1. **Install dependencies (from root):**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Create `.env.local` in the root directory:
   ```env
   REACT_APP_API_URL=http://localhost:3001
   ```

3. **Start the development server:**
   ```bash
   npm start
   ```

## Features

### ✅ Organization Self-Signup
- Organizations can register themselves (no SuperAdmin required)
- Creates organization and initial OrgAdmin user atomically
- Email uniqueness validation
- Password hashing with bcrypt

### ✅ Organization Login
- Login using OrgUser credentials
- JWT token generation
- Role-based redirects (OrgAdmin, Reviewer, Subject Expert)
- LastLogin tracking

### ✅ User Management (OrgAdmin)
- Create Reviewer users
- Create Subject Expert users
- List all organization users
- Tenant isolation enforced

### ✅ Security
- JWT-based authentication
- Role-based access control (RBAC)
- Password hashing (bcrypt, 12 rounds)
- Input validation
- Audit logging
- Tenant isolation

## API Documentation

See `backend/README.md` for complete API documentation.

## Database Schema

See `Related_Documents/Database_Schema.md` for full database schema.

## Technology Stack

**Backend:**
- Node.js + Express
- Supabase (PostgreSQL)
- JWT (jsonwebtoken)
- bcrypt
- express-validator

**Frontend:**
- React
- Fetch API

## Development

### Running Both Servers

**Terminal 1 (Backend):**
```bash
cd backend
npm run dev
```

**Terminal 2 (Frontend):**
```bash
npm start
```

### Testing

1. **Organization Signup:**
   - Navigate to signup form
   - Fill organization and admin details
   - Submit to create organization

2. **Login:**
   - Use admin email and password
   - Get JWT token
   - Redirected to role-based dashboard

3. **Create Users (OrgAdmin):**
   - After login, use API to create Reviewer/Subject Expert
   - Users can then login with their credentials

## Environment Variables

### Backend (.env)
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (bypasses RLS)
- `JWT_SECRET`: Secret for JWT signing (min 32 chars)
- `JWT_EXPIRES_IN`: Token expiration (default: 7d)
- `PORT`: Server port (default: 3001)

### Frontend (.env.local)
- `REACT_APP_API_URL`: Backend API URL (default: http://localhost:3001)

## Security Notes

- **Service Role Key**: Only use in backend, never expose to frontend
- **JWT Secret**: Use a strong random string (32+ characters)
- **Password Policy**: Minimum 8 characters (enforced in validation)
- **HTTPS**: Use HTTPS in production
- **CORS**: Configure CORS appropriately for production

## License

Private - ProPath Platform
