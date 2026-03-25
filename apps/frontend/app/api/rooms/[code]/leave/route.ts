import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// POST /api/rooms/[code]/leave — leave a room
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));

    const playerId = body.player_id as string;
    if (!playerId) {
      return NextResponse.json({ success: false, error: 'player_id is required' }, { status: 400 });
    }

    // Find the room
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    // Check if player is host
    if (room.host_id === playerId) {
      // Host leaves -> delete the room
      const { error: deleteError } = await supabase
        .from('rooms')
        .delete()
        .eq('id', room.id);

      if (deleteError) {
        return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: 'Room deleted' });
    } else {
      // Regular player leaves -> delete player
      const { error: deleteError } = await supabase
        .from('players')
        .delete()
        .eq('id', playerId)
        .eq('room_id', room.id);

      if (deleteError) {
        return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: 'Player left' });
    }
  } catch (err) {
    console.error('POST /api/rooms/[code]/leave error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
