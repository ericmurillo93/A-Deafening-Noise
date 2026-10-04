import { requireArchiveUser } from "./lib/supabase-auth.js";
import { matchSetlist } from "./lib/setlist-match.js";

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== "POST") return { statusCode: 405, headers: { Allow: "POST" }, body: "Method not allowed" };
  const auth = await requireArchiveUser(event, { quota: "setlist" });
  if (auth.error) return auth.error;

  let setlistId, artist, venue, date, action, userId, pages;
  try {
    ({ setlistId, artist, venue, date, action, userId, pages } = JSON.parse(event.body));
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
  const request = (url) => fetch(url, { headers, signal: AbortSignal.timeout(12000) });

  const respond = (status, body) => ({
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

  if (action === "attended") {
    if (!userId || !/^[\w.-]{1,100}$/.test(userId)) return respond(400, { error: "Enter a valid setlist.fm username" });
    const pageLimit = Math.min(Math.max(Number(pages) || 5, 1), 10); const setlists = [];
    try {
      for (let page = 1; page <= pageLimit; page += 1) {
        const res = await request(`https://api.setlist.fm/rest/1.0/user/${encodeURIComponent(userId)}/attended?p=${page}`);
        if (!res.ok) return respond(res.status, await res.text());
        const body = await res.json(); setlists.push(...(body.setlist || []));
        if (setlists.length >= Number(body.total || 0)) break;
      }
      return respond(200, { setlist: setlists });
    } catch (err) { return respond(500, { error: err.message }); }
  }

  // ── Path 1: direct lookup by setlistId ──────────────────────────────────────
  if (setlistId) {
    try {
      const res = await request(`https://api.setlist.fm/rest/1.0/setlist/${encodeURIComponent(setlistId)}`);
      const text = await res.text();
      return respond(res.status, text);
    } catch (err) {
      return respond(500, { error: err.message });
    }
  }

  // ── Path 2: search by artist name + date ────────────────────────────────────
  if (typeof artist !== "string" || typeof date !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    return respond(400, { error: "Provide either setlistId or both artist and date" });
  }

  // Convert date from DD/MM/YYYY to DD-MM-YYYY (setlist.fm search format)
  const fmDate = date.replace(/\//g, "-");

  try {
    const searchUrl = `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(artist)}&date=${fmDate}&p=1`;
    const res = await request(searchUrl);

    if (!res.ok) {
      const text = await res.text();
      return respond(res.status, text);
    }

    const searchResult = await res.json();
    const setlists = searchResult?.setlist;

    if (!setlists || setlists.length === 0) {
      return respond(404, { error: `No setlist found for ${artist} on ${date}` });
    }

    const match = matchSetlist(setlists, venue);
    return match ? respond(200, match) : respond(404, { error: "No unambiguous setlist found for this venue." });
  } catch (err) {
    return respond(500, { error: err.message });
  }
};
