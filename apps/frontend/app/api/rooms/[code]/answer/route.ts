import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ code: string }>;
}

// POST /api/rooms/[code]/answer — submit an answer
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const supabase = createServiceClient();
    const body = await request.json().catch(() => ({}));

    const userId = body.user_id as string | undefined;
    const roundId = body.round_id as string | undefined;
    const selectedTrackId = body.selected_track_id as string | undefined;
    const timeTakenMs = body.time_taken_ms as number | undefined;

    if (!userId || !roundId || !selectedTrackId || timeTakenMs === undefined) {
      return NextResponse.json(
        { success: false, error: 'user_id, round_id, selected_track_id, and time_taken_ms are required' },
        { status: 400 }
      );
    }

    // Find room
    const { data: room } = await supabase.from('rooms').select('*').eq('code', code).single();
    if (!room) {
      return NextResponse.json({ success: false, error: 'Room not found' }, { status: 404 });
    }

    // Find player
    const { data: player } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .eq('user_id', userId)
      .single();

    if (!player) {
      return NextResponse.json({ success: false, error: 'Not a player in this room' }, { status: 403 });
    }

    // Find round → correct track
    const { data: round } = await supabase.from('game_rounds').select('*').eq('id', roundId).single();
    if (!round) {
      return NextResponse.json({ success: false, error: 'Round not found' }, { status: 404 });
    }

    const isCorrect = round.track_id === selectedTrackId;
    const timePerRoundMs = ((room.settings as { time_per_round?: number })?.time_per_round ?? 30) * 1000;
    const pointSystem = (room.settings as { point_system?: string })?.point_system ?? 'speed';

    let pointsAwarded = 0;
    if (isCorrect) {
      if (pointSystem === 'speed') {
        const basePoints = 100;
        const timeFraction = Math.max(0, (timePerRoundMs - timeTakenMs) / timePerRoundMs);
        pointsAwarded = Math.round(basePoints * (1 + timeFraction));
      } else {
        pointsAwarded = 100;
      }
    }

    // Insert answer
    const { data: answer, error: answerError } = await supabase
      .from('player_answers')
      .insert({
        round_id: roundId,
        player_id: player.id,
        selected_track_id: selectedTrackId,
        is_correct: isCorrect,
        time_taken_ms: timeTakenMs,
        points_awarded: pointsAwarded,
      })
      .select()
      .single();

    if (answerError) {
      if (answerError.code === '23505') {
        return NextResponse.json({ success: false, error: 'Already answered this round' }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: answerError.message }, { status: 500 });
    }

    // Update player score
    await supabase
      .from('players')
      .update({ score: player.score + pointsAwarded })
      .eq('id', player.id);

    return NextResponse.json({
      success: true,
      data: {
        ...answer,
        new_score: player.score + pointsAwarded,
      },
    });
  } catch (err) {
    console.error('POST /api/rooms/[code]/answer error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
