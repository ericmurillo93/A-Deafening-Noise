import { context, decodeHtml, fetchText, matchingArtists, suggestion, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const sourceUrl = "https://paral-lel62.cat/es/agenda-es/";
const apiUrl = "https://paral-lel62.cat/wp-json/wp/v2/event?per_page=100";
const { listened, existing } = await context();
const events = JSON.parse(await fetchText(apiUrl));
const suggestions = [];

for (const event of events) {
  const title = decodeHtml(event.title?.rendered);
  const artists = matchingArtists(title, listened);
  if (!artists.length) continue;
  const year = event.slug.match(/(20\d{2})/)?.[1];
  const description = decodeHtml(event.yoast_head_json?.description || event.yoast_head || "");
  const numeric = description.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
  const written = description.match(/\b(?:dia|el)\s+(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i);
  const months = { enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06", julio: "07", agosto: "08", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12" };
  const date = numeric ? `${numeric[1].padStart(2, "0")}/${numeric[2].padStart(2, "0")}/${numeric[3]}` : written && year ? `${written[1].padStart(2, "0")}/${months[written[2].toLowerCase()]}/${year}` : "";
  if (!date) continue;
  const item = suggestion({ id: `parallel62-${event.id}`, title, artists, venue: "Paral·lel 62", city: "Barcelona", country: "ES", date, source: "Paral·lel 62", sourceUrl: event.link || sourceUrl }, existing);
  if (item) suggestions.push(item);
}

await writeResult({ source: sourceUrl, eventsFound: events.length, suggestions });
