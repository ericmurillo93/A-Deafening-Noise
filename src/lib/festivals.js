import { parseDate } from "./concerts.js";

export function festivalEditions(concerts) {
  const editions = new Map();
  for (const concert of concerts) {
    const known = /^(BE PROG!?[ .]*MY FRIEND|HELLFEST|RESURRECTION FEST|MONTREUX JAZZ FESTIVAL)\b/i.exec(concert.venue || "")?.[1];
    const name = String(concert.festival || known || "").trim().toUpperCase();
    const year = String(concert.date).match(/\d{4}/)?.[0];
    if (!name || !year) continue;
    const key = `${name} · ${year}`;
    if (!editions.has(key)) editions.set(key, { key, name, year, concerts: [] });
    editions.get(key).concerts.push(concert);
  }
  return [...editions.values()].map((edition) => ({ ...edition,
    concerts: edition.concerts.sort((a,b) => parseDate(a.date)-parseDate(b.date) || a.artist.localeCompare(b.artist)),
    seen: edition.concerts.filter((concert) => concert.bought && parseDate(String(concert.date).split(" - ").at(-1)) < new Date().setHours(0,0,0,0)).length,
  })).sort((a,b) => b.year.localeCompare(a.year) || a.name.localeCompare(b.name));
}
