import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "adn-spotify-sync-"));
const cwd = process.cwd(), originalFetch = globalThis.fetch;
process.chdir(directory);
Object.assign(process.env, { SUPABASE_URL: "https://audit.invalid", SUPABASE_SERVICE_ROLE_KEY: "fake", SPOTIFY_CLIENT_ID: "fake" });
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push(url);
  if (url.endsWith("get_spotify_sync_accounts")) return Response.json([{ userId: "user", refreshToken: "old" }]);
  if (url.includes("concert_participants?")) return Response.json(url.includes('offset=0') ? Array.from({ length: 1000 }, (_, i) => ({ user_id: "user", concert_id: i })) : [{ user_id: "user", concert_id: 1000 }]);
  if (url.includes("concerts?")) return Response.json(url.includes('offset=0') ? Array.from({ length: 1000 }, (_, i) => ({ id: i, artist: "KNOWN" })) : [{ id: 1000, artist: "MISSING IMAGE" }]);
  if (url.includes("spotify_artist_artwork?")) return Response.json([{ normalized_artist: "known" }]);
  if (url.endsWith("/api/token")) return Response.json({ access_token: 'access', refresh_token: 'rotated' });
  if (url.endsWith("rotate_spotify_refresh_token")) {
    assert.equal(JSON.parse(options.body).rotated_refresh_token, "rotated");
    return Response.json(null);
  }
  if (url.includes('/me/top/artists')) {
    assert(calls.some(c => c.endsWith('rotate_spotify_refresh_token')));
    return Response.json({ items: [{ id: '1', name: 'TOP ARTIST' }] });
  }
  if (url.endsWith("complete_spotify_background_sync")) return Response.json(null);
  if (url.includes('/search?')) {
    assert(calls.some(c => c.endsWith('complete_spotify_background_sync')));
    return new Response('Rate limited', { status: 429 });
  }
  if (url.endsWith("get_discovery_artist_catalog")) return Response.json(['TOP ARTIST']);
  throw new Error(`Unexpected request: ${url}`);
};
try {
  await import('../scripts/sync-spotify-accounts.mjs');
  assert(calls.some(url => url.includes('concert_participants?') && url.includes('offset=1000')));
  assert(calls.some(url => url.includes('concerts?') && url.includes('offset=1000')));
  assert(calls.some(url => url.includes('/search?')));
  assert.equal(JSON.parse(await fs.readFile('data/listened-artists.json', 'utf8')).artists.length, 1);
} finally {
  globalThis.fetch = originalFetch; process.chdir(cwd);
  await fs.rm(directory, { recursive: true, force: true });
}
