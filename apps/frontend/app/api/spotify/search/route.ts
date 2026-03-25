import { NextRequest, NextResponse } from 'next/server';
// Spotify search is currently disabled in favor of YouTube search.
// To re-enable, uncomment the import below and the search logic.
// import { searchTracks } from '@/lib/spotify';

// GET /api/spotify/search?q=...
// Currently disabled — using /api/youtube/search instead.
// Kept for future hybrid mode when Spotify Premium is available.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  return NextResponse.json(
    {
      success: false,
      error: 'Spotify search is currently disabled. Please use /api/youtube/search instead.',
      query,
    },
    { status: 503 }
  );

  // --- Original Spotify search logic (preserved for hybrid mode) ---
  // try {
  //   if (!query || query.trim().length === 0) {
  //     return NextResponse.json(
  //       { success: false, error: 'Query parameter "q" is required' },
  //       { status: 400 }
  //     );
  //   }
  //   const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10);
  //   const results = await searchTracks(query.trim(), Math.min(limit, 50));
  //   return NextResponse.json({ success: true, data: results });
  // } catch (err) {
  //   const message = err instanceof Error ? err.message : String(err);
  //   console.error('GET /api/spotify/search error', message);
  //   return NextResponse.json(
  //     { success: false, error: `Failed to search Spotify: ${message}` },
  //     { status: 500 }
  //   );
  // }
}
