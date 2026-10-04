// Synthetic data only: measures local data processing, not server concurrency.
import { performance } from "node:perf_hooks";
import { matchesArchiveFilters } from "../src/lib/archive-filters.js";
import { normalize, parseConcertDateRange } from "../src/lib/concerts.js";

for (const size of [1000, 10000, 50000]) {
  const concerts = Array.from({ length: size }, (_, index) => ({ artist: `ARTIST ${index % 500}`, venue: `VENUE ${index % 100}`, city: `CITY ${index % 40}`, country: index % 2 ? "ES" : "CH", date: `15/06/${2000 + index % 27}`, bought: true }));
  for (const [name, operation] of [
    ["Stats filters", () => concerts.filter(concert => matchesArchiveFilters(concert, { country: ["ES"], year: ["2020"] }))],
    ["Archive search", () => concerts.filter(concert => normalize(`${concert.artist} ${concert.venue} ${concert.city}`).includes("artist 10"))],
    ["Calendar dates", () => concerts.map(concert => parseConcertDateRange(concert.date))],
    ["Snapshot serialization", () => JSON.stringify(concerts)],
  ]) {
    operation();
    const runs = Array.from({ length: 7 }, () => { const start = performance.now(); operation(); return performance.now() - start; }).sort((a, b) => a - b);
    console.log(`${size} concerts · ${name}: ${runs[3].toFixed(1)} ms median`);
  }
}
