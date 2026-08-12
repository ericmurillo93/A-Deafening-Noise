import { context, fetchText, normalize, textContent, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const BASE_URL = "https://www.madnesslive.es";
const LISTING_URL = `${BASE_URL}/es/`;
const cityFilter = process.argv.find((argument) => argument.startsWith("--city="))?.slice("--city=".length);

const MONTHS = new Map(Object.entries({
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}));

function titleCaseSlug(value) {
  return decodeURIComponent(value).replaceAll("-", " ").replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function eventLinks(listingHtml) {
  return [...new Set(
    [...listingHtml.matchAll(/<a\s+href="(https:\/\/www\.madnesslive\.es\/es\/pagina\/[^"#]+)"[^>]*>\s*<img[^>]+src="[^"]*\/img\/cms\/shows\//gi)]
      .map((match) => match[1]),
  )];
}

function pageTitle(detailHtml) {
  return textContent(detailHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function dateFromText(value) {
  const normalized = normalize(value);
  const numeric = normalized.match(/\b(\d{1,2})\s+(\d{1,2})\s+(20\d{2})\b/);
  if (numeric) return `${numeric[1].padStart(2, "0")}/${numeric[2].padStart(2, "0")}/${numeric[3]}`;
  const written = normalized.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de)?\s+(20\d{2})\b/);
  if (!written || !MONTHS.has(written[2])) return "";
  return `${written[1].padStart(2, "0")}/${String(MONTHS.get(written[2])).padStart(2, "0")}/${written[3]}`;
}

function billedArtistKeys(detailHtml) {
  const content = detailHtml.match(/<section\s+id="content"[\s\S]*?<\/section>/i)?.[0] || detailHtml;
  const strongTexts = [...content.matchAll(/<strong[^>]*>([\s\S]*?)<\/strong>/gi)].map((match) => textContent(match[1]));
  return new Set(
    strongTexts
      .flatMap((value) => [value, ...value.split(/\s+(?:\+|\/|,|&|y)\s+/i)])
      .map(normalize)
      .filter(Boolean),
  );
}

function tourStops(detailHtml) {
  const purchaseStart = detailHtml.search(/id="comprarentradas"/i);
  if (purchaseStart < 0) return [];
  const purchaseHtml = detailHtml.slice(purchaseStart, detailHtml.indexOf("</section>", purchaseStart));
  const strongMatches = [...purchaseHtml.matchAll(/<strong[^>]*>([\s\S]*?)<\/strong>/gi)];
  const stops = [];

  for (const [index, match] of strongMatches.entries()) {
    const date = dateFromText(textContent(match[1]));
    if (!date) continue;
    const nextDateIndex = strongMatches.slice(index + 1).findIndex((candidate) => dateFromText(textContent(candidate[1])));
    const end = nextDateIndex < 0 ? purchaseHtml.length : strongMatches[index + 1 + nextDateIndex].index;
    const block = purchaseHtml.slice(match.index, end);
    const followingStrong = [...block.matchAll(/<strong[^>]*>([\s\S]*?)<\/strong>/gi)]
      .slice(1)
      .map((candidate) => textContent(candidate[1]))
      .find((value) => value && !/(?:€|anticipada|taquilla|entrada|horario|sold out|agotad)/i.test(value));
    const citySlug = block.match(/\/conciertos-en-([^/"?]+)\//i)?.[1];
    const parentheticalCity = followingStrong?.match(/\((?:[^,]+,\s*)?([^)]+)\)/)?.[1]?.trim();
    const city = parentheticalCity || (citySlug ? titleCaseSlug(citySlug) : "");
    const venue = (followingStrong || "").replace(/\s*\([^)]+\)\s*$/, "").trim();
    if (venue) stops.push({ city, venue, date });
  }

  return stops.filter((stop, index) => stops.findIndex((candidate) =>
    candidate.date === stop.date && normalize(candidate.venue) === normalize(stop.venue)
  ) === index);
}

const { listened: listenedArtistsByKey, existing: existingArtistDates } = await context();

const listingHtml = await fetchText(LISTING_URL);
const links = eventLinks(listingHtml);
const suggestions = [];
const alreadyTrackedMatches = [];
const pagesWithoutStops = [];
let matchedPages = 0;
let matchedStops = 0;

for (const [index, sourceUrl] of links.entries()) {
  if (index > 0) await new Promise((resolve) => setTimeout(resolve, 250));
  const detailHtml = await fetchText(sourceUrl);
  const billedKeys = billedArtistKeys(detailHtml);
  const matchedArtists = [...listenedArtistsByKey]
    .filter(([key]) => billedKeys.has(key))
    .map(([, artist]) => artist);
  if (!matchedArtists.length) continue;
  matchedPages += 1;

  const stops = tourStops(detailHtml).filter((stop) => !cityFilter || normalize(stop.city) === normalize(cityFilter));
  if (!stops.length) pagesWithoutStops.push({ title: pageTitle(detailHtml), sourceUrl });
  for (const stop of stops) {
    matchedStops += 1;
    const newArtists = matchedArtists.filter((artist) => !existingArtistDates.has(`${normalize(artist)}|${stop.date}`));
    const trackedArtists = matchedArtists.filter((artist) => !newArtists.includes(artist));
    alreadyTrackedMatches.push(...trackedArtists.map((artist) => ({ artist, ...stop, sourceUrl })));
    if (!newArtists.length) continue;
    suggestions.push({
      id: `madness-live-${sourceUrl.match(/\/pagina\/(\d+)-/)?.[1] || index}-${stop.date.replaceAll("/", "")}`,
      title: pageTitle(detailHtml),
      artists: newArtists.sort((a, b) => a.localeCompare(b)),
      venue: stop.venue,
      city: stop.city,
      country: "ES",
      date: stop.date,
      source: "Madness Live",
      sourceUrl,
    });
  }
}

await writeResult({
  source: LISTING_URL,
  city: cityFilter || null,
  pagesScanned: links.length,
  matchedPages,
  matchedStops,
  alreadyTracked: alreadyTrackedMatches.length,
  alreadyTrackedMatches,
  pagesWithoutStops,
  suggestions,
});
