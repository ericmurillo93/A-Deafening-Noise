import assert from "node:assert/strict";
import test from "node:test";
import { loadSpotifyArtwork } from "../scripts/lib/spotify-artwork.mjs";

test("Spotify artwork reads beyond Supabase's first page and fails explicitly on service errors", async () => {
  const original = globalThis.fetch;
  const urls = [];
  try {
    globalThis.fetch = async (url) => {
      urls.push(url);
      return { ok: true, json: async () => urls.length === 1 ? Array.from({ length: 1000 }, (_, i) => ({ normalized_artist: `example ${i}` })) : [{ normalized_artist: "last artist" }] };
    };
    assert.equal((await loadSpotifyArtwork("https://example.invalid", {})).length, 1001);
    assert.match(urls[1], /offset=1000/);
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(loadSpotifyArtwork("https://example.invalid", {}), /503/);
  } finally { globalThis.fetch = original; }
});
