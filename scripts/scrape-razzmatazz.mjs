import { context, decodeHtml, fetchText, matchingArtists, suggestion, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const sourceUrl = "https://www.salarazzmatazz.com/agenda/";
const { listened, existing } = await context();
const html = await fetchText(sourceUrl);
const payloadPath = decodeHtml(html.match(/href="(\/agenda\/_payload\.json\?[^"\s]+)"/i)?.[1]);
if (!payloadPath) throw new Error("Razzmatazz agenda payload was not found");

function payloadEvents(payload) {
  const values = JSON.parse(payload);
  const data = values[values[values[0].data][1]];
  const eventsReference = Object.entries(data).find(([key]) => key.startsWith("latestsAgendaEvents-"))?.[1];
  if (!Number.isInteger(eventsReference)) throw new Error("Razzmatazz events were not found in the agenda payload");
  const seen = new Map();
  function revive(reference) {
    if (typeof reference !== "number") return reference;
    if (seen.has(reference)) return seen.get(reference);
    const value = values[reference];
    if (!value || typeof value !== "object") return value;
    const result = Array.isArray(value) ? [] : {};
    seen.set(reference, result);
    if (Array.isArray(value)) result.push(...value.map(revive));
    else for (const [key, child] of Object.entries(value)) result[key] = revive(child);
    return result;
  }
  return revive(eventsReference);
}

const events = payloadEvents(await fetchText(new URL(payloadPath, sourceUrl)));
const suggestions = [];
const seen = new Set();

for (const event of events) {
  const [, year, month, day] = String(event.date || "").match(/^(20\d{2})-(\d{2})-(\d{2})$/) || [];
  const slug = event.slug?.current;
  if (!day || !slug) continue;
  const key = `${day}/${month}/${year}|${slug}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const artists = matchingArtists((event.artists || []).map(({ title }) => title), listened);
  if (!artists.length) continue;
  const item = suggestion({ id: `razzmatazz-${day}${month}${year}-${slug}`, title: event.title || artists.join(" + "), artists, venue: "Razzmatazz", city: "Barcelona", country: "ES", date: `${day}/${month}/${year}`, source: "Sala Razzmatazz", sourceUrl: new URL(`/agenda/${slug}/`, sourceUrl).href }, existing);
  if (item) suggestions.push(item);
}

await writeResult({ source: sourceUrl, eventsFound: seen.size, suggestions });
