'use client';

import { useEffect, useState } from 'react';
import { Player, Room, Track } from '@songguessr/shared';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { Button, Card, Chip, Separator } from '@heroui/react';

interface LeaderboardProps {
  room: Room;
  players: Player[];
  currentUserId: string;
  roomCode: string;
  tracks: Track[];
}

interface PlayerWithAnswers extends Player {
  display_name: string;
  correct_count: number;
  total_rounds: number;
}

export default function Leaderboard({ room, players, currentUserId, roomCode, tracks }: LeaderboardProps) {
  const [leaderboard, setLeaderboard] = useState<PlayerWithAnswers[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostPlayedArtist, setMostPlayedArtist] = useState<string>('');

  useEffect(() => {
    const fetchLeaderboard = async () => {
      // Fetch final player data
      const { data: freshPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', room.id)
        .order('score', { ascending: false });

      // Fetch user profiles for display names
      const userIds = (freshPlayers ?? players).map((p) => p.user_id);
      const { data: users } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', userIds);

      const userMap = new Map<string, string>();
      for (const u of (users as any[]) ?? []) {
        userMap.set(u.id, (u.display_name as string) ?? 'Player');
      }

      // Fetch answers
      const { data: rounds } = await supabase
        .from('game_rounds')
        .select('id')
        .eq('room_id', room.id);

      const roundIds = (rounds ?? []).map((r) => r.id);
      const totalRounds = roundIds.length;

      const playerList: PlayerWithAnswers[] = [];

      for (const p of freshPlayers ?? players) {
        let correctCount = 0;

        if (roundIds.length > 0) {
          const { count } = await supabase
            .from('player_answers')
            .select('*', { count: 'exact', head: true })
            .eq('player_id', p.id)
            .eq('is_correct', true)
            .in('round_id', roundIds);

          correctCount = count ?? 0;
        }

        playerList.push({
          ...p,
          display_name: userMap.get(p.user_id) ?? 'Player',
          correct_count: correctCount,
          total_rounds: totalRounds,
        } as PlayerWithAnswers);
      }

      // Sort by score descending
      playerList.sort((a, b) => b.score - a.score);
      setLeaderboard(playerList);

      // Find most played artist
      const artistCounts: Record<string, number> = {};
      for (const t of tracks) {
        for (const a of t.artists) {
          artistCounts[a] = (artistCounts[a] || 0) + 1;
        }
      }
      const topArtist = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0];
      if (topArtist) setMostPlayedArtist(topArtist[0]);

      setLoading(false);
    };

    fetchLeaderboard();
  }, [room.id, players, tracks]);

  const handleLeaveRoom = async () => {
    try {
      await fetch(`/api/rooms/${roomCode}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: currentUserId }),
      });
    } catch (e) {
      console.error('Failed to leave room', e);
    }
    window.location.href = '/';
  };

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-5 text-white">
        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Content className="flex flex-col items-center gap-4 p-10">
            <div className="text-[0.65rem] uppercase tracking-[0.45em] text-white/45">Loading results...</div>
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </Card.Content>
        </Card>
      </main>
    );
  }

  const winner = leaderboard[0];
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-5 text-white sm:px-6">
      {/* Header */}
      <header className="flex flex-col items-center gap-4 border-b border-white/10 pb-6 text-center">
        <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
          Game finished
        </Chip>
        <h1 className="text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">
          Final standings
        </h1>
        <p className="max-w-md text-sm text-white/55">
          Room {roomCode} — {leaderboard[0]?.total_rounds ?? 0} rounds completed
        </p>
      </header>

      {/* Winner spotlight */}
      {winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
            <Card.Content className="flex flex-col items-center gap-4 py-10">
              <div className="text-5xl">🏆</div>
              <div>
                <div className="text-center text-2xl font-semibold text-white">
                  {winner.user_id === currentUserId ? 'You won!' : `${winner.display_name} wins!`}
                </div>
                <div className="mt-1 text-center text-sm text-white/55">
                  {winner.score} points — {winner.correct_count}/{winner.total_rounds} correct
                </div>
              </div>
            </Card.Content>
          </Card>
        </motion.div>
      )}

      {/* Full leaderboard */}
      <Card className="border border-white/10 bg-white/[0.04] shadow-none">
        <Card.Header className="px-6 pt-6">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Rankings</h2>
            <p className="mt-1 text-sm text-white/50">Speed and accuracy combined</p>
          </div>
        </Card.Header>
        <Card.Content className="space-y-3 px-6 pb-6">
          {leaderboard.map((player, index) => {
            const isCurrentUser = player.user_id === currentUserId;

            return (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`flex items-center gap-4 rounded-2xl border px-4 py-4 transition-colors ${
                  isCurrentUser
                    ? 'border-white/20 bg-white/[0.08]'
                    : 'border-white/10 bg-black/20'
                }`}
              >
                <div className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-lg">
                  {index < 3 ? medals[index] : (
                    <span className="font-mono text-sm text-white/50">{index + 1}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">
                      {isCurrentUser ? 'You' : player.display_name}
                    </span>
                    {isCurrentUser && (
                      <Chip variant="soft" className="bg-white/10 text-white/60">You</Chip>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm text-white/48">
                    {player.correct_count}/{player.total_rounds} correct
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-semibold text-white">{player.score}</div>
                  <div className="text-xs text-white/40">points</div>
                </div>
              </motion.div>
            );
          })}
        </Card.Content>
      </Card>

      {/* Fun stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border border-white/10 bg-white/[0.04] shadow-none">
          <Card.Content className="p-5">
            <div className="text-[0.65rem] uppercase tracking-[0.3em] text-white/40">Tracks played</div>
            <div className="mt-1 font-mono text-2xl text-white">{leaderboard[0]?.total_rounds ?? 0}</div>
          </Card.Content>
        </Card>
        <Card className="border border-white/10 bg-white/[0.04] shadow-none">
          <Card.Content className="p-5">
            <div className="text-[0.65rem] uppercase tracking-[0.3em] text-white/40">Most played artist</div>
            <div className="mt-1 truncate text-lg font-medium text-white">{mostPlayedArtist || '—'}</div>
          </Card.Content>
        </Card>
        <Card className="border border-white/10 bg-white/[0.04] shadow-none">
          <Card.Content className="p-5">
            <div className="text-[0.65rem] uppercase tracking-[0.3em] text-white/40">Total players</div>
            <div className="mt-1 font-mono text-2xl text-white">{leaderboard.length}</div>
          </Card.Content>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-3 border-t border-white/10 py-8">
        <Button variant="primary" size="lg" className="bg-white text-black" onPress={handleLeaveRoom}>
          Leave Room / Play again
        </Button>
        <p className="text-sm text-white/45">Create a new room and start another round</p>
      </div>
    </main>
  );
}
