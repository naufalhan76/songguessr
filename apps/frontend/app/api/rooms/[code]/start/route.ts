import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
// Spotify auto-fill (kept for hybrid mode later):
// import { getTop100Global } from '@/lib/spotify';
import { getTop100Indonesia } from '@/lib/youtube';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// POST /api/rooms/[code]/start — start the game (host only, from selecting phase)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));

    const hostPlayerId = body.host_player_id as string | undefined;
    if (!hostPlayerId) {
      return NextResponse.json({ success: false, error: 'host_player_id is required' }, { status: 400 });
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

    if (room.host_id !== hostPlayerId) {
      return NextResponse.json({ success: false, error: 'Only the host can start the game' }, { status: 403 });
    }

    if (room.status !== 'selecting') {
      return NextResponse.json({ success: false, error: 'Room must be in song selection phase to start' }, { status: 400 });
    }

    // Get all players
    const { data: players } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id);

    if (!players || players.length < 2) {
      return NextResponse.json({ success: false, error: 'Need at least 2 players' }, { status: 400 });
    }

    const settings = room.settings as { rounds?: number };
    const roundCount = settings.rounds ?? 10;

    // Get all room songs with their tracks
    const { data: roomSongs } = await supabase
      .from('room_songs')
      .select('*, tracks(*)')
      .eq('room_id', room.id);

    let existingTracks = (roomSongs ?? [])
      .map((rs) => rs.tracks)
      .filter((t): t is NonNullable<typeof t> => !!t && (!!t.preview_url || !!t.youtube_id));

    // Auto-fill from Top 100 Global if not enough songs
    const neededSongs = Math.max(roundCount, 4);
    if (existingTracks.length < neededSongs) {
      const shortage = neededSongs - existingTracks.length;
      console.log(`Auto-filling ${shortage} songs from YouTube Top 100 Indonesia`);

      try {
        const globalTracks = await getTop100Indonesia();

        // Filter out tracks already in the room
        const existingSpotifyIds = new Set(existingTracks.map((t) => t.spotify_id));
        const fillTracks = globalTracks
          .filter((t) => !existingSpotifyIds.has(t.spotify_id))
          .slice(0, shortage);

        // Upsert fill tracks into DB
        for (const t of fillTracks) {
          const { data: dbTrack } = await supabase
            .from('tracks')
            .upsert(
              { ...t, cached_at: new Date().toISOString() },
              { onConflict: 'spotify_id' }
            )
            .select()
            .single();

          if (dbTrack) {
            existingTracks.push(dbTrack);

            // Add as room_song from the host's player record
            await supabase.from('room_songs').insert({
              room_id: room.id,
              player_id: hostPlayerId,
              track_id: dbTrack.id,
            }).select(); // ignore duplicate errors
          }
        }
      } catch (e) {
        console.error('Failed to auto-fill from Top 100 Global', e);
      }
    }

    if (existingTracks.length < 4) {
      return NextResponse.json(
        { success: false, error: `Not enough songs. Found ${existingTracks.length}, need at least 4.` },
        { status: 400 }
      );
    }

    // Shuffle tracks
    for (let i = existingTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [existingTracks[i], existingTracks[j]] = [existingTracks[j], existingTracks[i]];
    }

    // Pick tracks for rounds
    const roundTracks = existingTracks.slice(0, roundCount);

    // Create game rounds
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

    // Fetch extra distractor tracks from Top 100 Indonesia for quiz options
    let distractorTracks: Array<{ id: string; title: string; artists: string[] }> = [];
    try {
      const top100 = await getTop100Indonesia();
      const gameTrackTitles = new Set(existingTracks.map((t) => t.title.toLowerCase()));
      distractorTracks = top100
        .filter((t) => !gameTrackTitles.has(t.title.toLowerCase()))
        .slice(0, 20)
        .map((t) => ({ id: `distractor_${t.spotify_id}`, title: t.title, artists: t.artists }));
    } catch (e) {
      console.error('Failed to fetch distractor tracks', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        room_id: room.id,
        total_rounds: roundTracks.length,
        tracks: existingTracks, // send all tracks (for answer options)
        distractor_tracks: distractorTracks, // extra fake options from Top 100
      },
    });
  } catch (err) {
    console.error('POST /api/rooms/[code]/start error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
