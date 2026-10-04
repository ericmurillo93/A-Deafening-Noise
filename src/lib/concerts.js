import { countryName } from "./countries.js";

export function parseConcertDateRange(value) {
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}(?: - \d{1,2}\/\d{1,2}\/\d{4})?$/.test(String(value).trim())) return null;
  const matches = [...String(value).matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)];
  if (!matches.length) return null;
  const toDate = (match) => new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  if (matches.some(match => { const date = toDate(match); return date.getDate() !== Number(match[1]) || date.getMonth() + 1 !== Number(match[2]); })) return null;
  const start = toDate(matches[0]), end = toDate(matches[matches.length - 1]);
  return end >= start ? { start, end } : null;
}

export function isPastConcert(concert) {
  const range = parseConcertDateRange(concert.date);
  if (!range) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return range.end < today;
}

export function uppercaseConcertLabel(value) {
  return String(value || "").toLocaleUpperCase();
}

export function concertLocation({ city, country } = {}) {
  return [city, countryName(country)].filter(Boolean).join(", ");
}

export function normalizeTicketUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function normalize(value) {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function cityKey(city, country = "") {
  const plain = normalize(city).replace(/[’'`]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const canonical = /(^| )hospitalet( de llobregat)?$/.test(plain.replace(/^l /, "")) ? "hospitalet de llobregat" : plain;
  return `${String(country || "").toUpperCase()}|${canonical}`;
}

export function sameCity(left, right) {
  const [leftCountry, leftCity] = cityKey(left?.city ?? left, left?.country).split("|");
  const [rightCountry, rightCity] = cityKey(right?.city ?? right, right?.country).split("|");
  return leftCity === rightCity && (!leftCountry || !rightCountry || leftCountry === rightCountry);
}

export function uniqueSourceLinks(sources = [], excludedUrl = "") {
  const canonical = (value) => {
    try { return new URL(value).href; } catch { return ""; }
  };
  const excluded = canonical(excludedUrl);
  const seen = new Set();
  return sources.filter((source) => {
    const url = canonical(source?.url);
    if (!url || url === excluded || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

export function parseDate(date) {
  const match = String(date).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return 0;
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

export function parseShow(show, mode) {
  let body = show;
  let setlistId = "";
  const pipeIdx = String(show).lastIndexOf(" | ");
  if (pipeIdx !== -1) {
    setlistId = String(show).slice(pipeIdx + 3).trim();
    body = String(show).slice(0, pipeIdx);
  }
  const dateOnly = /^(\d{1,2}\/\d{1,2}\/\d{4})(\s-\s\d{1,2}\/\d{1,2}\/\d{4})?$/.test(body);
  if (mode === "next" || dateOnly) return { venue: "Date confirmed", date: body, setlistId };
  const parts = body.split(" - ");
  const hasDateRange = parts.length >= 3
    && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(parts[parts.length - 2])
    && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(parts[parts.length - 1]);
  const date = hasDateRange ? parts.slice(-2).join(" - ") : parts[parts.length - 1] || "";
  const venue = parts.slice(0, hasDateRange ? -2 : -1).join(" - ") || body;
  return { venue, date, setlistId };
}

export function getMostRecentShowDate(item, mode) {
  return Math.max(...item.shows.map((show) => parseDate(parseShow(show, mode).date)));
}
