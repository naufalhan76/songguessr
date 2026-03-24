'use client';

import { useEffect, useState, useRef } from 'react';
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

  const exchangeAttempted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    
    // Check if there's an error in the URL hash (from implicit flow)
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      const errDesc = params.get('error_description') || 'Unknown OAuth Error';
      console.error('[Auth Debug] OAuth Error in hash:', errDesc);
      setMessage(`Spotify Sign-In Failed: ${errDesc.replace(/\+/g, ' ')}`);
      setTimeout(() => router.replace('/'), 5000);
      return;
    }

    const finalizeAuth = async () => {
      // Prevent double execution in React Strict Mode
      if (exchangeAttempted.current) {
        console.log('[Auth Debug] Exchange already attempted, skipping.');
        return;
      }
      exchangeAttempted.current = true;
      console.log('[Auth Debug] Starting finalizeAuth execution');

      // Ensure that we explicitly wait for the exchange if PKCE (code) is present
      if (code) {
        console.log('[Auth Debug] Code found in URL, attempting exchange CodeForSession...');
        const { error, data } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('[Auth Debug] Failed to exchange auth code:', error);
          if (!cancelled) {
            setMessage('Invalid or expired login link. Retrying...');
          }
        } else {
          console.log('[Auth Debug] exchangeCodeForSession succeeded!', data);
        }
      }

      console.log('[Auth Debug] Calling getSession() immediately...');
      // If we made it here (or if it was implicit flow without code), check session
      const { data: { session }, error } = await supabase.auth.getSession();
      console.log('[Auth Debug] getSession() response:', { session: session ? 'exists' : 'null', error });
      
      if (cancelled) return;

      if (error) {
        console.error('[Auth Debug] Failed to get session:', error);
        setMessage('Sign-in failed. Redirecting...');
        setTimeout(() => router.replace('/'), 2000);
        return;
      }

      if (session) {
        console.log('[Auth Debug] Valid session found immediately, redirecting to', nextPath);
        router.replace(nextPath);
        return;
      }

      // If there's still no session, wait a bit for implicit hash parsing 
      // via onAuthStateChange which might be happening concurrently
      console.log('[Auth Debug] No session found yet, waiting for onAuthStateChange or timeout...');
      setMessage('Finalizing...');
      setTimeout(() => {
        console.log('[Auth Debug] 3-second timeout hit. Re-checking session.');
        if (!cancelled) {
          supabase.auth.getSession().then(({ data, error }) => {
            console.log('[Auth Debug] Timeout getSession() result:', { session: !!data.session, error });
            if (data.session) {
              console.log('[Auth Debug] Session finally found, redirecting!');
              router.replace(nextPath);
            } else {
              console.error('[Auth Debug] No session after 3 seconds timeout. Redirecting home.');
              setMessage('Sign-in took too long. Returning home...');
              setTimeout(() => router.replace('/'), 2000);
            }
          });
        }
      }, 3000);
    };

    // Also listen for change immediately in case it happens while we wait
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth Debug] onAuthStateChange fired!', { event, session: !!session });
      if (session && !cancelled) {
        console.log('[Auth Debug] Valid session received from onAuthStateChange event, redirecting to', nextPath);
        router.replace(nextPath);
      }
    });

    finalizeAuth();

    return () => {
      console.log('[Auth Debug] AuthCallbackClient unmounting');
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
