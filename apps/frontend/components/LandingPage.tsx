'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateRoomCode } from '@songguessr/shared';
import { Button, Card, Chip, Separator } from '@heroui/react';

const stats = [
  { value: '10', label: 'Rounds' },
  { value: '30s', label: 'Preview' },
  { value: '2-4', label: 'Players' },
];

const steps = [
  {
    title: 'Listen',
    text: 'Lean previews, no clutter, and a room that stays readable while the track plays.',
  },
  {
    title: 'Guess',
    text: 'Fast feedback for every player with a minimal lobby that makes state obvious.',
  },
  {
    title: 'Score',
    text: 'Simple speed-based scoring with a quiet visual language and clear hierarchy.',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');

  const handleCreateRoom = () => {
    const code = generateRoomCode();
    router.push(`/room/${code}`);
  };

  const handleJoinRoom = () => {
    if (roomCode.length === 6) {
      router.push(`/room/${roomCode}`);
    }
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
            <div className="text-sm text-white/65">Monochrome music duel</div>
          </div>
        </div>

        <Chip variant="secondary" className="border border-white/10 bg-white/5 text-white/70">
          HeroUI interface
        </Chip>
      </header>

      <section className="grid flex-1 gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-8">
          <div className="space-y-5">
            <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/70">
              Real-time guessing room
            </Chip>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.07em] text-white sm:text-5xl lg:text-7xl">
                Guess songs.
                <br />
                Keep the room honest.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-white/62 sm:text-base lg:text-lg">
                Songguessr turns Spotify listening history into a stripped-back social game.
                No loud gradients, no visual noise, just a sharp room code and fast rounds.
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
            <Button variant="primary" className="bg-white text-black shadow-lg shadow-white/5" onPress={handleCreateRoom}>
              Create room
            </Button>
            <Button variant="outline" className="border-white/15 text-white" onPress={handleJoinRoom} isDisabled={roomCode.length !== 6}>
              Join room
            </Button>
          </div>
        </div>

        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Header className="flex flex-col items-start gap-3 px-6 pt-6">
            <Chip variant="secondary" className="bg-white/10 text-white/72">
              Lobby preview
            </Chip>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.05em] text-white">Minimal room flow</h2>
              <p className="mt-1 text-sm text-white/55">
                A cleaner lobby built for room state, not decorative noise.
              </p>
            </div>
          </Card.Header>

          <Card.Content className="space-y-5 px-6 pb-6">
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center justify-between text-sm text-white/55">
                <span>Room code</span>
                <span className="font-mono tracking-[0.3em] text-white/82">ABCDEF</span>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center justify-between text-sm text-white/55">
                <span>Status</span>
                <span className="text-white">Waiting</span>
              </div>
              <div className="flex items-center justify-between text-sm text-white/55">
                <span>Mode</span>
                <span className="text-white">Top tracks</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border border-white/10 bg-white/[0.03] shadow-none">
                <Card.Content className="p-4">
                  <div className="text-xs uppercase tracking-[0.3em] text-white/40">Look</div>
                  <div className="mt-1 text-sm text-white/70">Monochrome, high contrast, no excess color.</div>
                </Card.Content>
              </Card>
              <Card className="border border-white/10 bg-white/[0.03] shadow-none">
                <Card.Content className="p-4">
                  <div className="text-xs uppercase tracking-[0.3em] text-white/40">Interaction</div>
                  <div className="mt-1 text-sm text-white/70">Sharp controls with clear hover and focus states.</div>
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
              <Button variant="primary" className="bg-white text-black sm:w-40" onPress={handleJoinRoom} isDisabled={roomCode.length !== 6}>
                Join now
              </Button>
            </div>
          </Card.Content>
        </Card>
      </section>
    </main>
  );
}
