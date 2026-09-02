import process from "node:process";
import { context, matchingArtists, suggestion, USER_AGENT, writeResult } from "./lib/suggestion-scraper-utils.mjs";

const API_URL = "https://app.ticketmaster.com/discovery/v2/events.json";
const MUSIC_SEGMENT_ID = "KZFzniwnSyZfZ7v7nJ";
const COUNTRIES = [...new Set(String(process.env.DISCOVERY_COUNTRIES || "ES,CH").split(",").map((country) => country.trim().toUpperCase()).filter((country) => /^[A-Z]{2}$/.test(country)))];
const PAGE_SIZE = 200;
const MONTHS_AHEAD = 36;
const EXCLUDED_STATUSES = new Set(["cancelled", "canceled", "postponed"]);
const apiKey = process.env.TICKETMASTER_API_KEY;
let lastRequestAt = 0;

if (!apiKey) throw new Error("TICKETMASTER_API_KEY is required");

const iso = (date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");
const formatDate = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

async function fetchPage(country, start, end, page, retry = true) {
  const delay = 250 - (Date.now() - lastRequestAt);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  lastRequestAt = Date.now();
  const query = new URLSearchParams({
    apikey: apiKey,
    countryCode: country,
    segmentId: MUSIC_SEGMENT_ID,
    startDateTime: iso(start),
    endDateTime: iso(end),
    size: String(PAGE_SIZE),
    page: String(page),
    sort: "date,asc",
  });
  const response = await fetch(`${API_URL}?${query}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (response.status === 429 && retry) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, Number(response.headers.get("retry-after")) || 1) * 1000));
    return fetchPage(country, start, end, page, false);
  }
  if (!response.ok) throw new Error(`Ticketmaster ${country} returned HTTP ${response.status}`);
  return response.json();
}

async function eventsForCountry(country) {
  const events = new Map();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  let pagesScanned = 0;

  // ponytail: three years covers normally announced concerts; extend MONTHS_AHEAD if promoters begin announcing further out.
  for (let month = 0; month < MONTHS_AHEAD; month += 1) {
    const windowStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month, month ? 1 : start.getUTCDate()));
    const windowEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month + 1, 1));
    const first = await fetchPage(country, windowStart, windowEnd, 0);
    const totalPages = first.page?.totalPages || 0;
    for (const event of first._embedded?.events || []) events.set(event.id, event);
    pagesScanned += 1;
    if (totalPages * PAGE_SIZE > 1000) throw new Error(`Ticketmaster ${country} has too many events in ${windowStart.toISOString().slice(0, 7)}`);
    for (let page = 1; page < totalPages; page += 1) {
      const result = await fetchPage(country, windowStart, windowEnd, page);
      for (const event of result._embedded?.events || []) events.set(event.id, event);
      pagesScanned += 1;
    }
  }
  return { events: [...events.values()], pagesScanned };
}

const { listened, existing } = await context();
const suggestions = [];
const coverage = [];

for (const country of COUNTRIES) {
  const result = await eventsForCountry(country);
  coverage.push({ country, pagesScanned: result.pagesScanned, eventsFound: result.events.length });
  for (const event of result.events) {
    if (EXCLUDED_STATUSES.has(String(event.dates?.status?.code || "").toLowerCase())) continue;
    const artists = matchingArtists((event._embedded?.attractions || []).map(({ name }) => name), listened);
    const venue = event._embedded?.venues?.[0];
    const item = suggestion({
      id: `ticketmaster-${event.id}`,
      title: event.name,
      artists,
      venue: venue?.name || "",
      city: venue?.city?.name || "",
      country,
      date: formatDate(event.dates?.start?.localDate),
      source: "Ticketmaster",
      sourceUrl: event.url || "",
    }, existing);
    if (item) suggestions.push(item);
  }
}

await writeResult({ source: "Ticketmaster Discovery API", countries: COUNTRIES, coverage, suggestions });
