import { NextRequest, NextResponse } from 'next/server';
import { searchTracks } from '@/lib/spotify';

// GET /api/spotify/search?q=...
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10);
    const results = await searchTracks(query.trim(), Math.min(limit, 50));

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    console.error('GET /api/spotify/search error', err);
    return NextResponse.json(
      { success: false, error: 'Failed to search Spotify' },
      { status: 500 }
    );
  }
}
