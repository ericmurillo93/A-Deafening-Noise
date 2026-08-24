import assert from "node:assert/strict";
import fs from "node:fs/promises";

const normalize = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const exactArtist = (items, name) => items.find((artist) => normalize(artist.name) === normalize(name) && artist.images?.[0]?.url);

if (process.argv.includes("--check")) {
  assert.equal(exactArtist([{ name: "Wrong Tribute", images: [{ url: "wrong" }] }, { name: "Sigur Rós", images: [{ url: "right" }] }], "SIGUR ROS").images[0].url, "right");
  process.stdout.write("Suggestion artwork self-check passed\n");
  process.exit(0);
}

const path = process.argv[2] || "data/suggestions.json";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const clientId = process.env.SPOTIFY_CLIENT_ID;
if (!url || !key || !clientId) throw new Error("Supabase and Spotify service configuration is required");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const accountsResponse = await fetch(`${url}/rest/v1/rpc/get_spotify_sync_accounts`, { method: "POST", headers, body: "{}" });
if (!accountsResponse.ok) throw new Error(`Could not load a Spotify connection (${accountsResponse.status})`);
const [account] = await accountsResponse.json();
if (!account) {
  process.stdout.write("Suggestion artwork skipped: no Spotify account is connected\n");
  process.exit(0);
}
const tokenResponse = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: account.refreshToken, client_id: clientId }) });
const token = await tokenResponse.json();
if (!tokenResponse.ok) throw new Error(`Spotify token refresh failed (${tokenResponse.status})`);
if (token.refresh_token) {
  const rotateResponse = await fetch(`${url}/rest/v1/rpc/rotate_spotify_refresh_token`, { method: "POST", headers, body: JSON.stringify({ target_user: account.userId, rotated_refresh_token: token.refresh_token }) });
  if (!rotateResponse.ok) throw new Error(`Could not preserve the rotated Spotify token (${rotateResponse.status})`);
}
const catalog = JSON.parse(await fs.readFile(path, "utf8"));
const images = new Map(catalog.suggestions.filter(({ imageUrl }) => imageUrl).map(({ artist, imageUrl }) => [normalize(artist), imageUrl]));
for (const artist of new Set(catalog.suggestions.filter(({ imageUrl }) => !imageUrl).map(({ artist }) => artist))) {
  const response = await fetch(`https://api.spotify.com/v1/search?type=artist&limit=5&q=${encodeURIComponent(artist)}`, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!response.ok) throw new Error(`Spotify artist search failed (${response.status})`);
  const match = exactArtist((await response.json()).artists?.items || [], artist);
  if (match) images.set(normalize(artist), match.images[0].url);
}
catalog.suggestions = catalog.suggestions.map((suggestion) => ({ ...suggestion, imageUrl: images.get(normalize(suggestion.artist)) || "" }));
await fs.writeFile(path, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
process.stdout.write(`Resolved artwork for ${images.size} suggestion artists\n`);
