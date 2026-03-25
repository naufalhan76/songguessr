-- Allow players to submit the same source track during song selection.
-- Duplicate title/artist handling is deferred to match start logic.

ALTER TABLE public.room_songs
  DROP CONSTRAINT IF EXISTS room_songs_room_id_track_id_key;

CREATE INDEX IF NOT EXISTS idx_room_songs_room_id_track_id
  ON public.room_songs(room_id, track_id);
