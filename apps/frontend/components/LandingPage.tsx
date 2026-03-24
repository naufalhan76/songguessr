'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generateRoomCode } from '@songguessr/shared';
import { supabase, signInWithSpotify } from '@/lib/supabase';
import { Card, Chip, Separator } from '@heroui/react';

const stats = [
  { value: '10', label: 'Rounds' },
  { value: '30s', label: 'Preview' },
  { value: '2-4', label: 'Players' },
];

const steps = [
  {
    title: 'Listen',
    text: 'Quick previews and a clean stage so the track stays in focus.',
  },
  {
    title: 'Guess',
    text: 'Fast room updates make it easy to keep up while the round is live.',
  },
  {
    title: 'Score',
    text: 'Simple scoring that rewards the right answer without extra noise.',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ display_name: string; avatar_url: string | null } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const canJoin = roomCode.length === 6;

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.user) {
        setUserId(session.user.id);
        
        // Upsert user profile to ensure they exist in public.users before creating a room
        const userProfileData = {
          id: session.user.id,
          email: session.user.email ?? '',
          display_name: session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? 'Spotify User',
          avatar_url: session.user.user_metadata?.avatar_url ?? null,
        };

        // If we have a fresh token from session, save it too
        if (session.provider_token) {
          Object.assign(userProfileData, {
            spotify_access_token: session.provider_token,
            spotify_refresh_token: session.provider_refresh_token ?? null,
            spotify_expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
          });
        }

        const { data: profile } = await supabase
          .from('users')
          .upsert(userProfileData as any)
          .select('display_name, avatar_url')
          .single();

        if (!cancelled) {
          setUserId(session.user.id);
          if (profile) {
            setUserProfile(profile as any);
          }
        }
      }
    };
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      
      const newUserId = session?.user?.id ?? null;
      
      if (!newUserId) {
        setUserId(null);
        setUserProfile(null);
      } else {
        // Always attempt an upsert on auth state change to capture refreshed tokens
        const userProfileData = {
          id: session!.user.id,
          email: session!.user.email ?? '',
          display_name: session!.user.user_metadata?.full_name ?? session!.user.email?.split('@')[0] ?? 'Spotify User',
          avatar_url: session!.user.user_metadata?.avatar_url ?? null,
        };

        if (session!.provider_token) {
          Object.assign(userProfileData, {
            spotify_access_token: session!.provider_token,
            spotify_refresh_token: session!.provider_refresh_token ?? null,
            spotify_expires_at: session!.expires_at ? new Date(session!.expires_at * 1000).toISOString() : null,
          });
        }

        const { data: profile } = await supabase
          .from('users')
          .upsert(userProfileData as any)
          .select('display_name, avatar_url')
          .single();

        if (!cancelled) {
          setUserId(newUserId);
          if (profile) {
            setUserProfile(profile as any);
          }
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleCreateRoom = async () => {
    if (!userId) {
      // Not logged in, redirect to Spotify auth first
      const redirectTo = `${window.location.origin}/auth/callback?next=/`;
      await signInWithSpotify(redirectTo);
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_id: userId }),
      });
      const json = await res.json();

      if (json.success) {
        router.push(`/room/${json.data.code}`);
      } else {
        alert(json.error || 'Failed to create room');
      }
    } catch (err) {
      console.error('Failed to create room', err);
      alert('Failed to create room. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = () => {
    if (!canJoin) return;
    router.push(`/room/${roomCode}`);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUserProfile(null);
    setUserId(null);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/5 font-mono text-sm tracking-[0.35em] text-white/80">
            SG
          </div>
          <div>
            <div className="text-[0.7rem] uppercase tracking-[0.42em] text-white/40">Songguessr</div>
              <div className="text-sm text-white/65">Fast music guessing rooms</div>
          </div>
        </div>

        <div>
          {userId ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 py-1.5 pl-2 pr-4 text-emerald-300">
                {userProfile?.avatar_url ? (
                  <img src={userProfile.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                ) : (
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400/20 text-[10px] font-bold">
                    {userProfile?.display_name?.slice(0, 2).toUpperCase() || 'SP'}
                  </div>
                )}
                <span className="text-sm font-medium">{userProfile?.display_name || 'Spotify User'}</span>
              </div>
              <button onClick={handleSignOut} className="text-xs text-white/40 hover:text-white/70 hover:underline">
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-white/55">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.45)]" />
              Not signed in
            </div>
          )}
        </div>
      </header>

      <section className="grid flex-1 gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-8">
          <div className="space-y-5">
            <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              Private multiplayer room
            </Chip>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.07em] text-white sm:text-5xl lg:text-7xl">
                Guess songs together.
                <br />
                Keep the round moving.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-white/62 sm:text-base lg:text-lg">
                Songguessr turns Spotify listening data into fast, private rounds with a clean room layout,
                clear controls, and just enough visual polish to stay memorable.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {stats.map((item) => (
              <Card key={item.label} className="border border-white/10 bg-white/[0.03] shadow-none">
                <Card.Content className="p-5">
                  <div className="font-mono text-2xl text-white">{item.value}</div>
                  <div className="mt-1 text-sm text-white/48">{item.label}</div>
                </Card.Content>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCreateRoom}
              disabled={isCreating}
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-black shadow-lg shadow-white/5 transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create room'}
            </button>
            <button type="button" onClick={handleJoinRoom} disabled={!canJoin} className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-medium text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45">
              Join room
            </button>
          </div>
        </div>

        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Header className="flex flex-col items-start gap-3 px-6 pt-6">
            <Chip variant="secondary" className="bg-white/10 text-white/72">
              Room preview
            </Chip>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.05em] text-white">A room that stays readable</h2>
              <p className="mt-1 text-sm text-white/55">
                Designed for fast starts, clear player state, and a calmer visual rhythm.
              </p>
            </div>
          </Card.Header>

          <Card.Content className="space-y-5 px-6 pb-6">
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center justify-between text-sm text-white/55">
                <span>Room code</span>
                <span className="font-mono tracking-[0.3em] text-emerald-300/90">ABCDEF</span>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center justify-between text-sm text-white/55">
                <span>Status</span>
                <span className="text-emerald-300/90">Waiting</span>
              </div>
              <div className="flex items-center justify-between text-sm text-white/55">
                <span>Mode</span>
                <span className="text-white">Top tracks</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border border-white/10 bg-white/[0.03] shadow-none">
                <Card.Content className="p-4">
                  <div className="text-xs uppercase tracking-[0.3em] text-white/40">Layout</div>
                  <div className="mt-1 text-sm text-white/70">A quiet structure that keeps the room state easy to scan.</div>
                </Card.Content>
              </Card>
              <Card className="border border-white/10 bg-white/[0.03] shadow-none">
                <Card.Content className="p-4">
                  <div className="text-xs uppercase tracking-[0.3em] text-white/40">Controls</div>
                  <div className="mt-1 text-sm text-white/70">Quick actions with immediate feedback for create and join.</div>
                </Card.Content>
              </Card>
            </div>
          </Card.Content>
        </Card>
      </section>

      <section className="grid gap-4 border-t border-white/10 py-8 md:grid-cols-3">
        {steps.map((item) => (
          <Card key={item.title} className="border border-white/10 bg-white/[0.03] shadow-none transition-transform duration-200 hover:-translate-y-0.5 hover:bg-white/[0.05]">
            <Card.Content className="p-5">
              <div className="font-semibold text-white">{item.title}</div>
              <p className="mt-2 text-sm leading-6 text-white/55">{item.text}</p>
            </Card.Content>
          </Card>
        ))}
      </section>

      <section className="border-t border-white/10 py-6">
        <Card className="border border-white/10 bg-white/[0.03] shadow-none">
          <Card.Content className="grid gap-4 p-5 md:grid-cols-[1.2fr_0.8fr] md:items-center">
            <div>
              <div className="text-sm font-medium text-white">Join a room</div>
              <p className="mt-1 text-sm text-white/52">
                Enter a 6-character room code to jump straight into a lobby.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                maxLength={6}
                placeholder="ROOM01"
                aria-label="Room code"
                className="h-12 w-full rounded-2xl border border-white/12 bg-black/30 px-4 font-mono text-sm tracking-[0.32em] text-white outline-none transition placeholder:text-white/30 focus:border-white/30"
              />
              <button type="button" onClick={handleJoinRoom} disabled={!canJoin} className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-medium text-black transition hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 sm:w-40">
                Join now
              </button>
            </div>
          </Card.Content>
        </Card>
      </section>
    </main>
  );
}
