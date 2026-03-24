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

    const finalizeSession = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (cancelled) {
          return;
        }

        if (!error) {
          router.replace(nextPath);
          return;
        }

        console.error('Failed to exchange auth code', error);
      }

      const { data, error } = await supabase.auth.getSession();

      if (cancelled) {
        return;
      }

      if (error) {
        console.error('Failed to load session', error);
        setMessage('Sign-in failed. Redirecting to the home page...');
        setTimeout(() => router.replace('/'), 1500);
        return;
      }

      if (!data.session) {
        setMessage('Completing sign-in...');
        setTimeout(() => router.replace('/'), 5000);
        return;
      }

      router.replace(nextPath);
    };

    finalizeSession();
    return () => {
      cancelled = true;
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
