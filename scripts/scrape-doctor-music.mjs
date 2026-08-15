import { context, decodeHtml, matchingArtists, suggestion, USER_AGENT, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const SOURCE_URL = "https://www.doctormusic.com/conciertos";
const DETAIL_URL = "https://www.doctormusic.com/concert_content.php";
const MONTHS = new Map([
  ["enero", 1], ["febrero", 2], ["marzo", 3], ["abril", 4], ["mayo", 5], ["junio", 6],
  ["julio", 7], ["agosto", 8], ["septiembre", 9], ["octubre", 10], ["noviembre", 11], ["diciembre", 12],
]);

function clean(value) {
  return decodeHtml(String(value || "").replace(/\s+/g, " ")).trim();
}

function parseDate(value) {
  const match = clean(value).match(/(\d{1,2})\s+([a-záéíóú]+)\s+(20\d{2})/i);
  const month = MONTHS.get(String(match?.[2] || "").toLowerCase());
  return match && month ? `${match[1].padStart(2, "0")}/${String(month).padStart(2, "0")}/${match[3]}` : "";
}

function listingEvents(html) {
  const events = [];
  const pattern = /<div id="concert(\d+)" class="imagecab">([\s\S]*?)(?=<div id="concert\d+" class="imagecab">|<div class="dots">|<\/body>)/gi;
  for (const match of html.matchAll(pattern)) {
    const title = clean(match[2].match(/class="title">([\s\S]*?)<\/div>/i)?.[1]);
    const dateText = clean(match[2].match(/class="date">([\s\S]*?)<\/div>/i)?.[1]);
    if (title) events.push({ id: match[1], title, date: parseDate(dateText), city: clean(dateText.match(/\(([^)]+)\)/)?.[1]) });
  }
  return events;
}

async function detail(eventId) {
  const response = await fetch(DETAIL_URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, Accept: "text/html", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ event_id: eventId, language: "es" }),
  });
  if (!response.ok) throw new Error(`Doctor Music detail ${eventId} returned HTTP ${response.status}`);
  return response.text();
}

function performances(html, fallback) {
  const blocks = html.match(/<div id="concerts-pastilla-\d+"[\s\S]*?(?=<div id="concerts-pastilla-|<p\s)/gi) || [];
  const values = blocks.map((block) => {
    const city = clean(block.match(/<span id="city">([\s\S]*?)<\/span>/i)?.[1]) || fallback.city;
    const dateText = block.match(/<div class="data">([\s\S]*?)<\/div>/i)?.[1] || "";
    const venue = clean(block.match(/<div class="data">[\s\S]*?<\/div>\s*<div>([\s\S]*?)<\/div>/i)?.[1]);
    const ticketUrl = block.match(/<a href="(https?:\/\/[^"#]+)"[^>]*>\s*<div>[\s\S]*?Comprar/i)?.[1] || "";
    return { city, venue, date: parseDate(dateText), ticketUrl };
  }).filter(({ date }) => date);
  return values.length ? values : (fallback.date ? [fallback] : []);
}

const { listened, existing } = await context();
const response = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } });
if (!response.ok) throw new Error(`Doctor Music returned HTTP ${response.status}`);
const events = listingEvents(await response.text());
const suggestions = [];

for (const event of events) {
  const artists = matchingArtists([event.title, event.title.split(":")[0]], listened);
  if (!artists.length) continue;
  const html = await detail(event.id);
  for (const performance of performances(html, event)) {
    const item = suggestion({
      id: `doctor-music-${event.id}-${performance.date}-${performance.city}`,
      title: event.title,
      artists,
      venue: performance.venue || "Doctor Music",
      city: performance.city,
      country: "ES",
      date: performance.date,
      source: "Doctor Music",
      sourceUrl: performance.ticketUrl || SOURCE_URL,
    }, existing);
    if (item) suggestions.push(item);
  }
}

await writeResult({ source: SOURCE_URL, eventsFound: events.length, suggestions });
