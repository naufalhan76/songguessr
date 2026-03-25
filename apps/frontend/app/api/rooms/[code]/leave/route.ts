import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// POST /api/rooms/[code]/leave - leave a room
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));

    const playerId = body.player_id as string | undefined;
    if (!playerId) {
      return NextResponse.json({ success: false, error: 'player_id is required' }, { status: 400 });
    }

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    const { data: roomPlayers, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true });

    if (playersError || !roomPlayers) {
      return NextResponse.json({ success: false, error: 'Failed to load players' }, { status: 500 });
    }

    const leavingPlayer = roomPlayers.find((player) => player.id === playerId);
    if (!leavingPlayer) {
      return NextResponse.json({ success: false, error: 'Player not found in this room' }, { status: 404 });
    }

    const roomStatus = room.status as string;
    const isActiveOrFinished = roomStatus === 'active' || roomStatus === 'finished';
    const highestScoreBeforeLeave = roomPlayers.reduce((maxScore, player) => Math.max(maxScore, player.score), 0);

    if (!isActiveOrFinished && room.host_id === playerId) {
      const { error: deleteRoomError } = await supabase
        .from('rooms')
        .delete()
        .eq('id', room.id);

      if (deleteRoomError) {
        return NextResponse.json({ success: false, error: deleteRoomError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Room deleted' });
    }

    const { error: deletePlayerError } = await supabase
      .from('players')
      .delete()
      .eq('id', playerId)
      .eq('room_id', room.id);

    if (deletePlayerError) {
      return NextResponse.json({ success: false, error: deletePlayerError.message }, { status: 500 });
    }

    const remainingPlayers = roomPlayers.filter((player) => player.id !== playerId);

    if (remainingPlayers.length === 0) {
      const { error: deleteRoomError } = await supabase
        .from('rooms')
        .delete()
        .eq('id', room.id);

      if (deleteRoomError) {
        return NextResponse.json({ success: false, error: deleteRoomError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Last player left, room deleted' });
    }

    const roomUpdates: Record<string, string> = {};
    if (room.host_id === playerId) {
      roomUpdates.host_id = remainingPlayers[0].id;
    }

    let autoWinnerId: string | null = null;

    if (roomStatus === 'active' && remainingPlayers.length === 1) {
      const winner = remainingPlayers[0];
      const winnerScore = Math.max(winner.score, highestScoreBeforeLeave + 100);

      const { error: winnerUpdateError } = await supabase
        .from('players')
        .update({ score: winnerScore })
        .eq('id', winner.id);

      if (winnerUpdateError) {
        return NextResponse.json({ success: false, error: winnerUpdateError.message }, { status: 500 });
      }

      roomUpdates.status = 'finished';
      roomUpdates.ended_at = new Date().toISOString();
      autoWinnerId = winner.id;
    }

    if (Object.keys(roomUpdates).length > 0) {
      const { error: roomUpdateError } = await supabase
        .from('rooms')
        .update(roomUpdates)
        .eq('id', room.id);

      if (roomUpdateError) {
        return NextResponse.json({ success: false, error: roomUpdateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        message: 'Player left',
        remaining_players: remainingPlayers.length,
        auto_winner_id: autoWinnerId,
        new_host_id: roomUpdates.host_id ?? null,
      },
    });
  } catch (err) {
    console.error('POST /api/rooms/[code]/leave error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
