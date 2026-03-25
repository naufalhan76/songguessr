import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// GET /api/rooms/[code] — get room by code
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();

    const { data: room, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    if (
      room.status === 'finished'
      && room.ended_at
      && new Date(room.ended_at).getTime() <= Date.now() - (2 * 60 * 1000)
    ) {
      await supabase
        .from('rooms')
        .delete()
        .eq('id', room.id);

      return NextResponse.json({ success: false, error: 'Room has expired' }, { status: 404 });
    }

    // Fetch players for this room
    const { data: players } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true });

    return NextResponse.json({ success: true, data: { room, players: players ?? [] } });
  } catch (err) {
    console.error('GET /api/rooms/[code] error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
