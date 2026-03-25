// Server-side YouTube helpers for fetching trending playlists
// Uses @distube/ytpl to scrape YouTube playlists without API keys

import ytpl from '@distube/ytpl';

// YouTube "Top 100 Songs Indonesia" playlist
const TOP_100_INDONESIA_PLAYLIST_ID = 'PL4fGSI1pDJn5ObxTlEPlkkornHXUiKX1z';

/**
 * Parse a YouTube video title into song title and artist(s).
 * Common formats:
 *   "Artist - Title"
 *   "Artist - Title (Official Music Video)"
 *   "Title | Artist"
 */
function parseTitleAndArtist(rawTitle: string): { title: string; artists: string[] } {
  // Remove common suffixes
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
    .replace(/\|.*$/g, '') // Remove everything after |
    .replace(/ft\.?\s*.*/gi, '') // Remove featuring
    .replace(/feat\.?\s*.*/gi, '')
    .trim();

  // Try "Artist - Title" format
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    return { title: title || cleaned, artists: [artist] };
  }

  // Fallback: use channel name as artist (handled at call site)
  return { title: cleaned, artists: [] };
}

/**
 * Parse a YouTube duration string like "3:45" or "1:02:30" into seconds.
 */
function parseDuration(duration: string | null): number {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

/**
 * Fetch tracks from YouTube's "Top 100 Songs Indonesia" playlist.
 * Used as auto-fill fallback when players don't complete their song quota.
 */
export async function getTop100Indonesia(): Promise<Array<{
  spotify_id: string; // We store youtube video ID here for compatibility
  title: string;
  artists: string[];
  album: string;
  album_art_url: string;
  preview_url: string | null;
  youtube_id: string;
  duration_ms: number;
  popularity: number;
}>> {
  const result = await ytpl(TOP_100_INDONESIA_PLAYLIST_ID, { limit: 100 });

  return result.items
    .filter((item) => !!item.id) // Ensure we have a valid video ID
    .map((item, index) => {
      const parsed = parseTitleAndArtist(item.title);

      // If we couldn't parse the artist from the title, use the channel name
      const artists = parsed.artists.length > 0
        ? parsed.artists
        : [item.author?.name || 'Unknown Artist'];

      return {
        spotify_id: `yt_${item.id}`, // Prefix to distinguish from Spotify IDs
        title: parsed.title,
        artists,
        album: 'Top 100 Indonesia',
        album_art_url: item.thumbnail || '',
        preview_url: null, // No Spotify preview — we use YouTube playback
        youtube_id: item.id,
        duration_ms: parseDuration(item.duration) * 1000,
        popularity: 100 - index, // Rank-based popularity
      };
    });
}
