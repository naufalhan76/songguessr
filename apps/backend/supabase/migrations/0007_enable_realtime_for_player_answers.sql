-- Ensure answer submissions are broadcast in realtime so rounds can end
-- immediately when all active players have answered.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'player_answers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.player_answers;
  END IF;
END $$;
