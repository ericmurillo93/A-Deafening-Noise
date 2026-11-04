export async function loadSpotifyArtwork(url, headers) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`${url}/rest/v1/spotify_artist_artwork?select=normalized_artist,artist_name,image_url&order=normalized_artist&limit=1000&offset=${offset}`, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Could not read persistent Spotify artwork (${response.status})`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
