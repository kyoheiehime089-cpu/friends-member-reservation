import { createClient } from '@supabase/supabase-js';

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  configuredSupabaseUrl && configuredSupabaseAnonKey
);

// Vercel runs Next.js static generation at build time. Supabase's client
// throws when either env value is missing, so use safe placeholders during
// build and let the UI explain that Supabase environment variables are needed.
const supabaseUrl = configuredSupabaseUrl || 'https://placeholder.supabase.co';
const supabaseAnonKey = configuredSupabaseAnonKey || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
