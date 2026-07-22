import { context, decodeHtml, fetchText, matchingArtists, suggestion, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const sourceUrl = "https://www.palaumusica.cat/es/programacion_1158636";
const apiUrl = "https://www.palaumusica.cat/es/programming_data_json?palau_productions=true&orfeo_productions=false&espaisoci_productions=false&sessions_as_dict=1";
const { listened, existing } = await context();
const data = JSON.parse(await fetchText(apiUrl));
const suggestions = [];
let eventsFound = 0;

for (const production of Object.values(data.productions || {})) {
  const title = decodeHtml(production.title);
  const performerNames = [...String(production.performers || "").matchAll(/<span class="artist">([\s\S]*?)<\/span>/gi)]
    .flatMap((match) => decodeHtml(match[1]).split(/\s*,\s*/));
  const artists = matchingArtists([title, ...performerNames], listened);
  if (!artists.length) continue;
  for (const sessionId of production.sessions || []) {
    const session = data.sessions?.[sessionId];
    if (!session || session.expired || session.hidden || session.problems?.cancelled) continue;
    const match = session.start_date?.value?.match(/^(20\d{2})-(\d{2})-(\d{2})/);
    if (!match) continue;
    eventsFound += 1;
    const [, year, month, day] = match;
    const date = `${day}/${month}/${year}`;
    const stage = data.stages?.[session.stage];
    const item = suggestion({ id: `palau-${production.id}-${sessionId}`, title, artists, venue: stage?.title || stage?.name || "Palau de la Música Catalana", city: "Barcelona", country: "ES", date, source: "Palau de la Música Catalana", sourceUrl: production.url || sourceUrl }, existing);
    if (item) suggestions.push(item);
  }
}

await writeResult({ source: sourceUrl, eventsFound, suggestions });
