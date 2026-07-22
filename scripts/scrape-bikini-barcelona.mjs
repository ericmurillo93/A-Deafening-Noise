import { context, decodeHtml, fetchText, matchingArtists, suggestion, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const sourceUrl = "https://bikinibcn.com/conciertos/";
const { listened, existing } = await context();
const html = await fetchText(sourceUrl);
const suggestions = [];
const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const today = new Date();
let eventsFound = 0;

for (const match of html.matchAll(/<div class="qode-event-content qode-events(\d+)"[\s\S]*?<span class="qode-event-day-number-holder"[^>]*>\s*(\d{1,2})\s*<\/span>[\s\S]*?<span class="qode-event-day-holder">\s*([A-Za-z]{3})\s*<\/span>[\s\S]*?<h3 class="qode-event-title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
  const [, eventId, day, monthName, eventUrl, rawTitle] = match;
  const month = months[monthName.toLowerCase()];
  if (!month) continue;
  eventsFound += 1;
  const year = month < today.getMonth() + 1 || (month === today.getMonth() + 1 && Number(day) < today.getDate()) ? today.getFullYear() + 1 : today.getFullYear();
  const date = `${day.padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  const title = decodeHtml(rawTitle);
  const artists = matchingArtists(title, listened);
  if (!artists.length) continue;
  const item = suggestion({ id: `bikini-${eventId}`, title, artists, venue: "Sala Bikini", city: "Barcelona", country: "ES", date, source: "Sala Bikini", sourceUrl: eventUrl }, existing);
  if (item) suggestions.push(item);
}

await writeResult({ source: sourceUrl, eventsFound, suggestions });
