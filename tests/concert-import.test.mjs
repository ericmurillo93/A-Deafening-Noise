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

test("versioned exports preserve metadata without importing invitations or foreign IDs", () => {
  const original = { artist: "TEST", venue: "VENUE", city: "Barcelona", country: "ES", date: "01/02/2027", bought: false, guestAttendees: ["Guest"], setlistId: "abc", ticketUrl: "https://example.org", lineup: [{ artist: "TEST" }], festival: "Festival" };
  const [row] = parseConcertImport("archive.json", JSON.stringify({ schemaVersion: 2, concerts: [{ ...original, concertId: 99, attendeeUserIds: ["foreign"] }] }));
  assert.equal(importRowError(row), "");
  for (const [key,value] of Object.entries(original)) assert.deepEqual(row[key], value);
  assert(!("concertId" in row)); assert(!("attendeeUserIds" in row));
  assert(importRowError({ ...row, status: "declined" }));
  assert(importRowError({ ...row, date: "31/02/2027" }));
});

test("calendar exports can roundtrip their structured location", () => {
  const [row] = parseConcertImport("calendar.ics", "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20270201\nSUMMARY:Concierto TEST - no comprado\nLOCATION:VENUE\nX-ADN-CITY:Barcelona\nX-ADN-COUNTRY:ES\nEND:VEVENT\nEND:VCALENDAR");
  assert.equal(importRowError(row), ""); assert.equal(row.bought,false);
});
