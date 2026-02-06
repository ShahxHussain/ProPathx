/**
 * Script to create a Super Admin user
 * Run with: node backend/scripts/createSuperAdmin.js
 */

import { supabase } from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function createSuperAdmin() {
  try {
    console.log('🔐 Super Admin Creation Script\n');
    console.log('Please provide the following information:\n');

    const fullName = await question('Full Name: ');
    const email = await question('Email: ');
    const password = await question('Password (min 8 characters): ');
    const phone = await question('Phone (optional, press Enter to skip): ');

    if (!fullName || !email || !password) {
      console.error('❌ Full Name, Email, and Password are required!');
      process.exit(1);
    }

    if (password.length < 8) {
      console.error('❌ Password must be at least 8 characters!');
      process.exit(1);
    }

    console.log('\n⏳ Creating Super Admin...\n');

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('Users')
      .select('UserID')
      .eq('Email', email)
      .single();

    if (existingUser) {
      console.error('❌ Email already exists in Users table!');
      process.exit(1);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create Super Admin
    const { data: newUser, error } = await supabase
      .from('Users')
      .insert({
        FullName: fullName,
        Email: email,
        PasswordHash: passwordHash,
        Role: 'SuperAdmin',
        Phone: phone || null,
        Status: 'Active',
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating Super Admin:', error.message);
      process.exit(1);
    }

    console.log('✅ Super Admin created successfully!\n');
    console.log('User Details:');
    console.log(`  UserID: ${newUser.UserID}`);
    console.log(`  Full Name: ${newUser.FullName}`);
    console.log(`  Email: ${newUser.Email}`);
    console.log(`  Role: ${newUser.Role}`);
    console.log(`  Status: ${newUser.Status}\n`);
    console.log('🔗 Login URL: http://localhost:3000/admin/login\n');
    console.log('⚠️  Keep these credentials secure!');

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    rl.close();
    process.exit(1);
  }
}

createSuperAdmin();

