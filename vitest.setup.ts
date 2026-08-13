// Placeholder values so modules that construct the Supabase client at import
// time (src/lib/supabase.ts throws without these) can be imported by tests
// that only need a pure function from the same file — no real network call
// happens just from calling createClient().
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://test-placeholder.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'test-placeholder-anon-key';
