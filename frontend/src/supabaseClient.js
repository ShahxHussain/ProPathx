import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Keep this guard so failures show early in console during dev.
  console.warn('Supabase credentials are missing. Check your .env settings.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

