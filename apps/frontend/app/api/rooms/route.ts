import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { generateRoomCode } from '@songguessr/shared';

// POST /api/rooms — create a new room
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));

    const hostId = body.host_id as string | undefined;
    if (!hostId) {
      return NextResponse.json({ success: false, error: 'host_id is required' }, { status: 400 });
    }

    const code = generateRoomCode();
    const settings = {
      rounds: body.rounds ?? 10,
      time_per_round: body.time_per_round ?? 30,
      max_players: body.max_players ?? 4,
      allow_skips: false,
      point_system: body.point_system ?? 'speed',
    };

    // Ensure the user exists in public.users (service role bypasses RLS)
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', hostId)
      .single();

    if (!existingUser) {
      // Create a minimal user record so the FK constraint is satisfied
      const { error: userError } = await supabase
        .from('users')
        .upsert({
          id: hostId,
          email: body.email || 'unknown@spotify.user',
          display_name: body.display_name || 'Spotify User',
          avatar_url: body.avatar_url || null,
        });

      if (userError) {
        console.error('Failed to create user record', userError);
        return NextResponse.json({ success: false, error: 'Failed to create user profile: ' + userError.message }, { status: 500 });
      }
    }

    // Insert room
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({ code, host_id: hostId, status: 'waiting', settings })
      .select()
      .single();

    if (roomError) {
      console.error('Failed to create room', roomError);
      return NextResponse.json({ success: false, error: roomError.message }, { status: 500 });
    }

    // Auto-join the host as a player
    const { error: joinError } = await supabase
      .from('players')
      .insert({ room_id: room.id, user_id: hostId, score: 0, is_ready: false });

    if (joinError) {
      console.error('Failed to auto-join host', joinError);
    }

    return NextResponse.json({ success: true, data: room });
  } catch (err) {
    console.error('POST /api/rooms error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
