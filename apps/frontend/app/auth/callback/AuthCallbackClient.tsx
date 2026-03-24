'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

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
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-indigo-800 to-blue-900 text-white px-6">
      <div className="max-w-md rounded-2xl border border-white/20 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-lg">
        <h1 className="text-2xl font-bold mb-3">Spotify sign-in</h1>
        <p className="text-gray-200">{message}</p>
      </div>
    </main>
  );
}
