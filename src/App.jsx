import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import whatsappIcon from "@fortawesome/fontawesome-free/svgs/brands/whatsapp.svg";
import concertsData from "../data/concerts.json";
import suggestionsData from "../data/suggestions.json";
import {
  deleteMyAccount,
  deleteMyConcert,
  exportMyData,
  leaveSharedConcert,
  loadConcertData,
  markNotificationsRead,
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
  updateMyProfile,
} from "./lib/supabase";
import { clearAppCache, readAppCache, writeAppCache } from "./lib/app-cache";
import { readRouteFromLocation, routeToPath } from "./lib/routes";
import { getMostRecentShowDate, normalize, parseDate, parseShow } from "./lib/concerts";
import { EmptyState, PanelHeading, UserAvatar } from "./components/SharedUi";
import { restorePageScroll, useDialogFocus, usePageScrollLock } from "./hooks/useUi";

const ProfilePage = React.lazy(() => import("./pages/AccountPages").then(({ ProfilePage: Page }) => ({ default: Page })));
const ActivityPage = React.lazy(() => import("./pages/AccountPages").then(({ ActivityPage: Page }) => ({ default: Page })));
const AdminPage = React.lazy(() => import("./pages/AccountPages").then(({ AdminPage: Page }) => ({ default: Page })));
const HomePage = React.lazy(() => import("./pages/HomePage"));
const FriendsPage = React.lazy(() => import("./pages/FriendsPage"));
const SuggestionsPage = React.lazy(() => import("./pages/SuggestionsPage"));
const StatsPage = React.lazy(() => import("./pages/StatsPage"));
const YearInReviewPage = React.lazy(() => import("./pages/StatsPage").then(({ YearInReviewPage: Page }) => ({ default: Page })));
const ArtistDetailPage = React.lazy(() => import("./pages/ArchiveDetailPages").then(({ ArtistDetailPage: Page }) => ({ default: Page })));
const VenueDetailPage = React.lazy(() => import("./pages/ArchiveDetailPages").then(({ VenueDetailPage: Page }) => ({ default: Page })));
const ConcertTimelinePage = React.lazy(() => import("./pages/ArchiveDetailPages").then(({ ConcertTimelinePage: Page }) => ({ default: Page })));

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

const IS_LOCAL = import.meta.env.DEV || import.meta.env.VITE_QUALITY_AUDIT === "true";
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

function uppercaseConcertLabel(value) {
  return String(value || "").toLocaleUpperCase();
}

function concertLocation({ city, country } = {}) {
  const countryName = ({ ES: "Spain", CH: "Switzerland", FR: "France", GB: "United Kingdom", PT: "Portugal" })[String(country || "").toUpperCase()] || country;
  return [city, countryName].filter(Boolean).join(", ");
}

function suggestionDecisionKey({ artist, date }) {
  const normalizedArtist = normalize(artist).replace(/[^a-z0-9]+/g, " ").trim();
  return `${normalizedArtist}|${date}`;
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
  const icons = {
    search: ["fa-magnifying-glass", "h-5 w-5 text-zinc-500"],
    calendar: ["fa-calendar-days", "mt-0.5 h-4 w-4 text-zinc-600"],
    music: ["fa-music", "h-4 w-4"],
    map: ["fa-location-dot", "mt-0.5 h-4 w-4 text-zinc-500"],
  };
  const [icon, className] = icons[type] || icons.map;
  return <i className={`fa-solid ${icon} shrink-0 text-center ${className}`} aria-hidden="true" />;
}

function ModalCloseButton({ onClick, disabled = false }) {
  async function close(event) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onClick(); return; }
    const panel = event.currentTarget.closest('[role="dialog"], [role="alertdialog"]');
    const backdrop = panel?.parentElement;
    event.currentTarget.disabled = true;
    await Promise.all([
      panel?.animate([{ opacity: 1, transform: "translateY(0) scale(1)" }, { opacity: 0, transform: "translateY(8px) scale(.985)" }], { duration: 150, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" }).finished,
      backdrop?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: "ease-out", fill: "forwards" }).finished,
    ].filter(Boolean)).catch(() => {});
    onClick();
  }
  return <button type="button" onClick={close} disabled={disabled} className="touch-target flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:opacity-40" aria-label="Close"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>;
}

// ─── AutoSuggestField ─────────────────────────────────────────────────────────

function AutoSuggestField({ value, onChange, suggestions, placeholder }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listId = React.useId();
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
      <input role="combobox" aria-autocomplete="list" aria-expanded={open && matches.length > 0} aria-controls={listId} aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined} type="text" value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(-1); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={handleKey} placeholder={placeholder} autoComplete="off" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" />
      {open && matches.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
          {matches.map((m, i) => (
            <li id={`${listId}-${i}`} role="option" aria-selected={i === highlight} key={m} onMouseDown={(e) => { e.preventDefault(); pick(m); }} onMouseEnter={() => setHighlight(i)} className={`cursor-pointer px-4 py-2 text-sm ${i === highlight ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-900"}`}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConcertCatalogField({ field, value, onChange, onPick, onSearch, placeholder }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const listId = React.useId();

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
      <input role="combobox" aria-autocomplete="list" aria-expanded={open && results.length > 0} aria-controls={listId} type="text" value={value} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} placeholder={placeholder} autoComplete="off" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" />
      {open && results.length > 0 && <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-1 shadow-2xl">{results.map((concert) => <li role="presentation" key={concert.concertId}><button role="option" aria-selected="false" type="button" onMouseDown={(event) => { event.preventDefault(); onPick(concert); setOpen(false); }} className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-zinc-900"><span className="block text-sm font-bold text-zinc-100">{concert.artist}</span><span className="mt-0.5 block text-xs text-zinc-500">{concert.venue || "Venue not specified"} · {concert.date}</span></button></li>)}</ul>}
    </div>
  );
}

// ─── SetlistModal ─────────────────────────────────────────────────────────────

function SetlistModal({ target, onClose, onEdit, onLeave, onIdDiscovered }) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  const dialogRef = useDialogFocus(Boolean(target));

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
    <div data-testid="concert-details-modal" className="adn-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="concert-details-title" className="adn-modal-panel w-full max-w-lg rounded-3xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="mb-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 id="concert-details-title" className="text-2xl font-black uppercase tracking-tight">{artist}</h2>
            <p className="mt-1 text-sm text-zinc-400">{venue || "Venue not specified"}{concertLocation(target) ? ` · ${concertLocation(target)}` : ""} · {date}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-2">
              {onEdit && <button type="button" onClick={() => onEdit(target)} className="touch-target flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white" aria-label="Edit concert" title="Edit concert"><i className="fa-solid fa-pencil" aria-hidden="true" /></button>}
              <ModalCloseButton onClick={onClose} />
            </div>
            {target.creator?.displayName && <p className="mt-1.5 max-w-28 truncate text-[9px] font-semibold text-zinc-600" title={`Created by ${target.creator.displayName}`}>Created by {target.creator.displayName}</p>}
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {target.attendees?.length > 0 && (
            <section className="mb-5 flex items-center gap-3 border-b border-zinc-900 pb-4">
              <div className="flex shrink-0 -space-x-2" aria-hidden="true">
                {target.attendees.slice(0, 3).map((person, index) => <span key={`${person}-${index}`} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-zinc-950 bg-zinc-800 text-[10px] font-black text-zinc-300">{String(person).trim().slice(0, 1).toUpperCase()}</span>)}
                {target.attendees.length > 3 && <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-zinc-950 bg-zinc-900 text-[9px] font-black text-zinc-500">+{target.attendees.length - 3}</span>}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Attended with</div>
                <p className="mt-0.5 break-words text-sm font-semibold text-zinc-300">{target.attendees.join(" · ")}</p>
              </div>
            </section>
          )}
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Setlist</h3>
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3" role="status" aria-live="polite">
              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
              <span className="text-sm text-zinc-500">Loading setlist…</span>
            </div>
          )}
          {status === "error" && (
            <div className="rounded-2xl border border-red-900 bg-red-950/40 px-5 py-4 text-sm text-red-200" role="alert">
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
                    <span className={`w-6 shrink-0 text-right text-xs font-bold tabular-nums ${song.tape ? "text-zinc-600" : "text-zinc-700"}`}>{i + 1}</span>
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
          {onLeave && target.createdBy && target.createdBy !== target.currentUserId && <button type="button" onClick={() => onLeave(target)} className="adn-button-danger mt-6 w-full">Leave this shared concert</button>}
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
      <div className="adn-context-menu fixed z-[56] w-44 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl" style={{ left, top }}>
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
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [date, setDate] = useState("");
  const [bought, setBought] = useState(false);
  const [setlistId, setSetlistId] = useState("");
  const [attendeeUserIds, setAttendeeUserIds] = useState([]);
  const [guestAttendees, setGuestAttendees] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [validationError, setValidationError] = useState("");
  const dialogRef = useDialogFocus(isOpen);

  useEffect(() => {
    if (isOpen && initial) {
      setArtist(uppercaseConcertLabel(initial.artist));
      setVenue(uppercaseConcertLabel(initial.venue));
      setCity(initial.city || "");
      setCountry(String(initial.country || "").toUpperCase());
      setDate(initial.date || "");
      setBought(!!initial.bought);
      setSetlistId(initial.setlistId || "");
      setAttendeeUserIds((initial.attendeeUsers || []).filter((person) => person.status === "confirmed" || person.status === "pending").map((person) => person.id));
      setGuestAttendees((initial.guestAttendees || []).join(", "));
      setTicketUrl(initial.ticketUrl || "");
      setValidationError("");
    }
  }, [isOpen, initial]);

  if (!isOpen || !initial) return null;
  const isNextMode = mode === "next";
  const canEditEvent = initial.canEditEvent !== false;

  function submit() {
    if (!artist.trim() || !date.trim() || !city.trim() || !/^[A-Z]{2}$/i.test(country.trim())) { setValidationError("Add an artist, date, city and two-letter country code before saving."); return; }
    if (!isNextMode && !venue.trim()) { setValidationError("Add a venue for this past concert."); return; }
    setValidationError("");
    onSave({
      artist: uppercaseConcertLabel(artist.trim()),
      venue: uppercaseConcertLabel(venue.trim()),
      city: city.trim(),
      country: country.trim().toUpperCase(),
      date: date.trim(),
      bought,
      setlistId: setlistId.trim(),
      attendeeUserIds,
      guestAttendees: [...new Set(guestAttendees.split(",").map((name) => name.trim()).filter(Boolean))],
      ticketUrl: normalizeTicketUrl(ticketUrl),
    });
  }

  return (
    <div className="adn-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="edit-concert-title" className="adn-modal-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 shadow-2xl md:max-h-[90dvh]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-900 px-6 py-5">
          <div className="min-w-0">
            <h2 id="edit-concert-title" className="text-2xl font-black uppercase tracking-tight">Edit concert</h2>
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
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">City</span><input value={city} onChange={(event) => setCity(event.target.value)} disabled={!canEditEvent} placeholder="Barcelona" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400 disabled:border-zinc-800 disabled:text-zinc-500" /></label>
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Country</span><input value={country} onChange={(event) => setCountry(event.target.value.toUpperCase().slice(0, 2))} disabled={!canEditEvent} placeholder="ES" maxLength="2" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 uppercase text-zinc-100 outline-none focus:border-zinc-400 disabled:border-zinc-800 disabled:text-zinc-500" /></label>
          </div>
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
          <button onClick={submit} disabled={isSaving} className="adn-button-primary adn-save-button w-full">{isSaving && <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />}{isSaving ? "Saving..." : "Save changes"}</button>
          {validationError && <div className="mt-3 rounded-2xl border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm font-semibold text-amber-200" role="alert">{validationError}</div>}
          {saveError && <div className="mt-3 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{saveError}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── AddConcertModal ──────────────────────────────────────────────────────────

function AddConcertModal({ isOpen, initial, onClose, onSave, isSaving, saveError, friends = [], onSearchCatalog }) {
  const [artist, setArtist] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [date, setDate] = useState("");
  const [bought, setBought] = useState(false);
  const [attendeeUserIds, setAttendeeUserIds] = useState([]);
  const [guestAttendees, setGuestAttendees] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [validationError, setValidationError] = useState("");
  const dialogRef = useDialogFocus(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    setArtist(uppercaseConcertLabel(initial?.artist));
    setVenue(uppercaseConcertLabel(initial?.venue));
    setCity(initial?.city || "");
    setCountry(String(initial?.country || "").toUpperCase());
    setDate(initial?.date || "");
    setBought(Boolean(initial?.bought));
    setAttendeeUserIds((initial?.attendeeUsers || []).map((person) => person.id));
    setGuestAttendees((initial?.guestAttendees || []).join(", "));
    setTicketUrl(initial?.ticketUrl || "");
    setValidationError("");
  }, [isOpen, initial]);

  if (!isOpen) return null;
  const isPastDate = isPastConcert({ date });

  function submit() {
    if (!artist.trim() || !date.trim() || !city.trim() || !/^[A-Z]{2}$/i.test(country.trim())) { setValidationError("Add an artist, date, city and two-letter country code before saving."); return; }
    if (isPastDate && !venue.trim()) { setValidationError("Add a venue for this past concert."); return; }
    setValidationError("");
    onSave({ concertId: initial?.concertId || null, artist, venue, city: city.trim(), country: country.trim().toUpperCase(), date, bought: isPastDate ? true : bought, ticketUrl: isPastDate ? "" : normalizeTicketUrl(ticketUrl), attendeeUserIds, guestAttendees: [...new Set(guestAttendees.split(",").map((name) => name.trim()).filter(Boolean))] });
  }

  function pickCatalogConcert(concert) {
    setArtist(uppercaseConcertLabel(concert.artist));
    setVenue(uppercaseConcertLabel(concert.venue));
    setCity(concert.city || "");
    setCountry(String(concert.country || "").toUpperCase());
    setDate(concert.date || "");
    if (!ticketUrl && concert.ticketUrl) setTicketUrl(concert.ticketUrl);
  }

  return (
    <div className="adn-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="add-concert-title" data-testid="add-concert-modal" className="adn-modal-panel relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 shadow-2xl md:max-h-[90dvh]">
        <div data-testid="add-concert-header" className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-900 px-6 py-5">
          <div className="min-w-0">
            <h2 id="add-concert-title" className="text-2xl font-black uppercase tracking-tight">Add concert</h2>
            <p className="mt-1 truncate text-sm text-zinc-500">Add a past or upcoming concert.</p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>
        <div data-testid="add-concert-scroll" className="min-h-0 flex-1 overflow-y-auto px-6 py-5 overscroll-contain">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Artist</span>
            <ConcertCatalogField field="artist" value={artist} onChange={(value) => setArtist(uppercaseConcertLabel(value))} onPick={pickCatalogConcert} onSearch={onSearchCatalog} placeholder="Artist name" />
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">City</span><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Barcelona" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" /></label>
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Country</span><input value={country} onChange={(event) => setCountry(event.target.value.toUpperCase().slice(0, 2))} placeholder="ES" maxLength="2" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 uppercase text-zinc-100 outline-none focus:border-zinc-400" /></label>
          </div>
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
        </div>
        </div>
        <div className="shrink-0 border-t border-zinc-900 bg-zinc-950 px-6 py-4">
          <button onClick={submit} disabled={isSaving} className="adn-button-primary adn-save-button w-full">{isSaving && <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />}{isSaving ? "Saving..." : "Add concert"}</button>
          {validationError && <div className="mt-3 rounded-2xl border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm font-semibold text-amber-200" role="alert">{validationError}</div>}
          {saveError && <div className="mt-3 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{saveError}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Upcoming concert calendar ────────────────────────────────────────────────

function CalendarExportMenu({ items, compact = false, iconOnly = false }) {
  return (
    <DropdownMenu
      compact={compact}
      ariaLabel="Export concerts"
      buttonLabel={iconOnly ? <i className="fa-solid fa-download" aria-hidden="true" /> : "Export"}
      iconOnly={iconOnly}
      className={iconOnly ? "[&_summary]:flex [&_summary]:h-12 [&_summary]:w-12 [&_summary]:items-center [&_summary]:justify-center [&_summary]:!p-0" : ""}
      options={[
        { value: "all", label: "Export all concerts", disabled: items.length === 0, onSelect: () => downloadConcertCalendar(items, "concerts.ics", "Próximos conciertos") },
        { value: "bought", label: "Export bought concerts", disabled: !items.some((item) => item.bought), onSelect: () => downloadConcertCalendar(items.filter((item) => item.bought), "concerts-bought.ics", "Conciertos comprados") },
        { value: "not-bought", label: "Export not bought concerts", disabled: !items.some((item) => !item.bought), onSelect: () => downloadConcertCalendar(items.filter((item) => !item.bought), "concerts-not-bought.ics", "Conciertos no comprados") },
      ]}
    />
  );
}

function DropdownMenu({ value, onChange, options, compact = false, ariaLabel, className = "", groupName, centered = false, menuAlign = "right", buttonLabel, bare = false, iconOnly = false }) {
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

  function selectOption(event, option) {
    if (option.onSelect) option.onSelect();
    else onChange?.(option.value);
    event.currentTarget.closest("details")?.removeAttribute("open");
  }

  return (
    <details ref={detailsRef} name={groupName} className={`group relative min-w-0 ${className}`}>
      <summary aria-label={ariaLabel} className={`cursor-pointer list-none truncate text-sm font-semibold text-zinc-100 transition [&::-webkit-details-marker]:hidden ${bare ? "px-2 py-2 text-zinc-400 hover:text-zinc-100" : "rounded-md border border-[#30343a] bg-[#15191e] hover:border-zinc-500"} ${centered ? "text-center" : "text-left"} ${compact && !bare ? "px-4 py-2.5" : !bare ? "px-5 py-3" : ""}`}>
        {activeLabel}{!iconOnly && <span className="ml-1 text-zinc-500">▾</span>}
      </summary>
      <div className={`adn-popover absolute top-full z-30 mt-2 max-h-72 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-2 shadow-2xl ${menuAlign === "left" ? "left-0" : "right-0"}`}>
        {normalizedOptions.map((option) => (
          <button
            key={option.value ?? option.label}
            onClick={(event) => selectOption(event, option)}
            disabled={option.disabled}
            className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 ${value === option.value ? "bg-zinc-900 text-zinc-100" : "text-zinc-400"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function ConcertSortMenu({ value, onChange, compact = false, iconOnly = false }) {
  return (
    <DropdownMenu
      value={value}
      onChange={onChange}
      compact={compact}
      ariaLabel="Sort concerts"
      buttonLabel={iconOnly ? <i className="fa-solid fa-arrow-down-wide-short" aria-hidden="true" /> : undefined}
      iconOnly={iconOnly}
      className={iconOnly ? "[&_summary]:flex [&_summary]:h-12 [&_summary]:w-12 [&_summary]:items-center [&_summary]:justify-center [&_summary]:!p-0" : ""}
      options={[
        { value: "artist", label: "Sort by artist" },
        { value: "concerts", label: "Sort by number of concerts" },
        { value: "recent", label: "Sort by most recent" },
      ]}
    />
  );
}

function FriendStatsMenu({ friends, selectedIds, onChange }) {
  const detailsRef = useRef(null);
  useEffect(() => {
    function close(event) { if (!detailsRef.current?.contains(event.target)) detailsRef.current?.removeAttribute("open"); }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  function toggle(id) { onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]); }
  return <details ref={detailsRef} className="group relative"><summary aria-label="Filter stats by friends" className="flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-md border border-[#30343a] bg-[#15191e] text-zinc-100 transition hover:border-zinc-500 [&::-webkit-details-marker]:hidden"><i className="fa-solid fa-user-group" aria-hidden="true" />{selectedIds.length > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-blue-600 px-1 text-center text-[9px] font-black leading-5 text-white">{selectedIds.length}</span>}</summary><div className="adn-popover absolute right-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-zinc-700 bg-zinc-950 p-2 shadow-2xl"><button type="button" onClick={() => onChange([])} className={`mb-1 flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-semibold hover:bg-zinc-800 ${selectedIds.length === 0 ? "text-blue-400" : "text-zinc-300"}`}>All my concerts</button>{friends.map((friend) => <label key={friend.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"><input type="checkbox" checked={selectedIds.includes(friend.id)} onChange={() => toggle(friend.id)} className="h-4 w-4 accent-blue-600" /><span className="truncate">With {friend.displayName}</span></label>)}</div></details>;
}

function NextConcertCalendar({ items, onOpen, onContextMenu, onContextMenuAt }) {
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
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
    if (!monthPickerOpen) return undefined;
    function dismiss(event) {
      if (!monthPickerRef.current?.contains(event.target)) setMonthPickerOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [monthPickerOpen]);

  function moveMonth(offset) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
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
        <button onClick={() => setMonthPickerOpen((open) => !open)} className="rounded-xl px-4 py-2 text-xl font-black text-zinc-100 transition hover:bg-zinc-800 md:text-2xl" aria-label={`Choose month, ${monthLabel}`} aria-expanded={monthPickerOpen}>
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
            <div key={day} className={`relative h-20 overflow-hidden rounded-xl border p-1.5 md:h-auto md:min-h-32 md:overflow-visible md:rounded-2xl md:p-2 ${concerts.length ? "border-zinc-700 bg-zinc-950" : "border-zinc-800/60 bg-zinc-950/40"}`}>
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

      {datedItems.some(({ range }) => range.start <= new Date(year, month + 1, 0) && range.end >= new Date(year, month, 1)) && (
        <section className="mt-4 md:hidden">
          <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">This month</h3>
          <div className="space-y-2">
            {datedItems.filter(({ range }) => range.start <= new Date(year, month + 1, 0) && range.end >= new Date(year, month, 1)).map((concert) => (
              <button key={`month-${concert.source}-${concert.artist}-${concert.date}-${concert.venue || ""}`} {...eventInteractionProps(concert)} className={`flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${concert.isPast ? "border-blue-700 bg-blue-950" : concert.bought ? "border-emerald-700 bg-emerald-900" : "border-amber-700 bg-amber-950"}`}>
                <span className="w-12 shrink-0 text-xs font-black tabular-nums text-zinc-100">{concert.date.slice(0, 5)}</span>
                <span className="min-w-0"><span className="block truncate text-xs font-black uppercase text-zinc-100">{concert.artist}</span>{concert.venue && <span className="mt-0.5 block truncate text-[10px] text-zinc-300">{concert.venue}</span>}</span>
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

function CalendarConcertModal({ target, artistImages, onClose, onEdit }) {
  const dialogRef = useDialogFocus(Boolean(target));
  if (!target) return null;
  const isPast = isPastConcert(target);
  const artistImage = artistImages.get(normalize(target.artist));
  const ticketUrl = normalizeTicketUrl(target.ticketUrl);
  const whatsappMessage = [
    `Concierto: ${target.artist}`,
    `Fecha: ${target.date}`,
    target.venue || concertLocation(target) ? `Lugar: ${[target.venue, concertLocation(target)].filter(Boolean).join(" · ")}` : "",
    ticketUrl ? `Entradas: ${ticketUrl}` : "",
    "",
    "¿Te interesa?",
  ].filter((line, index) => line || index === 4).join("\n");
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
  return (
    <div className="adn-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4" onClick={onClose}>
      <article ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="calendar-concert-title" className="adn-modal-panel w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4">
          <h2 id="calendar-concert-title" className="min-w-0 break-words text-2xl font-black uppercase leading-none tracking-tight text-zinc-100">{target.artist}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {onEdit && <button type="button" onClick={() => onEdit(target)} className="touch-target flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white" aria-label="Edit concert" title="Edit concert"><i className="fa-solid fa-pencil" aria-hidden="true" /></button>}
            <ModalCloseButton onClick={onClose} />
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl bg-zinc-950">
          {!isPast && artistImage && <img src={artistImage} alt="" className="h-44 w-full object-cover object-center" />}
          <div className="p-4">
            <div className="flex items-start justify-between gap-4">
              {target.venue || concertLocation(target) ? <div className="flex min-w-0 gap-2 text-sm font-semibold text-zinc-100"><Icon type="map" /><span className="break-words">{[target.venue, concertLocation(target)].filter(Boolean).join(" · ")}</span></div> : <span />}
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
        {!isPast && target.attendeeUsers?.length > 0 && <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4"><p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Coming with</p><div className="space-y-2">{target.attendeeUsers.map((person) => <div key={person.id} className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-zinc-200">{person.displayName}</span><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${person.status === "confirmed" ? "border-emerald-900 bg-emerald-950/40 text-emerald-300" : "border-amber-900 bg-amber-950/40 text-amber-300"}`}>{person.status === "confirmed" ? "Confirmed" : "Pending"}</span></div>)}</div></section>}
      </article>
    </div>
  );
}

function ConfirmActionModal({ confirmation, onClose, onConfirm, isSaving, error }) {
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const dialogRef = useDialogFocus(Boolean(confirmation));
  useEffect(() => {
    if (!confirmation) return undefined;
    setTypedConfirmation("");
    const closeOnEscape = (event) => { if (event.key === "Escape" && !isSaving) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmation, isSaving, onClose]);
  if (!confirmation) return null;
  const confirmed = !confirmation.confirmationText || typedConfirmation === confirmation.confirmationText;
  const streamlined = confirmation.hideIcon === true;
  return (
    <div className="adn-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-description" className={`adn-modal-panel w-full max-w-sm rounded-3xl border bg-zinc-950 p-6 shadow-2xl ${streamlined ? "border-zinc-700" : "border-red-950"}`}>
        {streamlined ? <div className="mb-3 flex items-start justify-between gap-4"><h2 id="confirm-action-title" className="pt-1 text-xl font-black uppercase tracking-tight">{confirmation.title}</h2><ModalCloseButton onClick={onClose} disabled={isSaving} /></div> : <><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-red-900/60 bg-red-950/30 text-red-300"><i className={`fa-solid ${confirmation.icon || "fa-triangle-exclamation"}`} aria-hidden="true" /></div><h2 id="confirm-action-title" className="mb-2 text-xl font-black uppercase tracking-tight">{confirmation.title}</h2></>}
        <p id="confirm-action-description" className={`${confirmation.confirmationText ? "mb-4" : "mb-6"} text-sm leading-relaxed text-zinc-400`}>{confirmation.description}</p>
        {confirmation.confirmationText && <label className="mb-6 block text-xs font-bold text-zinc-400">Type <span className="text-zinc-100">{confirmation.confirmationText}</span> to continue<input value={typedConfirmation} onChange={(event) => setTypedConfirmation(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-400" /></label>}
        {error && <p className="mb-4 rounded-xl border border-red-900 bg-red-950/30 px-3 py-2 text-sm text-red-300" role="alert">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={isSaving} className="adn-button-secondary flex-1">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={isSaving || !confirmed} className="adn-button-danger flex-1">{isSaving ? "Working…" : confirmation.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── StatsPage ────────────────────────────────────────────────────────────────


// ─── Artist detail ────────────────────────────────────────────────────────────



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
          <h1 className="text-4xl font-black uppercase tracking-tight text-zinc-100">Concert Archive</h1>
          <p className="mt-3 text-sm text-zinc-500">Sign in to open your concert history.</p>
        </div>
        <form onSubmit={attempt} className="space-y-4">
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); setResetSent(false); }} placeholder="Email" autoComplete="email" autoFocus className={`w-full rounded-2xl border bg-zinc-900 px-5 py-4 text-zinc-100 outline-none transition placeholder:text-zinc-600 ${error ? "border-red-700" : "border-zinc-700 focus:border-zinc-400"}`} />
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="Password" autoComplete="current-password" className={`w-full rounded-2xl border bg-zinc-900 px-5 py-4 text-zinc-100 outline-none transition placeholder:text-zinc-600 ${error ? "border-red-700 text-red-300" : "border-zinc-700 focus:border-zinc-400"}`} />
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
          {resetSent && <p className="rounded-2xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-center text-sm text-emerald-300">If that account exists, a recovery link has been sent.</p>}
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 py-4 font-black uppercase tracking-widest text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 disabled:opacity-50">{loading ? "Signing in…" : "Sign in"}</button>
          <button type="button" onClick={requestPasswordReset} disabled={loading || resetLoading || emailCooldown.seconds > 0} className="w-full py-2 text-sm font-semibold text-zinc-500 transition hover:text-zinc-200 disabled:opacity-50">{resetLoading ? "Sending recovery email…" : emailCooldown.seconds > 0 ? `Try again in ${emailCooldown.seconds}s` : "Forgot password?"}</button>
        </form>
      </div>
    </div>
  );
}

function AppBootstrapShell() {
  return <div className="min-h-screen bg-zinc-950"><span className="sr-only" role="status">Opening A Deafening Noise</span></div>;
}

function DeferredPage({ children }) {
  return <React.Suspense fallback={<div className="h-64 animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900" role="status" aria-label="Opening page" />}>{children}</React.Suspense>;
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
    <div className="adn-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4">
      <section role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="adn-modal-panel w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
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
            <button type="button" onClick={onClose} className="adn-button-primary w-full">Done</button>
          </div>
        ) : step === "request" ? (
          <div>
            <p className="mb-2 text-sm text-zinc-300">We'll email a verification code to:</p>
            <p className="mb-6 break-all text-sm font-bold text-zinc-100">{email}</p>
            {error && <p className="mb-4 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button type="button" onClick={sendVerificationCode} disabled={saving || emailCooldown.seconds > 0} className="adn-button-primary w-full">{saving ? "Sending code…" : emailCooldown.seconds > 0 ? `Try again in ${emailCooldown.seconds}s` : "Send verification code"}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {!isRecovery && <p className="text-sm text-zinc-400">Enter the verification code sent to {email}.</p>}
            {!isRecovery && <input type="text" inputMode="numeric" value={nonce} onChange={(event) => { setNonce(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} placeholder="6-digit verification code" autoComplete="one-time-code" pattern="[0-9]{6}" autoFocus required className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400" />}
            <input type="password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError(""); }} placeholder="New password" autoComplete="new-password" minLength={8} required className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400" />
            <input type="password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(""); }} placeholder="Confirm new password" autoComplete="new-password" minLength={8} required className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400" />
            <p className="text-xs text-zinc-600">Use at least 8 characters.</p>
            {error && <p className="rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={saving} className="adn-button-primary w-full">{saving ? "Changing password…" : "Change password"}</button>
          </form>
        )}
      </section>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function mainNavigationItems(activePage, attentionCount) {
  const archiveActive = ["history", "artist", "venue"].includes(activePage);
  return [
    ["home", "fa-house", "Home", activePage === "home", 0],
    ["history", "fa-box-archive", "Concert archive", archiveActive, 0],
    ["timeline", "fa-clock-rotate-left", "Concert Timeline", activePage === "timeline", 0],
    ["next", "fa-calendar-days", "Concert calendar", activePage === "next", 0],
    ["suggestions", "fa-wand-magic-sparkles", "Suggestions", activePage === "suggestions", 0],
    ["stats", "fa-chart-column", "Stats", activePage === "stats" || activePage === "year-review", 0],
    ["friends", "fa-user-group", "Friends", activePage === "friends", attentionCount],
  ];
}

function DesktopNavigation({ activePage, profile, attentionCount, onNavigate }) {
  const items = mainNavigationItems(activePage, attentionCount);
  return <aside className="fixed inset-y-0 left-0 z-30 hidden w-[205px] flex-col border-r border-[#20242a] bg-[#0c1015] lg:flex">
    <button type="button" onClick={() => onNavigate("home")} className="h-[121px] border-b border-[#20242a] px-4 text-left"><span className="block whitespace-nowrap text-[15px] font-black uppercase tracking-tight text-zinc-50">A Deafening Noise</span><span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">Concert archive</span></button>
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Main navigation">{items.map(([page, icon, label, active, count]) =>
      <button key={page} type="button" onClick={() => onNavigate(page)} aria-current={active ? "page" : undefined} className={`relative flex min-h-[61px] w-full items-center gap-3 px-5 text-left text-[12px] font-black uppercase tracking-wide transition-colors ${active ? "bg-[#171b20] text-zinc-50 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-blue-500" : "text-zinc-400 hover:bg-[#171b20] hover:text-zinc-100"}`}><i className={`fa-solid ${icon} w-5 text-center text-[17px] ${active ? "text-zinc-100" : "text-zinc-400"}`} aria-hidden="true" /><span className="truncate">{label}</span>{count > 0 && <span className="ml-auto min-w-5 rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[8px] text-white">{count}</span>}</button>
    )}</nav>
    <div className="mx-4 h-[98px] border-t border-[#2a2e34]"><button type="button" onClick={() => onNavigate("profile")} aria-current={activePage === "profile" || activePage === "admin" ? "page" : undefined} className={`group relative flex h-full w-full items-center gap-3 rounded-lg text-left transition-colors ${activePage === "profile" || activePage === "admin" ? "before:absolute before:inset-y-6 before:-left-4 before:w-0.5 before:bg-blue-500" : ""}`}><UserAvatar person={profile} size="h-8 w-8" /><span className={`min-w-0 flex-1 truncate text-xs font-bold transition-colors group-hover:text-white ${activePage === "profile" || activePage === "admin" ? "text-white" : "text-zinc-300"}`}>{profile?.displayName || profile?.username || "Profile"}</span><i className={`fa-solid fa-chevron-right text-[9px] transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-blue-400 ${activePage === "profile" || activePage === "admin" ? "text-blue-400" : "text-zinc-500"}`} aria-hidden="true" /></button></div>
  </aside>;
}

export default function App() {
  const initialRoute = useMemo(() => readRouteFromLocation(), []);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!supabaseEnabled);
  const [dataReady, setDataReady] = useState(!supabaseEnabled);
  const [dataOwnerId, setDataOwnerId] = useState("");
  const [dataLoadError, setDataLoadError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("artist");
  const [activePage, setActivePage] = useState(initialRoute.page);
  const [selectedArtist, setSelectedArtist] = useState(initialRoute.artist);
  const [selectedVenue, setSelectedVenue] = useState(initialRoute.venue);
  const [selectedReviewYear, setSelectedReviewYear] = useState(initialRoute.year || "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerControlsNode, setHeaderControlsNode] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [addInitial, setAddInitial] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, target: null });
  const [setlistTarget, setSetlistTarget] = useState(null);
  const [calendarTarget, setCalendarTarget] = useState(null);
  const [concertItems, setConcertItems] = useState(fallbackConcerts);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(fallbackDismissedSuggestions);
  const [listenedArtists, setListenedArtists] = useState([]);
  const [artistImageRows, setArtistImageRows] = useState([]);
  const [spotifyStatus, setSpotifyStatus] = useState({ connected: !supabaseEnabled });
  const [appProfile, setAppProfile] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [concertInvitations, setConcertInvitations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [statsFriendIds, setStatsFriendIds] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmRemoveFriend, setConfirmRemoveFriend] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [passwordModalMode, setPasswordModalMode] = useState(null);
  const dialogHistoryOpenRef = useRef(false);
  const closingDialogWithBackRef = useRef(false);
  const overlayScrollYRef = useRef(0);
  const pageOverlayWasOpenRef = useRef(false);
  const dialogScrollYRef = useRef(0);
  const scrollRestorationRef = useRef("auto");
  const passwordModalModeRef = useRef(null);
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    if (!successMessage) return undefined;
    const timeout = window.setTimeout(() => setSuccessMessage(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);
  passwordModalModeRef.current = passwordModalMode;
  const anyDialogOpen = modalOpen || Boolean(editTarget) || Boolean(setlistTarget) || Boolean(calendarTarget) || Boolean(confirmRemoveFriend) || Boolean(confirmAction) || Boolean(passwordModalMode);
  const anyPageOverlayOpen = sidebarOpen || contextMenu.open || anyDialogOpen;
  if (anyPageOverlayOpen && !pageOverlayWasOpenRef.current) overlayScrollYRef.current = window.scrollY;
  pageOverlayWasOpenRef.current = anyPageOverlayOpen;
  const currentUserId = session?.user?.id || "";
  const currentEmail = session?.user?.email?.toLowerCase() || "";
  const currentUserName = appProfile?.displayName || "";
  const isAdmin = !supabaseEnabled || appProfile?.role === "admin";
  const canEdit = !supabaseEnabled || Boolean(appProfile);

  const isNext = canEdit && activePage === "next";
  const isHome = activePage === "home";
  const isArchive = activePage === "history";
  const isStats = activePage === "stats";
  const isTimeline = activePage === "timeline";
  const isYearReview = activePage === "year-review";
  const isFriends = activePage === "friends";
  const isActivity = activePage === "activity";
  const isProfile = activePage === "profile";
  const isAdminPage = isAdmin && activePage === "admin";
  const isSuggestions = canEdit && activePage === "suggestions";

  usePageScrollLock(anyPageOverlayOpen);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [sidebarOpen]);

  const historyConcerts = useMemo(
    () => concertItems.filter((concert) => concert.bought && isPastConcert(concert)),
    [concertItems]
  );
  const historyItems = useMemo(() => groupHistoryFromJson(historyConcerts), [historyConcerts]);
  const scopedHistoryConcerts = useMemo(() => statsFriendIds.length ? historyConcerts.filter((concert) => statsFriendIds.every((friendId) => concert.attendeeUsers?.some((person) => person.id === friendId && person.status === "confirmed"))) : historyConcerts, [historyConcerts, statsFriendIds]);
  const scopedHistoryItems = useMemo(() => groupHistoryFromJson(scopedHistoryConcerts), [scopedHistoryConcerts]);
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
  const title = isVenueDetail ? selectedVenue : isArtistDetail ? artistDetail.artist : isAdminPage ? "Administration" : isSuggestions ? "Concert Suggestions" : isProfile ? "Profile" : isActivity ? "Activity" : isFriends ? "Friends" : isYearReview ? "Year in Review" : isTimeline ? "Concert Timeline" : isStats ? "Archive Overview" : isNext ? "Concert Calendar" : "Concert Archive";
  const description = isVenueDetail
    ? `${venueShows.length} archived ${venueShows.length === 1 ? "visit" : "visits"} to this venue.`
    : isArtistDetail
    ? `${artistDetail.shows.length} live ${artistDetail.shows.length === 1 ? "performance" : "performances"} in the archive.`
    : isAdminPage ? "Users, roles and access controls."
    : isSuggestions ? "Discover upcoming concerts from artists you already listen to."
    : isProfile ? "Your identity, privacy and account settings."
    : isActivity ? "Everything that needs your attention."
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

  const listenedArtistKeys = useMemo(() => new Set(listenedArtists.map(normalize)), [listenedArtists]);
  const artistImages = useMemo(() => new Map(artistImageRows.map(({ artist, imageUrl }) => [normalize(artist), imageUrl])), [artistImageRows]);
  const availableSuggestions = useMemo(() => suggestionsData.suggestions.filter((suggestion) =>
    !supabaseEnabled || listenedArtistKeys.has(normalize(suggestion.artist))
  ), [listenedArtistKeys]);
  const suggestionReviews = useMemo(() => Object.fromEntries(availableSuggestions.flatMap((suggestion) => {
    const concert = concertItems.find((item) => normalize(item.artist) === normalize(suggestion.artist) && item.date === suggestion.date);
    if (concert) return [[suggestion.id, { decision: "interested", concert }]];
    if (dismissedSuggestions.includes(suggestionDecisionKey(suggestion))) return [[suggestion.id, { decision: "not-interested" }]];
    return [];
  })), [availableSuggestions, concertItems, dismissedSuggestions]);

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
          window.history.replaceState({ adnRoute: true, canGoBack: false }, "", "/home");
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
        void clearAppCache();
        setDataReady(false);
        setDataOwnerId("");
        if (!recoveryRequested || event === "SIGNED_OUT") showLoginRoute();
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabaseEnabled || !currentUserId) return;
    let cancelled = false;
    setDataReady(false);
    setDataOwnerId("");
    setDataLoadError("");
    setSyncError("");
    (async () => {
      let hasCachedData = false;
      try {
        const cached = await readAppCache(currentUserId);
        if (cancelled) return;
        if (cached?.data) {
          hasCachedData = true;
          applyAppData(cached.data);
          setDataOwnerId(currentUserId);
          setDataReady(true);
        }
        setIsRefreshing(true);
        const archive = await loadConcertData();
        if (!cancelled) {
          applyAppData(archive);
          setDataOwnerId(currentUserId);
          await writeAppCache(currentUserId, archive);
          lastRefreshRef.current = Date.now();
        }
      } catch (error) {
        if (!cancelled) {
          const message = error.message || "Could not refresh the archive";
          if (hasCachedData) setSyncError(message);
          else setDataLoadError(message);
        }
      } finally {
        if (!cancelled) { setDataReady(true); setIsRefreshing(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId, currentEmail]);

  useEffect(() => {
    if (!supabaseEnabled || !currentUserId || !dataReady) return undefined;
    async function refreshWhenVisible() {
      if (document.visibilityState !== "visible" || Date.now() - lastRefreshRef.current < 30_000) return;
      try { await reloadAppData(); setSyncError(""); }
      catch (error) { setSyncError(error.message || "Could not refresh the archive"); }
    }
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshWhenVisible); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, [currentUserId, dataReady]);

  useEffect(() => {
    if (supabaseEnabled && (!authReady || !currentUserId || !dataReady)) return;
    if (canEdit || activePage !== "next") return;
    window.history.replaceState({ adnRoute: true, canGoBack: false }, "", routeToPath({ page: "history" }));
    setActivePage("history");
  }, [activePage, canEdit, authReady, currentUserId, dataReady]);

  useEffect(() => {
    if (!dataReady || activePage !== "admin" || isAdmin) return;
    window.history.replaceState({ adnRoute: true, canGoBack: false }, "", "/history");
    setActivePage("history");
  }, [activePage, dataReady, isAdmin]);

  useEffect(() => {
    const initial = readRouteFromLocation();
    const isPasswordRecovery = new URLSearchParams(window.location.search).get("password-recovery") === "1";
    const isLoggedOutRoot = window.location.pathname === "/" && !window.location.hash;
    if (!isPasswordRecovery && !isLoggedOutRoot && window.location.pathname !== "/spotify/callback") window.history.replaceState({ adnRoute: true, canGoBack: false }, "", routeToPath(initial));

    function restoreRoute() {
      if (dialogHistoryOpenRef.current || closingDialogWithBackRef.current) {
        const scrollY = dialogScrollYRef.current;
        dialogHistoryOpenRef.current = false;
        closingDialogWithBackRef.current = false;
        setModalOpen(false);
        setAddInitial(null);
        setActiveSuggestionId(null);
        setEditTarget(null);
        setSetlistTarget(null);
        setCalendarTarget(null);
        setConfirmRemoveFriend(null);
        setConfirmAction(null);
        if (passwordModalModeRef.current === "recovery") void supabase.auth.signOut();
        setPasswordModalMode(null);
        window.setTimeout(() => {
          restorePageScroll(scrollY);
          window.history.scrollRestoration = scrollRestorationRef.current;
        }, 150);
        return;
      }
      const route = readRouteFromLocation();
      setActivePage(route.page);
      setSelectedArtist(route.artist);
      setSelectedVenue(route.venue);
      setSelectedReviewYear(route.year || "");
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
      dialogScrollYRef.current = overlayScrollYRef.current;
      scrollRestorationRef.current = window.history.scrollRestoration;
      window.history.scrollRestoration = "manual";
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

  if (!authReady) return <>{passwordModal}<AppBootstrapShell /></>;
  if (!supabaseEnabled && !IS_LOCAL) return <>{passwordModal}<div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-center text-red-300">Supabase is not configured for this deployment.</div></>;
  if (passwordModalMode === "recovery") return <>{passwordModal}<div className="min-h-screen bg-zinc-950" aria-hidden="true" /></>;
  if (supabaseEnabled && !session) return <>{passwordModal}<LoginGate onSignedIn={() => navigateTo({ page: "home" }, { replace: true })} /></>;
  if (!dataReady || (supabaseEnabled && dataOwnerId !== currentUserId)) return <>{passwordModal}<AppBootstrapShell /></>;
  if (dataLoadError) return <>{passwordModal}<div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-center text-red-300">{dataLoadError}</div></>;

  function navigateTo(route, { replace = false } = {}) {
    const updateHistory = replace ? window.history.replaceState.bind(window.history) : window.history.pushState.bind(window.history);
    updateHistory({ adnRoute: true, canGoBack: !replace }, "", routeToPath(route));
    setActivePage(route.page);
    setSelectedArtist(route.artist || null);
    setSelectedVenue(route.venue || null);
    setSelectedReviewYear(route.year || "");
    setQuery("");
    setSortMode("artist");
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function navigateToArchive({ replace = false } = {}) {
    const historyRoute = { page: "history", artist: null, venue: null };
    const updateHistory = replace ? window.history.replaceState.bind(window.history) : window.history.pushState.bind(window.history);
    updateHistory({ adnRoute: true, canGoBack: !replace }, "", routeToPath(historyRoute));
    setActivePage("history");
    setSelectedArtist(null);
    setSelectedVenue(null);
    setSelectedReviewYear("");
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
  function openYearReview(year) {
    navigateTo({ page: "year-review", artist: null, venue: null, year: String(year) });
  }
  function changeReviewYear(year) {
    const route = { page: "year-review", artist: null, venue: null, year: String(year) };
    window.history.pushState({ adnRoute: true, canGoBack: true }, "", routeToPath(route));
    setSelectedReviewYear(String(year));
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
      creator: storedConcert?.creator || target.creator,
      createdBy: storedConcert?.createdBy || target.createdBy,
      currentUserId,
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
    setListenedArtists(archive.listenedArtists || []);
    setArtistImageRows(archive.artistImages || []);
    setSpotifyStatus(archive.spotifyStatus || { connected: false });
    setAppProfile(archive.profile || null);
    setFriends(archive.friends || []);
    setFriendRequests(archive.friendRequests || []);
    setConcertInvitations(archive.concertInvitations || []);
    setNotifications(archive.notifications || []);
  }

  async function reloadAppData() {
    if (!supabaseEnabled) return;
    setIsRefreshing(true);
    try {
      const archive = await loadConcertData();
      applyAppData(archive);
      await writeAppCache(currentUserId, archive);
      lastRefreshRef.current = Date.now();
      setSyncError("");
    } finally { setIsRefreshing(false); }
  }

  async function handleAddConcert(data, suggestion = null) {
    const pastConcert = isPastConcert({ date: data.date });
    const newConcert = {
      concertId: data.concertId || null,
      artist: uppercaseConcertLabel(data.artist.trim()),
      venue: uppercaseConcertLabel(data.venue?.trim()),
      city: data.city?.trim() || "",
      country: String(data.country || "").trim().toUpperCase(),
      date: data.date.trim(),
      bought: pastConcert ? true : Boolean(data.bought),
      attendeeUserIds: data.attendeeUserIds || [],
      guestAttendees: data.guestAttendees || [],
      ...(data.guestAttendees?.length ? { attendees: data.guestAttendees } : {}),
      ...(!pastConcert && normalizeTicketUrl(data.ticketUrl) ? { ticketUrl: normalizeTicketUrl(data.ticketUrl) } : {}),
    };
    setIsSaving(true); setSaveError("");
    try {
      const updatedDismissed = suggestion ? dismissedSuggestions.filter((key) => key !== suggestionDecisionKey(suggestion)) : dismissedSuggestions;
      if (supabaseEnabled) {
        await upsertMyConcert(newConcert);
        if (suggestion) await saveDismissedSuggestions(updatedDismissed);
        await reloadAppData();
      } else {
        const updatedConcerts = [...concertItems, newConcert];
        await saveConcertData(concertDataPayload(updatedConcerts, updatedDismissed), `Add concert: ${data.artist}${data.venue ? " — " + data.venue : ""} (${data.date})`);
        setConcertItems(updatedConcerts);
        setDismissedSuggestions(updatedDismissed);
      }
      setModalOpen(false);
      setAddInitial(null);
      if (suggestion) setSuccessMessage("Concert added to your calendar.");
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
    setSaveError("");
    setConfirmAction({
      title: "Delete concert?",
      description: `${t.artist}${t.venue ? ` · ${t.venue}` : ""} · ${t.date}. This action cannot be undone.`,
      confirmLabel: "Delete",
      hideIcon: true,
      action: async () => {
        if (supabaseEnabled && t.concertId) {
          await deleteMyConcert(t.concertId);
          await reloadAppData();
        } else {
          const updatedConcerts = removeConcert(concertItems, t);
          await saveConcertData(concertDataPayload(updatedConcerts), `Delete concert: ${t.artist}${t.venue ? " — " + t.venue : ""} (${t.date})`);
          setConcertItems(updatedConcerts);
        }
      },
    });
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

  async function handleProfileExport() {
    const data = await exportMyData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `a-deafening-noise-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  }

  function reviewSuggestionAsInterested(suggestion) {
    if (isSaving || suggestionReviews[suggestion.id]?.decision === "interested") return;
    setSaveError("");
    void handleAddConcert({ artist: suggestion.artist, venue: suggestion.venue, city: suggestion.city || "", country: suggestion.country || "", date: suggestion.date, bought: false, ticketUrl: suggestion.sourceUrl || "" }, suggestion);
  }

  function reviewSuggestionAsNotInterested(suggestion) {
    if (isSaving || suggestionReviews[suggestion.id]?.decision === "not-interested") return;
    setSaveError("");
    const matchingConcert = suggestionReviews[suggestion.id]?.concert;
    const action = async () => {
      const updatedDismissed = [...new Set([...dismissedSuggestions, suggestionDecisionKey(suggestion)])];
      const updatedConcerts = matchingConcert ? concertItems.filter((concert) => !concertMatches(concert, matchingConcert)) : concertItems;
      if (supabaseEnabled) {
        if (matchingConcert?.concertId) await deleteMyConcert(matchingConcert.concertId);
        await saveDismissedSuggestions(updatedDismissed);
        await reloadAppData();
      } else {
        await saveConcertData(concertDataPayload(updatedConcerts, updatedDismissed), `Mark suggestion not interested: ${suggestion.artist} (${suggestion.date})`);
        setConcertItems(updatedConcerts);
        setDismissedSuggestions(updatedDismissed);
      }
    };
    if (matchingConcert) {
      setConfirmAction({
        title: "Mark as not interested?",
        description: `${suggestion.artist} · ${suggestion.date}`,
        confirmLabel: "Not interested",
        hideIcon: true,
        action,
      });
      return;
    }
    setIsSaving(true);
    action().catch((error) => setSaveError(error.message || "Could not save suggestion decision")).finally(() => setIsSaving(false));
  }

  const statsScopeControl = (isStats || isYearReview) && friends.length > 0 ? <FriendStatsMenu friends={friends} selectedIds={statsFriendIds} onChange={setStatsFriendIds} /> : null;
  const suggestionsPage = isSuggestions ? <DeferredPage><SuggestionsPage
    suggestions={availableSuggestions}
    artistImages={artistImages}
    reviews={suggestionReviews}
    onInterested={reviewSuggestionAsInterested}
    onNotInterested={reviewSuggestionAsNotInterested}
    onOpenProfile={() => changePage("profile")}
    spotifyConnected={spotifyStatus.connected}
    isSaving={isSaving}
    saveError={saveError}
  /></DeferredPage> : null;

  return (
    <>
    {passwordModal}
    {isRefreshing && <span className="sr-only" role="status">Syncing your latest data</span>}
    {syncError && <div className="fixed bottom-4 left-1/2 z-[80] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-amber-900 bg-zinc-950 px-4 py-2 text-center text-xs font-semibold text-amber-300 shadow-2xl" role="status">Offline · showing saved data</div>}
    <main className="adn-shell min-h-screen bg-zinc-950 text-zinc-100 md:flex">
      <DesktopNavigation activePage={activePage} profile={appProfile} attentionCount={friendRequests.filter((request) => request.direction === "incoming").length + concertInvitations.length} onNavigate={changePage} />
      {/* Desktop-only fixed Menu button */}
      <button onClick={() => setSidebarOpen(true)} className="menu-button-desktop fixed left-4 top-4 z-40 h-11 w-11 rounded-md border border-[#30343a] bg-[#111418] text-sm text-zinc-100 shadow-lg transition-colors hover:border-zinc-500 hover:bg-[#171b20] lg:hidden" aria-label="Open menu" aria-expanded={sidebarOpen} aria-controls="main-navigation"><i className="fa-solid fa-bars text-xs" aria-hidden="true" /></button>
      {/* Touch-device Menu starts at the top of the page and scrolls away with it */}
      <button onClick={() => setSidebarOpen(true)} className="menu-button-touch touch-target absolute left-4 top-4 z-40 h-11 w-11 rounded-md border border-[#30343a] bg-[#111418] text-sm text-zinc-100 shadow-lg transition-colors hover:border-zinc-500 hover:bg-[#171b20]" aria-label="Open menu" title="Menu" aria-expanded={sidebarOpen} aria-controls="main-navigation"><i className="fa-solid fa-bars text-xs" aria-hidden="true" /></button>

      <button disabled={!sidebarOpen} aria-hidden={!sidebarOpen} tabIndex={sidebarOpen ? 0 : -1} className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-150 lg:hidden ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={() => setSidebarOpen(false)} aria-label="Close menu overlay" />

      <aside id="main-navigation" aria-label="Mobile navigation" aria-hidden={!sidebarOpen} inert={!sidebarOpen ? "" : undefined} className={`adn-navigation fixed inset-y-0 left-0 z-50 flex w-[min(17rem,88vw)] flex-col border-r border-[#20242a] bg-[#0c1015] transition-transform duration-300 lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex min-h-[105px] items-center justify-between gap-3 border-b border-[#20242a] px-5 pt-[env(safe-area-inset-top)]">
          <button onClick={() => changePage("home")} className="min-w-0 text-left" aria-label="Go to dashboard"><span className="block truncate text-[15px] font-black uppercase tracking-tight text-zinc-50">A Deafening Noise</span><span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">Concert archive</span></button>
          <button onClick={() => setSidebarOpen(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-[#171b20] hover:text-zinc-100" aria-label="Close menu"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="Main navigation">{mainNavigationItems(activePage, friendRequests.filter((request) => request.direction === "incoming").length + concertInvitations.length).map(([page, icon, label, active, count]) =>
          <button key={page} type="button" onClick={() => changePage(page)} aria-current={active ? "page" : undefined} className={`relative flex min-h-[58px] w-full items-center gap-3 px-5 text-left text-[12px] font-black uppercase tracking-wide transition-colors ${active ? "bg-[#171b20] text-zinc-50 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-blue-500" : "text-zinc-400 hover:bg-[#171b20] hover:text-zinc-100"}`}><i className={`fa-solid ${icon} w-5 text-center text-[17px] ${active ? "text-zinc-100" : "text-zinc-400"}`} aria-hidden="true" /><span className="truncate">{label}</span>{count > 0 && <span className="ml-auto min-w-5 rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[8px] text-white">{count}</span>}</button>
        )}</nav>
        {currentUserName && <div className="mx-4 h-[90px] shrink-0 border-t border-[#2a2e34] pb-[env(safe-area-inset-bottom)]"><button type="button" onClick={() => changePage("profile")} aria-current={activePage === "profile" || activePage === "admin" ? "page" : undefined} className={`group relative flex h-full w-full items-center gap-3 text-left transition-colors ${activePage === "profile" || activePage === "admin" ? "before:absolute before:inset-y-5 before:-left-4 before:w-0.5 before:bg-blue-500" : ""}`}><UserAvatar person={appProfile} size="h-8 w-8" /><span className={`min-w-0 flex-1 truncate text-xs font-bold transition-colors group-hover:text-white ${activePage === "profile" || activePage === "admin" ? "text-white" : "text-zinc-300"}`}>{currentUserName}</span>{isAdmin && <span className="rounded-full border border-zinc-700 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-500">Admin</span>}<i className={`fa-solid fa-chevron-right text-[9px] transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-blue-400 ${activePage === "profile" || activePage === "admin" ? "text-blue-400" : "text-zinc-500"}`} aria-hidden="true" /></button></div>}
      </aside>

      <section className={`adn-content w-full overflow-x-hidden lg:ml-[205px] ${isHome ? "px-4 pb-8 pt-5 lg:pb-10 lg:pl-[51px] lg:pr-[56px] lg:pt-8" : "px-4 pb-8 pt-5 md:px-8 md:py-10 lg:px-[51px] lg:py-8 lg:pr-[56px]"}`}>
        {!isHome && <header className="mb-6 min-h-32 pt-12 text-left md:min-h-0 md:pt-0 lg:mb-6">
          <div className="flex flex-col items-start justify-between gap-5 lg:flex-row">
            <div className="min-w-0"><h1 className="break-words text-3xl font-black uppercase leading-none tracking-[0.025em] text-zinc-50 lg:text-[1.75rem]">{title}</h1><p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-zinc-400">{description}</p></div>
            <div ref={setHeaderControlsNode} className={`flex w-full min-w-0 flex-wrap items-start justify-end gap-2 lg:max-w-[65%] lg:shrink-0 ${isArchive || isTimeline || isNext ? "lg:w-[42rem]" : "lg:w-auto"}`} />
          </div>
        </header>}

        {isHome ? <DeferredPage><HomePage
          profile={appProfile}
          concerts={concertItems}
          suggestions={availableSuggestions}
          artistImages={artistImages}
          suggestionReviews={suggestionReviews}
          suggestionError={saveError}
          notifications={notifications}
          onAdd={() => { setSaveError(""); setAddInitial(null); setModalOpen(true); }}
          onOpenConcert={(concert) => setCalendarTarget({ ...concert, mode: isPastConcert(concert) ? "history" : "next" })}
          onSuggestionInterested={reviewSuggestionAsInterested}
          onSuggestionNotInterested={reviewSuggestionAsNotInterested}
          onNavigate={changePage}
          onOpenYearReview={openYearReview}
          DropdownMenu={DropdownMenu}
        /></DeferredPage> : isVenueDetail ? (
          <DeferredPage><VenueDetailPage
            venue={selectedVenue}
            historyItems={historyItems}
            onOpenArtist={openArtistDetail}
            onOpenSetlist={openConcertDetails}
            Icon={Icon}
          /></DeferredPage>
        ) : isArtistDetail ? (
          <DeferredPage><ArtistDetailPage
            item={artistDetail}
            upcoming={artistUpcoming}
            onOpenSetlist={openConcertDetails}
            onOpenVenue={openVenueDetail}
            Icon={Icon}
          /></DeferredPage>
        ) : isTimeline ? (
          <DeferredPage><ConcertTimelinePage
            historyItems={historyItems}
            onOpenArtist={openArtistDetail}
            onOpenSetlist={openConcertDetails}
            onOpenVenue={openVenueDetail}
            DropdownMenu={DropdownMenu}
            Icon={Icon}
            headerTarget={headerControlsNode}
          /></DeferredPage>
        ) : isYearReview ? (
          <><DeferredPage><YearInReviewPage
            historyItems={scopedHistoryItems}
            selectedYear={selectedReviewYear}
            onYearChange={changeReviewYear}
            onOpenArtist={openArtistDetail}
            onOpenSetlist={openConcertDetails}
            onOpenVenue={openVenueDetail}
            DropdownMenu={DropdownMenu}
            Icon={Icon}
            headerTarget={headerControlsNode}
          /></DeferredPage></>
        ) : isSuggestions ? suggestionsPage
        : isAdminPage ? <DeferredPage><AdminPage currentUserId={currentUserId} onChanged={reloadAppData} onConfirm={(confirmation) => { setSaveError(""); setConfirmAction(confirmation); }} /></DeferredPage>
        : isProfile ? <DeferredPage><ProfilePage profile={appProfile} futureArtists={[...new Set(concertItems.filter((concert) => !isPastConcert(concert)).map((concert) => concert.artist))]} isAdmin={isAdmin} onAdmin={() => changePage("admin")} onSignOut={() => supabase.auth.signOut()} onSave={async (payload) => { await updateMyProfile(payload); await reloadAppData(); }} onExport={handleProfileExport} onDelete={async () => { await deleteMyAccount(); await supabase.auth.signOut(); }} onPassword={() => setPasswordModalMode("change")} onConfirm={(confirmation) => { setSaveError(""); setConfirmAction(confirmation); }} onSpotifyChanged={reloadAppData} /></DeferredPage>
        : isActivity ? <DeferredPage><ActivityPage notifications={notifications} onRead={async (ids) => { await markNotificationsRead(ids); await reloadAppData(); }} onOpenFriends={() => changePage("friends")} /></DeferredPage>
        : isFriends ? <DeferredPage><FriendsPage friends={friends} requests={friendRequests} invitations={concertInvitations} onSearch={searchProfiles} onSendRequest={(userId) => runSocialAction(() => sendFriendRequest(userId))} onRespondRequest={(requestId, accept) => runSocialAction(() => respondFriendRequest(requestId, accept))} onRequestRemoveFriend={(friend) => { setSaveError(""); setConfirmRemoveFriend(friend); }} onRespondInvitation={(concertId, accept, bought) => runSocialAction(() => respondConcertInvitation(concertId, accept, bought))} /></DeferredPage> : isStats ? <>{headerControlsNode && statsScopeControl && createPortal(statsScopeControl, headerControlsNode)}<DeferredPage><StatsPage historyItems={scopedHistoryItems} onOpenArtist={openArtistDetail} onOpenVenue={openVenueDetail} onOpenYearReview={openYearReview} /></DeferredPage></> : (
          <>
            {headerControlsNode && createPortal(<div className="w-full space-y-2 md:space-y-0">

                {/* Mobile layout */}
                <div className="flex items-center gap-2 md:hidden">
                  <div className="adn-search-field flex h-12 min-w-0 flex-1 items-center gap-2 rounded-md border border-[#30343a] bg-[#15191e] px-3">
                    <Icon type="search" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="w-full min-w-0 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500" aria-label="Search concerts" />
                  </div>
                  {isNext ? <CalendarExportMenu items={nextItems} compact iconOnly /> : <ConcertSortMenu value={sortMode} onChange={setSortMode} compact iconOnly />}
                </div>

                {/* Desktop layout */}
                <div className="hidden gap-3 md:grid md:grid-cols-[minmax(18rem,1fr)_auto]">
                  <div className="adn-search-field flex h-12 items-center gap-3 rounded-md border border-[#30343a] bg-[#15191e] px-5">
                    <Icon type="search" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search artist, venue, festival, city or date" className="w-full bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500" aria-label="Search concerts" />
                  </div>
                  {isNext ? <CalendarExportMenu items={nextItems} iconOnly /> : <ConcertSortMenu value={sortMode} onChange={setSortMode} iconOnly />}
                </div>
            </div>, headerControlsNode)}

            {isNext ? (
              <>
                <NextConcertCalendar
                  items={calendarItems}
                  onOpen={(concert) => setCalendarTarget({ ...concert, mode: concert.source === "history" ? "history" : "next" })}
                  onContextMenu={(event, concert) => openContextMenu(event, { ...concert, mode: concert.source === "history" ? "history" : "next" })}
                  onContextMenuAt={(x, y, concert) => openContextMenuAt(x, y, { ...concert, mode: concert.source === "history" ? "history" : "next" })}
                />
              </>
            ) : (
            <><section className="grid w-full gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => (
                <article key={item.artist + (isNext ? item.date : "")} className="adn-artist-card group w-full min-w-0 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
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
                      const concertTarget = { ...target, concertId: storedConcert?.concertId, city: storedConcert?.city || "", country: storedConcert?.country || "", canEditEvent: storedConcert?.canEditEvent, attendees: storedConcert?.attendees || [], attendeeUsers: storedConcert?.attendeeUsers || [], guestAttendees: storedConcert?.guestAttendees || [], setlistId: storedConcert?.setlistId || setlistId, ticketUrl: storedConcert?.ticketUrl || "" };
                      let touchTimer = null, touchMoved = false, longPressed = false;
                      return (
                        <div
                          key={`${item.artist}-${show}`}
                          className="adn-concert-row group/concert relative cursor-pointer select-none rounded-2xl border border-transparent bg-zinc-950 p-4"
                          onContextMenu={(e) => openContextMenu(e, concertTarget)}
                          onTouchStart={(e) => { touchMoved = false; longPressed = false; const t = e.touches[0]; const sx = t.clientX, sy = t.clientY; touchTimer = setTimeout(() => { if (!touchMoved) { longPressed = true; if (navigator.vibrate) navigator.vibrate(20); openContextMenuAt(sx, sy, concertTarget); } }, 500); }}
                          onTouchMove={() => { touchMoved = true; if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } }}
                          onTouchEnd={() => { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } setTimeout(() => { longPressed = false; }, 400); }}
                          onTouchCancel={() => { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } }}
                          style={{ WebkitTouchCallout: "none" }}
                        >
                          <button type="button" aria-label={`Open ${item.artist} at ${venue || "venue not specified"} on ${date}`} onClick={() => { if (!longPressed) openConcertDetails(concertTarget); }} className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400" />
                          <div className="pointer-events-none relative space-y-2">
                            {!isNext && <div className="flex gap-2 text-sm font-semibold text-zinc-100"><Icon type="map" /><button onClick={() => openVenueDetail(venue)} className="pointer-events-auto truncate text-left hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{venue}</button></div>}
                            {isNext && item.venue && <div className="flex gap-2 text-sm font-semibold text-zinc-100"><Icon type="map" /><span className="truncate">{item.venue}</span></div>}
                            <div className="flex gap-2 text-sm text-zinc-400"><Icon type="calendar" /><span>{date}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </section></>
            )}
            {filtered.length === 0 && <div className="mt-12"><EmptyState icon="fa-magnifying-glass" title="No concerts found" description="Try another artist, venue, city or date." /></div>}
          </>
        )}
      </section>

      {isSaving && (
        <div className="adn-saving-toast pointer-events-none fixed bottom-6 right-6 z-[80] flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900/95 px-5 py-3 shadow-2xl backdrop-blur" role="status" aria-live="polite">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-100" />
          <span className="text-sm font-bold text-zinc-100">Saving…</span>
        </div>
      )}
      {successMessage && <div className="adn-saving-toast fixed bottom-6 right-6 z-[80] max-w-[calc(100vw-2rem)] rounded-md border border-emerald-800 bg-emerald-950 px-5 py-3 text-sm font-bold text-emerald-200 shadow-2xl" role="status" aria-live="polite"><i className="fa-solid fa-circle-check mr-2" aria-hidden="true" />{successMessage}<button type="button" onClick={() => setSuccessMessage("")} className="ml-4 text-emerald-400 hover:text-white" aria-label="Dismiss message"><i className="fa-solid fa-xmark" aria-hidden="true" /></button></div>}

      <ConfirmActionModal confirmation={confirmRemoveFriend ? { title: "Remove friend?", description: `${confirmRemoveFriend.displayName} will no longer appear in concert invitations. Existing concert records remain unchanged.`, confirmLabel: "Remove", hideIcon: true } : null} onClose={() => { if (!isSaving) { setConfirmRemoveFriend(null); setSaveError(""); } }} isSaving={isSaving} error={saveError} onConfirm={async () => {
        if (!confirmRemoveFriend) return;
        setIsSaving(true); setSaveError("");
        try {
          await runSocialAction(() => removeFriend(confirmRemoveFriend.id));
          setConfirmRemoveFriend(null);
        } catch (error) { setSaveError(error.message || "Could not remove friend"); }
        finally { setIsSaving(false); }
      }} />

      <ConfirmActionModal confirmation={confirmAction} onClose={() => { if (!isSaving) { setConfirmAction(null); setSaveError(""); } }} isSaving={isSaving} error={saveError} onConfirm={async () => {
        if (!confirmAction) return;
        setIsSaving(true); setSaveError("");
        try { await confirmAction.action(); setConfirmAction(null); }
        catch (error) { setSaveError(error.message || "The action could not be completed"); }
        finally { setIsSaving(false); }
      }} />

      {canEdit && <AddConcertModal isOpen={modalOpen} initial={addInitial} onClose={() => { setModalOpen(false); setAddInitial(null); }} onSave={handleAddConcert} isSaving={isSaving} saveError={saveError} friends={friends} onSearchCatalog={supabaseEnabled ? searchConcertCatalog : null} />}
      {canEdit && <EditConcertModal isOpen={!!editTarget} mode={editTarget?.mode || mode} initial={editTarget} onClose={() => setEditTarget(null)} onSave={handleEditConcert} isSaving={isSaving} saveError={saveError} artistSuggestions={artistSuggestions} venueSuggestions={venueSuggestions} friends={friends} />}
      {canEdit && <ContextMenu open={contextMenu.open} x={contextMenu.x} y={contextMenu.y} onEdit={startEditFromContext} onDelete={deleteFromContext} onClose={closeContextMenu} />}
      <SetlistModal
        target={setlistTarget}
        onClose={() => setSetlistTarget(null)}
        onEdit={canEdit ? (target) => { setSetlistTarget(null); setEditTarget(target); } : null}
        onLeave={supabaseEnabled ? async (target) => { setSaveError(""); setSetlistTarget(null); setConfirmAction({ title: "Leave concert?", description: "The concert will be removed from your archive but will remain in the creator's archive.", confirmLabel: "Leave", hideIcon: true, action: async () => { await leaveSharedConcert(target.concertId); await reloadAppData(); } }); } : null}
        onIdDiscovered={canEdit ? handleSetlistIdDiscovered : null}
      />
      <CalendarConcertModal
        target={calendarTarget}
        artistImages={artistImages}
        onClose={() => setCalendarTarget(null)}
        onEdit={canEdit ? (target) => { setCalendarTarget(null); setEditTarget(target); } : null}
      />
    </main>
    </>
  );
}
