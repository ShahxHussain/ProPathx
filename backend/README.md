# ProPath Backend API

Organization authentication and user management API for ProPath multi-tenant exam platform.

## Project layout

```
backend/
  config/       Supabase client
  middleware/   Auth, validation
  routes/       Thin HTTP handlers (mount in routes/index.js)
    org/        Org-scoped routes (auth, users, students, groups, settings, tests/)
    shared/     Cross-portal routes (profile, questions, notifications, reviewers)
    student/    Student portal
    admin/      SuperAdmin
  db/
    migrations/ Ordered SQL for Supabase
  services/     Business logic — see services/README.md
  utils/        Shared low-level helpers (JWT, password, logging)
```

New features: add logic in `services/`, wire it from a route handler.

## Setup

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (bypasses RLS)
   - `JWT_SECRET`: A secure random string (min 32 characters)
   - `PORT`: Server port (default: 3001)

3. **Start the server:**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

4. **Smoke test (optional):**
   ```bash
   npm run test:smoke
   ```
   See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md#ci-github-actions) for full auth smoke with env vars.

## API Endpoints

### Authentication

#### POST `/api/org/auth/signup`
Organization self-signup.

**Request Body:**
```json
{
  "orgName": "ProPath Academy",
  "orgEmail": "contact@org.com",
  "password": "securepassword123",
  "phone": "+92 300 0000000",
  "address": "123 Main Street"
}
```

**Note:** The organization email and password will be used to create the OrgAdmin account. The organization itself acts as the OrgAdmin.

**Response:**
```json
{
  "message": "Organization created successfully",
  "organization": {
    "orgId": "uuid",
    "orgName": "ProPath Academy",
    "orgEmail": "contact@org.com"
  },
  "admin": {
    "userId": "uuid",
    "email": "contact@org.com",
    "role": "OrgAdmin"
  }
}
```

#### POST `/api/org/auth/login`
Organization/OrgUser login.

**Request Body:**
```json
{
  "email": "admin@org.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "jwt_token_here",
  "user": {
    "userId": "uuid",
    "fullName": "Fatima Ali",
    "email": "admin@org.com",
    "role": "OrgAdmin",
    "orgId": "uuid",
    "orgName": "ProPath Academy",
    "mustChangePassword": false
  }
}
```

When `mustChangePassword` is `true` (SuperAdmin- or OrgAdmin-created accounts), the client must call `POST /api/org/auth/first-password` before other org APIs. Run migration `001_org_users_must_change_password.sql` from `backend/db/migrations/` in Supabase first.

#### POST `/api/org/auth/first-password`
Set password on first login (Bearer token required; no current password).

**Request Body:** `{ "newPassword": "...", "confirmPassword": "..." }`

### User Management (OrgAdmin only)

#### POST `/api/org/users`
Create Reviewer or Subject Expert user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "fullName": "Ahmed Khan",
  "email": "reviewer@org.com",
  "password": "securepassword123",
  "phone": "+92 300 0000000",
  "role": "Reviewer"
}
```

**Response:**
```json
{
  "message": "User created successfully",
  "user": {
    "userId": "uuid",
    "fullName": "Ahmed Khan",
    "email": "reviewer@org.com",
    "role": "Reviewer",
    "status": "Active"
  }
}
```

#### GET `/api/org/users`
List all users in organization.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "users": [
    {
      "OrgUserID": "uuid",
      "FullName": "Fatima Ali",
      "Email": "admin@org.com",
      "Role": "OrgAdmin",
      "Status": "Active",
      "CreatedAt": "2024-01-01T00:00:00Z",
      "LastLogin": "2024-01-01T00:00:00Z"
    }
  ]
}
```

## Security Features

- **Password Hashing**: bcrypt with 12 salt rounds
- **JWT Authentication**: Secure token-based auth
- **Role-Based Access Control**: Middleware enforces OrgAdmin-only routes
- **Tenant Isolation**: Users can only access their organization's data
- **Input Validation**: express-validator for request validation
- **Audit Logging**: All critical actions logged to `Logs` table

## Database Schema

The API uses the following tables:
- `Organizations`: Organization records
- `OrgUsers`: Organization user accounts
- `Logs`: Audit trail

See `Related_Documents/Database_Schema.md` for full schema details.

## JWT Token Structure

```json
{
  "actorType": "Organization",
  "orgId": "uuid",
  "orgUserId": "uuid",
  "role": "OrgAdmin",
  "iat": 1234567890,
  "exp": 1234567890,
  "iss": "propath-api",
  "aud": "propath-client"
}
```

## Error Responses

All errors follow this format:
```json
{
  "error": "Error message",
  "details": "Additional details (in development mode)"
}
```

Common status codes:
- `400`: Validation error
- `401`: Authentication required/invalid
- `403`: Insufficient permissions
- `404`: Resource not found
- `409`: Conflict (e.g., email already exists)
- `500`: Internal server error

