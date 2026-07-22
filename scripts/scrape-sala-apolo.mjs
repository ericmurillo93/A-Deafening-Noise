import { context, decodeHtml, fetchText, matchingArtists, suggestion, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const sourceUrl = "https://www.sala-apolo.com/es/agenda";
const { listened, existing } = await context();
const suggestions = [];
const seenUrls = new Set();
let pagesScanned = 0;

for (let page = 0; page < 60; page += 1) {
  if (page > 0) await new Promise((resolve) => setTimeout(resolve, 250));
  const pageUrl = page ? `${sourceUrl}?page=${page}` : sourceUrl;
  const html = await fetchText(pageUrl);
  pagesScanned += 1;
  const eventPattern = /<a href="(\/es\/evento\/[^"#]+)" class="c-results__event__title">([\s\S]*?)<\/a>/gi;
  let newUrls = 0;

  for (const match of html.matchAll(eventPattern)) {
    const [, relativeUrl, rawTitle] = match;
    if (seenUrls.has(relativeUrl)) continue;
    seenUrls.add(relativeUrl);
    newUrls += 1;
    const compactDate = relativeUrl.match(/-(20\d{6})-\d+$/)?.[1];
    if (!compactDate) continue;
    const preceding = html.slice(Math.max(0, match.index - 1800), match.index);
    if (!/c-leadCategory[^>]*>\s*Conciertos\s*</i.test(preceding)) continue;
    const title = decodeHtml(rawTitle).replace(/\s+(?:Agotado|Gratis)\s*$/i, "").trim();
    const candidates = [title, ...title.split(/\s*(?:\+|\||:)\s*/).slice(1)];
    const artists = matchingArtists(candidates, listened);
    if (!artists.length) continue;
    const date = `${compactDate.slice(6, 8)}/${compactDate.slice(4, 6)}/${compactDate.slice(0, 4)}`;
    const meta = decodeHtml(preceding.match(/<span class="c-leadMeta">([\s\S]*?)<\/span>/i)?.[1] || "");
    const venue = meta.split("·").map((part) => part.trim()).find((part) => /^(?:Sala Apolo|La \([23]\))$/i.test(part)) || "Sala Apolo";
    const item = suggestion({ id: `sala-apolo-${relativeUrl.match(/-(\d+)$/)?.[1] || compactDate}`, title, artists, venue, city: "Barcelona", country: "ES", date, source: "Sala Apolo", sourceUrl: new URL(relativeUrl, sourceUrl).href }, existing);
    if (item) suggestions.push(item);
  }

  if (!html.includes(`href="?page=${page + 1}"`) || newUrls === 0) break;
}

await writeResult({ source: sourceUrl, pagesScanned, eventsFound: seenUrls.size, suggestions });
