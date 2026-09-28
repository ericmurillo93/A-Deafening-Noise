import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const USER_AGENT = "A-Deafening-Noise/1.0 (+personal concert calendar; contact via repository)";
const execFileAsync = promisify(execFile);
const curlHosts = new Set();

async function fetchWithCurl(url) {
  const { stdout } = await execFileAsync("curl", ["--fail", "--silent", "--show-error", "--location", "--max-time", "30", "--user-agent", USER_AGENT, String(url)], { maxBuffer: 10 * 1024 * 1024 });
  if (!stdout.trim()) throw new Error("curl returned an empty response");
  return stdout;
}

export function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function decodeHtml(value) {
  const entities = { aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", lt: "<", gt: ">" };
  return String(value || "").replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16))).replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&(aacute|eacute|iacute|oacute|uacute|ntilde|lt|gt);/gi, (_, name) => entities[name.toLowerCase()]).replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#039;|&apos;/gi, "'").replace(/&nbsp;/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export const textContent = (html) => decodeHtml(String(html).replace(/<br\s*\/?>/gi, " | "));

export async function fetchText(url, attempt = 0) {
  const host = new URL(url).host;
  if (curlHosts.has(host)) return fetchWithCurl(url);
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json" } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const body = await response.text();
  if (body.trim()) return body;
  if (attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    return fetchText(url, attempt + 1);
  }
  try {
    const body = await fetchWithCurl(url);
    curlHosts.add(host);
    return body;
  } catch (error) {
    throw new Error(`${url} returned an empty response (${error.message})`);
  }
  throw new Error(`${url} returned an empty response`);
}

export async function context() {
  const root = process.cwd();
  const listened = JSON.parse(await fs.readFile(path.join(root, "data/listened-artists.json"), "utf8"));
  return {
    root,
    listened: new Map(listened.artists.filter(({ artist, totalMsPlayed }) => artist && totalMsPlayed >= 3_600_000).map(({ artist }) => [normalize(artist), artist])),
    // The catalog is shared. Attendance and dismissals are personal decisions.
    existing: new Set(),
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
