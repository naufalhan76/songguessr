'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Finishing sign-in...');

  useEffect(() => {
    const nextPath = searchParams.get('next') || '/';
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace(nextPath);
      }
    });

    const finalizeSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Failed to load session', error);
        setMessage('Sign-in failed. Redirecting to the home page...');
        fallbackTimeout = setTimeout(() => router.replace('/'), 1500);
        return;
      }

      if (!data.session) {
        setMessage('Completing sign-in...');
        fallbackTimeout = setTimeout(() => router.replace('/'), 5000);
        return;
      }

      router.replace(nextPath);
    };

    finalizeSession();
    return () => {
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
      }
      subscription.unsubscribe();
    };
  }, [router, searchParams]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-indigo-800 to-blue-900 text-white px-6">
      <div className="max-w-md rounded-2xl border border-white/20 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-lg">
        <h1 className="text-2xl font-bold mb-3">Spotify sign-in</h1>
        <p className="text-gray-200">{message}</p>
      </div>
    </main>
  );
}
