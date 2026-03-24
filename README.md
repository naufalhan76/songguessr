# Songguessr 🎵

A real‑time multiplayer web game where players guess songs based on the "recently played" or "top tracks" of other players in the room.

## Features

- **Real‑time multiplayer** (2‑4 players) with room‑based lobbies
- **Spotify OAuth integration** to fetch users' top tracks & recently played
- **Interactive quiz** with 30‑second audio previews and multiple‑choice questions
- **Speed‑based scoring** – faster answers earn more points
- **Dynamic leaderboards** with fun trivia about whose playlist was played most
- **Mobile‑first responsive design** with smooth animations (Framer Motion)
- **Supabase backend** for authentication, real‑time sync, and database

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Supabase (PostgreSQL, Realtime, Auth, Edge Functions)
- **External API**: Spotify Web API
- **Deployment**: Vercel (frontend), Supabase (backend)

## Project Structure

```
songguessr/
├── apps/
│   ├── frontend/          # Next.js application
│   │   ├── app/           # App Router pages
│   │   ├── components/    # React components
│   │   └── lib/           # Utilities, Supabase client
│   └── backend/           # Supabase migrations & Edge Functions
│       └── supabase/migrations/
├── packages/
│   └── shared/            # Shared TypeScript types & utilities
├── ARCHITECTURE.md        # Detailed architecture & data models
└── README.md              # This file
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- A [Supabase](https://supabase.com) project
- A [Spotify Developer](https://developer.spotify.com/dashboard) app

### 1. Clone the repository

```bash
git clone <repository-url>
cd songguessr
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example environment file and fill in your credentials:

```bash
cd apps/frontend
cp .env.example .env.local
```

Edit `.env.local` with your Supabase and Spotify credentials.

### 4. Set up Supabase

1. Create a new Supabase project.
2. Run the initial migration (`apps/backend/supabase/migrations/0001_initial_schema.sql`) in the Supabase SQL editor.
3. Enable the `supabase_realtime` publication for the tables `rooms`, `players`, and `game_rounds`.
4. Note your project URL and anon key for the environment variables.

### 5. Set up Spotify OAuth

1. Configure Spotify as the provider in your Supabase project.
2. Add your deployed app callback URL to the allowed redirect URLs in Supabase, for example `https://your-vercel-app.vercel.app/auth/callback`.
3. Copy the Client ID and Client Secret to your environment variables.

### 6. Deploy to Vercel

1. Push this repository to GitHub.
2. Import the GitHub repo into Vercel.
3. Set the environment variables from `apps/frontend/.env.example` in the Vercel project settings.
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain.
5. Make sure the Supabase redirect allowlist includes your Vercel callback URL.
6. Deploy the frontend and use the Vercel URL instead of localhost.

### 7. Run the development server

From the root directory:

```bash
npm run dev
```

Or run frontend and backend separately:

```bash
npm run dev:frontend
# In another terminal
npm run dev:backend
```

The frontend will be available at [http://localhost:3000](http://localhost:3000) locally, and at your Vercel domain after deployment.

## Game Flow

1. **Lobby**: Host creates a room, shares the 6‑digit code. Players join and connect their Spotify accounts.
2. **Track Pooling**: Once all players are ready, the backend fetches each player's top tracks, filters for available previews, and selects 10 random tracks.
3. **Quiz Rounds** (10 rounds):
   - A 30‑second audio preview plays.
   - Four multiple‑choice options appear (one correct, three distractors from the same pool).
   - Players answer as quickly as possible.
   - Points are awarded based on correctness and speed.
4. **Leaderboard**: After the final round, players see their rankings, total points, and fun stats.

## API Endpoints (Planned)

- `POST /api/rooms` – create a new room
- `GET /api/rooms/:code` – get room details
- `POST /api/rooms/:code/join` – join a room
- `POST /api/spotify/auth` – initiate Spotify OAuth
- `GET /api/spotify/callback` – OAuth callback
- `GET /api/spotify/tracks` – fetch user's top tracks
- `WS /realtime` – Supabase Realtime WebSocket for game events

## Development Roadmap

- [x] Project architecture & data models
- [x] Monorepo setup with Next.js frontend
- [x] Room lobby UI boilerplate
- [x] Supabase migration schema
- [ ] Implement Supabase Auth with Spotify OAuth
- [ ] Real‑time room synchronization (Supabase Realtime)
- [ ] Spotify track fetching & caching
- [ ] Quiz game UI with audio player
- [ ] Scoring system & leaderboard
- [ ] Mobile responsiveness & polish
- [ ] Deployment to Vercel & Supabase

## License

MIT