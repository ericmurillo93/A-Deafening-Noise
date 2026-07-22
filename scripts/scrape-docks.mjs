import { context, decodeHtml, fetchText, matchingArtists, suggestion, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const sourceUrl = "https://www.docks.ch/";
const { listened, existing } = await context();
const html = await fetchText(sourceUrl);
const suggestions = [];
const seen = new Set();
const pattern = /<a href="(https:\/\/www\.docks\.ch\/evenement\/concerts\/(20\d{2})(\d{2})(\d{2})\/[^"/]+\/)">[\s\S]*?<div class="event-item-title programme-item-title">([\s\S]*?)<\/div>[\s\S]*?<div class="programme-item-date">([\s\S]*?)<\/div>/gi;

for (const match of html.matchAll(pattern)) {
  const [, eventUrl, year, month, day, rawTitle, rawStatus] = match;
  if (seen.has(eventUrl) || /annul/i.test(decodeHtml(rawStatus))) continue;
  seen.add(eventUrl);
  const title = decodeHtml(rawTitle);
  const artists = matchingArtists(title, listened);
  if (!artists.length) continue;
  const item = suggestion({ id: `docks-${year}${month}${day}-${eventUrl.split("/").filter(Boolean).at(-1)}`, title, artists, venue: "Les Docks", city: "Lausanne", country: "CH", date: `${day}/${month}/${year}`, source: "Les Docks", sourceUrl: eventUrl }, existing);
  if (item) suggestions.push(item);
}

await writeResult({ source: sourceUrl, eventsFound: seen.size, crawlDelaySeconds: 10, suggestions });
