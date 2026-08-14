import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set — see .env.example');
}

// Plain browser defaults are enough here: localStorage session persistence,
// auto token refresh. Unlike the consumer app there is no deep-link OAuth
// callback or native SecureStore adapter to wire up — this is a browser-only
// tool with one sign-in method.
export const supabase = createClient(url, anonKey);
