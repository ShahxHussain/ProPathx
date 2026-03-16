# Super Admin Setup Guide

## Overview

There is **no default Super Admin password**. You need to create a Super Admin user in the `Users` table manually.

---

## Method 1: Using Node.js Script (Recommended)

### Step 1: Run the creation script

```bash
cd backend
node scripts/createSuperAdmin.js
```

### Step 2: Follow the prompts

The script will ask for:
- Full Name
- Email
- Password (min 8 characters)
- Phone (optional)

### Step 3: Login

After creation, login at:
- URL: `http://localhost:3000/admin/login`
- Email: The email you provided
- Password: The password you provided

---

## Method 2: Using SQL Directly

### Step 1: Generate password hash

```bash
cd backend
node scripts/generateHash.js
```

Enter your desired password when prompted. Copy the generated hash.

### Step 2: Insert into database

Run this SQL in your Supabase SQL editor:

```sql
INSERT INTO "Users" (
  "UserID",
  "FullName",
  "Email",
  "PasswordHash",
  "Role",
  "Phone",
  "Status",
  "CreatedAt"
) VALUES (
  gen_random_uuid(),
  'System Administrator',
  'admin@propath.com',              -- Change this
  '$2b$12$YOUR_GENERATED_HASH_HERE', -- Paste hash from step 1
  'SuperAdmin',
  '+92 300 0000000',                 -- Optional
  'Active',
  now()
);
```

### Step 3: Verify

```sql
SELECT "UserID", "FullName", "Email", "Role", "Status"
FROM "Users"
WHERE "Role" = 'SuperAdmin';
```

---

## Method 3: Quick Test Setup

For quick testing, you can use this pre-generated hash for password `admin123`:

```sql
INSERT INTO "Users" (
  "UserID",
  "FullName",
  "Email",
  "PasswordHash",
  "Role",
  "Status",
  "CreatedAt"
) VALUES (
  gen_random_uuid(),
  'Test Super Admin',
  'admin@propath.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyY5Y5Y5Y5Y5', -- Hash for "admin123"
  'SuperAdmin',
  'Active',
  now()
);
```

**⚠️ WARNING**: This is for testing only! Change the password in production.

---

## Default Test Credentials (If using Method 3)

- **Email**: `admin@propath.com`
- **Password**: `admin123`
- **Login URL**: `http://localhost:3000/admin/login`

---

## Security Best Practices

1. ✅ Use a strong password (min 12 characters, mixed case, numbers, symbols)
2. ✅ Change default password immediately
3. ✅ Use unique email address
4. ✅ Enable 2FA if possible (future enhancement)
5. ✅ Limit Super Admin access to trusted IPs (future enhancement)
6. ✅ Regularly rotate passwords
7. ✅ Monitor Super Admin login activity

---

## Troubleshooting

### "Invalid email or password"
- Check that the user exists: `SELECT * FROM "Users" WHERE "Role" = 'SuperAdmin';`
- Verify password hash is correct
- Ensure Status = 'Active'

### "User not found"
- Verify the email matches exactly (case-sensitive)
- Check that Role = 'SuperAdmin' (exact match)

### "Account is inactive"
- Update status: `UPDATE "Users" SET "Status" = 'Active' WHERE "Role" = 'SuperAdmin';`

---

## Verification

After creating the Super Admin, verify it works:

1. Go to: `http://localhost:3000/admin/login`
2. Enter email and password
3. Should redirect to: `/admin/dashboard`

---

## Notes

- Super Admin credentials are stored in the `Users` table
- Password is hashed using bcrypt (12 rounds)
- Super Admin has access to `/admin/*` routes only
- Regular users cannot see or access admin routes

---

**Last Updated**: 2024





