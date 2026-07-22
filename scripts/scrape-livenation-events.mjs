import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BASE_URL = "https://www.livenation.es";
const API_URL = `${BASE_URL}/api/search/events`;
const USER_AGENT = "A-Deafening-Noise/1.0 (+personal concert calendar; contact via repository)";
const PAGE_SIZE = 50;
const DEFAULT_CITY_ID = "7243";
const DEFAULT_COUNTRY_ID = "206";
const DEFAULT_GENRES = "rock,hard-rock-and-metal";
const EXCLUDED_STATUSES = new Map([
  [5, "cancelled"],
  [6, "postponed"],
]);

function argument(name, fallback) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}

const cityId = argument("city-id", DEFAULT_CITY_ID);
const countryId = argument("country-id", DEFAULT_COUNTRY_ID);
const genres = argument("genres", DEFAULT_GENRES);
const outputPath = argument("output", "");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function localizedEvent(event) {
  return event.localizations?.find(({ cultureName }) => cultureName === "es-ES")
    || event.localizations?.[0]
    || {};
}

function sourceUrl(event) {
  const url = localizedEvent(event).url || event.eventUrl || "";
  return url ? new URL(url, BASE_URL).href : BASE_URL;
}

async function fetchPage(page) {
  const query = new URLSearchParams({
    PageSize: String(PAGE_SIZE),
    Url: "/event/allevents",
    IncludePostponed: "true",
    IncludeCancelled: "true",
    CityIds: cityId,
    CountryIds: countryId,
    Genres: genres,
    Page: String(page),
  });
  const response = await fetch(`${API_URL}?${query}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "X-Site": "www.livenation.es",
      "X-Culture": "es-ES",
    },
  });
  if (!response.ok) throw new Error(`Live Nation event search returned HTTP ${response.status}`);
  const result = await response.json();
  if (result.hasError) throw new Error("Live Nation event search reported an error");
  return result;
}

async function fetchEvents() {
  const firstPage = await fetchPage(1);
  const events = [...(firstPage.documents || [])];
  const pageCount = Math.max(1, Math.ceil((firstPage.total || events.length) / PAGE_SIZE));
  for (let page = 2; page <= pageCount; page += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result = await fetchPage(page);
    events.push(...(result.documents || []));
  }
  return { events, pageCount, total: firstPage.total || events.length };
}

const root = process.cwd();
const concertData = JSON.parse(await fs.readFile(path.join(root, "data/concerts.json"), "utf8"));
const listenedArtistData = JSON.parse(await fs.readFile(path.join(root, "data/listened-artists.json"), "utf8"));
const listenedArtistsByKey = new Map(
  listenedArtistData.artists
    .filter(({ artist }) => artist)
    .map(({ artist }) => [normalize(artist), artist]),
);
const existingArtistDates = new Set(
  concertData.concerts.map(({ artist, date }) => `${normalize(artist)}|${date}`),
);

const listingQuery = new URLSearchParams({ CityIds: cityId, CountryIds: countryId, Genres: genres });
const listingUrl = `${BASE_URL}/event/allevents?${listingQuery}`;
const { events, pageCount, total } = await fetchEvents();
const suggestions = [];
const alreadyTrackedMatches = [];
const excludedEvents = [];
let matchedEvents = 0;

for (const event of events) {
  if (EXCLUDED_STATUSES.has(event.allTicketStatus)) {
    excludedEvents.push({
      id: event.id,
      title: event.name || localizedEvent(event).name,
      status: EXCLUDED_STATUSES.get(event.allTicketStatus),
      sourceUrl: sourceUrl(event),
    });
    continue;
  }

  const date = formatDate(event.eventDate);
  if (!date) continue;
  const matchedArtists = [...new Set(
    (event.lineup || [])
      .map(({ name }) => listenedArtistsByKey.get(normalize(name)))
      .filter(Boolean),
  )];
  if (!matchedArtists.length) continue;
  matchedEvents += 1;

  const newArtists = matchedArtists.filter((artist) => !existingArtistDates.has(`${normalize(artist)}|${date}`));
  const trackedArtists = matchedArtists.filter((artist) => !newArtists.includes(artist));
  alreadyTrackedMatches.push(...trackedArtists.map((artist) => ({
    artist,
    venue: event.venue?.name || "",
    city: event.venue?.city || "",
    date,
    sourceUrl: sourceUrl(event),
  })));
  if (!newArtists.length) continue;

  suggestions.push({
    id: `livenation-${event.id}`,
    title: localizedEvent(event).name || event.name,
    artists: newArtists.sort((a, b) => a.localeCompare(b)),
    venue: event.venue?.name || "",
    city: event.venue?.city || "",
    country: "ES",
    date,
    source: "Live Nation Spain",
    sourceUrl: sourceUrl(event),
  });
}

const result = {
  generatedAt: new Date().toISOString(),
  source: listingUrl,
  cityId,
  countryId,
  genres: genres.split(",").filter(Boolean),
  pagesScanned: pageCount,
  eventsFound: total,
  matchedEvents,
  alreadyTracked: alreadyTrackedMatches.length,
  alreadyTrackedMatches,
  excludedEvents,
  suggestions,
};
const json = `${JSON.stringify(result, null, 2)}\n`;
if (outputPath) await fs.writeFile(path.resolve(root, outputPath), json, "utf8");
else process.stdout.write(json);
