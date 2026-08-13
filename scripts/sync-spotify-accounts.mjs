import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const outputPath = path.resolve("data/listened-artists.json");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function spotifyArtists(ranges) {
  const artists = new Map();
  ranges.forEach(({ items = [] }, index) => items.forEach(({ id, name }) => {
    if (!id || !name) return;
    const current = artists.get(id) || { spotifyId: id, name, ranges: [] };
    current.ranges.push(["short_term", "medium_term", "long_term"][index]);
    artists.set(id, current);
  }));
  return [...artists.values()];
}

const qualifiesHistoricalArtist = ({ listenCount = 0, totalMsPlayed = 0 }) => listenCount >= 3 || totalMsPlayed >= 600_000;

if (process.argv.includes("--check")) {
  assert.deepEqual(spotifyArtists([{ items: [{ id: "1", name: "Artist" }] }, { items: [{ id: "1", name: "Artist" }] }, { items: [] }]), [{ spotifyId: "1", name: "Artist", ranges: ["short_term", "medium_term"] }]);
  assert.equal(qualifiesHistoricalArtist({ listenCount: 1, totalMsPlayed: 262_906 }), false);
  assert.equal(qualifiesHistoricalArtist({ listenCount: 3, totalMsPlayed: 1 }), true);
  assert.equal(qualifiesHistoricalArtist({ listenCount: 1, totalMsPlayed: 600_000 }), true);
  process.stdout.write("Spotify sync self-check passed\n");
  process.exit(0);
}

const supabaseUrl = required("SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const seedOnly = process.argv.includes("--seed-only");
const spotifyClientId = seedOnly ? "" : required("SPOTIFY_CLIENT_ID");
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

async function seedHistoricalCatalog() {
  let catalog;
  try { catalog = JSON.parse(await fs.readFile(outputPath, "utf8")); } catch { return; }
  if (catalog.source !== "Spotify Extended Streaming History" || !catalog.artists?.length) return;
  const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&role=eq.admin&limit=1`, { headers });
  if (!profileResponse.ok) throw new Error(`Could not find the admin profile (${profileResponse.status})`);
  const [admin] = await profileResponse.json();
  if (!admin) throw new Error("Could not seed Spotify history without an admin profile");
  const artists = catalog.artists.filter(qualifiesHistoricalArtist);
  const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/user_listened_artists?${new URLSearchParams({ user_id: `eq.${admin.id}`, spotify_artist_id: "like.history:*" })}`, { method: "DELETE", headers });
  if (!deleteResponse.ok) throw new Error(`Could not replace Spotify history (${deleteResponse.status})`);
  for (let offset = 0; offset < artists.length; offset += 500) {
    const rows = artists.slice(offset, offset + 500).map(({ artist }) => ({
      user_id: admin.id,
      spotify_artist_id: `history:${createHash("sha256").update(normalize(artist)).digest("hex")}`,
      artist_name: artist,
      time_ranges: [],
    }));
    const response = await fetch(`${supabaseUrl}/rest/v1/user_listened_artists?on_conflict=user_id,spotify_artist_id`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(rows),
    });
    if (!response.ok) throw new Error(`Could not seed Spotify history (${response.status})`);
  }
  process.stdout.write(`Seeded ${artists.length} qualifying historical artists for the admin profile\n`);
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

async function rpc(name, body = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${name} failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function spotify(pathname, accessToken) {
  const response = await fetch(`https://api.spotify.com/v1${pathname}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Spotify ${pathname} failed (${response.status})`);
  return response.json();
}

await seedHistoricalCatalog();
if (seedOnly) process.exit(0);
const accounts = await rpc("get_spotify_sync_accounts");
let synced = 0;
for (const account of accounts) {
  try {
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: account.refreshToken, client_id: spotifyClientId }),
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok) {
      if (token.error === "invalid_grant") await rpc("mark_spotify_reauthorization_required", { target_user: account.userId });
      throw new Error(`Spotify token refresh failed: ${token.error || tokenResponse.status}`);
    }
    const ranges = await Promise.all(["short_term", "medium_term", "long_term"].map((range) => spotify(`/me/top/artists?limit=50&time_range=${range}`, token.access_token)));
    await rpc("complete_spotify_background_sync", { target_user: account.userId, payload: spotifyArtists(ranges), rotated_refresh_token: token.refresh_token || null });
    synced += 1;
  } catch (error) {
    process.stderr.write(`Warning: Spotify user ${account.userId} was not synced. ${error.message}\n`);
  }
}

const rows = [];
for (let offset = 0; ; offset += 1000) {
  const response = await fetch(`${supabaseUrl}/rest/v1/user_listened_artists?select=spotify_artist_id,artist_name&order=artist_name&offset=${offset}&limit=1000`, { headers });
  if (!response.ok) throw new Error(`Could not read Spotify artist catalog (${response.status})`);
  const page = await response.json();
  rows.push(...page);
  if (page.length < 1000) break;
}
const unique = new Map(rows.map((row) => [normalize(row.artist_name), row.artist_name]));
const artists = [...unique].map(([key, artist]) => ({ artist, spotifyId: `catalog:${createHash("sha256").update(key).digest("hex")}`, listenCount: 3, totalMsPlayed: 600000 })).sort((a, b) => a.artist.localeCompare(b.artist));
let generatedAt = new Date().toISOString();
try {
  const previous = JSON.parse(await fs.readFile(outputPath, "utf8"));
  if (JSON.stringify(previous.artists || []) === JSON.stringify(artists)) generatedAt = previous.generatedAt || generatedAt;
} catch {}
await fs.writeFile(outputPath, `${JSON.stringify({ generatedAt, source: "Connected Spotify profiles", matchingRule: "Current top artists from connected users", artists }, null, 2)}\n`, "utf8");
process.stdout.write(`Synced ${synced}/${accounts.length} Spotify accounts and wrote ${artists.length} unique artists\n`);
