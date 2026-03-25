-- Add youtube_id column to tracks table to enable hybrid youtube audio playback
ALTER TABLE "public"."tracks" ADD COLUMN IF NOT EXISTS "youtube_id" text;
