import { context, matchingArtists, suggestion, USER_AGENT, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const API_URL = "https://api.dice.fm";
const SOURCE_URL = "https://dice.fm";
const PAGE_SIZE = 24;
const REQUEST_DELAY_MS = 350;
const MAX_PAGES_PER_CITY = 50;
const ALLOWED_COUNTRIES = new Set(["ES", "CH"]);
const EXCLUDED_STATUSES = new Set(["cancelled", "canceled", "postponed"]);
const LOCATIONS = [
  { name: "Barcelona", lat: 41.39, lng: 2.154, timezone: "Europe/Madrid" },
  { name: "Madrid", lat: 40.416, lng: -3.703, timezone: "Europe/Madrid" },
  { name: "Ibiza", lat: 38.908062, lng: 1.429133, timezone: "Europe/Madrid" },
  { name: "Zürich", lat: 47.3769, lng: 8.5417, timezone: "Europe/Zurich" },
  { name: "Geneva", lat: 46.2044, lng: 6.1432, timezone: "Europe/Zurich" },
  { name: "Lausanne", lat: 46.5197, lng: 6.6323, timezone: "Europe/Zurich" },
  { name: "Basel", lat: 47.5596, lng: 7.5886, timezone: "Europe/Zurich" },
];

let lastRequestAt = 0;

async function politeDelay() {
  const remaining = REQUEST_DELAY_MS - (Date.now() - lastRequestAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  lastRequestAt = Date.now();
}

async function api(path, options = {}) {
  await politeDelay();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`DICE ${path} returned HTTP ${response.status}`);
  return response.json();
}

function eventsFromSearch(result) {
  const events = [];
  for (const section of result.sections || []) {
    if (Array.isArray(section.events)) events.push(...section.events);
    for (const item of section.items || []) {
      if (item.event) events.push(item.event);
    }
  }
  return events;
}

async function searchLocation(location) {
  const found = new Map();
  const cursors = new Set();
  let cursor = null;
  let pages = 0;

  while (pages < MAX_PAGES_PER_CITY) {
    const result = await api("/unified_search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en",
        "X-Client-Timezone": location.timezone,
      },
      body: JSON.stringify({
        count: PAGE_SIZE,
        lat: location.lat,
        lng: location.lng,
        tag: "music:gig",
        ...(cursor ? { cursor } : {}),
      }),
    });
    pages += 1;
    for (const event of eventsFromSearch(result)) {
      if (event?.id) found.set(event.id, event);
    }
    const nextCursor = result.next_page_cursor;
    if (!nextCursor || cursors.has(nextCursor)) break;
    cursors.add(nextCursor);
    cursor = nextCursor;
  }

  if (pages === MAX_PAGES_PER_CITY && cursor) {
    throw new Error(`DICE pagination exceeded ${MAX_PAGES_PER_CITY} pages for ${location.name}`);
  }
  return { events: [...found.values()], pages };
}

function formatDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

const { listened, existing } = await context();
const listedEvents = new Map();
const locationStats = [];

for (const location of LOCATIONS) {
  const result = await searchLocation(location);
  for (const event of result.events) listedEvents.set(event.id, event);
  locationStats.push({ location: location.name, pagesScanned: result.pages, eventsFound: result.events.length });
}

const suggestions = [];
let detailPagesScanned = 0;
let eligibleEvents = 0;

for (const listedEvent of listedEvents.values()) {
  const event = await api(`/events/${listedEvent.id}`);
  detailPagesScanned += 1;
  if (EXCLUDED_STATUSES.has(String(event.status || "").toLowerCase())) continue;

  const venue = event.venues?.[0];
  const country = venue?.city?.country_code || venue?.city?.country_id || "";
  if (!ALLOWED_COUNTRIES.has(country)) continue;
  eligibleEvents += 1;

  let lineup = event.summary_lineup?.top_artists || [];
  if ((event.summary_lineup?.total_artists || 0) > lineup.length) {
    const fullLineup = await api(`/events/${event.id}/lineup`);
    lineup = fullLineup.lineup || lineup;
  }
  const artists = matchingArtists(lineup.map(({ name }) => name), listened);
  if (!artists.length) continue;

  const item = suggestion({
    id: `dice-${event.id}`,
    title: event.name,
    artists,
    venue: venue?.name || "",
    city: venue?.city?.name || "",
    country,
    date: formatDate(event.dates?.event_start_date),
    source: "DICE",
    sourceUrl: event.perm_name ? `${SOURCE_URL}/event/${event.perm_name}` : event.social_links?.event_share || SOURCE_URL,
  }, existing);
  if (item) suggestions.push(item);
}

await writeResult({
  source: "DICE",
  sourceUrl: SOURCE_URL,
  locations: locationStats,
  listingEventsFound: listedEvents.size,
  detailPagesScanned,
  eligibleEvents,
  suggestions,
});
