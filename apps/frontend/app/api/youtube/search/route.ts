import { NextRequest, NextResponse } from 'next/server';
import YouTube from 'youtube-sr';

// Helper: parse a YouTube video title into song title and artist
function parseTitleAndArtist(rawTitle: string, channelName: string): { title: string; artists: string[] } {
  let cleaned = rawTitle
    .replace(/\(Official\s*(Music\s*)?Video\)/gi, '')
    .replace(/\[Official\s*(Music\s*)?Video\]/gi, '')
    .replace(/\(Official\s*Audio\)/gi, '')
    .replace(/\[Official\s*Audio\]/gi, '')
    .replace(/\(Lyric\s*Video\)/gi, '')
    .replace(/\[Lyric\s*Video\]/gi, '')
    .replace(/\(Lyrics?\)/gi, '')
    .replace(/\[Lyrics?\]/gi, '')
    .replace(/\(Visualizer\)/gi, '')
    .replace(/\|.*$/g, '')
    .trim();

  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    return { title: title || cleaned, artists: [artist] };
  }

  return { title: cleaned, artists: [channelName || 'Unknown Artist'] };
}

// GET /api/youtube/search?q=...&limit=10
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '10', 10);

    const videos = await YouTube.search(`${query.trim()} song`, {
      type: 'video',
      limit: Math.min(limit, 20),
      safeSearch: false,
    });

    const results = videos
      .filter((v) => v.id && v.title && v.duration && v.duration > 30000) // Filter out shorts
      .map((v) => {
        const parsed = parseTitleAndArtist(v.title || '', v.channel?.name || '');
        return {
          spotify_id: `yt_${v.id}`, // Prefixed to match DB schema
          title: parsed.title,
          artists: parsed.artists,
          album: v.channel?.name || 'YouTube',
          album_art_url: v.thumbnail?.url || '',
          preview_url: null,
          has_preview: true, // YouTube videos are always playable
          youtube_id: v.id,
          duration_ms: v.duration || 0,
          popularity: 50,
        };
      });

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('GET /api/youtube/search error', message);
    return NextResponse.json(
      { success: false, error: `Failed to search YouTube: ${message}` },
      { status: 500 }
    );
  }
}
