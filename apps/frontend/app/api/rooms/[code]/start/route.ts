import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// POST /api/rooms/[code]/start — start the game (host only)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));

    const hostId = body.host_id as string | undefined;
    if (!hostId) {
      return NextResponse.json({ success: false, error: 'host_id is required' }, { status: 400 });
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

    if (room.host_id !== hostId) {
      return NextResponse.json({ success: false, error: 'Only the host can start the game' }, { status: 403 });
    }

    if (room.status !== 'waiting') {
      return NextResponse.json({ success: false, error: 'Game already started' }, { status: 400 });
    }

    // Check all players are ready and at least 2
    const { data: players } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id);

    if (!players || players.length < 2) {
      return NextResponse.json({ success: false, error: 'Need at least 2 players' }, { status: 400 });
    }

    const allReady = players.every((p) => p.is_ready);
    if (!allReady) {
      return NextResponse.json({ success: false, error: 'All players must be ready' }, { status: 400 });
    }

    // Fetch tracks from all players and build rounds
    const roundCount = (room.settings as { rounds?: number })?.rounds ?? 10;

    // Collect Spotify tracks from all players via their user records
    const userIds = players.map((p) => p.user_id);
    const { data: users } = await supabase
      .from('users')
      .select('id, spotify_access_token')
      .in('id', userIds);

    const allTracks: Array<{
      spotify_id: string;
      title: string;
      artists: string[];
      album: string;
      preview_url: string;
      album_art_url: string;
      duration_ms: number;
      popularity: number;
    }> = [];

    for (const user of users ?? []) {
      if (!user.spotify_access_token) continue;

      try {
        const res = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term', {
          headers: { Authorization: `Bearer ${user.spotify_access_token}` },
        });

        if (!res.ok) continue;

        const data = await res.json();
        for (const item of data.items ?? []) {
          if (!item.preview_url) continue;
          allTracks.push({
            spotify_id: item.id,
            title: item.name,
            artists: item.artists.map((a: { name: string }) => a.name),
            album: item.album.name,
            preview_url: item.preview_url,
            album_art_url: item.album.images?.[0]?.url ?? '',
            duration_ms: item.duration_ms,
            popularity: item.popularity,
          });
        }
      } catch (e) {
        console.error(`Failed to fetch tracks for user ${user.id}`, e);
      }
    }

    // Deduplicate, shuffle, pick tracks for rounds
    const uniqueMap = new Map<string, (typeof allTracks)[0]>();
    for (const t of allTracks) {
      if (!uniqueMap.has(t.spotify_id)) uniqueMap.set(t.spotify_id, t);
    }
    const uniqueTracks = [...uniqueMap.values()];

    // Shuffle
    for (let i = uniqueTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uniqueTracks[i], uniqueTracks[j]] = [uniqueTracks[j], uniqueTracks[i]];
    }

    const selectedTracks = uniqueTracks.slice(0, Math.max(roundCount, 4));

    if (selectedTracks.length < 4) {
      return NextResponse.json(
        { success: false, error: `Not enough tracks with previews. Found ${selectedTracks.length}, need at least 4.` },
        { status: 400 }
      );
    }

    // Upsert tracks into DB
    for (const t of selectedTracks) {
      await supabase.from('tracks').upsert(
        { ...t, cached_at: new Date().toISOString() },
        { onConflict: 'spotify_id' }
      );
    }

    // Re-fetch the track IDs
    const spotifyIds = selectedTracks.map((t) => t.spotify_id);
    const { data: dbTracks } = await supabase
      .from('tracks')
      .select('*')
      .in('spotify_id', spotifyIds);

    if (!dbTracks || dbTracks.length < 4) {
      return NextResponse.json({ success: false, error: 'Failed to persist tracks' }, { status: 500 });
    }

    // Create game rounds
    const roundTracks = dbTracks.slice(0, roundCount);
    for (let i = 0; i < roundTracks.length; i++) {
      await supabase.from('game_rounds').insert({
        room_id: room.id,
        round_number: i + 1,
        track_id: roundTracks[i].id,
      });
    }

    // Update room status to active
    await supabase
      .from('rooms')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', room.id);

    return NextResponse.json({
      success: true,
      data: {
        room_id: room.id,
        total_rounds: roundTracks.length,
        tracks: dbTracks,
      },
    });
  } catch (err) {
    console.error('POST /api/rooms/[code]/start error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
