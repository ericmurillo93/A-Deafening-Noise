import { requireArchiveUser } from "./lib/supabase-auth.js";

export async function handler(event) {
  const auth = await requireArchiveUser(event);
  if (auth.error) return auth.error;

  let setlistId, artist, date;
  try {
    ({ setlistId, artist, date } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  const apiKey = process.env.SETLIST_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server is missing SETLIST_API_KEY." }),
    };
  }

  const headers = {
    "x-api-key": apiKey,
    "Accept": "application/json",
  };

  const respond = (status, body) => ({
    statusCode: status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

  // ── Path 1: direct lookup by setlistId ──────────────────────────────────────
  if (setlistId) {
    try {
      const res = await fetch(`https://api.setlist.fm/rest/1.0/setlist/${setlistId}`, { headers });
      const text = await res.text();
      return respond(res.status, text);
    } catch (err) {
      return respond(500, { error: err.message });
    }
  }

  // ── Path 2: search by artist name + date ────────────────────────────────────
  if (!artist || !date) {
    return respond(400, { error: "Provide either setlistId or both artist and date" });
  }

  // Convert date from DD/MM/YYYY to DD-MM-YYYY (setlist.fm search format)
  const fmDate = date.replace(/\//g, "-");

  try {
    const searchUrl = `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(artist)}&date=${fmDate}&p=1`;
    const res = await fetch(searchUrl, { headers });

    if (!res.ok) {
      const text = await res.text();
      return respond(res.status, text);
    }

    const searchResult = await res.json();
    const setlists = searchResult?.setlist;

    if (!setlists || setlists.length === 0) {
      return respond(404, { error: `No setlist found for ${artist} on ${date}` });
    }

    // Return the first (best) match — it includes the id field at the top level
    return respond(200, JSON.stringify(setlists[0]));
  } catch (err) {
    return respond(500, { error: err.message });
  }
};
