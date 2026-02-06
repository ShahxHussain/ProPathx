import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey || supabaseUrl === 'your_supabase_project_url' || supabaseServiceKey === 'your_supabase_service_role_key') {
  console.error('Missing or invalid Supabase configuration!');
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  console.error('See backend/SETUP.md for instructions.');
  process.exit(1);
}

// Use service role key for backend operations (bypasses RLS)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export default supabase;

