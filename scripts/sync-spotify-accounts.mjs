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
  ranges.forEach(({ items = [] }, index) => items.forEach(({ id, name, images }) => {
    if (!id || !name) return;
    const current = artists.get(id) || { spotifyId: id, name, imageUrl: images?.[0]?.url || "", ranges: [] };
    current.ranges.push(["short_term", "medium_term", "long_term"][index]);
    artists.set(id, current);
  }));
  return [...artists.values()];
}

if (process.argv.includes("--check")) {
  assert.deepEqual(spotifyArtists([{ items: [{ id: "1", name: "Artist", images: [{ url: "https://image" }] }] }, { items: [{ id: "1", name: "Artist" }] }, { items: [] }]), [{ spotifyId: "1", name: "Artist", imageUrl: "https://image", ranges: ["short_term", "medium_term"] }]);
  assert.equal(exactArtist([{ name: "Perturbator Tribute", images: [{ url: "https://wrong" }] }, { name: "PERTURBATOR", images: [{ url: "https://right" }] }], "Perturbator").images[0].url, "https://right");
  process.stdout.write("Spotify sync self-check passed\n");
  process.exit(0);
}

if (process.argv.includes("--seed-only")) throw new Error("Automatic historical reseeding is retired. Import a user's history explicitly into Supabase; daily sync never replaces historical rows.");
const supabaseUrl = required("SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const spotifyClientId = required("SPOTIFY_CLIENT_ID");
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function exactArtist(items, name) {
  return items.find((artist) => normalize(artist.name) === normalize(name) && artist.images?.[0]?.url);
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

const accounts = await rpc("get_spotify_sync_accounts");
const [participantResponse, concertResponse] = await Promise.all([
  fetch(`${supabaseUrl}/rest/v1/concert_participants?select=user_id,concert_id&status=eq.confirmed`, { headers }),
  fetch(`${supabaseUrl}/rest/v1/concerts?select=id,artist,concert_date`, { headers }),
]);
if (!participantResponse.ok || !concertResponse.ok) throw new Error("Could not read future concert artists");
const participants = await participantResponse.json();
const concertsById = new Map((await concertResponse.json()).map((concert) => [concert.id, concert]));
const futureByUser = new Map();
for (const { user_id: userId, concert_id: concertId } of participants) {
  const concert = concertsById.get(concertId);
  const match = String(concert?.concert_date || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match || new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 23, 59, 59) < new Date()) continue;
  if (!futureByUser.has(userId)) futureByUser.set(userId, new Set());
  futureByUser.get(userId).add(concert.artist);
}
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
    const topArtists = spotifyArtists(ranges);
    const known = new Set(topArtists.map(({ name }) => normalize(name)));
    const artwork = [];
    for (const name of [...(futureByUser.get(account.userId) || [])].filter((artist) => !known.has(normalize(artist))).slice(0, 50)) {
      const result = await spotify(`/search?type=artist&limit=5&q=${encodeURIComponent(name)}`, token.access_token);
      const match = exactArtist(result.artists?.items || [], name);
      if (match) artwork.push({ normalizedArtist: normalize(name), spotifyId: match.id, name: match.name, imageUrl: match.images[0].url });
    }
    await rpc("complete_spotify_background_sync", { target_user: account.userId, payload: topArtists, rotated_refresh_token: token.refresh_token || null });
    await rpc("upsert_spotify_artist_images", { target_user: account.userId, payload: artwork });
    synced += 1;
  } catch (error) {
    process.stderr.write(`Warning: Spotify user ${account.userId} was not synced. ${error.message}\n`);
  }
}

const affinity = await rpc("get_discovery_artist_catalog");
const unique = new Map(affinity.map((artist) => [normalize(artist), artist]));
const artists = [...unique].map(([key, artist]) => ({ artist, spotifyId: `catalog:${createHash("sha256").update(key).digest("hex")}`, listenCount: 1, totalMsPlayed: 3_600_000 })).sort((a, b) => a.artist.localeCompare(b.artist));
let generatedAt = new Date().toISOString();
try {
  const previous = JSON.parse(await fs.readFile(outputPath, "utf8"));
  if (JSON.stringify(previous.artists || []) === JSON.stringify(artists)) generatedAt = previous.generatedAt || generatedAt;
} catch {}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ generatedAt, source: "Active users' discovery affinity", matchingRule: "Confirmed archive, bucket list and qualified listening artists", artists }, null, 2)}\n`, "utf8");
process.stdout.write(`Synced ${synced}/${accounts.length} Spotify accounts and wrote ${artists.length} unique artists\n`);
