import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// POST /api/rooms/[code]/ready — toggle player ready status (by player_id)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));

    const playerId = body.player_id as string | undefined;
    const isReady = body.is_ready as boolean | undefined;

    if (!playerId || isReady === undefined) {
      return NextResponse.json({ success: false, error: 'player_id and is_ready are required' }, { status: 400 });
    }

    // Find the room
    const { data: room } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', code)
      .single();

    if (!room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    // Update player ready status by player ID
    const { data: player, error } = await supabase
      .from('players')
      .update({ is_ready: isReady })
      .eq('room_id', room.id)
      .eq('id', playerId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: player });
  } catch (err) {
    console.error('POST /api/rooms/[code]/ready error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
