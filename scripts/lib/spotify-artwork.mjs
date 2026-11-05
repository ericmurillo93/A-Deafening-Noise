export async function loadAllRows(url, headers, query) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`${url}/rest/v1/${query}&limit=1000&offset=${offset}`, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Could not read ${query.split('?')[0]} (${response.status})`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export const loadSpotifyArtwork = (url, headers) => loadAllRows(url, headers, "spotify_artist_artwork?select=normalized_artist,artist_name,image_url&order=normalized_artist");
