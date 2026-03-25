'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createGuestSession, getGuestSession, setRoomPlayerId } from '@/lib/supabase';
import { Card, Chip, Separator } from '@heroui/react';

const stats = [
  { value: '10', label: 'Rounds' },
  { value: '30s', label: 'Preview' },
  { value: '2-8', label: 'Players' },
];

const steps = [
  {
    title: 'Pick',
    text: 'Each player picks songs. Missing picks get auto-filled from the global charts.',
  },
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
  const [displayName, setDisplayName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const canJoin = roomCode.length === 6;

  // Restore display name from guest session
  useEffect(() => {
    const session = getGuestSession();
    if (session) {
      setDisplayName(session.display_name);
    }
  }, []);

  const handleCreateRoom = async () => {
    if (!displayName.trim()) {
      alert('Enter your display name first');
      return;
    }

    setIsCreating(true);
    try {
      // Create guest session
      createGuestSession(displayName.trim());

      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      const json = await res.json();

      if (json.success) {
        // Store the player_id for this room
        setRoomPlayerId(json.data.room.code, json.data.player.id);
        router.push(`/room/${json.data.room.code}`);
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex items-center justify-center border-b border-white/10 pb-5">
        <div className="text-xl font-bold uppercase tracking-[0.4em] text-white">Songguessr</div>
      </header>

      <section className="grid flex-1 gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-8">
          <div className="space-y-5">
            <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              No login required
            </Chip>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.07em] text-white sm:text-5xl lg:text-7xl">
                Guess songs together.
                <br />
                Keep the round moving.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-white/62 sm:text-base lg:text-lg">
                Pick your own songs, challenge your friends, and see who really
                knows their music. Just enter a name and start playing.
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

          {/* Create room form */}
          <div className="space-y-3">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
              maxLength={20}
              placeholder="Your display name"
              className="h-12 w-full max-w-sm rounded-2xl border border-white/12 bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/30"
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={isCreating || !displayName.trim()}
                className="inline-flex h-12 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-black shadow-lg shadow-white/5 transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create room'}
              </button>
              <button type="button" onClick={handleJoinRoom} disabled={!canJoin} className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-medium text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45">
                Join room
              </button>
            </div>
          </div>
        </div>

        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Header className="flex flex-col items-start gap-3 px-6 pt-6">
            <Chip variant="secondary" className="bg-white/10 text-white/72">
              How it works
            </Chip>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.05em] text-white">A room that stays readable</h2>
              <p className="mt-1 text-sm text-white/55">
                Create a room, pick songs, and challenge your friends.
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
                <span className="text-white">Player song picks</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border border-white/10 bg-white/[0.03] shadow-none">
                <Card.Content className="p-4">
                  <div className="text-xs uppercase tracking-[0.3em] text-white/40">Song selection</div>
                  <div className="mt-1 text-sm text-white/70">Every player picks songs. Auto-fill from Top 100 if time runs out.</div>
                </Card.Content>
              </Card>
              <Card className="border border-white/10 bg-white/[0.03] shadow-none">
                <Card.Content className="p-4">
                  <div className="text-xs uppercase tracking-[0.3em] text-white/40">Fair play</div>
                  <div className="mt-1 text-sm text-white/70">Everyone knows their own picks. Advantage is symmetric across players.</div>
                </Card.Content>
              </Card>
            </div>
          </Card.Content>
        </Card>
      </section>

      <section className="grid gap-4 border-t border-white/10 py-8 md:grid-cols-4">
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
