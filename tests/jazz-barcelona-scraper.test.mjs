import assert from "node:assert/strict";
import test from "node:test";
import { programmeEvents, concertSessions } from "../scripts/scrape-jazz-barcelona.mjs";

test("Jazz Barcelona keeps separately ticketed sessions, including sold-out shows, and only billed artists", () => {
  const url = "https://jazz.barcelona/concert/example/";
  assert.deepEqual(programmeEvents(`<h3 class="jzag__nom"><a href="${url}">EXAMPLE &amp; BAND</a></h3>`), [{ url, title: "EXAMPLE & BAND" }]);
  const event = {
    "@type": "MusicEvent", name: "EXAMPLE BAND", url,
    startDate: "2027-04-02T21:00:00+02:00", performer: { name: "EXAMPLE BAND" },
    description: "For fans of ANOTHER BAND",
    location: { name: "Paral·lel 62 - Barcelona", address: { addressLocality: "Barcelona", addressCountry: "ES" } },
    offers: { url: "https://tickets.oneboxtds.com/jazzbarcelona/select/100", availability: "https://schema.org/SoldOut" },
  };
  const second = { ...event, startDate: "2027-04-03T21:00:00+02:00", offers: { ...event.offers, url: "https://tickets.oneboxtds.com/jazzbarcelona/select/101" } };
  const html = `<script type="application/ld+json">${JSON.stringify({ "@graph": [event, second, { ...event, eventStatus: "https://schema.org/EventCancelled" }] })}</script>`;
  const sessions = concertSessions(html);
  assert.deepEqual(sessions.map(({ id, date }) => [id, date]), [["jazz-barcelona-100", "02/04/2027"], ["jazz-barcelona-101", "03/04/2027"]]);
  assert.deepEqual(sessions[0].artists, ["EXAMPLE BAND"]);
  assert.equal(sessions[0].venue, "Paral·lel 62");
  assert.equal(sessions[0].eventStatus, "sold_out");
  assert.equal(sessions[0].sourceUrl, event.offers.url);
  for (const invalid of [{ ...event, startDate: "2027-02-30" }, { ...event, startDate: "2027-99-01" }, { ...event, location: {} }]) {
    assert.deepEqual(concertSessions(`<script type="application/ld+json">${JSON.stringify(invalid)}</script>`), []);
  }
});
