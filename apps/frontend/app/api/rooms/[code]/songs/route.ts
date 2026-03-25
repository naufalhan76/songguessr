import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
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

    const trackToInsert: TrackPayload = {
      ...requestedTrack,
      youtube_id: youtubeId || undefined,
    };

    const dbTrack = await saveTrack(supabase, {
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
          { success: false, error: 'This song is already in your pick list' },
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
