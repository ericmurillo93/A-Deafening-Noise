import assert from "node:assert/strict";
import test from "node:test";
import { importRowError, parseConcertImport } from "../src/lib/concert-import.js";

test("imports quoted CSV values and normalizes canonical labels", () => {
  const [concert] = parseConcertImport("archive.csv", 'artist,venue,city,country,date,bought\n"Artist, The",Sala,Barcelona,es,01/02/2026,true');
  assert.deepEqual(concert, {
    artist: "ARTIST, THE", venue: "SALA", city: "Barcelona", country: "ES",
    date: "01/02/2026", bought: true, guestAttendees: [], row: 1,
  });
  assert.equal(importRowError(concert), "");
});

test("rejects an incomplete import row before it reaches the database", () => {
  assert.equal(importRowError({ artist: "TEST", date: "2026-02-01", city: "", country: "" }), "Use DD/MM/YYYY");
});
