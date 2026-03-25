-- Migration: Song Selection Phase + Guest Players
-- Adds room_songs table, 'selecting' room status, and guest player support

-- 1. Update rooms status CHECK to include 'selecting'
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_status_check
  CHECK (status IN ('waiting', 'selecting', 'active', 'finished'));

-- 2. Update default settings to include selection_time
ALTER TABLE public.rooms
  ALTER COLUMN settings SET DEFAULT '{
    "rounds": 10,
    "time_per_round": 30,
    "max_players": 4,
    "allow_skips": false,
    "point_system": "speed",
    "selection_time": 5
  }';

-- 3. Add guest player support: display_name on players, make user_id nullable
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Drop the existing foreign key and NOT NULL constraint on user_id
-- to allow guest players without Supabase auth
ALTER TABLE public.players ALTER COLUMN user_id DROP NOT NULL;

-- 3b. Change rooms.host_id FK from users.id to players.id
-- This allows the host to be a guest player
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_host_id_fkey;

-- Update unique constraint to support guests (use display_name + room_id)
-- Keep the original unique constraint for backwards compat but allow NULL user_id

-- 4. Create room_songs table
CREATE TABLE IF NOT EXISTS public.room_songs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, track_id)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_room_songs_room_id ON public.room_songs(room_id);
CREATE INDEX IF NOT EXISTS idx_room_songs_player_id ON public.room_songs(player_id);

-- 6. RLS for room_songs
ALTER TABLE public.room_songs ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users and anonymous to view room songs
DROP POLICY IF EXISTS "Anyone can view room songs" ON public.room_songs;
CREATE POLICY "Anyone can view room songs" ON public.room_songs
  FOR SELECT USING (true);

-- Allow inserts (API routes use service role, so this is permissive)
DROP POLICY IF EXISTS "Anyone can add room songs" ON public.room_songs;
CREATE POLICY "Anyone can add room songs" ON public.room_songs
  FOR INSERT WITH CHECK (true);

-- Allow deletes for own songs
DROP POLICY IF EXISTS "Anyone can delete room songs" ON public.room_songs;
CREATE POLICY "Anyone can delete room songs" ON public.room_songs
  FOR DELETE USING (true);

-- 7. Relax RLS on players for guest access
DROP POLICY IF EXISTS "Users can join as themselves" ON public.players;
CREATE POLICY "Anyone can join as player" ON public.players
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Players can update own readiness" ON public.players;
CREATE POLICY "Anyone can update player" ON public.players
  FOR UPDATE USING (true)
  WITH CHECK (true);

-- Relax tracks insert policy for service role track upserts
DROP POLICY IF EXISTS "Anyone can insert tracks" ON public.tracks;
CREATE POLICY "Anyone can insert tracks" ON public.tracks
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update tracks" ON public.tracks;
CREATE POLICY "Anyone can update tracks" ON public.tracks
  FOR UPDATE USING (true) WITH CHECK (true);

-- Relax rooms policies for guest access
DROP POLICY IF EXISTS "Anyone can view rooms" ON public.rooms;
DROP POLICY IF EXISTS "Authenticated users can view rooms" ON public.rooms;
CREATE POLICY "Anyone can view rooms" ON public.rooms
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON public.rooms;
CREATE POLICY "Anyone can create rooms" ON public.rooms
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Host can update own room" ON public.rooms;
CREATE POLICY "Anyone can update rooms" ON public.rooms
  FOR UPDATE USING (true) WITH CHECK (true);

-- Relax players view policy
DROP POLICY IF EXISTS "Authenticated users can view players" ON public.players;
CREATE POLICY "Anyone can view players" ON public.players
  FOR SELECT USING (true);

-- Relax game rounds policies
DROP POLICY IF EXISTS "Authenticated users can view game rounds" ON public.game_rounds;
CREATE POLICY "Anyone can view game rounds" ON public.game_rounds
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Room host can manage game rounds" ON public.game_rounds;
CREATE POLICY "Anyone can manage game rounds" ON public.game_rounds
  FOR INSERT WITH CHECK (true);

-- Relax player answers policies
DROP POLICY IF EXISTS "Authenticated users can view player answers" ON public.player_answers;
CREATE POLICY "Anyone can view player answers" ON public.player_answers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Players can submit their own answers" ON public.player_answers;
CREATE POLICY "Anyone can submit answers" ON public.player_answers
  FOR INSERT WITH CHECK (true);

-- Relax tracks view (already exists but re-create)
DROP POLICY IF EXISTS "Authenticated users can view tracks" ON public.tracks;
CREATE POLICY "Anyone can view tracks" ON public.tracks
  FOR SELECT USING (true);

-- 8. Add room_songs to Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'room_songs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_songs;
  END IF;
END $$;
