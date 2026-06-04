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

/** Warn once at startup if Supabase is unreachable (DNS / network / paused project). */
export async function warnIfSupabaseUnreachable() {
  try {
    const host = new URL(supabaseUrl).hostname;
    const { error } = await supabase.from('Organizations').select('OrgID').limit(1);
    if (error) {
      const msg = `${error.message || ''} ${error.details || ''}`.toLowerCase();
      if (msg.includes('fetch failed') || msg.includes('enotfound') || msg.includes('econnrefused')) {
        console.error(
          `\n⚠️  Supabase unreachable at ${host}. API calls will fail until this is fixed.\n` +
            '   → Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env\n' +
            '   → Confirm the project is active in the Supabase dashboard\n' +
            '   → Check internet / VPN / firewall\n'
        );
      }
    }
  } catch (err) {
    console.error('⚠️  Supabase startup check failed:', err.message);
  }
}

export default supabase;

