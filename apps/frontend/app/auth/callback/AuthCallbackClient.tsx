'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, Chip, Spinner } from '@heroui/react';

interface AuthCallbackClientProps {
  nextPath: string;
  code: string | null;
}

export default function AuthCallbackClient({ nextPath, code }: AuthCallbackClientProps) {
  const router = useRouter();
  const [message, setMessage] = useState('Finishing sign-in...');

  useEffect(() => {
    let cancelled = false;

    // First attempt to exchange code if PKCE flow is used
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) console.error('Failed to exchange auth code', error);
      });
    }

    // Subscribe to auth state changes to detect when the session is ready
    // (useful for implicit grant where tokens are in the URL hash)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      
      if (session) {
        router.replace(nextPath);
      }
    });

    // Fallback: check session immediately just in case it's already there
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (cancelled) return;
      
      if (error) {
        console.error('Failed to load session', error);
        setMessage('Sign-in failed. Redirecting to the home page...');
        setTimeout(() => router.replace('/'), 1500);
      } else if (session) {
        router.replace(nextPath);
      } else {
        // If no session yet, wait for onAuthStateChange to fire.
        // We set a timeout as a fail-safe in case auth fails silently.
        setTimeout(() => {
          if (!cancelled) {
            setMessage('Sign-in took too long. Returning home...');
            setTimeout(() => router.replace('/'), 1500);
          }
        }, 10000); // 10 second timeout
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [code, nextPath, router]);

  return (
    <main className="min-h-screen px-6 py-10 text-white">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-xl items-center justify-center">
        <Card className="w-full border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Header className="px-8 pt-8">
            <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/60">
              Spotify OAuth
            </Chip>
          </Card.Header>
          <Card.Content className="flex flex-col items-center gap-5 px-8 pb-10 text-center">
            <Spinner size="lg" />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-[-0.04em]">Finishing sign-in</h1>
              <p className="max-w-sm text-sm leading-6 text-white/55">{message}</p>
            </div>
          </Card.Content>
        </Card>
      </div>
    </main>
  );
}
