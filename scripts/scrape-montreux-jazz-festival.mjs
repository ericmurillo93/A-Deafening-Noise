import { context, decodeHtml, fetchText, matchingArtists, suggestion, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const sourceUrl = "https://www.montreuxjazzfestival.com/en/programme/";
const { listened, existing } = await context();
const html = await fetchText(sourceUrl);
const suggestions = [];
let eventsFound = 0;

for (const dayMatch of html.matchAll(/data-program-filter-date="(20\d{6})"([\s\S]*?)(?=data-program-filter-date="20\d{6}"|$)/g)) {
  const [, compactDate, dayHtml] = dayMatch;
  const date = `${compactDate.slice(6, 8)}/${compactDate.slice(4, 6)}/${compactDate.slice(0, 4)}`;
  for (const artistMatch of dayHtml.matchAll(/<a href="(https:\/\/www\.montreuxjazzfestival\.com\/en\/artist\/[^"/]+\/)"><strong>([\s\S]*?)<\/strong><\/a>/gi)) {
    eventsFound += 1;
    const [, artistUrl, rawTitle] = artistMatch;
    const title = decodeHtml(rawTitle);
    const artists = matchingArtists(title.replace(/\s*&\s*Special Guests$/i, ""), listened);
    if (!artists.length) continue;
    const item = suggestion({ id: `montreux-${compactDate}-${artistUrl.split("/").filter(Boolean).at(-1)}`, title, artists, venue: "Montreux Jazz Festival", city: "Montreux", country: "CH", date, source: "Montreux Jazz Festival", sourceUrl: artistUrl }, existing);
    if (item) suggestions.push(item);
  }
}

await writeResult({ source: sourceUrl, eventsFound, suggestions });
