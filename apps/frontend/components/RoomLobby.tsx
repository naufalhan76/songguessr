'use client';

import { useState } from 'react';
import { Player, Room, User } from '@songguessr/shared';
import { signInWithSpotify } from '@/lib/supabase';
import { Button, Card, Chip, Separator } from '@heroui/react';

interface RoomLobbyProps {
  roomCode: string;
}

const mockRoom: Room = {
  id: 'room-123',
  code: 'ABCDEF',
  host_id: 'user-1',
  status: 'waiting',
  settings: {
    rounds: 10,
    time_per_round: 30,
    allow_skips: false,
    point_system: 'speed',
  },
  created_at: new Date().toISOString(),
  started_at: null,
  ended_at: null,
};

const mockPlayers: Player[] = [
  { id: 'player-1', room_id: 'room-123', user_id: 'user-1', score: 0, is_ready: true, joined_at: new Date().toISOString() },
  { id: 'player-2', room_id: 'room-123', user_id: 'user-2', score: 0, is_ready: false, joined_at: new Date().toISOString() },
  { id: 'player-3', room_id: 'room-123', user_id: 'user-3', score: 0, is_ready: true, joined_at: new Date().toISOString() },
];

const mockUser: User = {
  id: 'user-1',
  email: 'player1@example.com',
  display_name: 'Player One',
  avatar_url: null,
  spotify_access_token: null,
  spotify_refresh_token: null,
  spotify_expires_at: null,
  created_at: new Date().toISOString(),
};

export default function RoomLobby({ roomCode }: RoomLobbyProps) {
  const [room] = useState<Room>(mockRoom);
  const [players, setPlayers] = useState<Player[]>(mockPlayers);
  const [currentUser] = useState<User | null>(mockUser);
  const [isConnectingSpotify, setIsConnectingSpotify] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [rounds, setRounds] = useState(String(mockRoom.settings.rounds));
  const [timePerRound, setTimePerRound] = useState(String(mockRoom.settings.time_per_round));
  const [scoring, setScoring] = useState(mockRoom.settings.point_system);

  const isHost = currentUser?.id === room.host_id;
  const readyCount = players.filter((player) => player.is_ready).length;
  const allPlayersReady = readyCount >= 2 && players.every((player) => player.is_ready);
  const readinessPercent = players.length > 0 ? Math.round((readyCount / players.length) * 100) : 0;

  const handleConnectSpotify = () => {
    setIsConnectingSpotify(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=/room/${roomCode}`;

    signInWithSpotify(redirectTo).catch((error) => {
      console.error('Spotify sign-in failed', error);
      setIsConnectingSpotify(false);
      alert('Failed to start Spotify sign-in. Check your Supabase and Spotify redirect settings.');
    });
  };

  const handleToggleReady = () => {
    const nextReady = !isReady;
    setIsReady(nextReady);
    setPlayers((currentPlayers) =>
      currentPlayers.map((player) =>
        player.user_id === currentUser?.id ? { ...player, is_ready: nextReady } : player
      )
    );
  };

  const handleStartGame = () => {
    if (!allPlayersReady) {
      alert('All players must be ready and at least 2 players needed');
      return;
    }

    alert('Game would start now!');
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    alert('Room code copied to clipboard!');
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-5 text-white sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Chip variant="tertiary" className="border border-white/10 bg-white/5 text-white/70">
              Room lobby
            </Chip>
            <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/70">
              {readyCount}/{players.length} ready
            </Chip>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
              Room <span className="font-mono text-white/80">{roomCode}</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
              Share the code, connect Spotify, and wait for the host to start the round.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="border-white/15 text-white" onPress={handleCopyCode}>
            Copy code
          </Button>
          <Button variant="primary" className="bg-white text-black" onPress={() => window.location.href = '/'}>
            Leave room
          </Button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
            <Card.Header className="flex flex-col items-start gap-3 px-6 pt-6">
              <div className="flex w-full items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Players</h2>
                  <p className="mt-1 text-sm text-white/50">Up to four players in the room.</p>
                </div>
                <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/70">
                  {players.length}/4
                </Chip>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-white" style={{ width: `${readinessPercent}%` }} />
              </div>
            </Card.Header>

            <Card.Content className="space-y-3 px-6 pb-6">
              {players.map((player, index) => {
                const isCurrentUser = player.user_id === currentUser?.id;

                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 transition-colors hover:bg-white/[0.05]"
                  >
                    <div className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 font-mono text-sm tracking-[0.2em] text-white/80">
                      {player.user_id.slice(-2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-white">{isCurrentUser ? 'You' : `Player ${index + 1}`}</div>
                        {player.user_id === room.host_id && (
                          <Chip variant="secondary" className="border border-white/10 bg-white/5 text-white/60">
                            Host
                          </Chip>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-white/48">
                        {player.is_ready ? 'Ready to play' : 'Waiting for readiness'}
                      </div>
                    </div>
                    <Chip
                      variant={player.is_ready ? 'primary' : 'secondary'}
                      className={player.is_ready ? 'bg-white text-black' : 'border border-white/10 bg-white/5 text-white/55'}
                    >
                      {player.is_ready ? 'Ready' : 'Waiting'}
                    </Chip>
                  </div>
                );
              })}
            </Card.Content>
          </Card>

          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="px-6 pt-6">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Music access</h2>
                <p className="mt-1 text-sm text-white/50">Connect Spotify once so the room can fetch top tracks.</p>
              </div>
            </Card.Header>
            <Card.Content className="space-y-4 px-6 pb-6">
              <p className="max-w-3xl text-sm leading-6 text-white/58">
                We only request read-only access to your top tracks and recently played songs.
                The room stays quiet so the game state remains the focus.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  className="bg-white text-black"
                  onPress={handleConnectSpotify}
                >
                  {isConnectingSpotify ? 'Connecting' : 'Connect Spotify'}
                </Button>
                <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/55">
                  read only
                </Chip>
              </div>
            </Card.Content>
          </Card>

          {isHost && (
            <Card className="border border-white/10 bg-white/[0.04] shadow-none">
              <Card.Header className="px-6 pt-6">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Game settings</h2>
                  <p className="mt-1 text-sm text-white/50">Host controls, kept minimal.</p>
                </div>
              </Card.Header>
              <Card.Content className="grid gap-4 px-6 pb-6 md:grid-cols-3">
                <label className="space-y-2 text-sm text-white/60">
                  <span>Rounds</span>
                  <select
                    value={rounds}
                    onChange={(event) => setRounds(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-white/30"
                  >
                    <option>10</option>
                    <option>15</option>
                    <option>20</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-white/60">
                  <span>Time per round</span>
                  <select
                    value={timePerRound}
                    onChange={(event) => setTimePerRound(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-white/30"
                  >
                    <option>30</option>
                    <option>45</option>
                    <option>60</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-white/60">
                  <span>Scoring</span>
                  <select
                    value={scoring}
                    onChange={(event) => setScoring(event.target.value as Room['settings']['point_system'])}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-white/30"
                  >
                    <option value="speed">Speed based</option>
                    <option value="correct_only">Correct only</option>
                  </select>
                </label>
              </Card.Content>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="px-6 pt-6">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Room status</h2>
                <p className="mt-1 text-sm text-white/50">The room stays readable at a glance.</p>
              </div>
            </Card.Header>
            <Card.Content className="space-y-4 px-6 pb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/50">Room code</span>
                <span className="font-mono text-sm tracking-[0.28em] text-white/85">{roomCode}</span>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/50">Mode</span>
                <span className="text-sm text-white">Top tracks</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/50">Status</span>
                <Chip variant="primary" className="bg-white text-black">
                  {room.status}
                </Chip>
              </div>
              <Separator className="bg-white/10" />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Players ready</span>
                  <span className="text-white">{readyCount}/{players.length}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-white" style={{ width: `${readinessPercent}%` }} />
                </div>
              </div>
            </Card.Content>
          </Card>

          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="px-6 pt-6">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Ready up</h2>
                <p className="mt-1 text-sm text-white/50">A single action, no clutter.</p>
              </div>
            </Card.Header>
            <Card.Content className="space-y-5 px-6 pb-6">
              <button
                type="button"
                onClick={handleToggleReady}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-left transition hover:bg-white/[0.05]"
              >
                <div>
                  <div className="text-sm text-white">I'm ready to play</div>
                  <div className="mt-1 text-sm text-white/50">Signal to the host that you are locked in.</div>
                </div>
                <div className={`grid h-10 w-10 place-items-center rounded-full border text-sm transition ${isReady ? 'border-white bg-white text-black' : 'border-white/15 bg-transparent text-white/50'}`}>
                  {isReady ? 'On' : 'Off'}
                </div>
              </button>

              <Button
                variant="primary"
                size="lg"
                className="w-full bg-white text-black"
                onPress={handleStartGame}
                isDisabled={!allPlayersReady || !isHost}
              >
                {isHost ? 'Start game' : 'Waiting for host'}
              </Button>

              {!allPlayersReady && (
                <p className="text-center text-sm text-white/45">
                  {players.length < 2 ? 'Need at least 2 players to start' : 'All players must be ready'}
                </p>
              )}
            </Card.Content>
          </Card>

          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="px-6 pt-6">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Mobile join</h2>
                <p className="mt-1 text-sm text-white/50">A placeholder for a mobile handoff.</p>
              </div>
            </Card.Header>
            <Card.Content className="space-y-4 px-6 pb-6">
              <div className="flex items-center justify-center rounded-3xl border border-dashed border-white/15 bg-black/20 p-8">
                <div className="grid h-36 w-36 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] font-mono text-sm tracking-[0.35em] text-white/35">
                  QR
                </div>
              </div>
              <div className="text-center text-sm text-white/50">
                Or visit <span className="font-mono text-white/75">songguessr.app/join/{roomCode}</span>
              </div>
            </Card.Content>
          </Card>
        </div>
      </div>
    </main>
  );
}
