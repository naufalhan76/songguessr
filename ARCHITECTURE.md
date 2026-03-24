# Songguessr - Architecture & Data Models

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Supabase (PostgreSQL, Realtime, Auth, Edge Functions)
- **External APIs**: Spotify Web API
- **Deployment**: Vercel (frontend), Supabase (backend)

## Project Structure (Monorepo)

```
songguessr/
├── apps/
│   ├── frontend/          # Next.js app
│   └── backend/           # Supabase Edge Functions & migrations
├── packages/
│   └── shared/            # Shared TypeScript types & utilities
├── package.json           # Root workspace config
└── ARCHITECTURE.md
```

## Data Models

### 1. User (Supabase Auth)
- `id` (uuid, primary key) - matches auth.users.id
- `email` (text)
- `display_name` (text)
- `avatar_url` (text)
- `spotify_access_token` (text, encrypted)
- `spotify_refresh_token` (text, encrypted)
- `spotify_expires_at` (timestamptz)
- `created_at` (timestamptz)

### 2. Room
- `id` (uuid, primary key)
- `code` (text, unique) - 6-character room code
- `host_id` (uuid, references users.id)
- `status` (enum: 'waiting', 'active', 'finished')
- `settings` (jsonb) - e.g., rounds, time per round
- `created_at` (timestamptz)
- `started_at` (timestamptz)
- `ended_at` (timestamptz)

### 3. Player (Room Participant)
- `id` (uuid, primary key)
- `room_id` (uuid, references rooms.id)
- `user_id` (uuid, references users.id)
- `score` (integer, default 0)
- `is_ready` (boolean, default false)
- `joined_at` (timestamptz)

### 4. Track (Spotify Track Cache)
- `id` (uuid, primary key)
- `spotify_id` (text, unique)
- `title` (text)
- `artists` (text[]) - array of artist names
- `album` (text)
- `preview_url` (text)
- `duration_ms` (integer)
- `popularity` (integer)
- `album_art_url` (text)
- `cached_at` (timestamptz)

### 5. Game Round
- `id` (uuid, primary key)
- `room_id` (uuid, references rooms.id)
- `round_number` (integer, 1-10)
- `track_id` (uuid, references tracks.id)
- `started_at` (timestamptz)
- `ended_at` (timestamptz)

### 6. Player Answer
- `id` (uuid, primary key)
- `round_id` (uuid, references game_rounds.id)
- `player_id` (uuid, references players.id)
- `selected_track_id` (uuid, references tracks.id) - which track they guessed
- `is_correct` (boolean)
- `time_taken_ms` (integer) - milliseconds from round start
- `points_awarded` (integer)
- `answered_at` (timestamptz)

## Real-time Events (Supabase Realtime)

We'll use Supabase Realtime for broadcasting game state changes.

### Channels:
- `room:{room_id}` - all players in a room
- `player:{player_id}` - private channel for individual player updates

### Events:
- `player_joined`, `player_left`, `player_ready`
- `round_started`, `round_ended`
- `answer_submitted`, `score_updated`
- `game_ended`

## Spotify OAuth Flow

1. User clicks "Connect Spotify" in lobby
2. Redirect to Spotify OAuth (scopes: `user-top-read`, `user-read-recently-played`)
3. Spotify callback → Supabase Edge Function exchanges code for tokens
4. Tokens stored encrypted in user record
5. Frontend can fetch tracks via backend proxy (to keep tokens secret)

## Game Flow

1. **Lobby**: Host creates room, shares code. Players join, connect Spotify, mark ready.
2. **Track Pooling**: Backend fetches top tracks from each player (via Spotify API), filters for preview_url, selects 10 random tracks.
3. **Quiz Rounds**: Each round plays 30s preview, shows 4 choices, timer counts down.
4. **Scoring**: Base points + speed multiplier (e.g., `base * (1 + (30 - time_taken)/30)`).
5. **Leaderboard**: After 10 rounds, show rankings and stats.

## Next Steps

- Set up Supabase project and database schema
- Implement authentication with Supabase Auth
- Create Spotify OAuth integration
- Build room lobby UI
- Implement real-time game state synchronization