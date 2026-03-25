'use client';

import { useEffect, useState, useCallback } from 'react';
import { Player, Room, Track } from '@muze/shared';
import { clearRoomPlayerId, supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Card, Chip } from '@heroui/react';
import confetti from 'canvas-confetti';

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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, defaultSize: number) {
  let size = defaultSize;
  do {
    ctx.font = `600 ${size}px Arial`;
    if (ctx.measureText(text).width <= maxWidth || size <= 20) {
      return size;
    }
    size -= 2;
  } while (size > 20);

  return size;
}

async function createLeaderboardImageBlob({
  room,
  roomCode,
  leaderboard,
  mostPlayedArtist,
}: {
  room: Room;
  roomCode: string;
  leaderboard: PlayerWithAnswers[];
  mostPlayedArtist: string;
}): Promise<Blob> {
  const width = 1200;
  const height = 1500;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context unavailable');
  }

  ctx.scale(scale, scale);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#050816');
  gradient.addColorStop(0.45, '#111827');
  gradient.addColorStop(1, '#022c22');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  ctx.arc(1080, 130, 180, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(120, 1320, 220, 0, Math.PI * 2);
  ctx.fill();

  const winner = leaderboard[0];
  const roomLabel = room.room_name?.trim() ? room.room_name.trim() : `Room ${roomCode}`;
  const topPlayers = leaderboard.slice(0, 5);
  const extraPlayers = Math.max(leaderboard.length - topPlayers.length, 0);
  const totalRounds = leaderboard[0]?.total_rounds ?? 0;

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '600 24px Arial';
  ctx.fillText('MUZE FINAL STANDINGS', 84, 92);

  ctx.fillStyle = '#ffffff';
  const titleSize = fitText(ctx, roomLabel, 760, 62);
  ctx.font = `700 ${titleSize}px Arial`;
  ctx.fillText(roomLabel, 84, 170);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '500 28px Arial';
  ctx.fillText(`${totalRounds} rounds played  |  Room code ${roomCode}`, 84, 222);

  drawRoundedRect(ctx, 84, 284, 1032, 280, 38);
  ctx.fillStyle = 'rgba(10,14,26,0.74)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(982, 424, 88, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fcd34d';
  ctx.font = '700 26px Arial';
  ctx.fillText('WINNER', 128, 350);

  ctx.fillStyle = '#ffffff';
  const winnerName = winner?.display_name || 'Player';
  const winnerSize = fitText(ctx, winnerName, 620, 54);
  ctx.font = `700 ${winnerSize}px Arial`;
  ctx.fillText(winnerName, 128, 424);

  ctx.fillStyle = 'rgba(255,255,255,0.74)';
  ctx.font = '500 30px Arial';
  ctx.fillText(
    `${winner?.score ?? 0} points  |  ${winner?.correct_count ?? 0}/${winner?.total_rounds ?? 0} correct`,
    128,
    478
  );

  ctx.fillStyle = '#fcd34d';
  ctx.font = '700 86px Arial';
  ctx.fillText('#1', 924, 448);

  ctx.fillStyle = 'rgba(255,255,255,0.52)';
  ctx.font = '600 20px Arial';
  ctx.fillText('Top players', 84, 642);

  let rowY = 676;
  topPlayers.forEach((player, index) => {
    drawRoundedRect(ctx, 84, rowY, 1032, 110, 28);
    ctx.fillStyle = index === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(8,12,23,0.58)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = index === 0 ? '#fcd34d' : 'rgba(255,255,255,0.84)';
    ctx.font = '700 36px Arial';
    ctx.fillText(`#${index + 1}`, 120, rowY + 68);

    ctx.fillStyle = '#ffffff';
    const nameSize = fitText(ctx, player.display_name, 520, 34);
    ctx.font = `600 ${nameSize}px Arial`;
    ctx.fillText(player.display_name, 230, rowY + 52);

    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '500 24px Arial';
    ctx.fillText(`${player.correct_count}/${player.total_rounds} correct`, 230, rowY + 84);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px Arial';
    ctx.fillText(`${player.score}`, 1050, rowY + 56);
    ctx.fillStyle = 'rgba(255,255,255,0.56)';
    ctx.font = '500 20px Arial';
    ctx.fillText('points', 1050, rowY + 84);
    ctx.textAlign = 'left';

    rowY += 128;
  });

  if (extraPlayers > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.56)';
    ctx.font = '500 22px Arial';
    ctx.fillText(`and ${extraPlayers} more player${extraPlayers > 1 ? 's' : ''}`, 84, rowY - 10);
  }

  const statsY = 1180;
  const statWidth = 320;
  const statGap = 36;
  const stats = [
    { label: 'Tracks played', value: `${totalRounds}` },
    { label: 'Most played artist', value: mostPlayedArtist || 'Unknown' },
    { label: 'Total players', value: `${leaderboard.length}` },
  ];

  stats.forEach((stat, index) => {
    const x = 84 + index * (statWidth + statGap);
    drawRoundedRect(ctx, x, statsY, statWidth, 170, 28);
    ctx.fillStyle = 'rgba(8,12,23,0.60)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.52)';
    ctx.font = '600 20px Arial';
    ctx.fillText(stat.label.toUpperCase(), x + 28, statsY + 46);

    const statSize = fitText(ctx, stat.value, statWidth - 56, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${statSize}px Arial`;
    ctx.fillText(stat.value, x + 28, statsY + 108);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.48)';
  ctx.font = '500 22px Arial';
  ctx.fillText('Share your room results on WhatsApp, Instagram, or anywhere else.', 84, 1428);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate leaderboard image'));
        return;
      }

      resolve(blob);
    }, 'image/png');
  });
}

export default function Leaderboard({ room, players, currentUserId, roomCode, tracks }: LeaderboardProps) {
  const autoLeaveAt = room.ended_at
    ? new Date(room.ended_at).getTime() + (2 * 60 * 1000)
    : Date.now() + (2 * 60 * 1000);
  const [leaderboard, setLeaderboard] = useState<PlayerWithAnswers[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostPlayedArtist, setMostPlayedArtist] = useState<string>('');
  const [isLeaving, setIsLeaving] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [secondsUntilAutoLeave, setSecondsUntilAutoLeave] = useState(
    Math.max(0, Math.ceil((autoLeaveAt - Date.now()) / 1000))
  );

  const fireConfetti = useCallback(() => {
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#34d399', '#fbbf24', '#60a5fa', '#f472b6'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#34d399', '#fbbf24', '#60a5fa', '#f472b6'],
      });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    confetti({
      particleCount: 100,
      spread: 100,
      origin: { y: 0.6 },
      colors: ['#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#a78bfa'],
    });

    frame();
  }, []);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      const { data: freshPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', room.id)
        .order('score', { ascending: false });

      const { data: rounds } = await supabase
        .from('game_rounds')
        .select('id')
        .eq('room_id', room.id);

      const roundIds = (rounds ?? []).map((round) => round.id);
      const totalRounds = roundIds.length;
      const playerList: PlayerWithAnswers[] = [];

      for (const player of freshPlayers ?? players) {
        let correctCount = 0;

        if (roundIds.length > 0) {
          const { count } = await supabase
            .from('player_answers')
            .select('*', { count: 'exact', head: true })
            .eq('player_id', player.id)
            .eq('is_correct', true)
            .in('round_id', roundIds);

          correctCount = count ?? 0;
        }

        playerList.push({
          ...player,
          display_name: player.display_name || 'Player',
          correct_count: correctCount,
          total_rounds: totalRounds,
        } as PlayerWithAnswers);
      }

      playerList.sort((a, b) => b.score - a.score);
      setLeaderboard(playerList);

      const artistCounts: Record<string, number> = {};
      for (const track of tracks) {
        for (const artist of track.artists) {
          artistCounts[artist] = (artistCounts[artist] || 0) + 1;
        }
      }

      const topArtist = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0];
      setMostPlayedArtist(topArtist?.[0] ?? '');
      setLoading(false);

      if (playerList.length > 0 && playerList[0].id === currentUserId) {
        fireConfetti();
      }
    };

    fetchLeaderboard();
  }, [currentUserId, fireConfetti, players, room.id, tracks]);

  useEffect(() => {
    if (!shareStatus) return;

    const timeout = window.setTimeout(() => {
      setShareStatus(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [shareStatus]);

  const handleShareImage = useCallback(async () => {
    if (leaderboard.length === 0) return;

    setIsSharingImage(true);
    setShareStatus(null);

    try {
      const blob = await createLeaderboardImageBlob({
        room,
        roomCode,
        leaderboard,
        mostPlayedArtist,
      });

      const file = new File([blob], `muze-games-${roomCode}-leaderboard.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'muze.games leaderboard',
          text: `Final standings for ${room.room_name?.trim() || `Room ${roomCode}`}`,
          files: [file],
        });
        setShareStatus('Leaderboard image shared.');
      } else {
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(downloadUrl);
        setShareStatus('Leaderboard image downloaded.');
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Failed to share leaderboard image', error);
        setShareStatus('Failed to generate leaderboard image.');
      }
    } finally {
      setIsSharingImage(false);
    }
  }, [leaderboard, mostPlayedArtist, room, roomCode]);

  const handleLeaveRoom = useCallback(async (isAutoLeave = false) => {
    setIsLeaving(true);
    try {
      await fetch(`/api/rooms/${roomCode}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: currentUserId }),
      });
    } catch (error) {
      if (!isAutoLeave) {
        console.error('Failed to leave room', error);
      }
    }
    clearRoomPlayerId(roomCode);
    window.location.href = '/';
  }, [currentUserId, roomCode]);

  useEffect(() => {
    const syncCountdown = () => {
      setSecondsUntilAutoLeave(Math.max(0, Math.ceil((autoLeaveAt - Date.now()) / 1000)));
    };

    syncCountdown();
    const interval = window.setInterval(syncCountdown, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [autoLeaveAt]);

  useEffect(() => {
    const remainingMs = autoLeaveAt - Date.now();
    if (remainingMs <= 0) {
      handleLeaveRoom(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      handleLeaveRoom(true);
    }, remainingMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [autoLeaveAt, handleLeaveRoom]);

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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-3 py-4 text-white sm:gap-8 sm:px-6">
      <header className="flex flex-col items-center gap-4 border-b border-white/10 pb-6 text-center">
        <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
          Game finished
        </Chip>
        <h1 className="text-3xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">
          Final standings
        </h1>
        <p className="max-w-md text-sm text-white/55">
          {room.room_name?.trim() ? `${room.room_name.trim()} - ` : `Room ${roomCode} - `}
          {leaderboard[0]?.total_rounds ?? 0} rounds completed
        </p>
        <div className="rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-300">
          Room data will be cleared in {secondsUntilAutoLeave}s
        </div>
      </header>

      {winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
            <Card.Content className="flex flex-col items-center gap-4 py-10">
              <Chip variant="soft" className="border border-amber-400/20 bg-amber-400/10 text-amber-300">
                Winner
              </Chip>
              <div>
                <div className="text-center text-2xl font-semibold text-white">
                  {winner.id === currentUserId ? 'You won!' : `${winner.display_name} wins!`}
                </div>
                <div className="mt-1 text-center text-sm text-white/55">
                  {winner.score} points - {winner.correct_count}/{winner.total_rounds} correct
                </div>
              </div>
            </Card.Content>
          </Card>
        </motion.div>
      )}

      <Card className="border border-white/10 bg-white/[0.04] shadow-none">
        <Card.Header className="px-6 pt-6">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Rankings</h2>
            <p className="mt-1 text-sm text-white/50">Speed and accuracy combined</p>
          </div>
        </Card.Header>
        <Card.Content className="space-y-3 px-6 pb-6">
          {leaderboard.map((player, index) => {
            const isCurrentUser = player.id === currentUserId;

            return (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`flex flex-col items-start gap-3 rounded-2xl border px-4 py-4 transition-colors sm:flex-row sm:items-center sm:gap-4 ${
                  isCurrentUser
                    ? 'border-white/20 bg-white/[0.08]'
                    : 'border-white/10 bg-black/20'
                }`}
              >
                <div className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white/70">
                  #{index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">
                      {isCurrentUser ? 'You' : player.display_name}
                    </span>
                    {isCurrentUser && (
                      <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/60">
                        You
                      </Chip>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm text-white/48">
                    {player.correct_count}/{player.total_rounds} correct
                  </div>
                </div>
                <div className="w-full text-left sm:w-auto sm:text-right">
                  <div className="font-mono text-lg font-semibold text-white">{player.score}</div>
                  <div className="text-xs text-white/40">points</div>
                </div>
              </motion.div>
            );
          })}
        </Card.Content>
      </Card>

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
            <div className="mt-1 truncate text-lg font-medium text-white">{mostPlayedArtist || '-'}</div>
          </Card.Content>
        </Card>
        <Card className="border border-white/10 bg-white/[0.04] shadow-none">
          <Card.Content className="p-5">
            <div className="text-[0.65rem] uppercase tracking-[0.3em] text-white/40">Total players</div>
            <div className="mt-1 font-mono text-2xl text-white">{leaderboard.length}</div>
          </Card.Content>
        </Card>
      </div>

      <div className="flex flex-col items-center gap-3 border-t border-white/10 py-8">
        <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            variant="outline"
            size="lg"
            className="border-white/15 text-white"
            onPress={handleShareImage}
            isDisabled={isSharingImage || leaderboard.length === 0}
          >
            {isSharingImage ? 'Preparing image...' : 'Share leaderboard image'}
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="bg-white text-black"
            onPress={() => handleLeaveRoom()}
            isDisabled={isLeaving}
          >
            {isLeaving ? 'Leaving...' : 'Leave Room / Play again'}
          </Button>
        </div>
        <p className="text-sm text-white/45">Create a new room and start another round</p>
        {shareStatus && (
          <p className="text-sm text-emerald-300">{shareStatus}</p>
        )}
      </div>

      <AnimatePresence>
        {isLeaving && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md"
          >
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
            <div className="mt-4 text-sm font-medium uppercase tracking-widest text-white">Leaving the room...</div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

