import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// POST /api/rooms/[code]/join — join a room
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));

    const userId = body.user_id as string | undefined;
    if (!userId) {
      return NextResponse.json({ success: false, error: 'user_id is required' }, { status: 400 });
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

    if (room.status !== 'waiting') {
      return NextResponse.json({ success: false, error: 'Room is no longer accepting players' }, { status: 400 });
    }

    // Check player count
    const { count } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id);

    const maxPlayers = (room.settings as { max_players?: number })?.max_players ?? 4;
    if ((count ?? 0) >= maxPlayers) {
      return NextResponse.json({ success: false, error: 'Room is full' }, { status: 400 });
    }

    // Check if already joined
    const { data: existing } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', room.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, data: existing, message: 'Already in room' });
    }

    // Join
    const { data: player, error: joinError } = await supabase
      .from('players')
      .insert({ room_id: room.id, user_id: userId, score: 0, is_ready: false })
      .select()
      .single();

    if (joinError) {
      return NextResponse.json({ success: false, error: joinError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: player });
  } catch (err) {
    console.error('POST /api/rooms/[code]/join error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
