import React, { useEffect, useMemo, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import worldGeography from "world-atlas/countries-110m.json";
import whatsappIcon from "@fortawesome/fontawesome-free/svgs/brands/whatsapp.svg";
import concertsData from "../data/concerts.json";
import suggestionsData from "../data/suggestions.json";
import {
  deleteMyConcert,
  loadConcertData,
  removeFriend,
  respondConcertInvitation,
  respondFriendRequest,
  saveDismissedSuggestions,
  saveSetlistId,
  searchConcertCatalog,
  searchProfiles,
  sendFriendRequest,
  supabase,
  supabaseEnabled,
  upsertMyConcert,
} from "./lib/supabase";

// ─── Data bootstrap ───────────────────────────────────────────────────────────

function groupHistoryFromJson(rows) {
  const grouped = rows.reduce((acc, { artist, venue, date, setlistId }) => {
    if (!acc[artist]) acc[artist] = [];
    acc[artist].push(setlistId ? `${venue} - ${date} | ${setlistId}` : `${venue} - ${date}`);
    return acc;
  }, {});
  return Object.entries(grouped).map(([artist, shows]) => ({ artist, shows }));
}

const fallbackConcerts = concertsData.concerts;
const fallbackDismissedSuggestions = concertsData.dismissedSuggestions || [];

const IS_LOCAL = import.meta.env.DEV;
const AUTH_EMAIL_COOLDOWN_KEY = "adn_auth_email_cooldown_until";
const AUTH_EMAIL_COOLDOWN_MS = 60_000;

function useAuthEmailCooldown() {
  const readUntil = () => Number(localStorage.getItem(AUTH_EMAIL_COOLDOWN_KEY)) || 0;
  const [until, setUntil] = useState(readUntil);
  const [now, setNow] = useState(Date.now());
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));

  useEffect(() => {
    if (until <= Date.now()) return undefined;
    const timer = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (nextNow >= until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [until]);

  function refresh() {
    const storedUntil = readUntil();
    setUntil(storedUntil);
    setNow(Date.now());
    return Math.max(0, Math.ceil((storedUntil - Date.now()) / 1000));
  }

  function start() {
    const nextUntil = Date.now() + AUTH_EMAIL_COOLDOWN_MS;
    localStorage.setItem(AUTH_EMAIL_COOLDOWN_KEY, String(nextUntil));
    setUntil(nextUntil);
    setNow(Date.now());
  }

  return { seconds, refresh, start };
}

async function sessionHeaders() {
  if (!supabaseEnabled) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── GitHub save ──────────────────────────────────────────────────────────────

async function saveConcertData(updatedData, commitMessage = "Update concerts via web") {
  if (supabaseEnabled) {
    throw new Error("Bulk concert replacement is disabled when Supabase is enabled.");
  }
  const res = await fetch("/.netlify/functions/save-concerts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify({ data: updatedData, commitMessage }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Save failed (${res.status})`);
  }
}

async function suggestionRefreshRequest(endpoint) {
  const res = await fetch(`/.netlify/functions/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await sessionHeaders()) },
    body: "{}",
  });
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
  return res.json();
}

// ─── Setlist.fm proxy ─────────────────────────────────────────────────────────

async function fetchSetlist({ setlistId, artist, date }) {
  const res = await fetch("/.netlify/functions/get-setlist", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify({ setlistId: setlistId || null, artist, date }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `setlist.fm returned ${res.status}`);
  }
  return res.json();
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function normalize(value) {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function uppercaseConcertLabel(value) {
  return String(value || "").toLocaleUpperCase();
}

function suggestionDecisionKey({ artist, date }) {
  const normalizedArtist = normalize(artist).replace(/[^a-z0-9]+/g, " ").trim();
  return `${normalizedArtist}|${date}`;
}

function formatEuropeanDateTime(value) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

function parseRouteParts(pagePart = "history", valueParts = []) {
  let value = null;
  try {
    value = valueParts.length ? decodeURIComponent(valueParts.join("/")) : null;
  } catch {
    value = valueParts.join("/") || null;
  }
  if (pagePart === "artist" && value) return { page: "artist", artist: value, venue: null };
  if (pagePart === "venue" && value) return { page: "venue", artist: null, venue: value };
  const pageAliases = { calendar: "next", history: "history", timeline: "timeline", stats: "stats", "year-review": "year-review", friends: "friends" };
  return { page: pageAliases[pagePart] || "history", artist: null, venue: null };
}

function readRouteFromLocation() {
  if (typeof window === "undefined") return { page: "history", artist: null, venue: null };
  const pathParts = window.location.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (pathParts.length) return parseRouteParts(pathParts[0], pathParts.slice(1));

  // Convert previously shared hash routes to clean paths on first load.
  const legacyParts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return legacyParts.length ? parseRouteParts(legacyParts[0], legacyParts.slice(1)) : parseRouteParts();
}

function routeToPath({ page, artist, venue }) {
  if (page === "artist" && artist) return `/artist/${encodeURIComponent(artist)}`;
  if (page === "venue" && venue) return `/venue/${encodeURIComponent(venue)}`;
  if (page === "next") return "/calendar";
  return `/${page || "history"}`;
}

function parseDate(date) {
  const match = String(date).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return 0;
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

function parseShow(show, mode) {
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

function getMostRecentShowDate(item, mode) {
  return Math.max(...item.shows.map((show) => parseDate(parseShow(show, mode).date)));
}

function filterConcerts(items, query) {
  const q = normalize(query.trim());
  if (!q) return items;
  return items
    .map((item) => {
      if (!item.shows) {
        const haystack = normalize(`${item.artist} ${item.date} ${item.venue || ""}`);
        return haystack.includes(q) ? item : null;
      }
      if (normalize(item.artist).includes(q)) return item;
      const matchingShows = item.shows.filter((show) => normalize(show).includes(q));
      return matchingShows.length ? { ...item, shows: matchingShows } : null;
    })
    .filter(Boolean);
}

function sortConcerts(items, sortMode, mode) {
  const sorted = [...items];
  if (mode === "next") return sorted.sort((a, b) => parseDate(a.date) - parseDate(b.date) || a.artist.localeCompare(b.artist));
  if (sortMode === "concerts") return sorted.sort((a, b) => b.shows.length - a.shows.length || a.artist.localeCompare(b.artist));
  if (sortMode === "recent") return sorted.sort((a, b) => getMostRecentShowDate(b, mode) - getMostRecentShowDate(a, mode) || a.artist.localeCompare(b.artist));
  return sorted.sort((a, b) => a.artist.localeCompare(b.artist));
}

function parseConcertDateRange(value) {
  const matches = [...String(value).matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)];
  if (!matches.length) return null;
  const toDate = (match) => new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return { start: toDate(matches[0]), end: toDate(matches[matches.length - 1]) };
}

function isPastConcert(concert) {
  const range = parseConcertDateRange(concert.date);
  if (!range) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return range.end < today;
}

function concertMatches(concert, target) {
  if (concert.concertId && target.concertId) return concert.concertId === target.concertId;
  return normalize(concert.artist) === normalize(target.artist)
    && concert.date === target.date
    && normalize(concert.venue || "") === normalize(target.venue || "");
}

function normalizeTicketUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function updateConcert(items, target, data) {
  let updated = false;
  return items.map((concert) => {
    if (updated || !concertMatches(concert, target)) return concert;
    updated = true;
    return {
      ...concert,
      artist: uppercaseConcertLabel(data.artist.trim()),
      venue: uppercaseConcertLabel(data.venue?.trim()),
      date: data.date.trim(),
      bought: target.mode === "history" ? true : Boolean(data.bought),
      ...(data.setlistId?.trim() ? { setlistId: data.setlistId.trim() } : {}),
      attendeeUserIds: data.attendeeUserIds || [],
      guestAttendees: data.guestAttendees || [],
      attendees: data.guestAttendees || [],
      ...(normalizeTicketUrl(data.ticketUrl) ? { ticketUrl: normalizeTicketUrl(data.ticketUrl) } : {}),
    };
  });
}

function removeConcert(items, target) {
  let removed = false;
  return items.filter((concert) => {
    if (removed || !concertMatches(concert, target)) return true;
    removed = true;
    return false;
  });
}

function formatIcsDate(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function escapeIcsText(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function buildConcertCalendar(items, calendarName) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const events = items.flatMap((concert) => {
    const range = parseConcertDateRange(concert.date);
    if (!range) return [];
    const exclusiveEnd = new Date(range.end);
    exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
    const title = concert.bought ? `Concierto ${concert.artist}` : `Concierto ${concert.artist} - no comprado`;
    const uidSeed = `${concert.artist}-${concert.date}-${concert.venue || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return [
      "BEGIN:VEVENT",
      `UID:${uidSeed}@a-deafening-noise`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${formatIcsDate(range.start)}`,
      `DTEND;VALUE=DATE:${formatIcsDate(exclusiveEnd)}`,
      `SUMMARY:${escapeIcsText(title)}`,
      concert.venue ? `LOCATION:${escapeIcsText(concert.venue)}` : null,
      `DESCRIPTION:${escapeIcsText(concert.bought ? "Entrada comprada" : "Entrada no comprada")}`,
      "END:VEVENT",
    ].filter(Boolean);
  });
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "PRODID:-//A Deafening Noise//Concert Calendar//ES",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function downloadConcertCalendar(items, filename, calendarName) {
  const blob = new Blob([buildConcertCalendar(items, calendarName)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function Icon({ type }) {
  const common = { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" };
  if (type === "search") return <svg {...common} className="h-5 w-5 shrink-0 text-zinc-500"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>;
  if (type === "calendar") return <svg {...common} className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>;
  if (type === "music") return <svg {...common} className="h-4 w-4 shrink-0" style={{color:"inherit"}}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
  return <svg {...common} className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>;
}

function ModalCloseButton({ onClick, disabled = false }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:opacity-40" aria-label="Close"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>;
}

function PanelHeading({ icon, title, description }) {
  return <div className="mb-5 flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-500"><i className={`fa-solid ${icon}`} aria-hidden="true" /></div><div><h2 className="text-lg font-black uppercase tracking-tight text-zinc-100">{title}</h2>{description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}</div></div>;
}

function EmptyState({ icon = "fa-music", title, description }) {
  return <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-5 py-8 text-center"><i className={`fa-solid ${icon} mb-3 text-xl text-zinc-700`} aria-hidden="true" /><p className="text-sm font-bold text-zinc-400">{title}</p>{description && <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-600">{description}</p>}</div>;
}

// ─── AutoSuggestField ─────────────────────────────────────────────────────────

function AutoSuggestField({ value, onChange, suggestions, placeholder }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const matches = useMemo(() => {
    const q = normalize(value || "").trim();
    if (!q) return [];
    return suggestions.filter((s) => normalize(s).includes(q) && normalize(s) !== q).slice(0, 6);
  }, [value, suggestions]);
  function pick(item) { onChange(item); setOpen(false); setHighlight(-1); }
  function handleKey(e) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && highlight >= 0) { e.preventDefault(); pick(matches[highlight]); }
    else if (e.key === "Escape") { setOpen(false); setHighlight(-1); }
  }
  return (
    <div className="relative">
      <input type="text" value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(-1); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={handleKey} placeholder={placeholder} autoComplete="off" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" />
      {open && matches.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
          {matches.map((m, i) => (
            <li key={m} onMouseDown={(e) => { e.preventDefault(); pick(m); }} onMouseEnter={() => setHighlight(i)} className={`cursor-pointer px-4 py-2 text-sm ${i === highlight ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-900"}`}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConcertCatalogField({ field, value, onChange, onPick, onSearch, placeholder }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);

  useEffect(() => {
    const query = value.trim();
    if (!open || !onSearch || query.length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const found = await onSearch(field, query);
        if (!cancelled) setResults(found || []);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [field, value, open, onSearch]);

  return (
    <div className="relative">
      <input type="text" value={value} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} placeholder={placeholder} autoComplete="off" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" />
      {open && results.length > 0 && <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-1 shadow-2xl">{results.map((concert) => <li key={concert.concertId}><button type="button" onMouseDown={(event) => { event.preventDefault(); onPick(concert); setOpen(false); }} className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-zinc-900"><span className="block text-sm font-bold text-zinc-100">{concert.artist}</span><span className="mt-0.5 block text-xs text-zinc-500">{concert.venue || "Venue not specified"} · {concert.date}</span></button></li>)}</ul>}
    </div>
  );
}

// ─── SetlistModal ─────────────────────────────────────────────────────────────

function SetlistModal({ target, onClose, onEdit, onIdDiscovered }) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });

  useEffect(() => {
    if (!target) return;
    setState({ status: "loading", data: null, error: null });
    fetchSetlist({ setlistId: target.setlistId, artist: target.artist, date: target.date })
      .then((data) => {
        setState({ status: "ok", data, error: null });
        // If we found the setlist via search and the ID wasn't stored yet, save it back
        if (!target.setlistId && data.id && onIdDiscovered) {
          onIdDiscovered(target, data.id);
        }
      })
      .catch((err) => setState({ status: "error", data: null, error: err.message }));
  }, [target?.setlistId, target?.artist, target?.date]);

  if (!target) return null;
  const { artist, venue, date } = target;
  const { status, data, error } = state;

  let songs = [];
  if (data?.sets?.set) {
    data.sets.set.forEach((set) => { if (set.song) songs = songs.concat(set.song); });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="mb-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">{artist}</h2>
            <p className="mt-1 text-sm text-zinc-400">{venue || "Venue not specified"} · {date}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onEdit && <button type="button" onClick={() => onEdit(target)} className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white" aria-label="Edit concert" title="Edit concert"><i className="fa-solid fa-pencil" aria-hidden="true" /></button>}
            <ModalCloseButton onClick={onClose} />
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {target.attendees?.length > 0 && (
            <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Attended with</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {target.attendees.map((person) => <span key={person} className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-sm font-semibold text-zinc-200">{person}</span>)}
              </div>
            </section>
          )}
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Setlist</h3>
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
              <span className="text-sm text-zinc-500">Loading setlist…</span>
            </div>
          )}
          {status === "error" && (
            <div className="rounded-2xl border border-red-900 bg-red-950/40 px-5 py-4 text-sm text-red-200">
              <p className="font-bold mb-1">Could not load setlist</p>
              <p className="text-red-300/80">{error}</p>
              <p className="mt-2 text-xs text-red-400/60">The setlist may not be available on setlist.fm yet.</p>
            </div>
          )}
          {status === "ok" && songs.length === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm text-zinc-400">
              No songs found for this setlist.
            </div>
          )}
          {status === "ok" && songs.length > 0 && (
            <div>
              <div className="mb-5">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">{songs.length} songs</span>
              </div>
              <ol className="space-y-px">
                {songs.map((song, i) => (
                  <li key={i} className={`flex items-center gap-4 px-3 py-2.5 rounded-xl transition-colors hover:bg-zinc-900 ${i % 2 === 0 ? "" : "bg-zinc-900/40"}`}>
                    <span className="text-xs font-bold tabular-nums w-6 shrink-0 text-right" style={{ color: song.tape ? "#52525b" : "#3f3f46" }}>{i + 1}</span>
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold leading-snug ${song.tape ? "text-zinc-500" : "text-zinc-100"}`}>{song.name}</span>
                      {song.tape && <span className="text-[9px] font-bold uppercase tracking-widest border border-zinc-700 text-zinc-600 px-1.5 py-0.5 rounded-md">tape</span>}
                      {song.cover?.name && <span className="text-[9px] font-bold uppercase tracking-widest border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded-md">cover</span>}
                    </div>
                    {song.info && <span className="text-[11px] text-zinc-500 italic shrink-0 max-w-[120px] truncate">{song.info}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ContextMenu ──────────────────────────────────────────────────────────────

function ContextMenu({ open, x, y, onEdit, onDelete, onClose }) {
  if (!open) return null;
  const viewportWidth = window.visualViewport?.width || window.innerWidth;
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const menuWidth = 176;
  const menuHeight = 82;
  const edgeGap = 12;
  const left = Math.max(edgeGap, Math.min(x, viewportWidth - menuWidth - edgeGap));
  const top = Math.max(edgeGap, Math.min(y, viewportHeight - menuHeight - edgeGap));

  return (
    <>
      <div className="fixed inset-0 z-[55]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="fixed z-[56] w-44 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl" style={{ left, top }}>
        <button onClick={onEdit} className="block w-full px-4 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800">Edit</button>
        <button onClick={onDelete} className="block w-full px-4 py-2 text-left text-sm text-red-300 hover:bg-zinc-800">Delete</button>
      </div>
    </>
  );
}

// ─── EditConcertModal ─────────────────────────────────────────────────────────

function FriendAttendeePicker({ friends, selectedIds, lockedIds = [], onChange }) {
  const selected = new Set(selectedIds);
  const locked = new Set(lockedIds);
  function toggle(id) { if (!locked.has(id)) onChange(selected.has(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]); }
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-300 transition hover:border-zinc-600 [&::-webkit-details-marker]:hidden"><i className="fa-solid fa-user-group text-xs text-zinc-600" aria-hidden="true" /><span className="flex-1">{selectedIds.length ? `${selectedIds.length} friend${selectedIds.length === 1 ? "" : "s"} selected` : "Select friends"}</span><i className="fa-solid fa-chevron-down text-[10px] text-zinc-600 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-2">
        {friends.length ? friends.map((friend) => <label key={friend.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-300 ${locked.has(friend.id) ? "cursor-default" : "cursor-pointer hover:bg-zinc-900"}`}><input type="checkbox" checked={selected.has(friend.id)} disabled={locked.has(friend.id)} onChange={() => toggle(friend.id)} className="accent-zinc-100" /><span>{friend.displayName}</span>{locked.has(friend.id) && <span className="text-xs text-emerald-500">Confirmed</span>}<span className="ml-auto text-xs text-zinc-600">@{friend.username}</span></label>) : <p className="px-3 py-2 text-sm text-zinc-600">Add friends from the Friends page first.</p>}
      </div>
    </details>
  );
}

function EditConcertModal({ isOpen, mode, initial, onClose, onSave, isSaving, saveError, artistSuggestions = [], venueSuggestions = [], friends = [] }) {
  const [artist, setArtist] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [bought, setBought] = useState(false);
  const [setlistId, setSetlistId] = useState("");
  const [attendeeUserIds, setAttendeeUserIds] = useState([]);
  const [guestAttendees, setGuestAttendees] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");

  useEffect(() => {
    if (isOpen && initial) {
      setArtist(uppercaseConcertLabel(initial.artist));
      setVenue(uppercaseConcertLabel(initial.venue));
      setDate(initial.date || "");
      setBought(!!initial.bought);
      setSetlistId(initial.setlistId || "");
      setAttendeeUserIds((initial.attendeeUsers || []).filter((person) => person.status === "confirmed" || person.status === "pending").map((person) => person.id));
      setGuestAttendees((initial.guestAttendees || []).join(", "));
      setTicketUrl(initial.ticketUrl || "");
    }
  }, [isOpen, initial]);

  if (!isOpen || !initial) return null;
  const isNextMode = mode === "next";
  const canEditEvent = initial.canEditEvent !== false;

  function submit() {
    if (!artist.trim() || !date.trim()) return;
    if (!isNextMode && !venue.trim()) return;
    onSave({
      artist: uppercaseConcertLabel(artist.trim()),
      venue: uppercaseConcertLabel(venue.trim()),
      date: date.trim(),
      bought,
      setlistId: setlistId.trim(),
      attendeeUserIds,
      guestAttendees: [...new Set(guestAttendees.split(",").map((name) => name.trim()).filter(Boolean))],
      ticketUrl: normalizeTicketUrl(ticketUrl),
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 shadow-2xl md:max-h-[90dvh]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-900 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-2xl font-black uppercase tracking-tight">Edit concert</h2>
            <p className="mt-1 truncate text-sm text-zinc-500">{artist || "Concert"}{venue ? ` · ${venue}` : ""}{date ? ` · ${date}` : ""}</p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 overscroll-contain">
          {!canEditEvent && <p className="rounded-2xl border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">This is a shared concert. You can update your ticket and attendees; the creator manages artist, venue and date.</p>}
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Artist</span>
            {canEditEvent ? <AutoSuggestField value={artist} onChange={(value) => setArtist(uppercaseConcertLabel(value))} suggestions={artistSuggestions} placeholder="Artist name" /> : <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-500">{artist}</div>}
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Venue {isNextMode && <span className="ml-1 normal-case tracking-normal text-zinc-600">(optional)</span>}</span>
            {canEditEvent ? <AutoSuggestField value={venue} onChange={(value) => setVenue(uppercaseConcertLabel(value))} suggestions={venueSuggestions} placeholder="Venue or festival" /> : <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-500">{venue || "—"}</div>}
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Date</span>
            <input type="text" value={date} onChange={(e) => setDate(e.target.value)} disabled={!canEditEvent} placeholder="DD/MM/YYYY" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400 disabled:border-zinc-800 disabled:text-zinc-500" />
          </label>
          {isNextMode && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Ticket / event link <span className="normal-case tracking-normal text-zinc-600">(optional)</span></span>
              <input type="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} disabled={!canEditEvent} placeholder="https://…" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400 disabled:border-zinc-800 disabled:text-zinc-500" />
            </label>
          )}
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Attended with <span className="normal-case tracking-normal text-zinc-600">(optional)</span></span>
            <FriendAttendeePicker friends={friends} selectedIds={attendeeUserIds} lockedIds={(initial.attendeeUsers || []).filter((person) => person.status === "confirmed").map((person) => person.id)} onChange={setAttendeeUserIds} />
            <input type="text" value={guestAttendees} onChange={(e) => setGuestAttendees(e.target.value)} placeholder="Other attendees (comma separated)" className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" />
            <span className="mt-1 block text-xs text-zinc-600">Separate multiple names with commas.</span>
          </label>
          {isNextMode && (
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              <input type="checkbox" checked={bought} onChange={(e) => setBought(e.target.checked)} />
              <i className="fa-solid fa-ticket text-zinc-500" aria-hidden="true" /><span>Ticket bought</span>
            </label>
          )}
        </div>
        <div className="shrink-0 border-t border-zinc-900 bg-zinc-950 px-6 py-4">
          <button onClick={submit} disabled={isSaving} className="w-full rounded-2xl bg-zinc-100 px-5 py-3 font-black text-zinc-950 transition hover:bg-white disabled:opacity-50">{isSaving ? "Saving..." : "Save changes"}</button>
          {saveError && <div className="mt-3 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{saveError}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── AddConcertModal ──────────────────────────────────────────────────────────

function AddConcertModal({ isOpen, initial, stagingSuggestion = false, onClose, onSave, isSaving, saveError, friends = [], onSearchCatalog }) {
  const [artist, setArtist] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [bought, setBought] = useState(false);
  const [attendeeUserIds, setAttendeeUserIds] = useState([]);
  const [guestAttendees, setGuestAttendees] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setArtist(uppercaseConcertLabel(initial?.artist));
    setVenue(uppercaseConcertLabel(initial?.venue));
    setDate(initial?.date || "");
    setBought(Boolean(initial?.bought));
    setAttendeeUserIds((initial?.attendeeUsers || []).map((person) => person.id));
    setGuestAttendees((initial?.guestAttendees || []).join(", "));
    setTicketUrl(initial?.ticketUrl || "");
  }, [isOpen, initial]);

  if (!isOpen) return null;
  const isPastDate = isPastConcert({ date });

  function submit() {
    if (!artist.trim() || !date.trim()) return;
    if (isPastDate && !venue.trim()) return;
    onSave({ concertId: initial?.concertId || null, artist, venue, date, bought: isPastDate ? true : bought, ticketUrl: isPastDate ? "" : normalizeTicketUrl(ticketUrl), attendeeUserIds, guestAttendees: [...new Set(guestAttendees.split(",").map((name) => name.trim()).filter(Boolean))] });
  }

  function stageSuggestion(ticketBought) {
    onSave({
      artist: uppercaseConcertLabel(initial?.artist),
      venue: uppercaseConcertLabel(initial?.venue),
      date: initial?.date || "",
      bought: ticketBought,
      ticketUrl: normalizeTicketUrl(initial?.ticketUrl),
      attendeeUserIds,
      guestAttendees: [...new Set(guestAttendees.split(",").map((name) => name.trim()).filter(Boolean))],
    });
  }

  function pickCatalogConcert(concert) {
    setArtist(uppercaseConcertLabel(concert.artist));
    setVenue(uppercaseConcertLabel(concert.venue));
    setDate(concert.date || "");
    if (!ticketUrl && concert.ticketUrl) setTicketUrl(concert.ticketUrl);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 shadow-2xl md:max-h-[90dvh]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-900 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-2xl font-black uppercase tracking-tight">Add concert</h2>
            <p className="mt-1 truncate text-sm text-zinc-500">{stagingSuggestion ? `${uppercaseConcertLabel(initial?.artist) || "Concert"}${initial?.date ? ` · ${initial.date}` : ""}` : "Add a past or upcoming concert."}</p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 overscroll-contain">
        {stagingSuggestion ? (
          <div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="font-black uppercase tracking-tight text-zinc-100">{uppercaseConcertLabel(initial?.artist)}</div>
              <div className="mt-1 text-sm text-zinc-400">{initial?.date}{initial?.venue ? ` · ${uppercaseConcertLabel(initial.venue)}` : ""}</div>
            </div>
            <p className="mb-3 mt-5 text-center text-xs font-bold uppercase tracking-widest text-zinc-500">Ticket status</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => stageSuggestion(true)} className="rounded-2xl border border-emerald-700 bg-emerald-950 px-4 py-3 font-black text-emerald-100 transition hover:border-emerald-500 hover:bg-emerald-900">Bought</button>
              <button type="button" onClick={() => stageSuggestion(false)} className="rounded-2xl border border-amber-700 bg-amber-950 px-4 py-3 font-black text-amber-100 transition hover:border-amber-500 hover:bg-amber-900">Not bought</button>
            </div>
          </div>
        ) : <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Artist</span>
            <ConcertCatalogField field="artist" value={artist} onChange={(value) => setArtist(uppercaseConcertLabel(value))} onPick={pickCatalogConcert} onSearch={onSearchCatalog} placeholder="Artist name" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Venue {!isPastDate && <span className="ml-1 normal-case tracking-normal text-zinc-600">(optional)</span>}</span>
            <ConcertCatalogField field="venue" value={venue} onChange={(value) => setVenue(uppercaseConcertLabel(value))} onPick={pickCatalogConcert} onSearch={onSearchCatalog} placeholder="Venue or festival" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Date</span>
            <ConcertCatalogField field="date" value={date} onChange={setDate} onPick={pickCatalogConcert} onSearch={onSearchCatalog} placeholder="DD/MM/YYYY" />
          </label>
          {!isPastDate && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Ticket / event link <span className="normal-case tracking-normal text-zinc-600">(optional)</span></span>
              <input type="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} placeholder="https://…" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" />
            </label>
          )}
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Attended with <span className="normal-case tracking-normal text-zinc-600">(optional)</span></span>
            <FriendAttendeePicker friends={friends} selectedIds={attendeeUserIds} onChange={setAttendeeUserIds} />
            <input type="text" value={guestAttendees} onChange={(e) => setGuestAttendees(e.target.value)} placeholder="Other attendees (comma separated)" className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" />
            <span className="mt-1 block text-xs text-zinc-600">Separate multiple names with commas.</span>
          </label>
          {!isPastDate && (
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              <input type="checkbox" checked={bought} onChange={(e) => setBought(e.target.checked)} />
              <i className="fa-solid fa-ticket text-zinc-500" aria-hidden="true" /><span>Ticket bought</span>
            </label>
          )}
        </div>}
        </div>
        {(!stagingSuggestion || saveError) && <div className="shrink-0 border-t border-zinc-900 bg-zinc-950 px-6 py-4">
          {!stagingSuggestion && <button onClick={submit} disabled={isSaving} className="w-full rounded-2xl bg-zinc-100 px-5 py-3 font-black text-zinc-950 transition hover:bg-white disabled:opacity-50">{isSaving ? "Saving..." : "Add concert"}</button>}
          {saveError && <div className="mt-3 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{saveError}</div>}
        </div>}
      </div>
    </div>
  );
}

// ─── Upcoming concert calendar ────────────────────────────────────────────────

function CalendarExportMenu({ items, compact = false }) {
  const detailsRef = useRef(null);

  useEffect(() => {
    function dismiss(event) {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target)) detailsRef.current.removeAttribute("open");
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  function runExport(event, concerts, filename, calendarName) {
    downloadConcertCalendar(concerts, filename, calendarName);
    event.currentTarget.closest("details")?.removeAttribute("open");
  }

  return (
    <details ref={detailsRef} className="group relative">
      <summary className={`cursor-pointer list-none rounded-full border border-zinc-700 bg-zinc-900 text-center text-sm font-black text-zinc-100 shadow-2xl transition hover:border-zinc-500 [&::-webkit-details-marker]:hidden ${compact ? "px-3 py-2.5" : "px-5 py-3"}`}>
        Export <span className="ml-1 text-zinc-500 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 p-2 shadow-2xl">
        <button onClick={(event) => runExport(event, items, "concerts.ics", "Próximos conciertos")} disabled={items.length === 0} className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-300 transition hover:bg-zinc-900 hover:text-white disabled:opacity-40">All concerts</button>
        <button onClick={(event) => runExport(event, items.filter((item) => item.bought), "concerts-bought.ics", "Conciertos comprados")} disabled={!items.some((item) => item.bought)} className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-300 transition hover:bg-zinc-900 hover:text-white disabled:opacity-40">Bought concerts</button>
        <button onClick={(event) => runExport(event, items.filter((item) => !item.bought), "concerts-not-bought.ics", "Conciertos no comprados")} disabled={!items.some((item) => !item.bought)} className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-300 transition hover:bg-zinc-900 hover:text-white disabled:opacity-40">Not bought concerts</button>
      </div>
    </details>
  );
}

function DropdownMenu({ value, onChange, options, compact = false, ariaLabel, className = "", groupName, centered = false, menuAlign = "right", buttonLabel }) {
  const detailsRef = useRef(null);
  const normalizedOptions = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const activeLabel = buttonLabel || normalizedOptions.find((option) => option.value === value)?.label || normalizedOptions[0]?.label || "";

  useEffect(() => {
    function dismiss(event) {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target)) detailsRef.current.removeAttribute("open");
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  function selectOption(event, nextValue) {
    onChange(nextValue);
    event.currentTarget.closest("details")?.removeAttribute("open");
  }

  return (
    <details ref={detailsRef} name={groupName} className={`group relative min-w-0 ${className}`}>
      <summary aria-label={ariaLabel} className={`cursor-pointer list-none truncate rounded-full border border-zinc-700 bg-zinc-900 text-sm font-semibold text-zinc-100 shadow-2xl transition hover:border-zinc-500 [&::-webkit-details-marker]:hidden ${centered ? "text-center" : "text-left"} ${compact ? "px-4 py-2.5" : "px-5 py-3"}`}>
        {activeLabel} <span className="ml-1 text-zinc-500">▾</span>
      </summary>
      <div className={`absolute top-full z-30 mt-2 max-h-72 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-2 shadow-2xl ${menuAlign === "left" ? "left-0" : "right-0"}`}>
        {normalizedOptions.map((option) => (
          <button
            key={option.value}
            onClick={(event) => selectOption(event, option.value)}
            className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-zinc-900 hover:text-white ${value === option.value ? "bg-zinc-900 text-zinc-100" : "text-zinc-400"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function ConcertSortMenu({ value, onChange, compact = false }) {
  return (
    <DropdownMenu
      value={value}
      onChange={onChange}
      compact={compact}
      ariaLabel="Sort concerts"
      options={[
        { value: "artist", label: "Sort by artist" },
        { value: "concerts", label: "Sort by number of concerts" },
        { value: "recent", label: "Sort by most recent" },
      ]}
    />
  );
}

function NextConcertCalendar({ items, onOpen, onContextMenu, onContextMenuAt }) {
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const monthPickerRef = useRef(null);
  const swipeStartRef = useRef(null);
  const datedItems = useMemo(
    () => items
      .map((concert) => {
        const range = parseConcertDateRange(concert.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return { ...concert, range, isPast: Boolean(range && range.end < today) };
      })
      .filter(({ range }) => range)
      .sort((a, b) => a.range.start - b.range.start),
    [items]
  );
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const savedMonth = localStorage.getItem("adn_calendar_month");
    const match = savedMonth?.match(/^(\d{4})-(\d{1,2})$/);
    if (match) {
      const saved = new Date(Number(match[1]), Number(match[2]) - 1, 1);
      if (!Number.isNaN(saved.getTime())) return saved;
    }
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingDays = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(visibleMonth);
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  useEffect(() => {
    localStorage.setItem("adn_calendar_month", `${visibleMonth.getFullYear()}-${visibleMonth.getMonth() + 1}`);
  }, [visibleMonth]);

  useEffect(() => {
    if (!monthPickerOpen) return undefined;
    function dismiss(event) {
      if (!monthPickerRef.current?.contains(event.target)) setMonthPickerOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [monthPickerOpen]);

  function moveMonth(offset) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    setSelectedDay(null);
  }

  function eventInteractionProps(concert) {
    return {
      onClick(event) {
        if (!event.currentTarget._adnLongPressed && !event.currentTarget._adnTouchMoved) onOpen(concert);
      },
      onContextMenu(event) {
        onContextMenu(event, concert);
      },
      onTouchStart(event) {
        const touch = event.touches[0];
        const button = event.currentTarget;
        button._adnTouchMoved = false;
        button._adnTouchTimer = setTimeout(() => {
          if (!button._adnTouchMoved) {
            button._adnLongPressed = true;
            if (navigator.vibrate) navigator.vibrate(20);
            onContextMenuAt(touch.clientX, touch.clientY, concert);
          }
        }, 500);
      },
      onTouchMove(event) {
        event.currentTarget._adnTouchMoved = true;
        clearTimeout(event.currentTarget._adnTouchTimer);
      },
      onTouchEnd(event) {
        const button = event.currentTarget;
        clearTimeout(button._adnTouchTimer);
        setTimeout(() => { button._adnLongPressed = false; }, 400);
      },
      onTouchCancel(event) {
        clearTimeout(event.currentTarget._adnTouchTimer);
        event.currentTarget._adnLongPressed = false;
      },
    };
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-3 md:p-6">
      <div ref={monthPickerRef} className="relative mb-5 flex flex-wrap items-center justify-start gap-2">
        <button onClick={() => { const today = new Date(); setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setMonthPickerOpen(false); }} className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm font-black text-zinc-100 transition hover:border-zinc-500">Today</button>
        <button onClick={() => moveMonth(-1)} className="rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white" aria-label="Previous month"><i className="fa-solid fa-chevron-up" aria-hidden="true" /></button>
        <button onClick={() => moveMonth(1)} className="rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white" aria-label="Next month"><i className="fa-solid fa-chevron-down" aria-hidden="true" /></button>
        <button onClick={() => setMonthPickerOpen((open) => !open)} className="rounded-xl px-4 py-2 text-xl font-black text-zinc-100 transition hover:bg-zinc-800 md:text-2xl" aria-expanded={monthPickerOpen}>
          {monthLabel} <i className="fa-solid fa-chevron-down ml-2 text-xs text-zinc-500" aria-hidden="true" />
        </button>
        {monthPickerOpen && (
          <div className="absolute right-0 top-full z-30 mt-2 w-full max-w-sm rounded-3xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl sm:right-auto">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xl font-black text-zinc-100">{year}</span>
              <div className="flex gap-1">
                <button onClick={() => setVisibleMonth(new Date(year - 1, month, 1))} className="rounded-xl px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Previous year"><i className="fa-solid fa-chevron-up" aria-hidden="true" /></button>
                <button onClick={() => setVisibleMonth(new Date(year + 1, month, 1))} className="rounded-xl px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Next year"><i className="fa-solid fa-chevron-down" aria-hidden="true" /></button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((label, monthIndex) => (
                <button key={label} onClick={() => { setVisibleMonth(new Date(year, monthIndex, 1)); setMonthPickerOpen(false); }} className={`rounded-xl px-2 py-3 text-sm font-semibold transition ${monthIndex === month ? "bg-zinc-100 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="grid grid-cols-7 gap-1 md:gap-2"
        style={{ touchAction: "pan-y" }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = swipeStartRef.current;
          swipeStartRef.current = null;
          if (!start || !event.changedTouches[0]) return;
          const touch = event.changedTouches[0];
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
          moveMonth(deltaX > 0 ? -1 : 1);
          setMonthPickerOpen(false);
        }}
        onTouchCancel={() => { swipeStartRef.current = null; }}
      >
        {weekdays.map((day) => <div key={day} className="pb-2 text-center text-[10px] font-bold uppercase text-zinc-600 md:text-xs">{day}</div>)}
        {Array.from({ length: leadingDays }).map((_, index) => <div key={`empty-${index}`} className="min-h-20 rounded-xl bg-zinc-950/30 md:min-h-32" />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const calendarDay = new Date(year, month, day);
          const concerts = datedItems.filter(({ range }) => calendarDay >= range.start && calendarDay <= range.end);
          return (
            <div key={day} onClick={() => concerts.length && setSelectedDay({ date: calendarDay, concerts })} className={`h-20 overflow-hidden rounded-xl border p-1.5 md:h-auto md:min-h-32 md:overflow-visible md:rounded-2xl md:p-2 ${concerts.length ? "cursor-pointer border-zinc-700 bg-zinc-950" : "border-zinc-800/60 bg-zinc-950/40"}`}>
              <div className="mb-1 text-right text-[10px] font-bold text-zinc-600 md:text-xs">{day}</div>
              {concerts.length > 0 && (
                <div className="md:hidden">
                  <div className={`truncate rounded-md border px-1 py-1 text-center text-[8px] font-bold text-zinc-100 ${concerts.some((concert) => concert.isPast) ? "border-blue-700 bg-blue-950" : concerts.some((concert) => concert.bought) ? "border-emerald-700 bg-emerald-900" : "border-amber-700 bg-amber-950"}`}>
                    {concerts.length === 1 ? concerts[0].artist : `${concerts.length} shows`}
                  </div>
                </div>
              )}
              <div className="hidden space-y-1 md:block">
                {concerts.map((concert) => (
                  <button
                    key={`${concert.source}-${concert.artist}-${concert.date}-${concert.show || ""}`}
                    {...eventInteractionProps(concert)}
                    onClick={(event) => { event.stopPropagation(); eventInteractionProps(concert).onClick(event); }}
                    className={`block w-full overflow-hidden rounded-md border px-1.5 py-1 text-left text-[8px] font-bold leading-tight text-zinc-100 transition hover:brightness-110 md:rounded-lg md:px-2 md:py-1.5 md:text-[11px] ${concert.isPast ? "border-blue-700 bg-blue-950" : concert.bought ? "border-emerald-700 bg-emerald-900" : "border-amber-700 bg-amber-950"}`}
                    title={`${concert.artist} — ${concert.date}${concert.venue ? ` — ${concert.venue}` : ""}`}
                  >
                    <span className="block truncate">{concert.artist}</span>
                    {concert.date.includes(" - ") && <span className="mt-0.5 hidden font-medium opacity-60 md:block">{concert.date}</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <section className="mt-4 rounded-2xl border border-zinc-700 bg-zinc-950 p-4 md:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase tracking-tight text-zinc-100">
              {new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short" }).format(selectedDay.date)}
            </h3>
            <span className="text-xs font-semibold text-zinc-500">{selectedDay.concerts.length} {selectedDay.concerts.length === 1 ? "concert" : "concerts"}</span>
          </div>
          <div className="space-y-2">
            {selectedDay.concerts.map((concert) => (
              <button
                key={`agenda-${concert.source}-${concert.artist}-${concert.date}-${concert.show || concert.venue || ""}`}
                {...eventInteractionProps(concert)}
                className={`block w-full rounded-xl border px-3 py-2.5 text-left text-sm font-bold text-zinc-100 transition hover:brightness-110 ${concert.isPast ? "border-blue-700 bg-blue-950" : concert.bought ? "border-emerald-700 bg-emerald-900" : "border-amber-700 bg-amber-950"}`}
              >
                <span className="block">{concert.artist}</span>
                {concert.venue && <span className="mt-0.5 block truncate text-xs font-medium opacity-60">{concert.venue}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-blue-700 bg-blue-950" /> History</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-emerald-700 bg-emerald-900" /> Bought</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-amber-700 bg-amber-950" /> Not bought</span>
      </div>

    </section>
  );
}

function ConcertSuggestions({ suggestions, reviews, onInterested, onNotInterested, onSave, isSaving, saveError }) {
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState({ status: "idle", conclusion: null });
  const [refreshError, setRefreshError] = useState("");
  const refreshRequestedAtRef = useRef(0);
  const pendingCount = Object.keys(reviews).length;

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    let timer;
    const check = async () => {
      try {
        const result = await suggestionRefreshRequest("suggestion-refresh-status");
        if (cancelled) return;
        const waitingForDispatchedRun = refreshRequestedAtRef.current
          && (!result.createdAt || new Date(result.createdAt).getTime() < refreshRequestedAtRef.current - 5000);
        if (waitingForDispatchedRun) {
          setRefresh({ status: "queued", conclusion: null });
          timer = window.setTimeout(check, 5000);
          return;
        }
        setRefresh(result);
        if (["queued", "in_progress", "waiting", "pending"].includes(result.status)) {
          timer = window.setTimeout(check, 8000);
        } else if (refreshRequestedAtRef.current) {
          refreshRequestedAtRef.current = 0;
        }
      } catch (error) {
        if (!cancelled) setRefreshError(error.message);
      }
    };
    check();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, refresh.status === "queued"]);

  const startRefresh = async () => {
    setRefreshError("");
    refreshRequestedAtRef.current = Date.now();
    setRefresh({ status: "queued", conclusion: null });
    try {
      const result = await suggestionRefreshRequest("refresh-suggestions");
      if (result.alreadyRunning) refreshRequestedAtRef.current = 0;
      setRefresh({ status: result.status || "queued", conclusion: null, createdAt: result.createdAt });
    } catch (error) {
      refreshRequestedAtRef.current = 0;
      setRefresh({ status: "completed", conclusion: "failure" });
      setRefreshError(error.message);
    }
  };

  const refreshRunning = ["queued", "in_progress", "waiting", "pending"].includes(refresh.status);
  const refreshIsNewerThanPage = refresh.createdAt
    && new Date(refresh.createdAt).getTime() > new Date(suggestionsData.generatedAt).getTime();
  const refreshMessage = refreshRunning
    ? "Searching for concerts…"
    : refreshIsNewerThanPage && refresh.status === "completed" && refresh.conclusion === "success"
      ? refresh.generatedAt === suggestionsData.generatedAt
        ? "Search finished. No new suggestions found."
        : "Search finished. Reload shortly to see the deployed results."
      : refreshIsNewerThanPage && refresh.status === "completed" && refresh.conclusion
        ? "The search did not finish successfully."
        : "";

  return (
    <section className="mt-5 rounded-3xl border border-zinc-800 bg-zinc-900 p-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left font-bold text-zinc-100 transition hover:bg-zinc-800"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3">
          <i className="fa-solid fa-wand-magic-sparkles text-zinc-400" aria-hidden="true" />
          <span>Concert suggestions</span>
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">{suggestions.length}</span>
        </span>
        <i className={`fa-solid fa-chevron-down text-xs text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="mx-3 mb-3 mt-1 border-l border-zinc-700 pl-3">
          <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs text-zinc-500">
              <p>Last updated {formatEuropeanDateTime(suggestionsData.generatedAt)}</p>
              {refreshMessage && <p className="mt-1 font-semibold text-zinc-300">{refreshMessage}</p>}
              {refreshError && <p className="mt-1 font-semibold text-red-300">{refreshError}</p>}
            </div>
            <button type="button" onClick={startRefresh} disabled={refreshRunning} className="shrink-0 rounded-full border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-100 transition hover:border-zinc-500 disabled:cursor-wait disabled:opacity-50">
              <i className={`fa-solid fa-rotate mr-2 ${refreshRunning ? "animate-spin" : ""}`} aria-hidden="true" />
              {refreshRunning ? "Searching" : "Find concerts"}
            </button>
          </div>
          {suggestions.length ? (
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <article key={suggestion.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate font-black uppercase tracking-tight text-zinc-100">{uppercaseConcertLabel(suggestion.artist)}</h3>
                      <p className="mt-1 text-sm text-zinc-400">
                        {suggestion.date}{suggestion.venue ? ` · ${uppercaseConcertLabel(suggestion.venue)}` : ""}{suggestion.city ? ` · ${suggestion.city}` : ""}
                      </p>
                      <a href={suggestion.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-zinc-600 transition hover:text-zinc-300">
                        {suggestion.source} <span aria-hidden="true">↗</span>
                      </a>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => onInterested(suggestion)} className={`flex-1 rounded-full border px-4 py-2.5 text-sm font-black transition sm:flex-none ${reviews[suggestion.id]?.decision === "interested" ? "border-emerald-500 bg-emerald-950 text-emerald-200" : "border-zinc-600 bg-zinc-900 text-zinc-100 hover:border-emerald-600"}`}>
                        Interested
                      </button>
                      <button type="button" onClick={() => onNotInterested(suggestion)} className={`flex-1 rounded-full border px-4 py-2.5 text-sm font-black transition sm:flex-none ${reviews[suggestion.id]?.decision === "not-interested" ? "border-red-700 bg-red-950/60 text-red-200" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-red-800 hover:text-red-200"}`}>
                        Not interested
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-zinc-950 px-4 py-5 text-sm text-zinc-500">No new suggestions right now.</p>
          )}
          {pendingCount > 0 && (
            <div className="sticky bottom-3 mt-3 rounded-2xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur">
              <button type="button" onClick={onSave} disabled={isSaving} className="w-full rounded-xl bg-zinc-100 px-5 py-3 text-sm font-black text-zinc-950 transition hover:bg-white disabled:opacity-50">
                {isSaving ? "Saving decisions..." : `Save ${pendingCount} ${pendingCount === 1 ? "decision" : "decisions"}`}
              </button>
              {saveError && <p className="mt-2 text-center text-xs font-semibold text-red-300">{saveError}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CalendarConcertModal({ target, onClose, onEdit }) {
  if (!target) return null;
  const isPast = isPastConcert(target);
  const ticketUrl = normalizeTicketUrl(target.ticketUrl);
  const whatsappMessage = [
    `Concierto: ${target.artist}`,
    `Fecha: ${target.date}`,
    target.venue ? `Lugar: ${target.venue}` : "",
    ticketUrl ? `Entradas: ${ticketUrl}` : "",
    "",
    "¿Te interesa?",
  ].filter((line, index) => line || index === 4).join("\n");
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4" onClick={onClose}>
      <article className="w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4">
          <h2 className="min-w-0 break-words text-2xl font-black uppercase leading-none tracking-tight text-zinc-100">{target.artist}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {onEdit && <button type="button" onClick={() => onEdit(target)} className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white" aria-label="Edit concert" title="Edit concert"><i className="fa-solid fa-pencil" aria-hidden="true" /></button>}
            <ModalCloseButton onClick={onClose} />
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl bg-zinc-950">
          <div className="p-4">
            <div className="flex items-start justify-between gap-4">
              {target.venue ? <div className="flex min-w-0 gap-2 text-sm font-semibold text-zinc-100"><Icon type="map" /><span className="break-words">{target.venue}</span></div> : <span />}
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold text-zinc-100 ${isPast ? "border-blue-800 bg-blue-950" : target.bought ? "border-emerald-800 bg-emerald-950" : "border-amber-800 bg-amber-950"}`}>
                {isPast ? "History" : target.bought ? "Bought" : "Not bought"}
              </span>
            </div>
            <div className={`${target.venue ? "mt-2 " : ""}flex gap-2 text-sm text-zinc-400`}><Icon type="calendar" /><span>{target.date}</span></div>
          </div>
          {!isPast && (
            <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3">
              {ticketUrl ? (
                <a href={ticketUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-2 text-xs font-bold text-zinc-400 transition hover:text-white"><i className="fa-solid fa-ticket" aria-hidden="true" /><span className="truncate">Tickets</span><span aria-hidden="true">↗</span></a>
              ) : <span />}
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#25D366]/40 bg-[#128C7E]/20 px-3 py-1.5 text-xs font-bold text-[#7ce6a3] transition hover:border-[#25D366] hover:bg-[#128C7E]/35 hover:text-white" aria-label={`Share ${target.artist} concert on WhatsApp`}>
                <img src={whatsappIcon} alt="" className="h-4 w-4 brightness-0 invert opacity-80" />
                Share
              </a>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

// ─── StatsPage ────────────────────────────────────────────────────────────────

const COUNTRY_IDS = {
  Spain: "724",
  Portugal: "620",
  France: "250",
  "United Kingdom": "826",
  Switzerland: "756",
};

function countryForVenue(venue) {
  const value = normalize(venue);
  if (/(zurich|zürich|fribourg|geneve|lausanne|docks|montreux|metropole|métropole|yverdon|basel|pratteln|bern)/.test(value)) return "Switzerland";
  if (value.includes("hellfest")) return "France";
  if (value.includes("o2 arena")) return "United Kingdom";
  if (value.includes("braga")) return "Portugal";
  return "Spain";
}

function GeographicStats({ shows, title = "Concert geography" }) {
  const [mapZoom, setMapZoom] = useState(3.2);
  const [mapCenter, setMapCenter] = useState([10, 50]);
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const countries = useMemo(() => {
    const counts = {};
    shows.forEach(({ venue }) => {
      if (!venue || venue === "Date confirmed") return;
      const country = countryForVenue(venue);
      counts[country] = (counts[country] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [shows]);
  const maxCount = countries[0]?.[1] || 1;
  const countsById = useMemo(
    () => Object.fromEntries(countries.map(([country, count]) => [COUNTRY_IDS[country], { country, count }])),
    [countries]
  );

  function resetMap() {
    setMapCenter([10, 50]);
    setMapZoom(3.2);
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight text-zinc-100">{title}</h3>
          <p className="mt-1 text-sm text-zinc-500">Concerts by country</p>
        </div>
        <span className="text-sm font-semibold text-zinc-500">{countries.length} {countries.length === 1 ? "country" : "countries"}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(220px,0.65fr)]">
        <div className="relative min-h-64 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <ComposableMap width={760} height={420} className="h-full min-h-64 w-full" aria-label="Map of concert countries in Europe">
            <ZoomableGroup center={mapCenter} zoom={mapZoom} minZoom={1} maxZoom={8} onMoveEnd={({ coordinates, zoom }) => { setMapCenter(coordinates); setMapZoom(zoom); }}>
              <Geographies geography={worldGeography}>
                {({ geographies }) => geographies.map((geo) => {
                  const entry = countsById[String(geo.id).padStart(3, "0")];
                  const intensity = entry ? entry.count / maxCount : 0;
                  const fill = entry
                    ? intensity > 0.66 ? "#fafafa" : intensity > 0.25 ? "#a1a1aa" : "#71717a"
                    : "#27272a";
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke="#09090b"
                      strokeWidth={0.55}
                      onMouseEnter={() => entry && setHoveredCountry(entry)}
                      onMouseLeave={() => setHoveredCountry(null)}
                      style={{
                        default: { outline: "none" },
                        hover: { fill: entry ? "#ffffff" : "#3f3f46", outline: "none" },
                        pressed: { fill, outline: "none" },
                      }}
                    />
                  );
                })}
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>
          {hoveredCountry && (
            <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-sm font-bold text-zinc-100 shadow-xl backdrop-blur">
              {hoveredCountry.country}: {hoveredCountry.count} {hoveredCountry.count === 1 ? "concert" : "concerts"}
            </div>
          )}
          <div className="absolute bottom-3 right-3 flex flex-col gap-1">
            <button onClick={resetMap} className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 shadow-lg transition hover:border-zinc-500 hover:text-white" aria-label="Reset map"><i className="fa-solid fa-house" aria-hidden="true" /></button>
            <button onClick={() => setMapZoom((zoom) => Math.min(8, zoom * 1.35))} className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 shadow-lg transition hover:border-zinc-500 hover:text-white" aria-label="Zoom map in"><i className="fa-solid fa-plus" aria-hidden="true" /></button>
            <button onClick={() => setMapZoom((zoom) => Math.max(1, zoom / 1.35))} className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 shadow-lg transition hover:border-zinc-500 hover:text-white" aria-label="Zoom map out"><i className="fa-solid fa-minus" aria-hidden="true" /></button>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-4 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">Drag to explore</div>
        </div>
        <div className="space-y-2">
          {countries.map(([country, count], index) => (
            <div key={country} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <span className="w-5 text-xs font-black text-zinc-600">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-bold text-zinc-100">{country}</span>
                  <span className="text-sm font-black text-zinc-300">{count}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-zinc-200" style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsBar({ data, max, accent = "bg-zinc-100", label }) {
  if (!data.length) return <p className="text-sm text-zinc-500">No data yet.</p>;
  return (
    <div className="space-y-3">
      {data.map(([name, value]) => {
        const pct = max ? Math.max(4, (value / max) * 100) : 0;
        return (
          <div key={name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold text-zinc-100">{name}</span>
                <span className="text-zinc-500">{value}{label ? ` ${label}` : ""}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                <div className={`h-full ${accent} transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatsPage({ historyItems, onOpenVenue }) {
  const geographyShows = useMemo(
    () => historyItems.flatMap(({ shows }) => shows.map((show) => parseShow(show, "history"))),
    [historyItems]
  );
  const stats = useMemo(() => {
    const totalArtists = historyItems.length;
    const totalShows = historyItems.reduce((s, i) => s + i.shows.length, 0);
    const venueCounts = {}, yearCounts = {};
    let earliestYear = Infinity, latestYear = -Infinity;
    historyItems.forEach(({ shows }) => {
      shows.forEach((show) => {
        const { venue, date } = parseShow(show, "history");
        if (venue && venue !== "Date confirmed") venueCounts[venue] = (venueCounts[venue] || 0) + 1;
        const yr = String(date).match(/\/(\d{4})/);
        if (yr) { const y = Number(yr[1]); yearCounts[y] = (yearCounts[y] || 0) + 1; if (y < earliestYear) earliestYear = y; if (y > latestYear) latestYear = y; }
      });
    });
    const topArtists = historyItems.map((i) => [i.artist, i.shows.length]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
    const topVenues = Object.entries(venueCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
    const years = [];
    if (Number.isFinite(earliestYear) && Number.isFinite(latestYear)) for (let y = earliestYear; y <= latestYear; y++) years.push([String(y), yearCounts[y] || 0]);
    return {
      totalArtists, totalShows, yearsActive: years.length, avgPerYear: years.length ? (totalShows / years.length).toFixed(1) : "0",
      topArtist: topArtists[0]?.[0] || "—", topArtistShows: topArtists[0]?.[1] || 0,
      topVenue: topVenues[0]?.[0] || "—", topVenueShows: topVenues[0]?.[1] || 0,
      topArtists, topVenues, years,
      maxArtist: topArtists[0]?.[1] || 1, maxVenue: topVenues[0]?.[1] || 1, maxYear: years.length ? Math.max(...years.map(([, v]) => v)) : 1,
    };
  }, [historyItems]);

  const summaryCards = [
    { label: "Total artists", value: stats.totalArtists },
    { label: "Total shows", value: stats.totalShows },
    { label: "Years active", value: stats.yearsActive },
    { label: "Avg shows/year", value: stats.avgPerYear },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards.map(({ label, value }) => (
          <div key={label} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center">
            <div className="text-3xl font-black text-zinc-100 md:text-4xl">{value}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Most-seen artist</div>
          <div className="mt-2 text-2xl font-black uppercase text-zinc-100">{stats.topArtist}</div>
          <div className="mt-1 text-sm text-zinc-400">{stats.topArtistShows} {stats.topArtistShows === 1 ? "show" : "shows"}</div>
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Top venue</div>
          <button onClick={() => stats.topVenue !== "—" && onOpenVenue(stats.topVenue)} className="mt-2 text-left text-2xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{stats.topVenue}</button>
          <div className="mt-1 text-sm text-zinc-400">{stats.topVenueShows} {stats.topVenueShows === 1 ? "show" : "shows"}</div>
        </div>
      </div>
      <GeographicStats shows={geographyShows} title="Lifetime geography" />
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-5 text-lg font-black uppercase tracking-tight text-zinc-100">Top 10 artists</h3>
        <StatsBar data={stats.topArtists} max={stats.maxArtist} label="shows" accent="bg-zinc-100" />
      </div>
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-5 text-lg font-black uppercase tracking-tight text-zinc-100">Top 10 venues</h3>
        <StatsBar data={stats.topVenues} max={stats.maxVenue} label="shows" accent="bg-zinc-300" />
      </div>
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-5 text-lg font-black uppercase tracking-tight text-zinc-100">Concerts per year</h3>
        {stats.years.length === 0 ? <p className="text-sm text-zinc-500">No data yet.</p> : (
          <div className="flex items-end gap-2 overflow-x-auto pb-2">
            {stats.years.map(([year, count]) => {
              const heightPct = stats.maxYear ? (count / stats.maxYear) * 100 : 0;
              return (
                <div key={year} className="flex min-w-[36px] flex-1 flex-col items-center gap-2">
                  <div className="flex h-44 w-full items-end">
                    <div className="w-full rounded-t-md bg-zinc-100 transition-all hover:bg-white" style={{ height: `${count === 0 ? 2 : heightPct}%`, opacity: count === 0 ? 0.15 : 1 }} title={`${count} ${count === 1 ? "show" : "shows"} in ${year}`} />
                  </div>
                  <div className="text-[10px] font-semibold text-zinc-500">'{year.slice(-2)}</div>
                  <div className="text-[11px] font-bold text-zinc-300">{count}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Artist detail ────────────────────────────────────────────────────────────

function ArtistDetailPage({ item, upcoming = [], onBack, onOpenSetlist, onOpenVenue }) {
  const shows = useMemo(
    () => [...item.shows]
      .map((show) => ({ show, ...parseShow(show, "history") }))
      .sort((a, b) => parseDate(b.date) - parseDate(a.date)),
    [item]
  );

  const venues = new Set(shows.map(({ venue }) => venue).filter((venue) => venue && venue !== "Date confirmed"));
  const years = new Set(shows.map(({ date }) => String(date).match(/(\d{4})/)?.[1]).filter(Boolean));
  const firstShow = shows[shows.length - 1];
  const latestShow = shows[0];
  const summaryCards = [
    { label: "Shows", value: shows.length },
    { label: "Venues", value: venues.size },
    { label: "Years seen", value: years.size },
    { label: "First seen", value: firstShow?.date || "—" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-zinc-500 hover:text-white">
          ← Go back
        </button>
        {latestShow && <p className="text-sm text-zinc-500">Most recently seen {latestShow.date}</p>}
      </div>

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards.map(({ label, value }) => (
          <div key={label} className="min-w-0 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center">
            <div className="truncate text-2xl font-black text-zinc-100 md:text-3xl" title={String(value)}>{value}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      {upcoming.length > 0 && (
        <section className="mb-10 rounded-3xl border border-zinc-700 bg-zinc-900 p-6">
          <h2 className="mb-5 text-lg font-black uppercase tracking-tight text-zinc-100">Coming up</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.map((concert) => (
              <div key={`${concert.date}-${concert.venue || ""}`} className="rounded-2xl bg-zinc-950 p-4">
                {concert.venue && <div className="flex gap-2 text-sm font-semibold text-zinc-100"><Icon type="map" /><button onClick={() => onOpenVenue(concert.venue)} className="text-left hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{concert.venue}</button></div>}
                <div className={`${concert.venue ? "mt-2 " : ""}flex gap-2 text-sm text-zinc-400`}><Icon type="calendar" /><span>{concert.date}</span></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="text-xl font-black uppercase tracking-tight text-zinc-100">Performance history</h2>
          <span className="text-sm text-zinc-500">{shows.length} {shows.length === 1 ? "show" : "shows"}</span>
        </div>
        <div className="relative space-y-4 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-px before:bg-zinc-800 md:before:left-[27px]">
          {shows.map(({ show, venue, date, setlistId }, index) => (
            <article key={show} className="relative flex gap-4 md:gap-6">
              <div className="relative z-[1] mt-6 h-10 w-10 shrink-0 rounded-full border-4 border-zinc-950 bg-zinc-700 md:h-14 md:w-14">
                <span className="flex h-full items-center justify-center text-[10px] font-black text-zinc-200 md:text-xs">{shows.length - index}</span>
              </div>
              <div className="min-w-0 flex-1 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <button onClick={() => onOpenVenue(venue)} className="break-words text-left text-lg font-black text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4 md:text-xl">{venue}</button>
                    <div className="mt-2 flex gap-2 text-sm text-zinc-400"><Icon type="calendar" /><span>{date}</span></div>
                  </div>
                  <button
                    onClick={() => onOpenSetlist({ artist: item.artist, venue, date, setlistId, show })}
                    className="flex shrink-0 items-center gap-2 self-start rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100"
                  >
                    <Icon type="music" />
                    Setlist
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Venue detail ─────────────────────────────────────────────────────────────

function VenueDetailPage({ venue, historyItems, onBack, onOpenArtist, onOpenSetlist }) {
  const shows = useMemo(
    () => historyItems.flatMap(({ artist, shows }) =>
      shows
        .map((show) => ({ artist, show, ...parseShow(show, "history") }))
        .filter((entry) => normalize(entry.venue) === normalize(venue))
    ).sort((a, b) => parseDate(b.date) - parseDate(a.date) || a.artist.localeCompare(b.artist)),
    [historyItems, venue]
  );
  const artists = useMemo(() => {
    const counts = {};
    shows.forEach(({ artist }) => { counts[artist] = (counts[artist] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [shows]);
  const years = new Set(shows.map(({ date }) => String(date).match(/(\d{4})/)?.[1]).filter(Boolean));
  const firstVisit = shows[shows.length - 1];
  const latestVisit = shows[0];
  const topArtist = artists[0];
  const summaryCards = [
    { label: "Visits", value: shows.length },
    { label: "Artists", value: artists.length },
    { label: "Years active", value: years.size },
    { label: "First visit", value: firstVisit?.date || "—" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-zinc-500 hover:text-white">
          ← Go back
        </button>
        {latestVisit && <p className="text-sm text-zinc-500">Last visited {latestVisit.date}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards.map(({ label, value }) => (
          <div key={label} className="min-w-0 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center">
            <div className="truncate text-2xl font-black text-zinc-100 md:text-3xl" title={String(value)}>{value}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      {topArtist && (
        <section className="mt-3 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Most seen here</div>
          <button onClick={() => onOpenArtist(topArtist[0])} className="mt-2 text-left text-2xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{topArtist[0]}</button>
          <p className="mt-1 text-sm text-zinc-400">{topArtist[1]} {topArtist[1] === 1 ? "performance" : "performances"}</p>
        </section>
      )}

      <section className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="text-xl font-black uppercase tracking-tight text-zinc-100">Artists at this venue</h2>
          <span className="text-sm text-zinc-500">{artists.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {artists.map(([artist, count]) => (
            <button key={artist} onClick={() => onOpenArtist(artist)} className="rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white">
              {artist} <span className="ml-1 text-zinc-600">{count}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-6 flex items-end justify-between border-b border-zinc-800 pb-4">
          <h2 className="text-2xl font-black uppercase tracking-tight text-zinc-100">Visit history</h2>
          <span className="text-sm text-zinc-500">{shows.length} total</span>
        </div>
        <div className="relative space-y-4 before:absolute before:bottom-6 before:left-[7px] before:top-6 before:w-px before:bg-zinc-800">
          {shows.map(({ artist, show, date, setlistId }) => (
            <article key={`${artist}-${show}`} className="relative flex gap-4">
              <span className="relative z-[1] mt-7 h-[15px] w-[15px] shrink-0 rounded-full border-4 border-zinc-950 bg-zinc-500" />
              <div className="min-w-0 flex-1 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <button onClick={() => onOpenArtist(artist)} className="break-words text-left text-xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{artist}</button>
                    <div className="mt-3 flex gap-2 text-sm text-zinc-400"><Icon type="calendar" /><span>{date}</span></div>
                  </div>
                  <button onClick={() => onOpenSetlist({ artist, venue, date, setlistId, show })} className="flex shrink-0 items-center gap-2 self-start rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100">
                    <Icon type="music" />
                    Setlist
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Concert timeline ─────────────────────────────────────────────────────────

function ConcertTimelinePage({ historyItems, onBack, onOpenArtist, onOpenSetlist, onOpenVenue }) {
  const [artistFilter, setArtistFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");

  const shows = useMemo(
    () => historyItems.flatMap(({ artist, shows }) =>
      shows.map((show) => ({ artist, show, ...parseShow(show, "history") }))
    ),
    [historyItems]
  );
  const artists = useMemo(
    () => [...new Set(shows.map(({ artist }) => artist))].sort((a, b) => a.localeCompare(b)),
    [shows]
  );
  const venues = useMemo(
    () => [...new Set(shows.map(({ venue }) => venue).filter((venue) => venue && venue !== "Date confirmed"))].sort((a, b) => a.localeCompare(b)),
    [shows]
  );
  const filteredShows = useMemo(
    () => shows
      .filter(({ artist, venue }) => artistFilter === "all" || artist === artistFilter)
      .filter(({ venue }) => venueFilter === "all" || venue === venueFilter)
      .sort((a, b) => parseDate(b.date) - parseDate(a.date) || a.artist.localeCompare(b.artist)),
    [shows, artistFilter, venueFilter]
  );
  const groupedYears = useMemo(() => {
    const groups = new Map();
    filteredShows.forEach((show) => {
      const year = String(show.date).match(/(\d{4})/)?.[1] || "Unknown";
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push(show);
    });
    return [...groups.entries()];
  }, [filteredShows]);
  const hasFilters = artistFilter !== "all" || venueFilter !== "all";

  function jumpToYear(year) {
    document.getElementById(`timeline-${year}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <section className="sticky top-0 z-10 mb-10 border-y border-zinc-800 bg-zinc-950/95 py-4 backdrop-blur">
        <div className="space-y-2 md:hidden">
          <div className="grid grid-cols-2 gap-2">
            <DropdownMenu
              value={artistFilter}
              onChange={setArtistFilter}
              ariaLabel="Filter timeline by artist"
              groupName="timeline-filters"
              menuAlign="left"
              options={[{ value: "all", label: "All artists" }, ...artists.map((artist) => ({ value: artist, label: artist }))]}
            />
            <DropdownMenu
              value={venueFilter}
              onChange={setVenueFilter}
              ariaLabel="Filter timeline by venue"
              groupName="timeline-filters"
              options={[{ value: "all", label: "All venues" }, ...venues.map((venue) => ({ value: venue, label: venue }))]}
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <DropdownMenu
              value=""
              onChange={jumpToYear}
              ariaLabel="Jump to timeline year"
              buttonLabel="Years"
              groupName="timeline-filters"
              menuAlign="left"
              options={groupedYears.map(([year, yearShows]) => ({ value: year, label: `${year} · ${yearShows.length} ${yearShows.length === 1 ? "concert" : "concerts"}` }))}
            />
            <button onClick={onBack} className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-200 transition hover:border-zinc-500 hover:text-white" aria-label="Back to concert archive" title="Back to concert archive">
              <i className="fa-solid fa-table-cells-large" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="hidden gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)_auto]">
          <DropdownMenu value={artistFilter} onChange={setArtistFilter} ariaLabel="Filter timeline by artist" groupName="timeline-filters" menuAlign="left" options={[{ value: "all", label: "All artists" }, ...artists.map((artist) => ({ value: artist, label: artist }))]} />
          <DropdownMenu value={venueFilter} onChange={setVenueFilter} ariaLabel="Filter timeline by venue" groupName="timeline-filters" options={[{ value: "all", label: "All venues" }, ...venues.map((venue) => ({ value: venue, label: venue }))]} />
          <DropdownMenu value="" onChange={jumpToYear} ariaLabel="Jump to timeline year" buttonLabel="Years" groupName="timeline-filters" menuAlign="left" options={groupedYears.map(([year, yearShows]) => ({ value: year, label: `${year} · ${yearShows.length} ${yearShows.length === 1 ? "concert" : "concerts"}` }))} />
          <button onClick={onBack} className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-200 transition hover:border-zinc-500 hover:text-white" aria-label="Back to concert archive" title="Back to concert archive"><i className="fa-solid fa-table-cells-large" aria-hidden="true" /></button>
        </div>
        {hasFilters && (
          <button onClick={() => { setArtistFilter("all"); setVenueFilter("all"); }} className="mt-3 rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:border-zinc-500">
            Clear filters
          </button>
        )}
      </section>

      {groupedYears.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No concerts match these filters.</p>
      ) : (
        <div className="space-y-14">
          {groupedYears.map(([year, yearShows]) => (
            <section key={year} id={`timeline-${year}`} className="scroll-mt-36">
              <div className="mb-6 flex items-end justify-between border-b border-zinc-800 pb-4">
                <h2 className="text-4xl font-black tracking-tight text-zinc-100 md:text-6xl">{year}</h2>
                <span className="text-sm font-semibold text-zinc-500">{yearShows.length} {yearShows.length === 1 ? "concert" : "concerts"}</span>
              </div>
              <div className="relative space-y-4 before:absolute before:bottom-6 before:left-[7px] before:top-6 before:w-px before:bg-zinc-800">
                {yearShows.map(({ artist, show, venue, date, setlistId }) => (
                  <article key={`${artist}-${show}`} className="relative flex gap-4">
                    <span className="relative z-[1] mt-7 h-[15px] w-[15px] shrink-0 rounded-full border-4 border-zinc-950 bg-zinc-500" />
                    <div className="min-w-0 flex-1 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div className="min-w-0">
                          <button onClick={() => onOpenArtist(artist)} className="break-words text-left text-xl font-black uppercase leading-tight text-zinc-100 transition hover:text-white hover:underline hover:decoration-zinc-600 hover:underline-offset-4 md:text-2xl">
                            {artist}
                          </button>
                          <div className="mt-3 flex gap-2 text-sm font-semibold text-zinc-300"><Icon type="map" /><button onClick={() => onOpenVenue(venue)} className="break-words text-left hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{venue}</button></div>
                          <div className="mt-2 flex gap-2 text-sm text-zinc-400"><Icon type="calendar" /><span>{date}</span></div>
                        </div>
                        <button
                          onClick={() => onOpenSetlist({ artist, venue, date, setlistId, show })}
                          className="flex shrink-0 items-center gap-2 self-start rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100"
                        >
                          <Icon type="music" />
                          Setlist
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Year in review ───────────────────────────────────────────────────────────

function YearInReviewPage({ historyItems, onOpenArtist, onOpenSetlist, onOpenVenue }) {
  const allShows = useMemo(
    () => historyItems.flatMap(({ artist, shows }) =>
      shows.map((show) => ({ artist, show, ...parseShow(show, "history") }))
    ),
    [historyItems]
  );
  const years = useMemo(
    () => [...new Set(allShows.map(({ date }) => String(date).match(/(\d{4})/)?.[1]).filter(Boolean))]
      .sort((a, b) => Number(b) - Number(a)),
    [allShows]
  );
  const [selectedYear, setSelectedYear] = useState(() => years[0] || "");
  const activeYear = years.includes(selectedYear) ? selectedYear : years[0] || "";

  const review = useMemo(() => {
    if (!activeYear) return null;
    const yearShows = allShows
      .filter(({ date }) => String(date).match(/(\d{4})/)?.[1] === activeYear)
      .sort((a, b) => parseDate(a.date) - parseDate(b.date) || a.artist.localeCompare(b.artist));
    const previousYear = String(Number(activeYear) - 1);
    const previousShows = allShows.filter(({ date }) => String(date).match(/(\d{4})/)?.[1] === previousYear);
    const artistFirstYear = new Map();
    allShows.forEach(({ artist, date }) => {
      const year = String(date).match(/(\d{4})/)?.[1];
      if (!year) return;
      const key = normalize(artist);
      if (!artistFirstYear.has(key) || Number(year) < Number(artistFirstYear.get(key))) artistFirstYear.set(key, year);
    });
    const uniqueArtists = [...new Set(yearShows.map(({ artist }) => artist))];
    const newArtists = uniqueArtists.filter((artist) => artistFirstYear.get(normalize(artist)) === activeYear);
    const returningArtists = uniqueArtists.filter((artist) => artistFirstYear.get(normalize(artist)) !== activeYear);
    const venueCounts = {};
    const monthCounts = {};
    yearShows.forEach(({ venue, date }) => {
      if (venue && venue !== "Date confirmed") venueCounts[venue] = (venueCounts[venue] || 0) + 1;
      const month = String(date).match(/^\d{1,2}\/(\d{1,2})\//)?.[1];
      if (month) monthCounts[month] = (monthCounts[month] || 0) + 1;
    });
    const topVenue = Object.entries(venueCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const busiestMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return {
      shows: yearShows,
      uniqueArtists,
      newArtists,
      returningArtists,
      firstShow: yearShows[0],
      lastShow: yearShows[yearShows.length - 1],
      topVenue: topVenue?.[0] || "—",
      topVenueCount: topVenue?.[1] || 0,
      busiestMonth: busiestMonth ? monthNames[Number(busiestMonth[0]) - 1] : "—",
      busiestMonthCount: busiestMonth?.[1] || 0,
      previousYear,
      previousCount: previousShows.length,
      change: yearShows.length - previousShows.length,
    };
  }, [activeYear, allShows]);

  if (!review) return <p className="py-16 text-center text-zinc-500">No yearly concert data yet.</p>;

  const summaryCards = [
    { label: "Concerts", value: review.shows.length },
    { label: "Artists", value: review.uniqueArtists.length },
    { label: "New artists", value: review.newArtists.length },
    { label: "Returning", value: review.returningArtists.length },
  ];
  const comparisonText = review.previousCount === 0
    ? `No concerts recorded in ${review.previousYear}`
    : review.change === 0
    ? `The same number as ${review.previousYear}`
    : `${Math.abs(review.change)} ${review.change > 0 ? "more" : "fewer"} than ${review.previousYear}`;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex justify-center">
        <DropdownMenu
          value={activeYear}
          onChange={setSelectedYear}
          ariaLabel="Choose review year"
          className="w-40"
          centered
          options={years.map((year) => ({ value: year, label: year }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards.map(({ label, value }) => (
          <div key={label} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center">
            <div className="text-3xl font-black text-zinc-100 md:text-4xl">{value}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Top venue</div>
          <button onClick={() => review.topVenue !== "—" && onOpenVenue(review.topVenue)} className="mt-2 break-words text-left text-xl font-black text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{review.topVenue}</button>
          <div className="mt-1 text-sm text-zinc-400">{review.topVenueCount} {review.topVenueCount === 1 ? "visit" : "visits"}</div>
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Busiest month</div>
          <div className="mt-2 text-xl font-black text-zinc-100">{review.busiestMonth}</div>
          <div className="mt-1 text-sm text-zinc-400">{review.busiestMonthCount} {review.busiestMonthCount === 1 ? "concert" : "concerts"}</div>
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Year over year</div>
          <div className={`mt-2 text-xl font-black ${review.change > 0 ? "text-emerald-400" : review.change < 0 ? "text-amber-400" : "text-zinc-100"}`}>
            {review.change > 0 ? "+" : ""}{review.change}
          </div>
          <div className="mt-1 text-sm text-zinc-400">{comparisonText}</div>
        </div>
      </div>

      <div className="mt-10">
        <GeographicStats shows={review.shows} title={`${activeYear} geography`} />
      </div>

      <div className="mt-10 grid gap-3 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">The year began with</div>
          {review.firstShow && (
            <>
              <button onClick={() => onOpenArtist(review.firstShow.artist)} className="mt-2 text-left text-xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{review.firstShow.artist}</button>
              <p className="mt-1 text-sm text-zinc-400">{review.firstShow.venue} · {review.firstShow.date}</p>
            </>
          )}
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">The year ended with</div>
          {review.lastShow && (
            <>
              <button onClick={() => onOpenArtist(review.lastShow.artist)} className="mt-2 text-left text-xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{review.lastShow.artist}</button>
              <p className="mt-1 text-sm text-zinc-400">{review.lastShow.venue} · {review.lastShow.date}</p>
            </>
          )}
        </div>
      </div>

      <section className="mt-12">
        <div className="mb-6 flex items-end justify-between border-b border-zinc-800 pb-4">
          <h2 className="text-2xl font-black uppercase tracking-tight text-zinc-100">The year in concerts</h2>
          <span className="text-sm text-zinc-500">{review.shows.length} total</span>
        </div>
        <div className="relative space-y-4 before:absolute before:bottom-6 before:left-[7px] before:top-6 before:w-px before:bg-zinc-800">
          {review.shows.map(({ artist, show, venue, date, setlistId }) => (
            <article key={`${artist}-${show}`} className="relative flex gap-4">
              <span className="relative z-[1] mt-7 h-[15px] w-[15px] shrink-0 rounded-full border-4 border-zinc-950 bg-zinc-500" />
              <div className="min-w-0 flex-1 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <button onClick={() => onOpenArtist(artist)} className="break-words text-left text-xl font-black uppercase leading-tight text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{artist}</button>
                    <div className="mt-3 flex gap-2 text-sm font-semibold text-zinc-300"><Icon type="map" /><button onClick={() => onOpenVenue(venue)} className="break-words text-left hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{venue}</button></div>
                    <div className="mt-2 flex gap-2 text-sm text-zinc-400"><Icon type="calendar" /><span>{date}</span></div>
                  </div>
                  <button onClick={() => onOpenSetlist({ artist, venue, date, setlistId, show })} className="flex shrink-0 items-center gap-2 self-start rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100">
                    <Icon type="music" />
                    Setlist
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function FriendsPage({ friends, requests, invitations, onSearch, onSendRequest, onRespondRequest, onRemoveFriend, onRespondInvitation }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitSearch(event) {
    event.preventDefault();
    if (search.trim().length < 2) return;
    setLoading(true);
    setError("");
    try { setResults(await onSearch(search.trim())); }
    catch (searchError) { setError(searchError.message || "Could not search users."); }
    finally { setLoading(false); }
  }

  async function act(action) {
    setError("");
    try {
      await action();
      if (search.trim().length >= 2) setResults(await onSearch(search.trim()));
    } catch (actionError) { setError(actionError.message || "Could not update friends."); }
  }

  return (
    <div className="space-y-8">
      {invitations.length > 0 && (
        <section className="rounded-3xl border border-amber-900/60 bg-gradient-to-br from-amber-950/30 to-zinc-950 p-5 md:p-7">
          <PanelHeading icon="fa-ticket" title="Concert invitations" description="Choose your ticket status to add the concert to your archive." />
          <div className="space-y-3">
            {invitations.map((invitation) => (
              <div key={invitation.concertId} className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="truncate font-black uppercase tracking-tight text-zinc-100">{invitation.artist}</p><p className="mt-1 text-sm text-zinc-500"><i className="fa-solid fa-location-dot mr-1.5 text-zinc-700" aria-hidden="true" />{invitation.venue || "Venue not specified"}</p><p className="mt-1 text-xs text-zinc-600">{invitation.date} · invited by <span className="text-zinc-400">{invitation.invitedBy}</span></p></div>
                <div className="grid grid-cols-2 gap-2 sm:flex"><button onClick={() => act(() => onRespondInvitation(invitation.concertId, true, true))} className="rounded-xl bg-emerald-200 px-4 py-2.5 text-xs font-black text-emerald-950 transition hover:bg-emerald-100">Bought</button><button onClick={() => act(() => onRespondInvitation(invitation.concertId, true, false))} className="rounded-xl bg-amber-200 px-4 py-2.5 text-xs font-black text-amber-950 transition hover:bg-amber-100">Not bought</button><button onClick={() => act(() => onRespondInvitation(invitation.concertId, false, false))} className="col-span-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-bold text-zinc-400 transition hover:border-red-900 hover:text-red-300">Decline</button></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading icon="fa-user-plus" title="Find people" description="Search by display name or username." />
        <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row"><div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 focus-within:border-zinc-500"><Icon type="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or username" className="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600" /></div><button disabled={loading || search.trim().length < 2} className="rounded-2xl bg-zinc-100 px-6 py-3 font-black text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Searching…" : "Search"}</button></form>
        {error && <p className="mt-4 rounded-2xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>}
        {results.length > 0 && <div className="mt-5 divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">{results.map((person) => <div key={person.id} className="flex items-center gap-3 px-4 py-3.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-xs font-black text-zinc-400">{person.displayName.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate font-bold text-zinc-100">{person.displayName}</p><p className="truncate text-xs text-zinc-600">@{person.username}</p></div>{person.relationship === "accepted" ? <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400"><i className="fa-solid fa-check" aria-hidden="true" />Friends</span> : person.relationship === "pending" ? <span className="text-xs font-bold text-zinc-500">Pending</span> : <button onClick={() => act(() => onSendRequest(person.id))} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-black text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900">Add</button>}</div>)}</div>}
      </section>

      {requests.filter((request) => request.direction === "incoming").length > 0 && <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7"><PanelHeading icon="fa-user-clock" title="Friend requests" description="Requests waiting for your response." /><div className="space-y-2">{requests.filter((request) => request.direction === "incoming").map((request) => <div key={request.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate font-bold">{request.displayName}</p><p className="truncate text-xs text-zinc-600">@{request.username}</p></div><div className="flex gap-2"><button onClick={() => act(() => onRespondRequest(request.id, true))} className="flex-1 rounded-xl bg-zinc-100 px-4 py-2 text-xs font-black text-zinc-950 transition hover:bg-white">Accept</button><button onClick={() => act(() => onRespondRequest(request.id, false))} className="flex-1 rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-400 transition hover:border-red-900 hover:text-red-300">Decline</button></div></div>)}</div></section>}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7"><PanelHeading icon="fa-user-group" title="Your friends" description="Friends can be invited when adding or editing a concert." />{friends.length ? <div className="grid gap-3 sm:grid-cols-2">{friends.map((friend) => <div key={friend.id} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-sm font-black text-zinc-400">{friend.displayName.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate font-bold">{friend.displayName}</p><p className="truncate text-xs text-zinc-600">@{friend.username}</p></div><button onClick={() => act(() => onRemoveFriend(friend.id))} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-700 transition hover:bg-red-950/40 hover:text-red-300" aria-label={`Remove ${friend.displayName}`}><i className="fa-solid fa-user-minus text-xs" aria-hidden="true" /></button></div>)}</div> : <EmptyState icon="fa-user-group" title="No friends yet" description="Use the search above to find people you know." />}</section>
    </div>
  );
}

// ─── LoginGate ────────────────────────────────────────────────────────────────

function LoginGate({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [shake, setShake] = useState(false);
  const emailCooldown = useAuthEmailCooldown();

  async function attempt(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!authError) {
      onSignedIn();
      return;
    }
    setError("Incorrect email or password.");
    setPassword("");
    setShake(true);
    setTimeout(() => setShake(false), 500);
    setLoading(false);
  }

  async function requestPasswordReset() {
    const normalizedEmail = email.trim();
    setError("");
    setResetSent(false);
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Enter your email address first.");
      return;
    }
    const cooldownSeconds = emailCooldown.refresh();
    if (cooldownSeconds > 0) {
      setError(`Wait ${cooldownSeconds} seconds before requesting another email.`);
      return;
    }
    setResetLoading(true);
    try {
      const redirectTo = `${window.location.origin}/?password-recovery=1`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (resetError) {
        setError(resetError.message || "Could not send the recovery email.");
        return;
      }
      emailCooldown.start();
      setResetSent(true);
    } catch {
      setError("Could not send the recovery email. Check your connection and try again.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className={`w-full max-w-sm ${shake ? "animate-shake" : ""}`}>
        <div className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.45em] text-zinc-500">A Deafening Noise</p>
          <h1 className="text-4xl font-black uppercase tracking-tight text-zinc-100">Private Archive</h1>
          <p className="mt-3 text-sm text-zinc-500">Sign in to open your concert history.</p>
        </div>
        <form onSubmit={attempt} className="space-y-4">
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); setResetSent(false); }} placeholder="Email" autoComplete="email" autoFocus className={`w-full rounded-2xl border bg-zinc-900 px-5 py-4 text-zinc-100 outline-none transition placeholder:text-zinc-600 ${error ? "border-red-700" : "border-zinc-700 focus:border-zinc-400"}`} />
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="Password" autoComplete="current-password" className={`w-full rounded-2xl border bg-zinc-900 px-5 py-4 text-zinc-100 outline-none transition placeholder:text-zinc-600 ${error ? "border-red-700 text-red-300" : "border-zinc-700 focus:border-zinc-400"}`} />
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
          {resetSent && <p className="rounded-2xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-center text-sm text-emerald-300">If that account exists, a recovery link has been sent.</p>}
          <button type="submit" disabled={loading} className="w-full rounded-2xl bg-zinc-100 py-4 font-black uppercase tracking-widest text-zinc-950 transition hover:bg-white disabled:opacity-50">{loading ? "Signing in…" : "Sign in"}</button>
          <button type="button" onClick={requestPasswordReset} disabled={loading || resetLoading || emailCooldown.seconds > 0} className="w-full py-2 text-sm font-semibold text-zinc-500 transition hover:text-zinc-200 disabled:opacity-50">{resetLoading ? "Sending recovery email…" : emailCooldown.seconds > 0 ? `Try again in ${emailCooldown.seconds}s` : "Forgot password?"}</button>
        </form>
      </div>
    </div>
  );
}

function ChangePasswordModal({ mode, email, onClose }) {
  const isOpen = Boolean(mode);
  const isRecovery = mode === "recovery";
  const [step, setStep] = useState("request");
  const [nonce, setNonce] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const emailCooldown = useAuthEmailCooldown();

  useEffect(() => {
    if (!isOpen) return;
    setStep(isRecovery ? "password" : "request");
    setNonce("");
    setNewPassword("");
    setConfirmation("");
    setError("");
    setSaving(false);
    setSaved(false);
  }, [isOpen, isRecovery]);

  if (!isOpen) return null;

  async function sendVerificationCode() {
    setError("");
    const cooldownSeconds = emailCooldown.refresh();
    if (cooldownSeconds > 0) {
      setError(`Wait ${cooldownSeconds} seconds before requesting another email.`);
      return;
    }
    setSaving(true);
    try {
      const { error: reauthenticationError } = await supabase.auth.reauthenticate();
      if (reauthenticationError) {
        setError(reauthenticationError.message || "Could not send the verification code.");
        return;
      }
      emailCooldown.start();
      setStep("password");
    } catch {
      setError("Could not send the verification code. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Use at least 8 characters for the new password.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }
    if (!isRecovery && !/^\d{6}$/.test(nonce.trim())) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        ...(!isRecovery ? { nonce: nonce.trim() } : {}),
      });
      if (updateError) {
        setError(updateError.message || "Could not change your password.");
        return;
      }
      setNonce("");
      setNewPassword("");
      setConfirmation("");
      setSaved(true);
      await supabase.auth.signOut();
    } catch {
      setError("Could not change your password. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4" onClick={() => { if (!saving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-zinc-600">{isRecovery ? "Account recovery" : "Account security"}</p>
            <h2 id="change-password-title" className="text-2xl font-black text-zinc-100">{step === "request" && !saved ? "Verify your email" : "Choose a new password"}</h2>
          </div>
          <ModalCloseButton onClick={onClose} disabled={saving} />
        </div>
        {saved ? (
          <div>
            <p className="mb-6 rounded-2xl border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">Your password has been changed. Sign in again with your new password.</p>
            <button type="button" onClick={onClose} className="w-full rounded-2xl bg-zinc-100 py-3.5 font-black text-zinc-950 transition hover:bg-white">Done</button>
          </div>
        ) : step === "request" ? (
          <div>
            <p className="mb-2 text-sm text-zinc-300">We'll email a verification code to:</p>
            <p className="mb-6 break-all text-sm font-bold text-zinc-100">{email}</p>
            {error && <p className="mb-4 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button type="button" onClick={sendVerificationCode} disabled={saving || emailCooldown.seconds > 0} className="w-full rounded-2xl bg-zinc-100 py-3.5 font-black text-zinc-950 transition hover:bg-white disabled:opacity-50">{saving ? "Sending code…" : emailCooldown.seconds > 0 ? `Try again in ${emailCooldown.seconds}s` : "Send verification code"}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {!isRecovery && <p className="text-sm text-zinc-400">Enter the verification code sent to {email}.</p>}
            {!isRecovery && <input type="text" inputMode="numeric" value={nonce} onChange={(event) => { setNonce(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} placeholder="6-digit verification code" autoComplete="one-time-code" pattern="[0-9]{6}" autoFocus required className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400" />}
            <input type="password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError(""); }} placeholder="New password" autoComplete="new-password" minLength={8} required className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400" />
            <input type="password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(""); }} placeholder="Confirm new password" autoComplete="new-password" minLength={8} required className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400" />
            <p className="text-xs text-zinc-600">Use at least 8 characters.</p>
            {error && <p className="rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={saving} className="w-full rounded-2xl bg-zinc-100 py-3.5 font-black text-zinc-950 transition hover:bg-white disabled:opacity-50">{saving ? "Changing password…" : "Change password"}</button>
          </form>
        )}
      </section>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const initialRoute = useMemo(() => readRouteFromLocation(), []);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!supabaseEnabled);
  const [dataReady, setDataReady] = useState(!supabaseEnabled);
  const [dataLoadError, setDataLoadError] = useState("");

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("artist");
  const [activePage, setActivePage] = useState(initialRoute.page);
  const [selectedArtist, setSelectedArtist] = useState(initialRoute.artist);
  const [selectedVenue, setSelectedVenue] = useState(initialRoute.venue);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statsMenuOpen, setStatsMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [addInitial, setAddInitial] = useState(null);
  const [activeSuggestionId, setActiveSuggestionId] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, target: null });
  const [setlistTarget, setSetlistTarget] = useState(null);
  const [calendarTarget, setCalendarTarget] = useState(null);
  const [concertItems, setConcertItems] = useState(fallbackConcerts);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(fallbackDismissedSuggestions);
  const [appProfile, setAppProfile] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [concertInvitations, setConcertInvitations] = useState([]);
  const [pendingSuggestionReviews, setPendingSuggestionReviews] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("adn_pending_suggestion_reviews") || "{}");
      return stored && !Array.isArray(stored) && typeof stored === "object" ? stored : {};
    }
    catch { return {}; }
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [passwordModalMode, setPasswordModalMode] = useState(null);
  const dialogHistoryOpenRef = useRef(false);
  const closingDialogWithBackRef = useRef(false);
  const passwordModalModeRef = useRef(null);
  passwordModalModeRef.current = passwordModalMode;
  const anyDialogOpen = modalOpen || Boolean(editTarget) || Boolean(setlistTarget) || Boolean(calendarTarget) || Boolean(confirmDelete) || Boolean(passwordModalMode);
  const currentUserId = session?.user?.id || "";
  const currentEmail = session?.user?.email?.toLowerCase() || "";
  const currentUserName = appProfile?.displayName || "";
  const isAdmin = !supabaseEnabled || appProfile?.role === "admin";
  const canEdit = !supabaseEnabled || Boolean(appProfile);

  const isNext = canEdit && activePage === "next";
  const isStats = activePage === "stats";
  const isTimeline = activePage === "timeline";
  const isYearReview = activePage === "year-review";
  const isFriends = activePage === "friends";

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (activePage === "stats" || activePage === "year-review") setStatsMenuOpen(true);
  }, [activePage]);
  const historyConcerts = useMemo(
    () => concertItems.filter((concert) => concert.bought && isPastConcert(concert)),
    [concertItems]
  );
  const historyItems = useMemo(() => groupHistoryFromJson(historyConcerts), [historyConcerts]);
  const nextItems = useMemo(
    () => concertItems.filter((concert) => !isPastConcert(concert)),
    [concertItems]
  );
  const venueShows = selectedVenue
    ? historyItems.flatMap(({ shows }) => shows.map((show) => parseShow(show, "history"))).filter(({ venue }) => normalize(venue) === normalize(selectedVenue))
    : [];
  const isVenueDetail = activePage === "venue" && venueShows.length > 0;
  const artistDetail = selectedArtist
    ? historyItems.find((item) => normalize(item.artist) === normalize(selectedArtist))
    : null;
  const isArtistDetail = activePage === "artist" && Boolean(artistDetail);
  const artistUpcoming = artistDetail
    ? nextItems.filter((item) => normalize(item.artist) === normalize(artistDetail.artist))
    : [];
  const mode = isNext ? "next" : "history";
  const title = isVenueDetail ? selectedVenue : isArtistDetail ? artistDetail.artist : isFriends ? "Friends" : isYearReview ? "Year in Review" : isTimeline ? "Timeline" : isStats ? "Archive Overview" : isNext ? "Concert Calendar" : "Concert Archive";
  const description = isVenueDetail
    ? `${venueShows.length} archived ${venueShows.length === 1 ? "visit" : "visits"} to this venue.`
    : isArtistDetail
    ? `${artistDetail.shows.length} live ${artistDetail.shows.length === 1 ? "performance" : "performances"} in the archive.`
    : isYearReview
    ? "The artists, venues and moments that defined each year."
    : isTimeline
    ? "Every concert, year by year."
    : isFriends
    ? "Find friends, manage requests and review concert invitations."
    : isStats
    ? "A snapshot of your concert history at a glance."
    : isNext ? "Past concerts, upcoming shows and possibilities in one calendar." : "A searchable lifetime lineup of artists, venues and dates.";

  const filtered = useMemo(() => {
    const visibleItems = isNext ? nextItems : historyItems;
    return sortConcerts(filterConcerts(visibleItems, query), sortMode, mode);
  }, [historyItems, nextItems, query, sortMode, mode, isNext]);

  const calendarItems = useMemo(() => {
    const visibleConcerts = concertItems
      .filter((concert) => concert.bought || !isPastConcert(concert))
      .map((concert) => ({ ...concert, source: isPastConcert(concert) ? "history" : "next" }));
    return filterConcerts(visibleConcerts, query);
  }, [concertItems, query]);

  const availableSuggestions = useMemo(() => suggestionsData.suggestions.filter((suggestion) =>
    !dismissedSuggestions.includes(suggestionDecisionKey(suggestion))
      && !concertItems.some((concert) => normalize(concert.artist) === normalize(suggestion.artist) && concert.date === suggestion.date)
  ), [concertItems, dismissedSuggestions]);

  const artistSuggestions = useMemo(() => {
    const set = new Set();
    historyItems.forEach((i) => set.add(i.artist));
    nextItems.forEach((i) => set.add(i.artist));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [historyItems, nextItems]);

  const venueSuggestions = useMemo(() => {
    const set = new Set();
    historyItems.forEach(({ shows }) => {
      shows.forEach((show) => {
        const { venue } = parseShow(show, "history");
        if (venue && venue !== "Date confirmed") set.add(venue);
      });
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [historyItems]);

  useEffect(() => {
    localStorage.setItem("adn_pending_suggestion_reviews", JSON.stringify(pendingSuggestionReviews));
  }, [pendingSuggestionReviews]);

  useEffect(() => {
    if (!supabaseEnabled) return undefined;
    const recoveryRequested = new URLSearchParams(window.location.search).get("password-recovery") === "1";
    function showLoginRoute() {
      window.history.replaceState({ adnRoute: true, canGoBack: false }, "", "/");
      setActivePage("history");
      setSelectedArtist(null);
      setSelectedVenue(null);
      setQuery("");
      setSortMode("artist");
      setSidebarOpen(false);
    }
    function openRecovery(sessionToUse) {
      if (!recoveryRequested || !sessionToUse) return;
      setPasswordModalMode("recovery");
      window.history.replaceState({ adnRoute: true, canGoBack: false }, "", "/history");
      setActivePage("history");
      setSelectedArtist(null);
      setSelectedVenue(null);
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        openRecovery(data.session);
        if (!recoveryRequested && window.location.pathname === "/" && !window.location.hash) {
          window.history.replaceState({ adnRoute: true, canGoBack: false }, "", "/history");
        }
      }
      else if (!recoveryRequested) showLoginRoute();
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        setPasswordModalMode("recovery");
        window.history.replaceState({ adnRoute: true, canGoBack: false }, "", "/history");
        setActivePage("history");
        setSelectedArtist(null);
        setSelectedVenue(null);
      }
      setAuthReady(true);
      if (!nextSession) {
        setDataReady(false);
        if (!recoveryRequested || event === "SIGNED_OUT") showLoginRoute();
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabaseEnabled || !currentUserId) return;
    let cancelled = false;
    setDataReady(false);
    setDataLoadError("");
    (async () => {
      try {
        const archive = await loadConcertData();
        if (!cancelled) {
          setConcertItems(archive.concerts || []);
          setDismissedSuggestions(archive.dismissedSuggestions || []);
          setAppProfile(archive.profile || null);
          setFriends(archive.friends || []);
          setFriendRequests(archive.friendRequests || []);
          setConcertInvitations(archive.concertInvitations || []);
        }
      } catch (error) {
        if (!cancelled) setDataLoadError(error.message || "Could not load the archive");
      } finally {
        if (!cancelled) setDataReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId, currentEmail]);

  useEffect(() => {
    if (supabaseEnabled && (!authReady || !currentUserId || !dataReady)) return;
    if (canEdit || activePage !== "next") return;
    window.history.replaceState({ adnRoute: true, canGoBack: false }, "", routeToPath({ page: "history" }));
    setActivePage("history");
  }, [activePage, canEdit, authReady, currentUserId, dataReady]);

  useEffect(() => {
    const initial = readRouteFromLocation();
    const isPasswordRecovery = new URLSearchParams(window.location.search).get("password-recovery") === "1";
    const isLoggedOutRoot = window.location.pathname === "/" && !window.location.hash;
    if (!isPasswordRecovery && !isLoggedOutRoot) window.history.replaceState({ adnRoute: true, canGoBack: false }, "", routeToPath(initial));

    function restoreRoute() {
      if (dialogHistoryOpenRef.current || closingDialogWithBackRef.current) {
        dialogHistoryOpenRef.current = false;
        closingDialogWithBackRef.current = false;
        setModalOpen(false);
        setAddInitial(null);
        setActiveSuggestionId(null);
        setEditTarget(null);
        setSetlistTarget(null);
        setCalendarTarget(null);
        setConfirmDelete(null);
        if (passwordModalModeRef.current === "recovery") void supabase.auth.signOut();
        setPasswordModalMode(null);
        return;
      }
      const route = readRouteFromLocation();
      setActivePage(route.page);
      setSelectedArtist(route.artist);
      setSelectedVenue(route.venue);
      setQuery("");
      setSortMode("artist");
      setSidebarOpen(false);
    }

    window.addEventListener("popstate", restoreRoute);
    return () => {
      window.removeEventListener("popstate", restoreRoute);
    };
  }, []);

  useEffect(() => {
    if (anyDialogOpen && !dialogHistoryOpenRef.current) {
      window.history.pushState({ ...window.history.state, adnModal: true }, "", window.location.href);
      dialogHistoryOpenRef.current = true;
      return;
    }
    if (!anyDialogOpen && dialogHistoryOpenRef.current) {
      dialogHistoryOpenRef.current = false;
      if (window.history.state?.adnModal) {
        closingDialogWithBackRef.current = true;
        window.history.back();
      }
    }
  }, [anyDialogOpen]);

  function closePasswordModal() {
    if (passwordModalMode === "recovery") void supabase.auth.signOut();
    setPasswordModalMode(null);
  }

  const passwordModal = <ChangePasswordModal mode={passwordModalMode} email={currentEmail} onClose={closePasswordModal} />;

  if (!authReady) return <>{passwordModal}<div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">Loading…</div></>;
  if (!supabaseEnabled && !IS_LOCAL) return <>{passwordModal}<div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-center text-red-300">Supabase is not configured for this deployment.</div></>;
  if (passwordModalMode === "recovery") return <>{passwordModal}<div className="min-h-screen bg-zinc-950" aria-hidden="true" /></>;
  if (supabaseEnabled && !session) return <>{passwordModal}<LoginGate onSignedIn={() => navigateToArchive({ replace: true })} /></>;
  if (!dataReady) return <>{passwordModal}<div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">Loading your concert archive…</div></>;
  if (dataLoadError) return <>{passwordModal}<div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-center text-red-300">{dataLoadError}</div></>;

  function navigateTo(route) {
    window.history.pushState({ adnRoute: true, canGoBack: true }, "", routeToPath(route));
    setActivePage(route.page);
    setSelectedArtist(route.artist || null);
    setSelectedVenue(route.venue || null);
    setQuery("");
    setSortMode("artist");
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigateToArchive({ replace = false } = {}) {
    const historyRoute = { page: "history", artist: null, venue: null };
    const updateHistory = replace ? window.history.replaceState.bind(window.history) : window.history.pushState.bind(window.history);
    updateHistory({ adnRoute: true, canGoBack: !replace }, "", routeToPath(historyRoute));
    setActivePage("history");
    setSelectedArtist(null);
    setSelectedVenue(null);
    setQuery("");
    setSortMode("artist");
    setSidebarOpen(false);
    setStatsMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  function changePage(page) { navigateTo({ page: !canEdit && page === "next" ? "history" : page, artist: null, venue: null }); }
  function openArtistDetail(artist) {
    navigateTo({ page: "artist", artist, venue: null });
  }
  function openVenueDetail(venue) {
    if (!venue || venue === "Date confirmed") return;
    navigateTo({ page: "venue", artist: null, venue });
  }
  function goBackFromDetail() {
    if (window.history.state?.canGoBack) window.history.back();
    else changePage("history");
  }
  function openConcertDetails(target) {
    const storedConcert = concertItems.find((concert) => concertMatches(concert, target));
    setSetlistTarget({
      ...target,
      concertId: storedConcert?.concertId || target.concertId,
      canEditEvent: storedConcert?.canEditEvent ?? target.canEditEvent,
      mode: isPastConcert(storedConcert || target) ? "history" : "next",
      bought: storedConcert?.bought ?? target.bought,
      attendees: storedConcert?.attendees || [],
      attendeeUsers: storedConcert?.attendeeUsers || [],
      guestAttendees: storedConcert?.guestAttendees || [],
      setlistId: storedConcert?.setlistId || target.setlistId || "",
      ticketUrl: storedConcert?.ticketUrl || target.ticketUrl || "",
    });
  }

  function concertDataPayload(concerts, dismissed = dismissedSuggestions) {
    return { concerts, dismissedSuggestions: [...new Set(dismissed)] };
  }

  function applyAppData(archive) {
    setConcertItems(archive.concerts || []);
    setDismissedSuggestions(archive.dismissedSuggestions || []);
    setAppProfile(archive.profile || null);
    setFriends(archive.friends || []);
    setFriendRequests(archive.friendRequests || []);
    setConcertInvitations(archive.concertInvitations || []);
  }

  async function reloadAppData() {
    if (!supabaseEnabled) return;
    applyAppData(await loadConcertData());
  }

  async function handleAddConcert(data) {
    const pastConcert = isPastConcert({ date: data.date });
    const newConcert = {
      concertId: data.concertId || null,
      artist: uppercaseConcertLabel(data.artist.trim()),
      venue: uppercaseConcertLabel(data.venue?.trim()),
      date: data.date.trim(),
      bought: pastConcert ? true : Boolean(data.bought),
      attendeeUserIds: data.attendeeUserIds || [],
      guestAttendees: data.guestAttendees || [],
      ...(data.guestAttendees?.length ? { attendees: data.guestAttendees } : {}),
      ...(!pastConcert && normalizeTicketUrl(data.ticketUrl) ? { ticketUrl: normalizeTicketUrl(data.ticketUrl) } : {}),
    };
    if (activeSuggestionId) {
      const suggestion = suggestionsData.suggestions.find(({ id }) => id === activeSuggestionId);
      setPendingSuggestionReviews((current) => ({
        ...current,
        [activeSuggestionId]: {
          decision: "interested",
          concert: newConcert,
          key: suggestionDecisionKey(suggestion || newConcert),
        },
      }));
      setSaveError("");
      setModalOpen(false);
      setAddInitial(null);
      setActiveSuggestionId(null);
      return;
    }

    setIsSaving(true); setSaveError("");
    try {
      if (supabaseEnabled) {
        await upsertMyConcert(newConcert);
        await reloadAppData();
      } else {
        const updatedConcerts = [...concertItems, newConcert];
        await saveConcertData(concertDataPayload(updatedConcerts), `Add concert: ${data.artist}${data.venue ? " — " + data.venue : ""} (${data.date})`);
        setConcertItems(updatedConcerts);
      }
      setModalOpen(false);
      setAddInitial(null);
    } catch (e) { setSaveError(e.message || "Could not save concert"); }
    finally { setIsSaving(false); }
  }

  async function handleEditConcert(data) {
    if (!editTarget) return;
    setIsSaving(true); setSaveError("");
    try {
      if (supabaseEnabled) {
        await upsertMyConcert({ ...data, concertId: editTarget.concertId, bought: editTarget.mode === "history" ? true : Boolean(data.bought) });
        await reloadAppData();
      } else {
        const updatedConcerts = updateConcert(concertItems, editTarget, data);
        await saveConcertData(concertDataPayload(updatedConcerts), `Edit concert: ${data.artist}${data.venue ? " — " + data.venue : ""} (${data.date})`);
        setConcertItems(updatedConcerts);
      }
      setEditTarget(null);
    } catch (e) { setSaveError(e.message || "Could not save changes"); }
    finally { setIsSaving(false); }
  }

  function openContextMenu(e, target) { e.preventDefault(); if (isSaving || !canEdit) return; setContextMenu({ open: true, x: e.clientX, y: e.clientY, target }); }
  function openContextMenuAt(x, y, target) { if (isSaving || !canEdit) return; setContextMenu({ open: true, x, y, target }); }
  function closeContextMenu() { setContextMenu({ open: false, x: 0, y: 0, target: null }); }

  function startEditFromContext() {
    const t = contextMenu.target; closeContextMenu(); if (!t) return;
    if (t.mode === "next") setEditTarget({ ...t, mode: "next" });
    else setEditTarget({ ...t, mode: "history" });
  }

  function deleteFromContext() {
    const t = contextMenu.target; closeContextMenu(); if (!t) return;
    setConfirmDelete(t);
  }

  async function saveSuggestionReviews() {
    const reviews = Object.entries(pendingSuggestionReviews);
    if (!reviews.length) return;
    setIsSaving(true); setSaveError("");
    try {
      const interestedConcerts = reviews
        .filter(([, review]) => review.decision === "interested" && review.concert)
        .map(([, review]) => review.concert)
        .filter((candidate) => !concertItems.some((concert) => concertMatches(concert, candidate)));
      const updatedDismissed = new Set(dismissedSuggestions);
      reviews.forEach(([, review]) => {
        if (!review.key) return;
        if (review.decision === "not-interested") updatedDismissed.add(review.key);
        else updatedDismissed.delete(review.key);
      });
      if (supabaseEnabled) {
        for (const concert of interestedConcerts) await upsertMyConcert(concert);
        await saveDismissedSuggestions([...updatedDismissed]);
        await reloadAppData();
      } else {
        const updatedConcerts = [...concertItems, ...interestedConcerts];
        await saveConcertData(concertDataPayload(updatedConcerts, [...updatedDismissed]), `Review ${reviews.length} concert ${reviews.length === 1 ? "suggestion" : "suggestions"}`);
        setConcertItems(updatedConcerts);
        setDismissedSuggestions([...updatedDismissed]);
      }
      setPendingSuggestionReviews({});
    } catch (error) {
      setSaveError(error.message || "Could not save suggestion decisions");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSetlistIdDiscovered(target, discoveredId) {
    const { artist, venue, date } = target;
    let updated = false;
    const updatedConcerts = concertItems.map((concert) => {
      if (updated || !concertMatches(concert, { artist, venue, date })) return concert;
      updated = true;
      return { ...concert, setlistId: discoveredId };
    });
    setConcertItems(updatedConcerts);
    // Save silently in the background — don't block or show saving indicator
    try {
      if (supabaseEnabled && target.concertId) await saveSetlistId(target.concertId, discoveredId);
      else await saveConcertData(concertDataPayload(updatedConcerts), `Auto-save setlist ID for ${artist}`);
    } catch (_) {
      // Silent fail — the ID is already updated in local state, will be persisted next manual save
    }
  }

  async function runSocialAction(action) {
    await action();
    await reloadAppData();
  }

  return (
    <>
    {passwordModal}
    <main className="min-h-screen bg-zinc-950 text-zinc-100 md:flex">
      {/* Desktop-only fixed Menu button */}
      <button onClick={() => setSidebarOpen(true)} className="menu-button-desktop fixed left-4 top-4 z-40 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-100 shadow-2xl transition hover:border-zinc-500" aria-label="Open menu" aria-expanded={sidebarOpen} aria-controls="main-navigation"><i className="fa-solid fa-bars mr-2 text-xs" aria-hidden="true" />Menu</button>
      {/* Touch-device Menu starts at the top of the page and scrolls away with it */}
      <button onClick={() => setSidebarOpen(true)} className="menu-button-touch absolute left-4 top-6 z-40 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-bold text-zinc-100 shadow-2xl transition hover:border-zinc-500" aria-label="Open menu" aria-expanded={sidebarOpen} aria-controls="main-navigation"><i className="fa-solid fa-bars mr-2 text-xs" aria-hidden="true" />Menu</button>

      {sidebarOpen && <button className="fixed inset-0 z-40 bg-black/60" onClick={() => setSidebarOpen(false)} aria-label="Close menu overlay" />}

      <aside id="main-navigation" aria-label="Main navigation" aria-hidden={!sidebarOpen} inert={!sidebarOpen ? "" : undefined} className={`fixed inset-y-0 left-0 z-50 w-[min(20rem,88vw)] border-r border-zinc-800 bg-zinc-950/95 backdrop-blur-xl transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-900 pb-5">
            <button onClick={() => changePage("history")} className="min-w-0 text-left" aria-label="Go to Concert history">
              <span className="block truncate text-lg font-black uppercase tracking-tight text-zinc-100">A Deafening Noise</span>
              <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">Concert archive</span>
            </button>
            <button onClick={() => setSidebarOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100" aria-label="Close menu"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
          </div>

          {canEdit && <button onClick={() => { setSidebarOpen(false); setSaveError(""); setActiveSuggestionId(null); setAddInitial(null); setModalOpen(true); }} className="my-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3.5 text-sm font-black text-zinc-950 shadow-lg shadow-black/20 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100"><i className="fa-solid fa-plus text-xs" aria-hidden="true" />Add concert</button>}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Explore</p>
            <nav className="space-y-1 text-sm">
              <button onClick={() => changePage("history")} aria-current={["history", "artist", "timeline", "venue"].includes(activePage) ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold transition ${["history", "artist", "timeline", "venue"].includes(activePage) ? "bg-zinc-900 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-100"}`}><i className="fa-solid fa-layer-group w-5 text-center text-zinc-500" aria-hidden="true" /><span>Concert history</span></button>
              {canEdit && <button onClick={() => changePage("next")} aria-current={activePage === "next" ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold transition ${activePage === "next" ? "bg-zinc-900 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-100"}`}><i className="fa-solid fa-calendar-days w-5 text-center text-zinc-500" aria-hidden="true" /><span>Concert calendar</span></button>}
              <button onClick={() => changePage("friends")} aria-current={activePage === "friends" ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold transition ${activePage === "friends" ? "bg-zinc-900 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-100"}`}><i className="fa-solid fa-user-group w-5 text-center text-zinc-500" aria-hidden="true" /><span>Friends</span>{friendRequests.filter((request) => request.direction === "incoming").length + concertInvitations.length > 0 && <span className="ml-auto min-w-6 rounded-full bg-amber-900 px-2 py-0.5 text-center text-[10px] font-black text-amber-100">{friendRequests.filter((request) => request.direction === "incoming").length + concertInvitations.length}</span>}</button>
              <div className={`rounded-xl ${activePage === "stats" || activePage === "year-review" ? "bg-zinc-900" : ""}`}>
                <button onClick={() => setStatsMenuOpen((open) => !open)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold transition hover:bg-zinc-900/70 hover:text-zinc-100 ${activePage === "stats" || activePage === "year-review" ? "text-zinc-100" : "text-zinc-400"}`} aria-expanded={statsMenuOpen} aria-controls="stats-navigation"><i className="fa-solid fa-chart-simple w-5 text-center text-zinc-500" aria-hidden="true" /><span>Stats</span><i className={`fa-solid fa-chevron-down ml-auto text-[10px] text-zinc-600 transition-transform ${statsMenuOpen ? "rotate-180" : ""}`} aria-hidden="true" /></button>
                {statsMenuOpen && <div id="stats-navigation" className="mb-2 ml-5 border-l border-zinc-800 pl-3 pr-2"><button onClick={() => changePage("stats")} aria-current={activePage === "stats" ? "page" : undefined} className={`block w-full rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition hover:bg-zinc-800 hover:text-zinc-100 ${activePage === "stats" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500"}`}>Archive overview</button><button onClick={() => changePage("year-review")} aria-current={activePage === "year-review" ? "page" : undefined} className={`mt-1 block w-full rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition hover:bg-zinc-800 hover:text-zinc-100 ${activePage === "year-review" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500"}`}>Year in review</button></div>}
              </div>
            </nav>
          </div>

          {currentUserName && <div className="mt-4 border-t border-zinc-900 pt-4"><div className="flex items-center gap-3 rounded-2xl bg-zinc-900/60 p-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-sm font-black text-zinc-200" aria-hidden="true">{currentUserName.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-bold text-zinc-200">{currentUserName}</span>{isAdmin && <span className="rounded-full border border-zinc-700 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-500">Admin</span>}</div><span className="block truncate text-[11px] text-zinc-600">{currentEmail}</span></div></div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setSidebarOpen(false); setPasswordModalMode("change"); }} className="rounded-xl px-3 py-2 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"><i className="fa-solid fa-key mr-2" aria-hidden="true" />Password</button><button type="button" onClick={() => supabase.auth.signOut()} className="rounded-xl px-3 py-2 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-900 hover:text-red-300"><i className="fa-solid fa-arrow-right-from-bracket mr-2" aria-hidden="true" />Sign out</button></div></div>}
        </div>
      </aside>

      <section className="mx-auto w-full max-w-7xl px-4 pt-6 pb-8 md:px-8 md:py-14 overflow-x-hidden">
        <header className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.45em] text-zinc-400">A Deafening Noise</p>
          <h1 className="break-words text-5xl font-black uppercase tracking-tight md:text-8xl">{title}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-zinc-400 md:text-lg">{description}</p>
        </header>

        {isVenueDetail ? (
          <VenueDetailPage
            venue={selectedVenue}
            historyItems={historyItems}
            onBack={goBackFromDetail}
            onOpenArtist={openArtistDetail}
            onOpenSetlist={openConcertDetails}
          />
        ) : isArtistDetail ? (
          <ArtistDetailPage
            item={artistDetail}
            upcoming={artistUpcoming}
            onBack={goBackFromDetail}
            onOpenSetlist={openConcertDetails}
            onOpenVenue={openVenueDetail}
          />
        ) : isTimeline ? (
          <ConcertTimelinePage
            historyItems={historyItems}
            onBack={() => changePage("history")}
            onOpenArtist={openArtistDetail}
            onOpenSetlist={openConcertDetails}
            onOpenVenue={openVenueDetail}
          />
        ) : isYearReview ? (
          <YearInReviewPage
            historyItems={historyItems}
            onOpenArtist={openArtistDetail}
            onOpenSetlist={openConcertDetails}
            onOpenVenue={openVenueDetail}
          />
        ) : isFriends ? <FriendsPage friends={friends} requests={friendRequests} invitations={concertInvitations} onSearch={searchProfiles} onSendRequest={(userId) => runSocialAction(() => sendFriendRequest(userId))} onRespondRequest={(requestId, accept) => runSocialAction(() => respondFriendRequest(requestId, accept))} onRemoveFriend={(userId) => runSocialAction(() => removeFriend(userId))} onRespondInvitation={(concertId, accept, bought) => runSocialAction(() => respondConcertInvitation(concertId, accept, bought))} /> : isStats ? <StatsPage historyItems={historyItems} onOpenVenue={openVenueDetail} /> : (
          <>
            <div className="sticky top-0 z-10 mb-8 border-y border-zinc-800 bg-zinc-950/90 py-3 backdrop-blur">
              <div className="mx-auto max-w-6xl space-y-2 px-4 md:space-y-0 md:px-0">

                {/* Mobile layout */}
                <div className="flex items-center gap-2 md:hidden">
                  <div className="flex flex-1 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2.5 min-w-0">
                    <Icon type="search" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="w-full min-w-0 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500" aria-label="Search concerts" />
                  </div>
                  {isNext && <CalendarExportMenu items={nextItems} compact />}
                </div>
                {!isNext && (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:hidden">
                    <ConcertSortMenu value={sortMode} onChange={setSortMode} compact />
                    <button onClick={() => changePage("timeline")} className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 transition hover:border-zinc-500" aria-label="Open concert timeline" title="Timeline"><i className="fa-solid fa-timeline" aria-hidden="true" /></button>
                  </div>
                )}

                {/* Desktop layout */}
                <div className={`hidden md:grid gap-3 ${isNext ? "md:grid-cols-[1fr_180px]" : "md:grid-cols-[1fr_280px]"}`}>
                  <div className="flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 shadow-2xl">
                    <Icon type="search" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search artist, venue, festival, city or date" className="w-full bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500" aria-label="Search concerts" />
                  </div>
                  {!isNext && (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <ConcertSortMenu value={sortMode} onChange={setSortMode} />
                      <button onClick={() => changePage("timeline")} className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 shadow-2xl transition hover:border-zinc-500" aria-label="Open concert timeline" title="Timeline"><i className="fa-solid fa-timeline" aria-hidden="true" /></button>
                    </div>
                  )}
                  {isNext && <CalendarExportMenu items={nextItems} />}
                </div>
              </div>
            </div>

            {isNext ? (
              <>
                <NextConcertCalendar
                  items={calendarItems}
                  onOpen={(concert) => setCalendarTarget({ ...concert, mode: concert.source === "history" ? "history" : "next" })}
                  onContextMenu={(event, concert) => openContextMenu(event, { ...concert, mode: concert.source === "history" ? "history" : "next" })}
                  onContextMenuAt={(x, y, concert) => openContextMenuAt(x, y, { ...concert, mode: concert.source === "history" ? "history" : "next" })}
                />
                {isAdmin && <ConcertSuggestions
                  suggestions={availableSuggestions}
                  reviews={pendingSuggestionReviews}
                  onInterested={(suggestion) => {
                    const pendingConcert = pendingSuggestionReviews[suggestion.id]?.concert;
                    setSaveError("");
                    setActiveSuggestionId(suggestion.id);
                    setAddInitial(pendingConcert || { artist: suggestion.artist, venue: suggestion.venue, date: suggestion.date, bought: false, ticketUrl: suggestion.sourceUrl || "" });
                    setModalOpen(true);
                  }}
                  onNotInterested={(suggestion) => {
                    setSaveError("");
                    setPendingSuggestionReviews((current) => ({
                      ...current,
                      [suggestion.id]: { decision: "not-interested", key: suggestionDecisionKey(suggestion) },
                    }));
                  }}
                  onSave={saveSuggestionReviews}
                  isSaving={isSaving}
                  saveError={saveError}
                />}
              </>
            ) : (
            <section className="grid w-full gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => (
                <article key={item.artist + (isNext ? item.date : "")} className="group rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl transition hover:-translate-y-1 hover:border-zinc-500 w-full min-w-0">
                  <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4">
                    {!isNext ? (
                      <button onClick={() => openArtistDetail(item.artist)} className="min-w-0 text-left text-xl font-black uppercase leading-none tracking-tight transition hover:text-white hover:underline hover:decoration-zinc-600 hover:underline-offset-4 md:text-3xl">
                        {item.artist}
                      </button>
                    ) : (
                      <h2 className="text-xl font-black uppercase leading-none tracking-tight md:text-3xl">{item.artist}</h2>
                    )}
                    {isNext ? (
                      item.bought ? <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-900/70 bg-emerald-950/30 px-3 py-1 text-xs font-bold text-emerald-300"><i className="fa-solid fa-check text-[9px]" aria-hidden="true" />Bought</span> : <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-900/60 bg-amber-950/20 px-3 py-1 text-xs font-bold text-amber-300"><i className="fa-solid fa-clock text-[9px]" aria-hidden="true" />Not bought</span>
                    ) : (
                      <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-400">{item.shows.length}</span>
                    )}
                  </div>
                  <div className="mt-4 space-y-3">
                    {(isNext ? [item.date] : [...item.shows].sort((a, b) => parseDate(parseShow(b, mode).date) - parseDate(parseShow(a, mode).date))).map((show) => {
                      const { venue, date, setlistId } = parseShow(show, mode);
                      const target = isNext
                        ? { mode: "next", artist: item.artist, date: item.date, bought: item.bought, venue: item.venue || "" }
                        : { mode: "history", artist: item.artist, show, venue, date, setlistId };
                      const storedConcert = concertItems.find((concert) => concertMatches(concert, target));
                      const concertTarget = { ...target, concertId: storedConcert?.concertId, canEditEvent: storedConcert?.canEditEvent, attendees: storedConcert?.attendees || [], attendeeUsers: storedConcert?.attendeeUsers || [], guestAttendees: storedConcert?.guestAttendees || [], setlistId: storedConcert?.setlistId || setlistId, ticketUrl: storedConcert?.ticketUrl || "" };
                      let touchTimer = null, touchMoved = false, longPressed = false;
                      return (
                        <div
                          key={`${item.artist}-${show}`}
                          className="select-none rounded-2xl bg-zinc-950 p-4 transition hover:bg-zinc-900"
                          onClick={() => { if (!longPressed) openConcertDetails(concertTarget); }}
                          onContextMenu={(e) => openContextMenu(e, concertTarget)}
                          onTouchStart={(e) => { touchMoved = false; longPressed = false; const t = e.touches[0]; const sx = t.clientX, sy = t.clientY; touchTimer = setTimeout(() => { if (!touchMoved) { longPressed = true; if (navigator.vibrate) navigator.vibrate(20); openContextMenuAt(sx, sy, concertTarget); } }, 500); }}
                          onTouchMove={() => { touchMoved = true; if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } }}
                          onTouchEnd={() => { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } setTimeout(() => { longPressed = false; }, 400); }}
                          onTouchCancel={() => { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } }}
                          style={{ WebkitTouchCallout: "none" }}
                        >
                          <div className="space-y-2">
                            {!isNext && <div className="flex gap-2 text-sm font-semibold text-zinc-100"><Icon type="map" /><button onClick={(event) => { event.stopPropagation(); openVenueDetail(venue); }} className="truncate text-left hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{venue}</button></div>}
                            {isNext && item.venue && <div className="flex gap-2 text-sm font-semibold text-zinc-100"><Icon type="map" /><span className="truncate">{item.venue}</span></div>}
                            <div className="flex gap-2 text-sm text-zinc-400"><Icon type="calendar" /><span>{date}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </section>
            )}
            {filtered.length === 0 && <div className="mt-12"><EmptyState icon="fa-magnifying-glass" title="No concerts found" description="Try another artist, venue, city or date." /></div>}
          </>
        )}
      </section>

      {isSaving && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[80] flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900/95 px-5 py-3 shadow-2xl backdrop-blur">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-100" />
          <span className="text-sm font-bold text-zinc-100">Saving…</span>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-concert-title" className="w-full max-w-sm rounded-3xl border border-red-950 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-red-900/60 bg-red-950/30 text-red-300"><i className="fa-solid fa-trash-can" aria-hidden="true" /></div>
            <h2 id="delete-concert-title" className="mb-2 text-xl font-black uppercase tracking-tight">Delete concert?</h2>
            <p className="mb-6 text-sm leading-relaxed text-zinc-400"><span className="font-semibold text-zinc-100">{confirmDelete.artist}</span>{confirmDelete.venue ? ` · ${confirmDelete.venue}` : ""}<span className="block text-zinc-600">{confirmDelete.date}</span>This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-2xl border border-zinc-700 px-5 py-3 font-black text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-900">Cancel</button>
              <button onClick={async () => {
                const t = confirmDelete; setConfirmDelete(null); setIsSaving(true);
                try {
                  if (supabaseEnabled && t.concertId) {
                    await deleteMyConcert(t.concertId);
                    await reloadAppData();
                  } else {
                    const updatedConcerts = removeConcert(concertItems, t);
                    await saveConcertData(concertDataPayload(updatedConcerts), `Delete concert: ${t.artist}${t.venue ? " — " + t.venue : ""} (${t.date})`);
                    setConcertItems(updatedConcerts);
                  }
                } catch (e) { setSaveError(e.message || "Could not delete"); }
                finally { setIsSaving(false); }
              }} className="flex-1 rounded-2xl bg-red-200 px-5 py-3 font-black text-red-950 transition hover:bg-red-100">Delete</button>
            </div>
          </div>
        </div>
      )}

      {canEdit && <AddConcertModal isOpen={modalOpen} initial={addInitial} stagingSuggestion={Boolean(activeSuggestionId)} onClose={() => { setModalOpen(false); setAddInitial(null); setActiveSuggestionId(null); }} onSave={handleAddConcert} isSaving={isSaving} saveError={saveError} friends={friends} onSearchCatalog={supabaseEnabled ? searchConcertCatalog : null} />}
      {canEdit && <EditConcertModal isOpen={!!editTarget} mode={editTarget?.mode || mode} initial={editTarget} onClose={() => setEditTarget(null)} onSave={handleEditConcert} isSaving={isSaving} saveError={saveError} artistSuggestions={artistSuggestions} venueSuggestions={venueSuggestions} friends={friends} />}
      {canEdit && <ContextMenu open={contextMenu.open} x={contextMenu.x} y={contextMenu.y} onEdit={startEditFromContext} onDelete={deleteFromContext} onClose={closeContextMenu} />}
      <SetlistModal
        target={setlistTarget}
        onClose={() => setSetlistTarget(null)}
        onEdit={canEdit ? (target) => { setSetlistTarget(null); setEditTarget(target); } : null}
        onIdDiscovered={canEdit ? handleSetlistIdDiscovered : null}
      />
      <CalendarConcertModal
        target={calendarTarget}
        onClose={() => setCalendarTarget(null)}
        onEdit={canEdit ? (target) => { setCalendarTarget(null); setEditTarget(target); } : null}
      />
    </main>
    </>
  );
}
