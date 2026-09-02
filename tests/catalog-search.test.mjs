import assert from "node:assert/strict";
import test from "node:test";
import { searchExternalConcertCatalog } from "../netlify/functions/lib/concert-catalog-providers.js";

test("normalizes historical setlist.fm results for the canonical catalog", async () => {
  const request = async () => ({ ok: true, json: async () => ({ setlist: [{ id: "abc", eventDate: "02-06-2020", url: "https://setlist.fm/abc", artist: { name: "Test" }, venue: { name: "Sala", city: { name: "Barcelona", country: { code: "ES" } } } }] }) });
  const [concert] = await searchExternalConcertCatalog({ field: "artist", value: "Test", date: "02/06/2020" }, { SETLIST_API_KEY: "test" }, request);
  assert.deepEqual(concert, { artist: "Test", venue: "Sala", city: "Barcelona", country: "ES", date: "02/06/2020", setlistId: "abc", source: "setlist.fm", sourceEventId: "abc", sourceUrl: "https://setlist.fm/abc" });
});

test("normalizes future Ticketmaster results without exposing its API key", async () => {
  const request = async (url) => {
    assert.match(url, /apikey=test/);
    return { ok: true, json: async () => ({ _embedded: { events: [{ id: "tm1", name: "Test", url: "https://tickets.test/1", dates: { start: { localDate: "2099-06-02", dateTime: "2099-06-02T18:00:00Z" }, status: { code: "onsale" } }, _embedded: { attractions: [{ name: "Test" }], venues: [{ name: "Arena", city: { name: "Zürich" }, country: { countryCode: "CH" } }] } }] } }) };
  };
  const [concert] = await searchExternalConcertCatalog({ field: "artist", value: "Test", country: "CH" }, { TICKETMASTER_API_KEY: "test" }, request);
  assert.equal(concert.sourceEventId, "tm1");
  assert.equal(concert.date, "02/06/2099");
  assert.equal(concert.country, "CH");
});

test("uses partial city text for event-backed city suggestions", async () => {
  const request = async (url) => {
    assert.match(url, /city=Mad/);
    assert.match(url, /keyword=Test/);
    return { ok: true, json: async () => ({ _embedded: { events: [{ id: "tm-city", name: "Test", dates: { start: { localDate: "2099-08-10" }, status: { code: "onsale" } }, _embedded: { attractions: [{ name: "Test" }], venues: [{ name: "Arena", city: { name: "Madrid" }, country: { countryCode: "ES" } }] } }] } }) };
  };
  const [concert] = await searchExternalConcertCatalog({ field: "city", value: "Mad", artist: "Test" }, { TICKETMASTER_API_KEY: "test" }, request);
  assert.equal(concert.city, "Madrid");
});

test("narrows setlist.fm discovery by year", async () => {
  const request = async (url) => {
    assert.match(url, /artistName=Shakira/);
    assert.match(url, /year=2018/);
    return { ok: true, json: async () => ({ setlist: [] }) };
  };
  await searchExternalConcertCatalog({ field: "artist", value: "Shakira", artist: "Shakira", year: "2018" }, { SETLIST_API_KEY: "test" }, request);
});

test("loads bounded setlist.fm pages for country-backed city and year facets", async () => {
  const pages = [];
  const request = async (url) => {
    const page = Number(new URL(url).searchParams.get("p"));
    pages.push(page);
    return { ok: true, json: async () => ({ total: 1000, itemsPerPage: 20, setlist: [{ id: String(page), eventDate: `${String(page).padStart(2, "0")}-06-2020`, artist: { name: "Shakira" }, venue: { name: `Venue ${page}`, city: { name: `City ${page}`, country: { code: "ES" } } } }] }) };
  };
  const results = await searchExternalConcertCatalog({ field: "artist", value: "Shakira", artist: "Shakira", country: "ES" }, { SETLIST_API_KEY: "test" }, request);
  assert.deepEqual(pages.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(results.length, 10);
});
