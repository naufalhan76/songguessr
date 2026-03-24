'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { generateRoomCode } from '@songguessr/shared';
import Link from 'next/link';

export default function LandingPage() {
  const [roomCode, setRoomCode] = useState('');

  const handleCreateRoom = () => {
    const code = generateRoomCode();
    // In a real implementation, this would create a room in the backend
    // For now, we'll just navigate to the room page
    window.location.href = `/room/${code}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-800 to-blue-900 text-white">
      <div className="container mx-auto px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl md:text-7xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-pink-400">
            Songguessr
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mx-auto">
            A real‑time multiplayer game where you guess songs from your friends' Spotify playlists.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Create Room Card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 shadow-2xl"
          >
            <div className="mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">Create a Room</h2>
              <p className="text-gray-300">Start a new game and invite friends with a room code.</p>
            </div>
            <button
              onClick={handleCreateRoom}
              className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
            >
              Create New Room
            </button>
            <p className="text-sm text-gray-400 mt-4 text-center">
              You'll need to connect your Spotify account to share your top tracks.
            </p>
          </motion.div>

          {/* Join Room Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 shadow-2xl"
          >
            <div className="mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">Join a Room</h2>
              <p className="text-gray-300">Enter a room code to join an existing game.</p>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter 6‑digit code"
                className="w-full px-6 py-4 bg-white/5 border border-white/20 rounded-xl text-center text-2xl font-bold tracking-widest placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                maxLength={6}
              />
              <Link
                href={`/room/${roomCode}`}
                className={`block w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 ${roomCode.length === 6
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 transform hover:scale-[1.02]'
                    : 'bg-gray-700 cursor-not-allowed'
                  } text-center shadow-lg`}
              >
                Join Room
              </Link>
            </div>
            <p className="text-sm text-gray-400 mt-4 text-center">
              Ask your friend for the room code they created.
            </p>
          </motion.div>
        </div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-16 max-w-4xl mx-auto"
        >
          <h3 className="text-2xl font-bold mb-8 text-center">How It Works</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/5 p-6 rounded-xl border border-white/10">
              <div className="text-cyan-400 font-bold text-lg mb-2">1. Connect Spotify</div>
              <p className="text-gray-300">Grant access to your top tracks & recently played songs.</p>
            </div>
            <div className="bg-white/5 p-6 rounded-xl border border-white/10">
              <div className="text-cyan-400 font-bold text-lg mb-2">2. Join a Room</div>
              <p className="text-gray-300">Create or join a room with 2‑4 players using a unique code.</p>
            </div>
            <div className="bg-white/5 p-6 rounded-xl border border-white/10">
              <div className="text-cyan-400 font-bold text-lg mb-2">3. Guess & Score</div>
              <p className="text-gray-300">Listen to 30‑second previews and guess the song faster than others.</p>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="mt-16 text-center text-gray-400 text-sm"
        >
          <p>
            This game uses the Spotify Web API to fetch your listening data.
            Your data is only used during the game and is not stored permanently.
          </p>
          <p className="mt-2">
            By playing, you agree to our{' '}
            <a href="#" className="text-cyan-400 hover:underline">Terms of Service</a> and{' '}
            <a href="#" className="text-cyan-400 hover:underline">Privacy Policy</a>.
          </p>
        </motion.div>
      </div>
    </div>
  );
}