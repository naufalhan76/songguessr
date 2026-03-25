# muze.games

muze.games is a real-time multiplayer music guessing game built with Next.js and Supabase.
Players join a room, mark ready, manually pick songs for the match, then guess tracks from short YouTube-based previews.

## What Exists Today

- Guest-friendly room flow with shareable room links and QR join
- Lobby with ready state, host-managed settings, and clearer leave/share actions
- Song selection phase where each player adds songs into the room pool
- Privacy masking so players cannot see other players' exact picks before the match
- Duplicate song handling on match start, with automatic Top 100 fallback replacement
- Match sync loading screen so the game waits for every client before starting
- YouTube playback with autoplay fallback, Android audio priming, and randomized preview start positions
- Multiple-choice rounds with realtime answer syncing
- Speed scoring plus streak bonus scoring
- Intermission screen between rounds with recent rank, streak, and remaining-question info
- Auto-win when only one player remains in an active match
- Leaderboard image export for WhatsApp / social sharing
- Automatic room cleanup 2 minutes after a finished match, plus orphan track cache cleanup

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, Framer Motion, HeroUI
- Backend: Supabase Postgres, Realtime, SQL migrations
- Music sources: YouTube search / YouTube Top 100 playlist fallback
- Shared package: `packages/shared`

## Project Structure

```text
muze/
|- apps/
|  |- frontend/                     # Next.js app
|  |  |- app/                       # App Router routes and API handlers
|  |  |- components/                # UI and gameplay components
|  |  |- lib/                       # Supabase, YouTube, helpers
|  |- backend/
|     |- supabase/
|        |- migrations/             # SQL migrations
|- packages/
|  |- shared/                       # Shared TS types
|- ARCHITECTURE.md
`- README.md
```

## Game Flow

1. Host creates a room and shares the link or code.
2. Players join as guests and tap Ready.
3. Host starts song selection.
4. Each player adds songs to the room pool.
5. If picks are incomplete, fallback songs can be auto-filled.
6. When all clients finish loading, the match starts in sync.
7. Every round plays a short preview and all active players answer.
8. The round advances when everyone has answered or the timer expires.
9. Final leaderboard appears, can be shared, and the room is cleaned up automatically.

## Current Match Rules

- Room songs are hidden from other players during the selection phase.
- Duplicate songs are not exposed to users during selection.
- On match start, duplicate title + artist combinations are replaced in the backend.
- Preview start points are randomized per round from a small set of offsets.
- Correct answers earn points based on speed or correctness mode.
- Consecutive correct answers add streak bonuses.
- If only one player remains during an active match, that player auto-wins.

## Local Development

### Prerequisites

- Node.js 18+
- npm
- A Supabase project

### Install

```bash
npm install
```

### Frontend environment

Create `apps/frontend/.env.local` and fill in the required values:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

If you deploy the frontend, set `NEXT_PUBLIC_APP_URL` to the public domain.

### Run the frontend

```bash
npm run dev --workspace=frontend
```

### Typecheck

```bash
npx tsc --noEmit -p apps/frontend/tsconfig.json
```

### Production build

```bash
npm run build
```

## Supabase Setup

Apply the SQL migrations in order:

1. `apps/backend/supabase/migrations/0001_initial_schema.sql`
2. `apps/backend/supabase/migrations/0002_add_room_name.sql`
3. `apps/backend/supabase/migrations/0003_song_selection.sql`
4. `apps/backend/supabase/migrations/0004_add_youtube_id.sql`
5. `apps/backend/supabase/migrations/0005_auto_cleanup_finished_rooms.sql`
6. `apps/backend/supabase/migrations/0006_allow_duplicate_room_song_picks.sql`
7. `apps/backend/supabase/migrations/0007_enable_realtime_for_player_answers.sql`
8. `apps/backend/supabase/migrations/0008_cleanup_orphan_tracks.sql`

Important notes:

- `pg_cron` is used for automatic cleanup of finished rooms.
- `supabase_realtime` should include `rooms`, `players`, `game_rounds`, `room_songs`, and `player_answers`.
- Room cleanup removes match data, while orphaned cached tracks are cleaned separately once no longer referenced.

## Important Frontend Areas

- `apps/frontend/components/RoomLobby.tsx`
  Lobby, ready state, room settings, share / leave actions
- `apps/frontend/components/SongSelection.tsx`
  Song picking flow, masked room songs, auto-start countdown
- `apps/frontend/components/GamePlay.tsx`
  Match sync, rounds, answer flow, intermission, scoring UI
- `apps/frontend/components/AudioPlayer.tsx`
  YouTube playback, autoplay fallback, preview window control
- `apps/frontend/components/Leaderboard.tsx`
  Final rankings, shareable image, auto-leave cleanup flow

## API Routes Used By The App

- `POST /api/rooms`
- `GET /api/rooms/[code]`
- `POST /api/rooms/[code]/join`
- `POST /api/rooms/[code]/ready`
- `PATCH /api/rooms/[code]/settings`
- `GET /api/rooms/[code]/songs`
- `POST /api/rooms/[code]/songs`
- `DELETE /api/rooms/[code]/songs`
- `POST /api/rooms/[code]/start`
- `POST /api/rooms/[code]/answer`
- `POST /api/rooms/[code]/leave`
- `GET /api/youtube/search`

## Notes

- The `tracks` table is used as a cache, not as permanent match history.
- Temporary local planning notes inside `plans/` are intentionally not part of the repo history.

## License

MIT

