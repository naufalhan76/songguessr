import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Create a Supabase client that reads the auth token from cookies.
 * Use this in API routes / server components so RLS policies apply.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        cookie: cookieStore.toString(),
      },
    },
    auth: {
      persistSession: false,
    },
  });
}

/**
 * Service-role client — bypasses RLS.  Use ONLY from trusted server code.
 * Returns an untyped client to avoid Supabase generic type inference issues.
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    // Fall back to anon client when service key is not configured
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}
