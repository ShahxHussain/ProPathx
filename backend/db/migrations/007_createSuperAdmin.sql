-- SQL Script to create Super Admin user manually
-- Replace the values below with your desired credentials
-- Password hash needs to be generated using bcrypt (12 rounds)

-- Option 1: Using SQL directly (you'll need to generate password hash separately)
-- You can use: node -e "const bcrypt = require('bcrypt'); bcrypt.hash('yourpassword', 12).then(h => console.log(h))"

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
  'System Administrator',           -- Change this
  'admin@propath.com',              -- Change this
  '$2b$12$YOUR_BCRYPT_HASH_HERE',  -- Generate this using bcrypt
  'SuperAdmin',
  '+92 300 0000000',                -- Optional
  'Active',
  now()
);

-- Option 2: If you want to use a simple password for testing
-- Generate hash for password "admin123" using: node backend/scripts/generateHash.js
-- Then replace the PasswordHash value above

-- To verify the user was created:
SELECT "UserID", "FullName", "Email", "Role", "Status", "CreatedAt"
FROM "Users"
WHERE "Role" = 'SuperAdmin';





