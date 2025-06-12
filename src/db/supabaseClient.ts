import { createClient } from '@supabase/supabase-js';
import config from '../config';

// Initialize Supabase client with service role key for full access
export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey
);

// Initialize Supabase client with anon key for auth operations
export const supabaseAuth = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey
);

// Re-enable temporary diagnostic query to confirm fix
async function testSupabaseConnection() {
  try {
    console.log('[supabaseClient] Attempting diagnostic query to fetch one company...');
    const { data, error } = await supabase.from('companies').select('id').limit(1).single();
    if (error && error.code !== 'PGRST116') { // PGRST116: 0 rows, which is fine if table is empty
      console.error('[supabaseClient] Diagnostic query FAILED:', error);
    } else if (data) {
      console.log('[supabaseClient] Diagnostic query SUCCEEDED. Found company ID:', data.id);
    } else {
      console.log('[supabaseClient] Diagnostic query SUCCEEDED (no companies found, or table empty, which is OK).');
    }
  } catch (e) {
    console.error('[supabaseClient] Diagnostic query CRASHED:', e);
  }
}

testSupabaseConnection(); // Run the test
