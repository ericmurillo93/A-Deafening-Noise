import assert from "node:assert/strict";
import test from "node:test";
import { uniqueSourceLinks, parseConcertDateRange } from "../src/lib/concerts.js";
import { matchSetlist } from "../netlify/functions/lib/setlist-match.js";

test("invalid and reversed date ranges are rejected", () => {
  assert.equal(parseConcertDateRange("31/02/2026"), null);
  assert.equal(parseConcertDateRange("02/01/2026 - 01/01/2026"), null);
  assert.ok(parseConcertDateRange("01/01/2026 - 02/01/2026"));
});

test("setlist search never chooses an ambiguous or different venue", () => {
  const records = [{ id: "one", venue: { name: "Razzmatazz 2" } }, { id: "two", venue: { name: "Sala Apolo" } }];
  assert.equal(matchSetlist(records, "RAZZMATAZZ 2").id, "one");
  assert.equal(matchSetlist(records, "Razzmatazz 1"), null);
  assert.equal(matchSetlist(records), null);
});

test("shows each secondary ticket link once and excludes the primary action", () => {
  const sources = [
    { source: "ticketmaster", url: "https://tickets.example/show" },
    { source: "suggestion", url: "https://tickets.example/show" },
    { source: "venue", url: "https://venue.example/show" },
  ];
  assert.deepEqual(uniqueSourceLinks(sources, "https://tickets.example/show").map(({ source }) => source), ["venue"]);
});
