/**
 * Quick script to generate bcrypt hash for a password
 * Usage: node backend/scripts/generateHash.js
 */

import bcrypt from 'bcrypt';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function generateHash() {
  try {
    const password = await question('Enter password to hash: ');
    
    if (!password) {
      console.error('❌ Password is required!');
      process.exit(1);
    }

    console.log('\n⏳ Generating hash (this may take a moment)...\n');
    
    const hash = await bcrypt.hash(password, 12);
    
    console.log('✅ Password hash generated:\n');
    console.log(hash);
    console.log('\n📋 Copy this hash and use it in your SQL INSERT statement.\n');
    
    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    rl.close();
    process.exit(1);
  }
}

generateHash();

