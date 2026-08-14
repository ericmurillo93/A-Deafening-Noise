const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const verifierKey = "adn_spotify_code_verifier";
const stateKey = "adn_spotify_oauth_state";
let callbackPromise;

const encode = (value) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const random = () => encode(crypto.getRandomValues(new Uint8Array(48)));
const redirectUri = () => `${window.location.origin}/spotify/callback`;
const artistKey = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export async function connectSpotify() {
  if (!clientId) throw new Error("Spotify is not configured for this environment.");
  const verifier = random();
  const state = random();
  const challenge = encode(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem(verifierKey, verifier);
  sessionStorage.setItem(stateKey, state);
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri(), scope: "user-top-read", state, show_dialog: "true", code_challenge_method: "S256", code_challenge: challenge });
  window.location.assign(url);
}

async function spotifyRequest(path, accessToken) {
  const response = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(response.status === 429 ? "Spotify is temporarily rate limiting requests. Try again later." : "Spotify could not return your listening profile.");
  return response.json();
}

async function finish(search, futureArtists) {
  const params = new URLSearchParams(search);
  if (params.get("error")) throw new Error("Spotify connection was cancelled.");
  const code = params.get("code");
  const verifier = sessionStorage.getItem(verifierKey);
  const expectedState = sessionStorage.getItem(stateKey);
  if (!code || !verifier || !expectedState || params.get("state") !== expectedState) throw new Error("Spotify could not verify this connection. Please try again.");

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: verifier }),
  });
  sessionStorage.removeItem(verifierKey);
  sessionStorage.removeItem(stateKey);
  if (!tokenResponse.ok) throw new Error("Spotify authorization expired. Please connect again.");
  const { access_token: accessToken, refresh_token: refreshToken } = await tokenResponse.json();
  const [profile, ...ranges] = await Promise.all([
    spotifyRequest("/me", accessToken),
    ...["short_term", "medium_term", "long_term"].map((range) => spotifyRequest(`/me/top/artists?limit=50&time_range=${range}`, accessToken)),
  ]);
  const artists = new Map();
  ranges.forEach(({ items = [] }, index) => items.forEach(({ id, name, images }) => {
    if (!id || !name) return;
    const current = artists.get(id) || { spotifyId: id, name, imageUrl: images?.[0]?.url || "", ranges: [] };
    current.ranges.push(["short_term", "medium_term", "long_term"][index]);
    artists.set(id, current);
  }));
  const known = new Set([...artists.values()].map(({ name }) => artistKey(name)));
  const artwork = [];
  for (const name of [...new Set(futureArtists)].filter((artist) => !known.has(artistKey(artist))).slice(0, 50)) {
    const { artists: matches } = await spotifyRequest(`/search?type=artist&limit=5&q=${encodeURIComponent(name)}`, accessToken);
    const match = matches?.items?.find((artist) => artistKey(artist.name) === artistKey(name) && artist.images?.[0]?.url);
    if (match) artwork.push({ normalizedArtist: artistKey(name), spotifyId: match.id, name: match.name, imageUrl: match.images[0].url });
  }
  return { spotifyUserId: profile.id, displayName: profile.display_name || "Spotify user", refreshToken, artists: [...artists.values()], artwork };
}

export function finishSpotifyConnection(futureArtists = [], search = window.location.search) {
  callbackPromise ||= finish(search, futureArtists);
  return callbackPromise;
}
