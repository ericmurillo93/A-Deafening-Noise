import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "adn-runtime-"));
const cwd = process.cwd(), originalFetch = globalThis.fetch, argv = process.argv;
process.chdir(directory);
Object.assign(process.env, { SUPABASE_URL: "https://audit.invalid", SUPABASE_SERVICE_ROLE_KEY: "fake", SPOTIFY_CLIENT_ID: "fake" });
globalThis.fetch = async (url, options) => {
  if (url.endsWith("get_spotify_sync_accounts")) return Response.json([]);
  if (url.endsWith("get_discovery_artist_catalog")) return Response.json(["EXAMPLE ARCHIVE ARTIST", "EXAMPLE BUCKET ARTIST"]);
  if (url.includes("concert_participants?") || url.includes("concerts?")) return Response.json([]);
  if (url.endsWith("get_concert_suggestions")) return Response.json({ generatedAt: "2026-09-28T00:00:00Z", suggestions: [] });
  throw new Error(`Unexpected request: ${options?.method || "GET"} ${url}`);
};
try {
  await import("../scripts/sync-spotify-accounts.mjs");
  const catalog = JSON.parse(await fs.readFile("data/listened-artists.json", "utf8"));
  assert.equal(catalog.artists.length, 2);
  process.argv = ["node", "publisher", "--download=runtime/suggestions.json"];
  await import("../scripts/publish-concert-suggestions.mjs");
  assert.deepEqual(JSON.parse(await fs.readFile("runtime/suggestions.json", "utf8")).suggestions, []);
} finally {
  globalThis.fetch = originalFetch; process.argv = argv; process.chdir(cwd);
  await fs.rm(directory, { recursive: true, force: true });
}
