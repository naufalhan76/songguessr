import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { generateRoomCode } from '@muze/shared';

// POST /api/rooms — create a new room (guest-friendly, no auth needed)
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));

    const displayName = (body.display_name as string)?.trim();
    if (!displayName) {
      return NextResponse.json({ success: false, error: 'display_name is required' }, { status: 400 });
    }

    const code = generateRoomCode();
    const settings = {
      rounds: body.rounds ?? 10,
      time_per_round: body.time_per_round ?? 30,
      max_players: body.max_players ?? 4,
      allow_skips: false,
      point_system: body.point_system ?? 'speed',
      selection_time: body.selection_time ?? 5,
    };

    // Create a player ID first (will be the host_id)
    // We use uuid_generate_v4() via Supabase to get a unique ID
    // First create the room, then create the host player

    // Generate a temporary host ID — we'll use the player ID
    // Insert room with a placeholder host_id, then update after player creation
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        code,
        host_id: '00000000-0000-0000-0000-000000000000', // temporary, updated below
        status: 'waiting',
        settings,
        room_name: body.room_name || null,
      })
      .select()
      .single();

    if (roomError || !room) {
      console.error('Failed to create room', roomError);
      return NextResponse.json({ success: false, error: roomError?.message ?? 'Failed to create room' }, { status: 500 });
    }

    // Auto-join the host as a player (guest — no user_id)
    const { data: hostPlayer, error: joinError } = await supabase
      .from('players')
      .insert({
        room_id: room.id,
        user_id: null,
        display_name: displayName,
        score: 0,
        is_ready: false,
      })
      .select()
      .single();

    if (joinError || !hostPlayer) {
      console.error('Failed to auto-join host', joinError);
      // Clean up the room
      await supabase.from('rooms').delete().eq('id', room.id);
      return NextResponse.json({ success: false, error: 'Failed to create player' }, { status: 500 });
    }

    // Update room with the actual host_id (player ID)
    const { data: updatedRoom } = await supabase
      .from('rooms')
      .update({ host_id: hostPlayer.id })
      .eq('id', room.id)
      .select()
      .single();

    return NextResponse.json({
      success: true,
      data: {
        room: updatedRoom ?? room,
        player: hostPlayer,
      },
    });
  } catch (err) {
    console.error('POST /api/rooms error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

