import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import YouTube from 'youtube-sr';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// GET /api/rooms/[code]/songs — list all songs in the room
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();

    // Get room
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    // Get room songs with track details
    const { data: roomSongs } = await supabase
      .from('room_songs')
      .select('*, tracks(*)')
      .eq('room_id', room.id)
      .order('added_at', { ascending: true });

    // Get player display names
    const { data: players } = await supabase
      .from('players')
      .select('id, display_name')
      .eq('room_id', room.id);

    const playerMap = new Map(
      (players ?? []).map((p) => [p.id, p.display_name ?? 'Player'])
    );

    const songs = (roomSongs ?? []).map((rs) => ({
      id: rs.id,
      player_id: rs.player_id,
      player_name: playerMap.get(rs.player_id) ?? 'Player',
      track: rs.tracks,
      added_at: rs.added_at,
    }));

    return NextResponse.json({ success: true, data: songs });
  } catch (err) {
    console.error('GET /api/rooms/[code]/songs error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/rooms/[code]/songs — add a song to the room
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json();

    const playerId = body.player_id as string;
    const spotifyTrack = body.track as {
      spotify_id: string;
      title: string;
      artists: string[];
      album: string;
      album_art_url: string;
      preview_url: string;
      duration_ms: number;
      popularity: number;
    };

    if (!playerId || !spotifyTrack?.spotify_id) {
      return NextResponse.json(
        { success: false, error: 'player_id and track are required' },
        { status: 400 }
      );
    }

    let youtubeId = null;
    if (!spotifyTrack.preview_url) {
      try {
        const query = `${spotifyTrack.artists.join(' ')} ${spotifyTrack.title} audiohq`;
        const video = await YouTube.searchOne(query, 'video', true);
        if (video && video.id) {
          youtubeId = video.id;
        }
      } catch (e) {
        console.error('youtube-sr fetch error', e);
      }
    }

    // Get room
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

    // Check player belongs to room
    const { data: player } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .eq('room_id', room.id)
      .single();

    if (!player) {
      return NextResponse.json({ success: false, error: 'Player not found in this room' }, { status: 403 });
    }

    // Check player quota
    const settings = room.settings as { rounds?: number; max_players?: number };
    const roundCount = settings.rounds ?? 10;

    const { data: allPlayers } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', room.id);

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

    // Upsert track into tracks table
    const { data: dbTrack, error: trackError } = await supabase
      .from('tracks')
      .upsert(
        {
          spotify_id: spotifyTrack.spotify_id,
          title: spotifyTrack.title,
          artists: spotifyTrack.artists,
          album: spotifyTrack.album,
          album_art_url: spotifyTrack.album_art_url,
          preview_url: spotifyTrack.preview_url || null,
          youtube_id: youtubeId,
          duration_ms: spotifyTrack.duration_ms,
          popularity: spotifyTrack.popularity,
          cached_at: new Date().toISOString(),
        },
        { onConflict: 'spotify_id' }
      )
      .select()
      .single();

    if (trackError || !dbTrack) {
      console.error('Failed to upsert track', trackError);
      return NextResponse.json({ success: false, error: 'Failed to save track' }, { status: 500 });
    }

    // Insert room_song
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
      },
    });
  } catch (err) {
    console.error('POST /api/rooms/[code]/songs error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/rooms/[code]/songs — remove a song from the room
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

    // Get room
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

    // Delete only if it belongs to this player
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
