# Backend Setup Guide

## Quick Start

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies (if not already done):**
   ```bash
   npm install
   ```

3. **Create `.env` file:**
   ```bash
   # Copy the example file
   cp .env.example .env
   
   # Or create manually with these variables:
   ```

4. **Edit `.env` file with your Supabase credentials:**
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   JWT_SECRET=your_secure_random_string_at_least_32_characters_long
   JWT_EXPIRES_IN=7d
   PORT=3001
   NODE_ENV=development
   ```

5. **Get your Supabase credentials:**
   - Go to your Supabase project dashboard
   - Settings → API
   - Copy the "Project URL" → `SUPABASE_URL`
   - Copy the "service_role" key (NOT the anon key) → `SUPABASE_SERVICE_ROLE_KEY`
   - Generate a secure random string for `JWT_SECRET` (use a password generator or: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

6. **Start the server:**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

7. **Verify it's running:**
   - You should see: `🚀 ProPath API server running on port 3001`
   - Visit: http://localhost:3001/health
   - Should return: `{"status":"ok","timestamp":"..."}`

## Troubleshooting

### Error: "Missing Supabase configuration"
- Make sure `.env` file exists in the `backend` directory
- Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Make sure there are no quotes around the values in `.env`

### Error: "Connection refused"
- Make sure the server is running (`npm start` in backend directory)
- Check that port 3001 is not already in use
- Verify `.env` file has correct values

### Error: "Invalid API key"
- Make sure you're using the **service_role** key, not the anon key
- Service role key starts with `eyJ...` and is much longer than the anon key
- Never expose the service_role key in frontend code!

## Testing the API

Once the server is running, you can test with:

```bash
# Health check
curl http://localhost:3001/health

# Signup (example)
curl -X POST http://localhost:3001/api/org/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "orgName": "Test Org",
    "orgEmail": "test@org.com",
    "password": "testpass123",
    "phone": "+1234567890"
  }'
```

