import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getTop100Indonesia } from '@/lib/youtube';
import YouTube from 'youtube-sr';

interface RouteContext {
  params: Promise<{ code: string }>;
}

type TrackPayload = {
  spotify_id: string;
  title: string;
  artists: string[];
  album: string;
  album_art_url: string;
  preview_url: string | null;
  youtube_id?: string;
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
  const normalizedTitle = normalizeText(candidate.title);
  const existingTitle = normalizeText(existing.title);
  if (!normalizedTitle || normalizedTitle !== existingTitle) {
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

async function saveTrack(
  supabase: ReturnType<typeof createServiceClient>,
  track: TrackPayload
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
    throw new Error('Failed to save track');
  }

  return data;
}

async function getFallbackTrack(
  supabase: ReturnType<typeof createServiceClient>,
  existingTracks: Array<{ spotify_id: string; title: string; artists: string[] }>
) {
  const topTracks = await getTop100Indonesia();

  const availableTrack = topTracks.find((track) => {
    return !existingTracks.some((existingTrack) => (
      existingTrack.spotify_id === track.spotify_id
      || isDuplicateSong(track, existingTrack)
    ));
  });

  if (!availableTrack) {
    throw new Error('No fallback songs available');
  }

  return saveTrack(supabase, availableTrack);
}

// GET /api/rooms/[code]/songs - list room songs
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const currentPlayerId = request.nextUrl.searchParams.get('player_id');

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    const { data: roomSongs } = await supabase
      .from('room_songs')
      .select('*, tracks(*)')
      .eq('room_id', room.id)
      .order('added_at', { ascending: true });

    const { data: players } = await supabase
      .from('players')
      .select('id, display_name')
      .eq('room_id', room.id);

    const playerMap = new Map((players ?? []).map((player) => [player.id, player.display_name ?? 'Player']));
    const songsPerPlayer = Math.ceil(((room.settings as { rounds?: number }).rounds ?? 10) / Math.max((players ?? []).length, 1));

    const songs = (roomSongs ?? []).map((roomSong, index) => {
      const playerName = playerMap.get(roomSong.player_id) ?? 'Player';
      const isOwner = currentPlayerId === roomSong.player_id;
      const playerSongIndex = (roomSongs ?? [])
        .filter((entry) => entry.player_id === roomSong.player_id && new Date(entry.added_at).getTime() <= new Date(roomSong.added_at).getTime())
        .length;

      return {
        id: roomSong.id,
        player_id: roomSong.player_id,
        player_name: playerName,
        track: isOwner ? roomSong.tracks : null,
        masked_label: `${playerName} telah menambahkan lagu ke-${playerSongIndex}`,
        masked_slot: Math.min(playerSongIndex, songsPerPlayer),
        order: index + 1,
        added_at: roomSong.added_at,
      };
    });

    return NextResponse.json({ success: true, data: songs });
  } catch (err) {
    console.error('GET /api/rooms/[code]/songs error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/rooms/[code]/songs - add a song to the room
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json();

    const playerId = body.player_id as string;
    const requestedTrack = body.track as TrackPayload;

    if (!playerId || !requestedTrack?.spotify_id) {
      return NextResponse.json(
        { success: false, error: 'player_id and track are required' },
        { status: 400 }
      );
    }

    let youtubeId = requestedTrack.youtube_id || null;
    if (!youtubeId && !requestedTrack.preview_url) {
      try {
        const query = `${requestedTrack.artists.join(' ')} ${requestedTrack.title} audio`;
        const video = await YouTube.searchOne(query, 'video', true);
        if (video?.id) {
          youtubeId = video.id;
        }
      } catch (error) {
        console.error('youtube-sr fetch error', error);
      }
    }

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    if (room.status !== 'selecting') {
      return NextResponse.json(
        { success: false, error: 'Room is not in song selection phase' },
        { status: 400 }
      );
    }

    const { data: player } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .eq('room_id', room.id)
      .single();

    if (!player) {
      return NextResponse.json({ success: false, error: 'Player not found in this room' }, { status: 403 });
    }

    const { data: allPlayers } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', room.id);

    const roundCount = (room.settings as { rounds?: number }).rounds ?? 10;
    const playerCount = allPlayers?.length ?? 1;
    const songsPerPlayer = Math.ceil(roundCount / playerCount);

    const { count: playerSongCount } = await supabase
      .from('room_songs')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .eq('player_id', playerId);

    if ((playerSongCount ?? 0) >= songsPerPlayer) {
      return NextResponse.json(
        { success: false, error: `You've already added your maximum of ${songsPerPlayer} songs` },
        { status: 400 }
      );
    }

    const { data: existingRoomSongs } = await supabase
      .from('room_songs')
      .select('player_id, tracks(*)')
      .eq('room_id', room.id);

    const existingTracks = ((existingRoomSongs ?? []) as unknown as Array<{
      player_id: string;
      tracks: { spotify_id: string; title: string; artists: string[] } | null;
    }>)
      .map((roomSong) => roomSong.tracks)
      .filter((track): track is { spotify_id: string; title: string; artists: string[] } => Boolean(track));

    let trackToInsert: TrackPayload = {
      ...requestedTrack,
      youtube_id: youtubeId || undefined,
    };
    let replacementMessage: string | null = null;

    const duplicateFound = existingTracks.some((track) => isDuplicateSong(trackToInsert, track));
    if (duplicateFound) {
      const fallbackTrack = await getFallbackTrack(
        supabase,
        existingTracks.map((track) => ({
          spotify_id: track.spotify_id,
          title: track.title,
          artists: track.artists,
        }))
      );

      trackToInsert = {
        spotify_id: fallbackTrack.spotify_id,
        title: fallbackTrack.title,
        artists: fallbackTrack.artists,
        album: fallbackTrack.album,
        album_art_url: fallbackTrack.album_art_url,
        preview_url: fallbackTrack.preview_url,
        youtube_id: fallbackTrack.youtube_id || undefined,
        duration_ms: fallbackTrack.duration_ms,
        popularity: fallbackTrack.popularity,
      };

      replacementMessage = 'Duplicate song detected. We replaced it with a Top 100 fallback.';
    }

    const dbTrack = duplicateFound
      ? await saveTrack(supabase, trackToInsert)
      : await saveTrack(supabase, {
          ...trackToInsert,
          youtube_id: trackToInsert.youtube_id || undefined,
        });

    const { data: roomSong, error: songError } = await supabase
      .from('room_songs')
      .insert({
        room_id: room.id,
        player_id: playerId,
        track_id: dbTrack.id,
      })
      .select()
      .single();

    if (songError) {
      if (songError.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'This song has already been added to the room' },
          { status: 409 }
        );
      }
      console.error('Failed to insert room_song', songError);
      return NextResponse.json({ success: false, error: 'Failed to add song' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        room_song: roomSong,
        track: dbTrack,
        songs_added: (playerSongCount ?? 0) + 1,
        songs_quota: songsPerPlayer,
        replacement_message: replacementMessage,
      },
    });
  } catch (err) {
    console.error('POST /api/rooms/[code]/songs error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/rooms/[code]/songs - remove a song from the room
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json();

    const playerId = body.player_id as string;
    const roomSongId = body.room_song_id as string;

    if (!playerId || !roomSongId) {
      return NextResponse.json(
        { success: false, error: 'player_id and room_song_id are required' },
        { status: 400 }
      );
    }

    const { data: room } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (!room || room.status !== 'selecting') {
      return NextResponse.json(
        { success: false, error: 'Can only remove songs during selection phase' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('room_songs')
      .delete()
      .eq('id', roomSongId)
      .eq('player_id', playerId)
      .eq('room_id', room.id);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to remove song' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/rooms/[code]/songs error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
