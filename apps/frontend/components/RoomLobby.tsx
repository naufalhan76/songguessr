'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { Player, Room, User } from '@songguessr/shared';
import { signInWithSpotify } from '@/lib/supabase';

interface RoomLobbyProps {
  roomCode: string;
}

// Mock data for demonstration
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
  const [room, setRoom] = useState<Room>(mockRoom);
  const [players, setPlayers] = useState<Player[]>(mockPlayers);
  const [currentUser, setCurrentUser] = useState<User | null>(mockUser);
  const [isConnectingSpotify, setIsConnectingSpotify] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const isHost = currentUser?.id === room.host_id;
  const allPlayersReady = players.every(p => p.is_ready) && players.length >= 2;

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
    setIsReady((currentReady) => {
      const nextReady = !currentReady;
      setPlayers((currentPlayers) =>
        currentPlayers.map((player) =>
          player.user_id === currentUser?.id ? { ...player, is_ready: nextReady } : player
        )
      );
      return nextReady;
    });
    // In a real implementation, this would update via Supabase Realtime
  };

  const handleStartGame = () => {
    if (!allPlayersReady) {
      alert('All players must be ready and at least 2 players needed');
      return;
    }
    // In a real implementation, this would start the game
    alert('Game would start now!');
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    alert('Room code copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-800 to-blue-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-center mb-8"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Room: <span className="text-cyan-300">{roomCode}</span></h1>
            <p className="text-gray-300">Share this code with friends to join</p>
          </div>
          <div className="flex gap-4 mt-4 md:mt-0">
            <button
              onClick={handleCopyCode}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/30 rounded-xl font-medium transition-colors"
            >
              Copy Code
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-xl font-medium transition-colors"
            >
              Leave Room
            </button>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column: Players */}
          <div className="lg:col-span-2">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6">Players ({players.length}/4)</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {players.map((player, index) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className={`p-4 rounded-xl border ${player.is_ready ? 'bg-green-500/20 border-green-500/40' : 'bg-white/5 border-white/20'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center font-bold text-lg">
                        {player.user_id.slice(-2)}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold">{player.user_id === currentUser?.id ? 'You' : `Player ${index + 1}`}</div>
                        <div className="text-sm text-gray-300">
                          {player.is_ready ? (
                            <span className="text-green-400">✓ Ready</span>
                          ) : (
                            <span className="text-yellow-400">Waiting...</span>
                          )}
                        </div>
                      </div>
                      {player.user_id === room.host_id && (
                        <div className="px-3 py-1 bg-amber-500/30 text-amber-300 rounded-full text-xs font-bold">
                          Host
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Spotify Connection */}
              <div className="mt-8 pt-8 border-t border-white/20">
                <h3 className="text-xl font-bold mb-4">Connect Your Music</h3>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="flex-1">
                    <p className="text-gray-300 mb-2">
                      Connect your Spotify account to share your top tracks and recently played songs.
                      This data will be used to generate the quiz questions.
                    </p>
                    <p className="text-sm text-gray-400">
                      We only request read‑only access to your top tracks and recently played.
                    </p>
                  </div>
                  <button
                    onClick={handleConnectSpotify}
                    disabled={isConnectingSpotify}
                    className={`px-8 py-3 rounded-xl font-bold transition-all ${isConnectingSpotify
                        ? 'bg-gray-700 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 transform hover:scale-105'
                      }`}
                  >
                    {isConnectingSpotify ? 'Connecting...' : 'Connect Spotify'}
                  </button>
                </div>
              </div>
            </div>

            {/* Game Settings (Host only) */}
            {isHost && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl"
              >
                <h3 className="text-xl font-bold mb-4">Game Settings</h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Rounds</label>
                    <select className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-2">
                      <option>10</option>
                      <option>15</option>
                      <option>20</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Time per Round</label>
                    <select className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-2">
                      <option>30 seconds</option>
                      <option>45 seconds</option>
                      <option>60 seconds</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Point System</label>
                    <select className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-2">
                      <option>Speed‑based</option>
                      <option>Correct‑only</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right column: Controls */}
          <div>
            <div className="sticky top-8">
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl mb-6">
                <h3 className="text-xl font-bold mb-4">Room Status</h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Players Ready</span>
                    <span className="font-bold">{players.filter(p => p.is_ready).length}/{players.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Room Code</span>
                    <span className="font-mono font-bold">{roomCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Game Mode</span>
                    <span className="font-bold">Top Tracks</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Status</span>
                    <span className={`font-bold ${room.status === 'waiting' ? 'text-amber-400' : 'text-green-400'}`}>
                      {room.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl">
                <h3 className="text-xl font-bold mb-6">Ready Up</h3>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-lg">I'm ready to play</span>
                    <button
                      onClick={handleToggleReady}
                      className={`w-14 h-8 rounded-full transition-colors ${isReady ? 'bg-green-500' : 'bg-gray-700'}`}
                    >
                      <div className={`w-6 h-6 rounded-full bg-white transform transition-transform ${isReady ? 'translate-x-8' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <button
                    onClick={handleStartGame}
                    disabled={!allPlayersReady || !isHost}
                    className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${allPlayersReady && isHost
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 transform hover:scale-105'
                        : 'bg-gray-700 cursor-not-allowed'
                      }`}
                  >
                    {isHost ? 'Start Game' : 'Waiting for Host...'}
                  </button>

                  {!allPlayersReady && (
                    <p className="text-sm text-gray-400 text-center">
                      {players.length < 2
                        ? 'Need at least 2 players to start'
                        : 'All players must be ready'
                      }
                    </p>
                  )}
                </div>
              </div>

              {/* QR Code for mobile (placeholder) */}
              <div className="mt-6 bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl">
                <h3 className="text-xl font-bold mb-4">Join on Mobile</h3>
                <p className="text-gray-300 mb-4">
                  Scan this QR code to join this room on your phone.
                </p>
                <div className="bg-white p-4 rounded-lg inline-block">
                  <div className="w-32 h-32 bg-gray-300 flex items-center justify-center text-gray-600">
                    QR Code
                  </div>
                </div>
                <p className="text-sm text-gray-400 mt-4">
                  Or visit: <span className="font-mono">songguessr.app/join/{roomCode}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}