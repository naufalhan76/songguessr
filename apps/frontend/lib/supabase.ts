import { createClient } from '@supabase/supabase-js';
import { Database } from '@songguessr/shared';

// These should be environment variables in production
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Helper to get user session
export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

// Helper to sign in with Spotify OAuth
export async function signInWithSpotify(redirectTo: string) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'spotify',
    options: {
      redirectTo,
      scopes: 'user-top-read user-read-recently-played',
    },
  });

  if (error) throw error;
  return data;
}

// Helper to sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}