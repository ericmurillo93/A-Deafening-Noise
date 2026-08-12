import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const USER_AGENT = "A-Deafening-Noise/1.0 (+personal concert calendar; contact via repository)";

export function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function decodeHtml(value) {
  const entities = { aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", lt: "<", gt: ">" };
  return String(value || "").replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16))).replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&(aacute|eacute|iacute|oacute|uacute|ntilde|lt|gt);/gi, (_, name) => entities[name.toLowerCase()]).replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#039;|&apos;/gi, "'").replace(/&nbsp;/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export const textContent = (html) => decodeHtml(String(html).replace(/<br\s*\/?>/gi, " | "));

export async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json" } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

export async function context() {
  const root = process.cwd();
  const concerts = JSON.parse(await fs.readFile(path.join(root, "data/concerts.json"), "utf8"));
  const listened = JSON.parse(await fs.readFile(path.join(root, "data/listened-artists.json"), "utf8"));
  return {
    root,
    listened: new Map(listened.artists.filter(({ artist }) => artist).map(({ artist }) => [normalize(artist), artist])),
    existing: process.argv.includes("--include-existing")
      ? new Set()
      : new Set(concerts.concerts.map(({ artist, date }) => `${normalize(artist)}|${date}`)),
  };
}

export function matchingArtists(value, listened) {
  const keys = new Set((Array.isArray(value) ? value : [value]).map(normalize).filter(Boolean));
  return [...listened].filter(([artistKey]) => keys.has(artistKey)).map(([, artist]) => artist);
}

export async function writeResult(result) {
  const output = process.argv.find((argument) => argument.startsWith("--output="))?.slice(9);
  const json = `${JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`;
  if (output) await fs.writeFile(path.resolve(output), json, "utf8");
  else process.stdout.write(json);
}

export function suggestion({ id, title, artists, venue, city, country, date, source, sourceUrl }, existing) {
  const [day, month, year] = String(date).split("/").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!day || !month || !year || new Date(year, month - 1, day) < today) return null;
  const newArtists = [...new Set(artists)].filter((artist) => !existing.has(`${normalize(artist)}|${date}`));
  return newArtists.length ? { id, title, artists: newArtists.sort((a, b) => a.localeCompare(b)), venue, city, country, date, source, sourceUrl } : null;
}
