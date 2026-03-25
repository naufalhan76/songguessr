// Server-side Spotify API helpers using Client Credentials flow
// No user login needed — server authenticates directly with Spotify

interface CachedToken {
  access_token: string;
  expires_at: number; // unix timestamp in ms
}

let cachedToken: CachedToken | null = null;

/**
 * Get a Spotify access token using Client Credentials flow.
 * Token is cached in memory until expiry.
 */
export async function getClientCredentialsToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) {
    return cachedToken.access_token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in environment variables');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Spotify token: ${response.status} ${error}`);
  }

  const data = await response.json();

  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.access_token;
}

/**
 * Search Spotify tracks by query string.
 * Returns tracks with preview_url availability status.
 */
export async function searchTracks(query: string, limit: number = 20) {
  const token = await getClientCredentialsToken();

  const params = new URLSearchParams({
    q: query,
    type: 'track',
    limit: '50', // Fetch more to ensure we have enough with preview_urls after filtering
    market: 'US',
  });

  const response = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify search failed: ${response.status} ${error}`);
  }

  const data = await response.json();

  return (data.tracks?.items ?? [])
    .slice(0, limit) // Apply requested limit directly
    .map((track: {
      id: string;
      name: string;
      artists: Array<{ name: string }>;
      album: { name: string; images: Array<{ url: string }> };
      preview_url: string | null;
      duration_ms: number;
      popularity: number;
    }) => ({
      spotify_id: track.id,
      title: track.name,
      artists: track.artists.map((a) => a.name),
      album: track.album.name,
      album_art_url: track.album.images?.[0]?.url ?? '',
      preview_url: track.preview_url,
      has_preview: !!track.preview_url,
      duration_ms: track.duration_ms,
      popularity: track.popularity,
    }));
}

/**
 * Fetch tracks from Spotify's "Top 50 - Global" playlist.
 * Used as auto-fill fallback when players don't complete their song quota.
 * Only returns tracks that have a preview_url.
 */
export async function getTop100Global(): Promise<Array<{
  spotify_id: string;
  title: string;
  artists: string[];
  album: string;
  album_art_url: string;
  preview_url: string;
  duration_ms: number;
  popularity: number;
}>> {
  const token = await getClientCredentialsToken();

  // Spotify's official "Top 50 - Global" playlist ID
  const playlistId = '37i9dQZEVXbMDoHDwVN2tF';

  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists(name),album(name,images),preview_url,duration_ms,popularity))`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Top 100 Global: ${response.status} ${error}`);
  }

  const data = await response.json();

  return (data.items ?? [])
    .map((item: { track: {
      id: string;
      name: string;
      artists: Array<{ name: string }>;
      album: { name: string; images: Array<{ url: string }> };
      preview_url: string | null;
      duration_ms: number;
      popularity: number;
    } | null }) => item.track)
    .filter((track: { preview_url: string | null } | null): track is NonNullable<typeof track> & { preview_url: string } =>
      !!track && !!track.preview_url
    )
    .map((track: {
      id: string;
      name: string;
      artists: Array<{ name: string }>;
      album: { name: string; images: Array<{ url: string }> };
      preview_url: string;
      duration_ms: number;
      popularity: number;
    }) => ({
      spotify_id: track.id,
      title: track.name,
      artists: track.artists.map((a) => a.name),
      album: track.album.name,
      album_art_url: track.album.images?.[0]?.url ?? '',
      preview_url: track.preview_url,
      duration_ms: track.duration_ms,
      popularity: track.popularity,
    }));
}
