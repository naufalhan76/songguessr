-- Extend cleanup so orphaned cached tracks from old matches do not pile up.
-- A track is considered orphaned when it is no longer referenced by:
-- - room_songs
-- - game_rounds
-- - player_answers.selected_track_id

CREATE OR REPLACE FUNCTION public.cleanup_expired_finished_rooms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rooms
  WHERE status = 'finished'
    AND ended_at IS NOT NULL
    AND ended_at <= NOW() - INTERVAL '2 minutes';

  DELETE FROM public.tracks t
  WHERE t.cached_at <= NOW() - INTERVAL '2 minutes'
    AND NOT EXISTS (
      SELECT 1
      FROM public.room_songs rs
      WHERE rs.track_id = t.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.game_rounds gr
      WHERE gr.track_id = t.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.player_answers pa
      WHERE pa.selected_track_id = t.id
    );
END;
$$;
