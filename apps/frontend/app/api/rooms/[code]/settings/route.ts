import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// PATCH /api/rooms/[code]/settings — update room settings (host only)
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));

    const hostId = body.host_id as string | undefined;
    if (!hostId) {
      return NextResponse.json({ success: false, error: 'host_id is required' }, { status: 400 });
    }

    // Fetch the room first
    const { data: room, error: fetchError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (fetchError || !room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    // Verify the user is the host
    if (room.host_id !== hostId) {
      return NextResponse.json({ success: false, error: 'Only the host can update settings' }, { status: 403 });
    }

    // Only allow updates while room is waiting
    if (room.status !== 'waiting') {
      return NextResponse.json({ success: false, error: 'Cannot update settings after game has started' }, { status: 400 });
    }

    // Build update object
    const updates: Record<string, unknown> = {};

    // Update room_name if provided
    if (body.room_name !== undefined) {
      updates.room_name = body.room_name ? String(body.room_name).slice(0, 50) : null;
    }

    // Update settings if any setting fields are provided
    const currentSettings = (room.settings as Record<string, unknown>) ?? {};
    let settingsChanged = false;

    if (body.rounds !== undefined) {
      const rounds = Math.min(Math.max(Number(body.rounds) || 5, 3), 20);
      currentSettings.rounds = rounds;
      settingsChanged = true;
    }

    if (body.time_per_round !== undefined) {
      const time = Math.min(Math.max(Number(body.time_per_round) || 30, 10), 60);
      currentSettings.time_per_round = time;
      settingsChanged = true;
    }

    if (body.max_players !== undefined) {
      const maxPlayers = Math.min(Math.max(Number(body.max_players) || 4, 2), 8);
      currentSettings.max_players = maxPlayers;
      settingsChanged = true;
    }

    if (body.point_system !== undefined) {
      const valid = ['speed', 'correct_only'];
      if (valid.includes(body.point_system)) {
        currentSettings.point_system = body.point_system;
        settingsChanged = true;
      }
    }

    if (settingsChanged) {
      updates.settings = currentSettings;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, data: room });
    }

    const { data: updatedRoom, error: updateError } = await supabase
      .from('rooms')
      .update(updates)
      .eq('id', room.id)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update room settings', updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updatedRoom });
  } catch (err) {
    console.error('PATCH /api/rooms/[code]/settings error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
