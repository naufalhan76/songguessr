import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getTop100Indonesia } from '@/lib/youtube';

interface RouteContext {
  params: Promise<{ code: string }>;
}

type BasicTrack = {
  id: string;
  spotify_id: string;
  title: string;
  artists: string[];
  album: string;
  album_art_url: string;
  preview_url: string | null;
  youtube_id: string | null;
  duration_ms: number;
  popularity: number;
};

type FallbackTrack = {
  spotify_id: string;
  title: string;
  artists: string[];
  album: string;
  album_art_url: string;
  preview_url: string | null;
  youtube_id: string;
  duration_ms: number;
  popularity: number;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArtists(artists: string[]) {
  return artists
    .map(normalizeText)
    .filter(Boolean);
}

function isDuplicateSong(
  candidate: { title: string; artists: string[] },
  existing: { title: string; artists: string[] }
) {
  const candidateTitle = normalizeText(candidate.title);
  const existingTitle = normalizeText(existing.title);

  if (!candidateTitle || candidateTitle !== existingTitle) {
    return false;
  }

  const candidateArtists = normalizeArtists(candidate.artists);
  const existingArtists = normalizeArtists(existing.artists);

  return candidateArtists.some((artist) => (
    existingArtists.some((existingArtist) => (
      artist === existingArtist
      || artist.includes(existingArtist)
      || existingArtist.includes(artist)
    ))
  ));
}

function isPlayableTrack(track: Pick<BasicTrack, 'preview_url' | 'youtube_id'>) {
  return Boolean(track.preview_url || track.youtube_id);
}

function getTrackFromRelation(value: unknown): BasicTrack | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return (value[0] as BasicTrack | undefined) ?? null;
  }
  return value as BasicTrack;
}

async function saveTrack(
  supabase: ReturnType<typeof createServiceClient>,
  track: FallbackTrack
) {
  const { data, error } = await supabase
    .from('tracks')
    .upsert(
      {
        spotify_id: track.spotify_id,
        title: track.title,
        artists: track.artists,
        album: track.album,
        album_art_url: track.album_art_url,
        preview_url: track.preview_url || null,
        youtube_id: track.youtube_id || null,
        duration_ms: track.duration_ms,
        popularity: track.popularity,
        cached_at: new Date().toISOString(),
      },
      { onConflict: 'spotify_id' }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error('Failed to save fallback track');
  }

  return data as BasicTrack;
}

async function pickFallbackTrack(
  supabase: ReturnType<typeof createServiceClient>,
  fallbackPool: FallbackTrack[],
  usedTracks: Array<{ spotify_id: string; title: string; artists: string[] }>
) {
  const availableTrack = fallbackPool.find((track) => (
    !usedTracks.some((usedTrack) => (
      usedTrack.spotify_id === track.spotify_id
      || isDuplicateSong(track, usedTrack)
    ))
  ));

  if (!availableTrack) {
    throw new Error('No fallback songs available');
  }

  return saveTrack(supabase, availableTrack);
}

// POST /api/rooms/[code]/start - start the game (host only, from selecting phase)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));

    const hostPlayerId = body.host_player_id as string | undefined;
    if (!hostPlayerId) {
      return NextResponse.json({ success: false, error: 'host_player_id is required' }, { status: 400 });
    }

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    if (room.host_id !== hostPlayerId) {
      return NextResponse.json({ success: false, error: 'Only the host can start the game' }, { status: 403 });
    }

    if (room.status !== 'selecting') {
      return NextResponse.json({ success: false, error: 'Room must be in song selection phase to start' }, { status: 400 });
    }

    const { data: players } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id);

    if (!players || players.length < 2) {
      return NextResponse.json({ success: false, error: 'Need at least 2 players' }, { status: 400 });
    }

    const settings = room.settings as { rounds?: number };
    const roundCount = settings.rounds ?? 10;

    const { data: roomSongs } = await supabase
      .from('room_songs')
      .select('id, player_id, track_id, added_at, tracks(*)')
      .eq('room_id', room.id)
      .order('added_at', { ascending: true });

    let fallbackPool: FallbackTrack[] = [];
    try {
      fallbackPool = await getTop100Indonesia();
    } catch (error) {
      console.error('Failed to fetch Top 100 Indonesia fallback pool', error);
    }
    const resolvedTracks: BasicTrack[] = [];

    for (const roomSong of roomSongs ?? []) {
      const track = getTrackFromRelation(roomSong.tracks);
      const shouldReplace =
        !track
        || !isPlayableTrack(track)
        || resolvedTracks.some((existingTrack) => isDuplicateSong(track, existingTrack));

      if (!shouldReplace && track) {
        resolvedTracks.push(track);
        continue;
      }

      try {
        const fallbackTrack = await pickFallbackTrack(
          supabase,
          fallbackPool,
          resolvedTracks.map((existingTrack) => ({
            spotify_id: existingTrack.spotify_id,
            title: existingTrack.title,
            artists: existingTrack.artists,
          }))
        );

        resolvedTracks.push(fallbackTrack);
      } catch (error) {
        console.error('Failed to replace duplicate room song', error);
      }
    }

    const neededSongs = Math.max(roundCount, 4);
    while (resolvedTracks.length < neededSongs) {
      try {
        const fallbackTrack = await pickFallbackTrack(
          supabase,
          fallbackPool,
          resolvedTracks.map((existingTrack) => ({
            spotify_id: existingTrack.spotify_id,
            title: existingTrack.title,
            artists: existingTrack.artists,
          }))
        );

        resolvedTracks.push(fallbackTrack);
      } catch (error) {
        console.error('Failed to auto-fill from Top 100 Indonesia', error);
        break;
      }
    }

    if (resolvedTracks.length < 4) {
      return NextResponse.json(
        { success: false, error: `Not enough songs. Found ${resolvedTracks.length}, need at least 4.` },
        { status: 400 }
      );
    }

    for (let i = resolvedTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [resolvedTracks[i], resolvedTracks[j]] = [resolvedTracks[j], resolvedTracks[i]];
    }

    const roundTracks = resolvedTracks.slice(0, roundCount);

    await supabase
      .from('game_rounds')
      .delete()
      .eq('room_id', room.id);

    for (let i = 0; i < roundTracks.length; i++) {
      await supabase.from('game_rounds').insert({
        room_id: room.id,
        round_number: i + 1,
        track_id: roundTracks[i].id,
      });
    }

    await supabase
      .from('rooms')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', room.id);

    let distractorTracks: Array<{ id: string; title: string; artists: string[] }> = [];
    try {
      const gameTrackTitles = new Set(resolvedTracks.map((track) => track.title.toLowerCase()));
      distractorTracks = fallbackPool
        .filter((track) => !gameTrackTitles.has(track.title.toLowerCase()))
        .slice(0, 20)
        .map((track) => ({ id: `distractor_${track.spotify_id}`, title: track.title, artists: track.artists }));
    } catch (error) {
      console.error('Failed to prepare distractor tracks', error);
    }

    return NextResponse.json({
      success: true,
      data: {
        room_id: room.id,
        total_rounds: roundTracks.length,
        tracks: resolvedTracks,
        distractor_tracks: distractorTracks,
      },
    });
  } catch (err) {
    console.error('POST /api/rooms/[code]/start error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
