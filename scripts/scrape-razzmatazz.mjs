import { context, decodeHtml, fetchText, normalize, suggestion, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const sourceUrl = "https://www.salarazzmatazz.com/agenda/";
const { listened, existing } = await context();
const html = await fetchText(sourceUrl);
const suggestions = [];
const seen = new Set();

for (const match of html.matchAll(/href="(\/agenda\/(\d{2})-(\d{2})-(20\d{2})-([^"/]+)\/?)"/gi)) {
  const [, relativeUrl, day, month, year, slug] = match;
  const key = `${day}/${month}/${year}|${slug}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const titleKey = normalize(slug.replaceAll("-", " "));
  const artists = [...listened]
    .filter(([artistKey]) => titleKey === artistKey || (artistKey.length >= 4 && titleKey.startsWith(`${artistKey} `)))
    .map(([, artist]) => artist);
  if (!artists.length) continue;
  const item = suggestion({ id: `razzmatazz-${day}${month}${year}-${slug}`, title: decodeHtml(slug.replaceAll("-", " ")), artists, venue: "Razzmatazz", city: "Barcelona", country: "ES", date: `${day}/${month}/${year}`, source: "Sala Razzmatazz", sourceUrl: new URL(relativeUrl, sourceUrl).href }, existing);
  if (item) suggestions.push(item);
}

await writeResult({ source: sourceUrl, eventsFound: seen.size, suggestions });
