import { context, fetchText, normalize, textContent, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const BASE_URL = "https://www.resurrectionfest.es";
const city = (process.argv.find((argument) => argument.startsWith("--city="))?.split("=")[1] || "barcelona").toLowerCase();

function eventLinks(listingHtml) {
  return [...new Set(
    [...listingHtml.matchAll(/<a\s+class="event-rf__card"\s+href="([^"]+)"/gi)].map((match) => match[1])
  )];
}

function routeStops(detailHtml) {
  const routeInfo = detailHtml.match(/<div\s+class="route-info">([\s\S]*?)<\/div>/i)?.[1];
  if (!routeInfo) return [];
  return textContent(routeInfo)
    .replace(/^Próximos conciertos:\s*/i, "")
    .split("|")
    .map((entry) => entry.trim())
    .flatMap((entry) => {
      const match = entry.match(/^(.+?)\.\s+(.+?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{4})$/);
      if (!match) return [];
      return [{ city: match[1].trim(), venue: match[2].trim(), date: match[3] }];
    });
}

function routeTitle(detailHtml) {
  const heading = detailHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "";
  return textContent(heading)
    .replace(/^Route Resurrection(?:\s+\d{4})?:\s*/i, "")
    .replace(/\s+\d{4}\s*$/, "")
    .trim();
}

function billedPerformerNames(detailHtml) {
  const article = detailHtml.match(/<div\s+class="gira-text">([\s\S]*?)<div\s+class="gira-ctas">/i)?.[1]
    || detailHtml.match(/<div\s+class="gira-text">([\s\S]*?)<\/section>/i)?.[1]
    || "";
  return [
    routeTitle(detailHtml),
    ...[...article.matchAll(/<strong[^>]*>([\s\S]*?)<\/strong>/gi)].map((match) => textContent(match[1])),
  ];
}

const { listened, existing: existingArtistDates } = await context();
const listenedArtists = [...listened.values()].sort((a, b) => b.length - a.length);

const listingUrl = `${BASE_URL}/route/?filter_city=${encodeURIComponent(city)}&q=&filter_date_range=`;
const listingHtml = await fetchText(listingUrl);
const links = eventLinks(listingHtml);
const suggestions = [];
let matchedStops = 0;
let alreadyTracked = 0;
const alreadyTrackedMatches = [];

for (const [index, sourceUrl] of links.entries()) {
  if (index > 0) await new Promise((resolve) => setTimeout(resolve, 250));
  const detailHtml = await fetchText(sourceUrl);
  const billedNames = new Set(billedPerformerNames(detailHtml).map(normalize).filter(Boolean));
  const matchedArtists = listenedArtists.filter((artist) => billedNames.has(normalize(artist)));
  if (!matchedArtists.length) continue;

  for (const stop of routeStops(detailHtml).filter((entry) => normalize(entry.city) === normalize(city))) {
    matchedStops += 1;
    const newArtists = matchedArtists.filter((artist) =>
      !existingArtistDates.has(`${normalize(artist)}|${stop.date}`)
    );
    const trackedArtists = matchedArtists.filter((artist) => !newArtists.includes(artist));
    alreadyTracked += trackedArtists.length;
    alreadyTrackedMatches.push(...trackedArtists.map((artist) => ({ artist, ...stop, sourceUrl })));
    if (!newArtists.length) continue;
    suggestions.push({
      id: `resurrection-route-${sourceUrl.split("/").filter(Boolean).at(-1)}-${stop.date.replaceAll("/", "")}`,
      title: routeTitle(detailHtml),
      artists: newArtists.sort((a, b) => a.localeCompare(b)),
      venue: stop.venue,
      city: stop.city,
      country: "ES",
      date: stop.date,
      source: "Resurrection Fest Route",
      sourceUrl,
    });
  }
}

await writeResult({
  source: listingUrl,
  city,
  pagesScanned: links.length,
  matchedStops,
  alreadyTracked,
  alreadyTrackedMatches,
  suggestions,
});
