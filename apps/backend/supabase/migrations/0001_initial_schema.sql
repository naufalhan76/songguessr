-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  spotify_access_token TEXT,
  spotify_refresh_token TEXT,
  spotify_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  host_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
  settings JSONB NOT NULL DEFAULT '{
    "rounds": 10,
    "time_per_round": 30,
    "max_players": 4,
    "allow_skips": false,
    "point_system": "speed"
  }',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- Players (room participants)
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

-- Tracks cache (Spotify tracks)
CREATE TABLE IF NOT EXISTS public.tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spotify_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  artists TEXT[] NOT NULL,
  album TEXT NOT NULL,
  preview_url TEXT,
  duration_ms INTEGER NOT NULL,
  popularity INTEGER,
  album_art_url TEXT,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- Game rounds
CREATE TABLE IF NOT EXISTS public.game_rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  UNIQUE(room_id, round_number)
);

-- Player answers
CREATE TABLE IF NOT EXISTS public.player_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  selected_track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  is_correct BOOLEAN NOT NULL,
  time_taken_ms INTEGER NOT NULL,
  points_awarded INTEGER NOT NULL,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, player_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(code);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON public.players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_user_id ON public.players(user_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_room_id ON public.game_rounds(room_id);
CREATE INDEX IF NOT EXISTS idx_player_answers_round_id ON public.player_answers(round_id);
CREATE INDEX IF NOT EXISTS idx_player_answers_player_id ON public.player_answers(player_id);

-- Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_answers ENABLE ROW LEVEL SECURITY;

-- Policies
-- Users can read their own data
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Rooms: host and room members can read, host can create/update
DROP POLICY IF EXISTS "Room members can view rooms" ON public.rooms;
CREATE POLICY "Room members can view rooms" ON public.rooms
  FOR SELECT USING (
    auth.uid() = host_id
    OR EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.room_id = rooms.id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create rooms" ON public.rooms;
CREATE POLICY "Authenticated users can create rooms" ON public.rooms
  FOR INSERT WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Host can update own room" ON public.rooms;
CREATE POLICY "Host can update own room" ON public.rooms
  FOR UPDATE USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

-- Players: room members can view, users can join/ready themselves
DROP POLICY IF EXISTS "Room members can view players" ON public.players;
CREATE POLICY "Room members can view players" ON public.players
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id = players.room_id
        AND r.host_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.room_id = players.room_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can join as themselves" ON public.players;
CREATE POLICY "Users can join as themselves" ON public.players
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Players can update own readiness" ON public.players;
CREATE POLICY "Players can update own readiness" ON public.players
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Tracks and game state: only authenticated room members should read them
DROP POLICY IF EXISTS "Authenticated users can view tracks" ON public.tracks;
CREATE POLICY "Authenticated users can view tracks" ON public.tracks
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Room members can view game rounds" ON public.game_rounds;
CREATE POLICY "Room members can view game rounds" ON public.game_rounds
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id = game_rounds.room_id
        AND (
          r.host_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.players p
            WHERE p.room_id = r.id
              AND p.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Room host can manage game rounds" ON public.game_rounds;
CREATE POLICY "Room host can manage game rounds" ON public.game_rounds
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id = game_rounds.room_id
        AND r.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Room members can view player answers" ON public.player_answers;
CREATE POLICY "Room members can view player answers" ON public.player_answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.players p
      JOIN public.game_rounds gr ON gr.id = player_answers.round_id
      WHERE p.id = player_answers.player_id
        AND p.room_id = gr.room_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.rooms r
            WHERE r.id = gr.room_id
              AND r.host_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.players room_player
            WHERE room_player.room_id = p.room_id
              AND room_player.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Players can submit their own answers" ON public.player_answers;
CREATE POLICY "Players can submit their own answers" ON public.player_answers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.players p
      JOIN public.game_rounds gr ON gr.id = player_answers.round_id
      WHERE p.id = player_answers.player_id
        AND p.user_id = auth.uid()
        AND p.room_id = gr.room_id
    )
  );

-- Enable realtime for rooms and players
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'game_rounds'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rounds;
  END IF;
END $$;