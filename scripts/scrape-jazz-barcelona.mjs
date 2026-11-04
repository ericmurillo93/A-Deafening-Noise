import { pathToFileURL } from "node:url";
import { context, decodeHtml, fetchText, matchingArtists, suggestion, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const SOURCE_URL = "https://jazz.barcelona/concerts/";

export function programmeEvents(html) {
  return [...html.matchAll(/<h3\b[^>]*class="jzag__nom"[^>]*>\s*<a\b[^>]*href="(https:\/\/jazz\.barcelona\/concert\/[^"?#]+\/)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map(([, url, title]) => ({ url, title: decodeHtml(title) }));
}

export function concertSessions(html) {
  const sessions = [];
  const visit = (value) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    if (value["@graph"]) visit(value["@graph"]);
    const types = [value["@type"]].flat();
    if (!types.includes("MusicEvent")) return;
    const date = String(value.startDate || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
    const address = value.location?.address;
    const venue = decodeHtml(value.location?.name).replace(/\s+-\s+Barcelona$/i, "");
    const city = decodeHtml(address?.addressLocality);
    const country = String(address?.addressCountry || "").toUpperCase();
    if (!date || !venue || !city || !/^[A-Z]{2}$/.test(country)) return;
    const [, year, month, day] = date;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return;
    if (/EventCancelled|EventPostponed/.test(value.eventStatus || "")) return;
    const offers = [value.offers || []].flat();
    const ticket = offers.find((offer) => /^https:\/\/tickets\.oneboxtds\.com\//.test(offer.url || ""))?.url;
    const ticketId = ticket?.match(/\/select\/(\d+)/)?.[1];
    if (!URL.canParse(value.url) || new URL(value.url).origin !== "https://jazz.barcelona") return;
    sessions.push({
      id: `jazz-barcelona-${ticketId || `${new URL(value.url).pathname.split("/").filter(Boolean).at(-1)}-${year}${month}${day}`}`,
      title: decodeHtml(value.name),
      artists: [value.performer || []].flat().map((performer) => decodeHtml(performer.name)),
      venue, city, country, date: `${day}/${month}/${year}`,
      source: "Festival de Jazz de Barcelona", sourceUrl: ticket || value.url,
      eventStatus: offers.some((offer) => /SoldOut/.test(offer.availability || "")) ? "sold_out" : "announced",
      imageUrl: typeof value.image === "string" && value.image.startsWith("https://") ? value.image : "",
    });
  };
  for (const [, json] of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) visit(JSON.parse(json));
  return sessions;
}

async function main() {
  const { listened, existing } = await context();
  const events = programmeEvents(await fetchText(SOURCE_URL));
  if (!events.length) throw new Error("Jazz Barcelona programme contained no concert entries");
  const suggestions = [];
  const seen = new Set();
  for (const event of events) {
    if (!matchingArtists(event.title, listened).length) continue;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const sessions = concertSessions(await fetchText(event.url));
    if (!sessions.length) throw new Error(`Jazz Barcelona concert has no usable sessions: ${event.url}`);
    for (const session of sessions) {
      if (seen.has(session.id)) continue;
      seen.add(session.id);
      const artists = matchingArtists(session.artists.length ? session.artists : session.title, listened);
      const item = suggestion({ ...session, artists }, existing);
      if (item) suggestions.push({ ...item, imageUrl: session.imageUrl, eventStatus: session.eventStatus });
    }
  }
  await writeResult({ source: SOURCE_URL, eventsFound: events.length, suggestions });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
