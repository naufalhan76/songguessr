-- Automatically delete finished rooms and their related match data after 2 minutes.
-- Deleting the room cascades to players, room_songs, game_rounds, and player_answers.

CREATE EXTENSION IF NOT EXISTS pg_cron;

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
END;
$$;

DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'muze-cleanup-finished-rooms'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  BEGIN
    PERFORM cron.schedule(
      'muze-cleanup-finished-rooms',
      '30 seconds',
      $job$SELECT public.cleanup_expired_finished_rooms();$job$
    );
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM cron.schedule(
        'muze-cleanup-finished-rooms',
        '* * * * *',
        $job$SELECT public.cleanup_expired_finished_rooms();$job$
      );
  END;
END $$;

