import ArchiveFilters from "./components/ArchiveFilters";
import ConcertJournal from "./components/ConcertJournal";
import ConcertDialog from "./components/ConcertDialog";
import { Icon, ModalCloseButton } from "./components/SharedUi";
import PageErrorBoundary from "./components/PageErrorBoundary";
import { useDialogGuard } from "./components/DialogGuard";
const FestivalsPage = React.lazy(() => import("./pages/FestivalsPage"));
import { filterScope, matchesArchiveFilters, readArchiveFilters, withArchiveFilters } from "./lib/archive-filters";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import whatsappIcon from "@fortawesome/fontawesome-free/svgs/brands/whatsapp.svg";
import { concertsData, suggestionsData } from "virtual:archive-fallback";
import { suggestionKey, legacySuggestionKey, isDismissedSuggestion, isCurrentSuggestion, canonicalVenue } from "./lib/suggestions";
import {
  deleteMyAccount,
  deleteMyConcert,
  exportMyData,
  leaveSharedConcert,
  markNotificationsRead,
  removeFriend,
  setConcertInvitationStatus,
  respondFriendRequest,
  saveSetlistId,
  searchConcertCatalog,
  searchProfiles,
  sendFriendRequest,
  supabase,
  supabaseEnabled,
  upsertMyConcert,
  reviewMySuggestion,
  clearSearchCaches,
  updateMyProfile,
} from "./lib/supabase";
import { clearAppCache } from "./lib/app-cache";
import { createRequestCache } from "./lib/request-cache";
import { useArchiveSync } from "./hooks/useArchiveSync";
import { readRouteFromLocation, routeToPath } from "./lib/routes";
import { getMostRecentShowDate, normalize, parseDate, parseShow, sameCity, uniqueSourceLinks, parseConcertDateRange, isPastConcert, uppercaseConcertLabel, normalizeTicketUrl, concertLocation } from "./lib/concerts";
import { COUNTRIES, countryName } from "./lib/countries";
import { useI18n } from "./lib/i18n.jsx";
import { EmptyState, PanelHeading, UserAvatar } from "./components/SharedUi";
import GlobalSearch from "./components/GlobalSearch";
import { restorePageScroll, useDialogFocus, usePageScrollLock } from "./hooks/useUi";

const ProfilePage = React.lazy(() => import("./pages/AccountPages").then(({ ProfilePage: Page }) => ({ default: Page })));
const ActivityPage = React.lazy(() => import("./pages/AccountPages").then(({ ActivityPage: Page }) => ({ default: Page })));
const AdminPage = React.lazy(() => import("./pages/AccountPages").then(({ AdminPage: Page }) => ({ default: Page })));
const HomePage = React.lazy(() => import("./pages/HomePage"));
const AddConcertModal = React.lazy(() => import("./components/ConcertEditor").then(module => ({ default: module.AddConcertModal })));
const EditConcertModal = React.lazy(() => import("./components/ConcertEditor").then(module => ({ default: module.EditConcertModal })));
const NextConcertCalendar = React.lazy(() => import("./pages/CalendarPage"));
const FriendsPage = React.lazy(() => import("./pages/FriendsPage"));
const SuggestionsPage = React.lazy(() => import("./pages/SuggestionsPage"));
const StatsPage = React.lazy(() => import("./pages/StatsPage"));
const YearInReviewPage = React.lazy(() => import("./pages/StatsPage").then(({ YearInReviewPage: Page }) => ({ default: Page })));
const ArtistDetailPage = React.lazy(() => import("./pages/ArtistDetailPage").then(({ ArtistDetailPage: Page }) => ({ default: Page })));
const VenueDetailPage = React.lazy(() => import("./pages/VenueDetailPage").then(({ VenueDetailPage: Page }) => ({ default: Page })));
const CityDetailPage = React.lazy(() => import("./pages/GeographyDetailPages").then(({ CityDetailPage: Page }) => ({ default: Page })));
const CountryDetailPage = React.lazy(() => import("./pages/GeographyDetailPages").then(({ CountryDetailPage: Page }) => ({ default: Page })));
const ConcertDetailPage = React.lazy(() => import("./pages/ConcertDetailPage"));
const ConcertTimelinePage = React.lazy(() => import("./pages/ConcertTimelinePage").then(({ ConcertTimelinePage: Page }) => ({ default: Page })));
const FriendProfilePage = React.lazy(() => import("./pages/FriendProfilePage"));

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

// Local demo persistence only. Hosted application writes go through Supabase.

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
    throw new Error("We couldn’t save your concert archive. Try again.");
  }
}

// ─── Setlist.fm proxy ─────────────────────────────────────────────────────────

const setlistCache = createRequestCache({ max: 50, ttl: 15 * 60000 });
async function fetchSetlist({ setlistId, artist, venue, date }) {
  return setlistCache.get(JSON.stringify([setlistId,artist,venue,date]),async()=>{
  const res = await fetch("/.netlify/functions/get-setlist", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify({ setlistId: setlistId || null, artist, venue, date }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `setlist.fm returned ${res.status}`);
  }
  return res.json();
  });
}

const externalCatalogCache = createRequestCache({ max: 50 });
async function searchAvailableConcertCatalog(field, value, context = {}) {
  const cacheKey = JSON.stringify([field, value.trim().toLocaleLowerCase(), context.artist, context.venue, context.date, context.year, context.city, context.country]);
  const external = externalCatalogCache.get(cacheKey,async()=> fetch("/.netlify/functions/search-concert-catalog", {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: { "Content-Type": "application/json", ...(await sessionHeaders()) },
      body: JSON.stringify({ field, value, ...context }),
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("We couldn’t search for concerts. Check your connection and try again.");
      return Object.assign(payload.concerts || [], { partial: Boolean(payload.partial) });
    }));
  const [local, providerResults] = await Promise.all([
    // ponytail: keep discovery responsive if the local RPC stalls; the next search retries it.
    supabaseEnabled ? Promise.race([searchConcertCatalog(field, value).catch(() => []), new Promise((resolve) => window.setTimeout(() => resolve([]), 750))]) : [],
    external,
  ]);
  const concerts = [...new Map([...local, ...providerResults].map((concert) => [
    `${normalize(concert.artist)}|${normalize(concert.venue)}|${concert.date}`,
    concert,
  ])).values()];
  const limit = context.country ? 420 : 40;
  return Object.assign(concerts.slice(0, limit), { partial: providerResults.partial || concerts.length > limit });
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────


function countryLabel(code) {
  return countryName(code);
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


function concertMatches(concert, target) {
  if (concert.concertId && target.concertId) return concert.concertId === target.concertId;
  return normalize(concert.artist) === normalize(target.artist)
    && concert.date === target.date
    && normalize(concert.venue || "") === normalize(target.venue || "");
}

function concertRouteKey(concert) {
  return String(concert?.concertId || `${normalize(concert?.artist)}|${normalize(concert?.venue)}|${concert?.date || ""}`);
}


function updateConcert(items, target, data) {
  let updated = false;
  return items.map((concert) => {
    if (updated || !concertMatches(concert, target)) return concert;
    updated = true;
    return {
      ...concert,
      artist: uppercaseConcertLabel(data.artist.trim()),
      venue: uppercaseConcertLabel(canonicalVenue(data.venue?.trim())),
      date: data.date.trim(),
      bought: target.mode === "history" ? true : Boolean(data.bought),
      ...(data.setlistId?.trim() ? { setlistId: data.setlistId.trim() } : {}),
      attendeeUserIds: data.attendeeUserIds || [],
      guestAttendees: data.guestAttendees || [],
      doorsAt: data.doorsAt || "", startsAt: data.startsAt || "", address: data.address || "", latitude: data.latitude || "", longitude: data.longitude || "", promoter: data.promoter || "",
      festival: data.festival || "", tour: data.tour || "", eventStatus: data.eventStatus || "announced", lineup: data.lineup || [{ artist: uppercaseConcertLabel(data.artist.trim()) }],
      source: data.source || "", sourceEventId: data.sourceEventId || "", sourceUrl: data.sourceUrl || "",
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
      concert.city ? `X-ADN-CITY:${escapeIcsText(concert.city)}` : null,
      concert.country ? `X-ADN-COUNTRY:${escapeIcsText(concert.country)}` : null,
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



function EventMetadata({ concert, primaryTicketUrl = "" }) {
  const { t, locale } = useI18n();
  const lineup = (concert.lineup || []).slice(1).map((item) => item.artist).filter(Boolean);
  const sourceLinks = uniqueSourceLinks(concert.sources, primaryTicketUrl);
  const rows = [
    concert.doorsAt && ["Doors", new Date(concert.doorsAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })],
    concert.startsAt && ["Start", new Date(concert.startsAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })],
    concert.address && ["Address", concert.address], concert.promoter && ["Promoter", concert.promoter],
    concert.festival && ["Festival", concert.festival], concert.tour && ["Tour", concert.tour],
    lineup.length && ["Also playing", lineup.join(" · ")],
  ].filter(Boolean);
  if (!rows.length && !sourceLinks.length && (!concert.eventStatus || concert.eventStatus === "announced")) return null;
  return <section className="mb-5 border-b border-zinc-900 pb-4">
    {concert.eventStatus && concert.eventStatus !== "announced" && <span className={`mb-3 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${concert.eventStatus === "cancelled" ? "border-red-900 bg-red-950/40 text-red-300" : concert.eventStatus === "sold_out" ? "border-amber-900 bg-amber-950/30 text-amber-300" : "border-blue-900 bg-blue-950/30 text-blue-300"}`}>{t(({ postponed: "Postponed", cancelled: "Cancelled", sold_out: "Sold out" })[concert.eventStatus])}</span>}
    <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{t(label)}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-zinc-300">{value}</dd></div>)}{sourceLinks.length > 0 && <div className="min-w-0"><dt className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{t("Tickets and event details")}</dt><dd className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold">{sourceLinks.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">{t("Open ticket page")} ↗</a>)}</dd></div>}</dl>
  </section>;
}

// ─── SetlistModal ─────────────────────────────────────────────────────────────

function SetlistModal({ target, onClose, onEdit, onLeave, onIdDiscovered }) {
  const { t } = useI18n();
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  const dialogRef = useDialogFocus(Boolean(target));

  useEffect(() => {
    if (!target) return;
    let active = true;
    setState({ status: "loading", data: null, error: null });
    fetchSetlist({ setlistId: target.setlistId, artist: target.artist, venue: target.venue, date: target.date })
      .then((data) => {
        if (!active) return;
        setState({ status: "ok", data, error: null });
        // If we found the setlist via search and the ID wasn't stored yet, save it back
        if (!target.setlistId && data.id && onIdDiscovered) {
          onIdDiscovered(target, data.id);
        }
      })
      .catch((err) => {if(active)setState({ status: "error", data: null, error: err.message });});
    return () => {active=false;};
  }, [target?.setlistId, target?.artist, target?.venue, target?.date]);

  if (!target) return null;
  const { status, data } = state;

  let songs = [];
  if (data?.sets?.set) {
    data.sets.set.forEach((set) => { if (set.song) songs = songs.concat(set.song); });
  }

  return (
    <ConcertDialog concert={target} location={concertLocation(target)} primaryLabel={t("Setlist")} journalEnabled={Boolean(supabaseEnabled&&target.concertId)} dialogRef={dialogRef} onClose={onClose} onEdit={onEdit} testId="concert-details-modal">
      {(tab,id)=><>
        <div hidden={tab!=="details"}>
          <EventMetadata concert={target} />
          {target.attendees?.length > 0 && (
            <section className="mb-5 flex items-center gap-3 border-b border-zinc-900 pb-4">
              <div className="flex shrink-0 -space-x-2" aria-hidden="true">
                {target.attendees.slice(0, 3).map((person, index) => <span key={`${person}-${index}`} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-zinc-950 bg-zinc-800 text-[10px] font-black text-zinc-300">{String(person).trim().slice(0, 1).toUpperCase()}</span>)}
                {target.attendees.length > 3 && <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-zinc-950 bg-zinc-900 text-[9px] font-black text-zinc-500">+{target.attendees.length - 3}</span>}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">{t("Attended with")}</div>
                <p className="mt-0.5 break-words text-sm font-semibold text-zinc-300">{target.attendees.join(" · ")}</p>
              </div>
            </section>
          )}
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Setlist")}</h3>
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3" role="status" aria-live="polite">
              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200" />
              <span className="text-sm text-zinc-500">{t("Loading setlist…")}</span>
            </div>
          )}
          {status === "error" && (
            <div className="py-5 text-sm text-zinc-300" role="status">
              <p className="font-bold mb-1">{t("Setlist unavailable")}</p>
              <p className="text-zinc-400">{t("This setlist may not have been published yet. Try again later.")}</p>
            </div>
          )}
          {status === "ok" && songs.length === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm text-zinc-400">
              {t("This setlist doesn’t contain any songs yet.")}
            </div>
          )}
          {status === "ok" && songs.length > 0 && (
            <div>
              <div className="mb-5">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("{count} songs", { count: songs.length })}</span>
              </div>
              <ol className="space-y-px">
                {songs.map((song, i) => (
                  <li key={i} className="flex items-center gap-4 border-b border-[var(--adn-border-strong)] py-3 last:border-0">
                    <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-zinc-400">{i + 1}</span>
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold leading-snug ${song.tape ? "text-zinc-500" : "text-zinc-100"}`}>{song.name}</span>
                      {song.tape && <span className="text-[9px] font-bold uppercase tracking-widest border border-zinc-700 text-zinc-600 px-1.5 py-0.5 rounded-md">{t("tape")}</span>}
                      {song.cover?.name && <span className="text-[9px] font-bold uppercase tracking-widest border border-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded-md">{t("cover")}</span>}
                    </div>
                    {song.info && <span className="text-[11px] text-zinc-500 italic shrink-0 max-w-[120px] truncate">{song.info}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {onLeave && target.createdBy && target.createdBy !== target.currentUserId && <button type="button" onClick={() => onLeave(target)} className="adn-button-danger mt-6 w-full">{t("Remove from my archive")}</button>}
        </div>
        <div hidden={tab==="details"}><ConcertJournal key={target.concertId} concert={target} view={tab==="activity"?"activity":"memories"} /></div>
      </>}
    </ConcertDialog>
  );
}

// ─── ContextMenu ──────────────────────────────────────────────────────────────

function ContextMenu({ open, x, y, onEdit, onDelete, onClose }) {
  const { t } = useI18n();
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
        <button onClick={onEdit} className="block w-full px-4 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800">{t("Edit")}</button>
        <button onClick={onDelete} className="block w-full px-4 py-2 text-left text-sm text-red-300 hover:bg-zinc-800">{t("Delete")}</button>
      </div>
    </>
  );
}

// ─── EditConcertModal ─────────────────────────────────────────────────────────


function CalendarExportMenu({ items, compact = false, iconOnly = false }) {
  const { t } = useI18n();
  return (
    <DropdownMenu
      compact={compact}
      ariaLabel="Export concerts"
      buttonLabel={iconOnly ? <i className="fa-solid fa-download" aria-hidden="true" /> : "Export"}
      iconOnly={iconOnly}
      className={iconOnly ? "[&_summary]:flex [&_summary]:h-12 [&_summary]:w-12 [&_summary]:items-center [&_summary]:justify-center [&_summary]:!p-0" : ""}
      options={[
        { value: "all", label: t("Export all concerts"), disabled: items.length === 0, onSelect: () => downloadConcertCalendar(items, "concerts.ics", t("Upcoming concerts")) },
        { value: "bought", label: t("Export concerts with tickets"), disabled: !items.some((item) => item.bought), onSelect: () => downloadConcertCalendar(items.filter((item) => item.bought), "concerts-bought.ics", t("Concerts with tickets")) },
        { value: "not-bought", label: t("Export concerts without tickets"), disabled: !items.some((item) => !item.bought), onSelect: () => downloadConcertCalendar(items.filter((item) => !item.bought), "concerts-not-bought.ics", t("Concerts without tickets")) },
      ]}
    />
  );
}

function DropdownMenu({ value, onChange, options, compact = false, ariaLabel, className = "", groupName, centered = false, menuAlign = "right", buttonLabel, bare = false, iconOnly = false }) {
  const detailsRef = useRef(null);
  const normalizedOptions = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const activeLabel = buttonLabel || normalizedOptions.find((option) => option.value === value)?.label || normalizedOptions[0]?.label || "";

  function positionMenu() {
    const details = detailsRef.current;
    if (!details?.open) return;
    const menu = details.querySelector(".adn-popover");
    const bounds = details.getBoundingClientRect();
    const desired = menuAlign === "left" ? bounds.left : bounds.right - menu.offsetWidth;
    const left = Math.max(8, Math.min(desired, window.innerWidth - menu.offsetWidth - 8));
    menu.style.left = `${left - bounds.left}px`;
    menu.style.right = "auto";
  }

  useEffect(() => {
    function dismiss(event) {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target)) detailsRef.current.removeAttribute("open");
    }
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", positionMenu);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", positionMenu);
    };
  }, []);

  function selectOption(event, option) {
    if (option.onSelect) option.onSelect();
    else onChange?.(option.value);
    event.currentTarget.closest("details")?.removeAttribute("open");
  }

  return (
    <details ref={detailsRef} onToggle={positionMenu} name={groupName} className={`group relative min-w-0 ${className}`}>
      <summary aria-label={ariaLabel} className={`cursor-pointer list-none truncate text-sm font-semibold text-zinc-100 transition [&::-webkit-details-marker]:hidden ${bare ? "px-2 py-2 text-zinc-400 hover:text-zinc-100" : "rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-panel)] hover:border-zinc-500"} ${centered ? "text-center" : "text-left"} ${compact && !bare ? "px-4 py-2.5" : !bare ? "px-5 py-3" : ""}`}>
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
  const { t } = useI18n();
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
        { value: "artist", label: t("Sort by artist") },
        { value: "concerts", label: t("Sort by number of concerts") },
        { value: "recent", label: t("Sort by most recent") },
      ]}
    />
  );
}

function CalendarFilterMenu({ value, onChange, compact = false }) {
  const { t } = useI18n();
  return <DropdownMenu value={value} onChange={onChange} compact={compact} ariaLabel={t("Filter calendar")} iconOnly={compact} buttonLabel={compact ? <i className={`fa-solid fa-filter ${value !== "all" ? "text-blue-400" : ""}`} aria-hidden="true" /> : undefined} className={compact ? "[&_summary]:flex [&_summary]:h-12 [&_summary]:w-12 [&_summary]:items-center [&_summary]:justify-center [&_summary]:!p-0" : ""} options={[{value:"all",label:t("All concerts")},{value:"history",label:t("History")},{value:"bought",label:t("Tickets bought")},{value:"not-bought",label:t("Tickets to buy")}]} />;
}


function CalendarConcertModal({ target, artistImages, onClose, onEdit }) {
  const { t } = useI18n();
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
    <ConcertDialog concert={target} location={concertLocation(target)} primaryLabel={t("Details")} journalEnabled={Boolean(supabaseEnabled&&target.concertId)} dialogRef={dialogRef} onClose={onClose} onEdit={onEdit}>
      {(tab,id)=><>
        <div hidden={tab!=="details"} className="space-y-5">
          {!isPast && artistImage && <img src={artistImage} alt="" className="aspect-[21/9] w-full rounded-md object-cover object-center" />}
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${isPast?"bg-blue-400":target.bought?"bg-emerald-400":"bg-amber-400"}`} />{t(isPast ? "History" : target.bought ? "Ticket bought" : "Ticket not bought")}</p>
          {!isPast && <div className="flex flex-wrap gap-3">
            {ticketUrl && <a href={ticketUrl} target="_blank" rel="noreferrer" className="adn-button-primary"><i className="fa-solid fa-ticket" aria-hidden="true" />{t("Tickets")}<i className="fa-solid fa-arrow-up-right-from-square text-[10px]" aria-hidden="true" /></a>}
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="adn-button-secondary" aria-label={t("Share {artist} concert on WhatsApp",{artist:target.artist})}><img src={whatsappIcon} alt="" className="h-4 w-4 brightness-0 invert" />{t("Share")}</a>
          </div>}
          <EventMetadata concert={target} primaryTicketUrl={ticketUrl} />
          {!isPast && target.attendeeUsers?.length>0 && <section className="border-t border-[var(--adn-border-strong)] pt-4"><h3 className="mb-3 text-sm font-semibold text-zinc-300">{t("Friends attending")}</h3><div className="space-y-3">{target.attendeeUsers.map(person=><div key={person.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-zinc-200">{person.displayName}</span><span className="text-zinc-400">{t((person.status||"pending")[0].toUpperCase()+(person.status||"pending").slice(1))}</span></div>)}</div></section>}
        </div>
        <div hidden={tab==="details"}><ConcertJournal key={target.concertId} concert={target} view={tab==="activity"?"activity":"memories"} /></div>
      </>}
    </ConcertDialog>
  );
}

function ConfirmActionModal({ confirmation, onClose, onConfirm, isSaving, error }) {
  const { t } = useI18n();
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
    <div className="adn-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-description" className={`adn-modal-panel w-full max-w-sm rounded-3xl border bg-zinc-950 p-6 shadow-2xl ${streamlined ? "border-zinc-700" : "border-red-950"}`}>
        {streamlined ? <div className="mb-3 flex items-start justify-between gap-4"><h2 id="confirm-action-title" className="pt-1 text-xl font-black uppercase tracking-tight">{t(confirmation.title)}</h2><ModalCloseButton onClick={onClose} disabled={isSaving} /></div> : <><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-red-900/60 bg-red-950/30 text-red-300"><i className={`fa-solid ${confirmation.icon || "fa-triangle-exclamation"}`} aria-hidden="true" /></div><h2 id="confirm-action-title" className="mb-2 text-xl font-black uppercase tracking-tight">{t(confirmation.title)}</h2></>}
        <p id="confirm-action-description" className={`${confirmation.confirmationText ? "mb-4" : "mb-6"} text-sm leading-relaxed text-zinc-400`}>{t(confirmation.description)}</p>
        {confirmation.confirmationText && <label className="mb-6 block text-xs font-bold text-zinc-400">{t("Type {value} to continue", { value: confirmation.confirmationText })}<input value={typedConfirmation} onChange={(event) => setTypedConfirmation(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-400" /></label>}
        {error && <p className="mb-4 rounded-xl border border-red-900 bg-red-950/30 px-3 py-2 text-sm text-red-300" role="alert">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={isSaving} className="adn-button-secondary flex-1">{t("Cancel")}</button>
          <button type="button" onClick={onConfirm} disabled={isSaving || !confirmed} className="adn-button-danger flex-1">{t(isSaving ? "Working…" : confirmation.confirmLabel)}</button>
        </div>
      </div>
    </div>
  );
}

// ─── StatsPage ────────────────────────────────────────────────────────────────


// ─── Artist detail ────────────────────────────────────────────────────────────



// ─── LoginGate ────────────────────────────────────────────────────────────────

function LoginGate({ onSignedIn }) {
  const { t, language } = useI18n();
  const [mode, setMode] = useState("sign-in");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [signUpSent, setSignUpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [shake, setShake] = useState(false);
  const emailCooldown = useAuthEmailCooldown();

  async function attempt(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSignUpSent(false);
    try {
      if (mode === "sign-up") {
        const name = displayName.trim();
        if (name.length < 2) {
          setError(t("Enter your name."));
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError(t("Use at least 8 characters for your password."));
          setLoading(false);
          return;
        }
        if (password !== passwordConfirmation) {
          setError(t("The passwords do not match."));
          setLoading(false);
          return;
        }
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name }, emailRedirectTo: `${window.location.origin}/` },
        });
        if (!authError) {
          if (data.session) onSignedIn();
          else {
            emailCooldown.start();
            setMode("sign-in");
            setDisplayName("");
            setPassword("");
            setPasswordConfirmation("");
            setSignUpSent(true);
            setLoading(false);
          }
          return;
        }
        setError(t(authError.message?.toLowerCase().includes("password") ? "Choose a stronger password with at least 8 characters." : "We couldn’t create your account. Check the details and try again."));
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (!authError) {
          onSignedIn();
          return;
        }
        setError(t("Incorrect email or password."));
      }
    } catch {
      setError(t(mode === "sign-up" ? "We couldn’t create your account. Check your connection and try again." : "We couldn’t sign you in. Check your connection and try again."));
    }
    setPassword("");
    setPasswordConfirmation("");
    setShake(true);
    setTimeout(() => setShake(false), 500);
    setLoading(false);
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setDisplayName("");
    setPassword("");
    setPasswordConfirmation("");
    setError("");
    setResetSent(false);
    setSignUpSent(false);
  }

  async function requestPasswordReset() {
    const normalizedEmail = email.trim();
    setError("");
    setResetSent(false);
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError(t("Enter your email address first."));
      return;
    }
    const cooldownSeconds = emailCooldown.refresh();
    if (cooldownSeconds > 0) {
      setError(t("Wait {seconds} seconds before requesting another email.", { seconds: cooldownSeconds }));
      return;
    }
    setResetLoading(true);
    try {
      const redirectTo = `${window.location.origin}/?password-recovery=1`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (resetError) {
        setError(t("We couldn’t send the recovery email. Try again later."));
        return;
      }
      emailCooldown.start();
      setResetSent(true);
    } catch {
      setError(t("We couldn’t send the recovery email. Check your connection and try again."));
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className={`w-full max-w-sm ${shake ? "animate-shake" : ""}`}>
        <div className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.45em] text-zinc-500">A Deafening Noise</p>
          <h1 className="text-4xl font-black uppercase tracking-tight text-zinc-100">{t("Concert Archive")}</h1>
          <p className="mt-3 text-sm text-zinc-500">{t(mode === "sign-up" ? "Create your personal concert archive." : "Sign in to open your concert history.")}</p>
        </div>
        <form onSubmit={attempt} className="space-y-4">
          {mode === "sign-up" && <input type="text" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setError(""); }} placeholder={t("Display name")} autoComplete="name" autoFocus maxLength="80" required className={`w-full rounded-2xl border bg-zinc-900 px-5 py-4 text-zinc-100 outline-none transition placeholder:text-zinc-600 ${error ? "border-red-700" : "border-zinc-700 focus:border-zinc-400"}`} />}
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); setResetSent(false); setSignUpSent(false); }} placeholder={t("Email")} autoComplete="email" autoFocus={mode === "sign-in"} required className={`w-full rounded-2xl border bg-zinc-900 px-5 py-4 text-zinc-100 outline-none transition placeholder:text-zinc-600 ${error ? "border-red-700" : "border-zinc-700 focus:border-zinc-400"}`} />
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder={t("Password")} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} minLength={mode === "sign-up" ? 8 : undefined} required className={`w-full rounded-2xl border bg-zinc-900 px-5 py-4 text-zinc-100 outline-none transition placeholder:text-zinc-600 ${error ? "border-red-700 text-red-300" : "border-zinc-700 focus:border-zinc-400"}`} />
          {mode === "sign-up" && <input type="password" value={passwordConfirmation} onChange={(e) => { setPasswordConfirmation(e.target.value); setError(""); }} placeholder={t("Confirm password")} autoComplete="new-password" minLength="8" required className={`w-full rounded-2xl border bg-zinc-900 px-5 py-4 text-zinc-100 outline-none transition placeholder:text-zinc-600 ${error ? "border-red-700 text-red-300" : "border-zinc-700 focus:border-zinc-400"}`} />}
          {error && <p className="text-center text-sm text-red-400" role="alert">{error}</p>}
          {resetSent && <p className="rounded-2xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-center text-sm text-emerald-300">{t("If that account exists, a recovery link has been sent.")}</p>}
          {signUpSent && <p className="rounded-2xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-center text-sm text-emerald-300" role="status">{t("Check your email. If this address can be registered, you’ll receive a confirmation link. Already have an account? Sign in or reset your password.")}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 py-4 font-black uppercase tracking-widest text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 disabled:opacity-50">{t(loading ? mode === "sign-up" ? "Creating account…" : "Signing in…" : mode === "sign-up" ? "Create account" : "Sign in")}</button>
          {mode === "sign-in" && <button type="button" onClick={requestPasswordReset} disabled={loading || resetLoading || emailCooldown.seconds > 0} className="w-full py-2 text-sm font-semibold text-zinc-500 transition hover:text-zinc-200 disabled:opacity-50">{resetLoading ? t("Sending recovery email…") : emailCooldown.seconds > 0 ? t("Try again in {seconds}s", { seconds: emailCooldown.seconds }) : t("Forgot password?")}</button>}
          <button type="button" onClick={() => changeMode(mode === "sign-in" ? "sign-up" : "sign-in")} disabled={loading || resetLoading} className="w-full py-2 text-sm font-semibold text-zinc-400 transition hover:text-zinc-100 disabled:opacity-50">{t(mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in")}</button>
        </form>
        <p className="mt-8 text-center text-xs text-zinc-600"><a href={`/privacy.html?lang=${language}`} className="hover:text-zinc-300">{t("Privacy")}</a><span className="mx-2">·</span><a href={`/terms.html?lang=${language}`} className="hover:text-zinc-300">{t("Terms")}</a></p>
      </div>
    </div>
  );
}

function AppBootstrapShell() {
  const { t } = useI18n();
  return <div className="min-h-screen bg-zinc-950"><span className="sr-only" role="status">{t("Opening A Deafening Noise")}</span></div>;
}

function DeferredPage({ children }) {
  const { t } = useI18n();
  return <PageErrorBoundary resetKey={window.location.pathname}><React.Suspense fallback={<div className="h-64 animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900" role="status" aria-label={t("Opening page")} />}>{children}</React.Suspense></PageErrorBoundary>;
}

function ChangePasswordModal({ mode, email, onClose }) {
  const { t } = useI18n();
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
      setError(t("Wait {seconds} seconds before requesting another email.", { seconds: cooldownSeconds }));
      return;
    }
    setSaving(true);
    try {
      const { error: reauthenticationError } = await supabase.auth.reauthenticate();
      if (reauthenticationError) {
        setError(t("We couldn’t send the verification code. Try again later."));
        return;
      }
      emailCooldown.start();
      setStep("password");
    } catch {
      setError(t("We couldn’t send the verification code. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError(t("Use at least 8 characters for the new password."));
      return;
    }
    if (newPassword !== confirmation) {
      setError(t("The new passwords do not match."));
      return;
    }
    if (!isRecovery && !/^\d{6}$/.test(nonce.trim())) {
      setError(t("Enter the 6-digit code from your email."));
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        ...(!isRecovery ? { nonce: nonce.trim() } : {}),
      });
      if (updateError) {
        setError(t("We couldn’t change your password. Check the code and try again."));
        return;
      }
      setNonce("");
      setNewPassword("");
      setConfirmation("");
      setSaved(true);
      await supabase.auth.signOut();
    } catch {
      setError(t("We couldn’t change your password. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="adn-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4">
      <section role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="adn-modal-panel w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-zinc-600">{t(isRecovery ? "Account recovery" : "Account security")}</p>
            <h2 id="change-password-title" className="text-2xl font-black text-zinc-100">{t(step === "request" && !saved ? "Verify your email" : "Choose a new password")}</h2>
          </div>
          <ModalCloseButton onClick={onClose} disabled={saving} />
        </div>
        {saved ? (
          <div>
            <p className="mb-6 rounded-2xl border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">{t("Your password has been changed. Sign in again with your new password.")}</p>
            <button type="button" onClick={onClose} className="adn-button-primary w-full">{t("Done")}</button>
          </div>
        ) : step === "request" ? (
          <div>
            <p className="mb-2 text-sm text-zinc-300">{t("We'll email a verification code to:")}</p>
            <p className="mb-6 break-all text-sm font-bold text-zinc-100">{email}</p>
            {error && <p className="mb-4 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button type="button" onClick={sendVerificationCode} disabled={saving || emailCooldown.seconds > 0} className="adn-button-primary w-full">{saving ? t("Sending code…") : emailCooldown.seconds > 0 ? t("Try again in {seconds}s", { seconds: emailCooldown.seconds }) : t("Send verification code")}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {!isRecovery && <p className="text-sm text-zinc-400">{t("Enter the verification code sent to {email}.", { email })}</p>}
            {!isRecovery && <input type="text" inputMode="numeric" value={nonce} onChange={(event) => { setNonce(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} placeholder={t("6-digit verification code")} autoComplete="one-time-code" pattern="[0-9]{6}" autoFocus required className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400" />}
            <input type="password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError(""); }} placeholder={t("New password")} autoComplete="new-password" minLength={8} required className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400" />
            <input type="password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(""); }} placeholder={t("Confirm new password")} autoComplete="new-password" minLength={8} required className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3.5 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-400" />
            <p className="text-xs text-zinc-600">{t("Use at least 8 characters.")}</p>
            {error && <p className="rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={saving} className="adn-button-primary w-full">{t(saving ? "Changing password…" : "Change password")}</button>
          </form>
        )}
      </section>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function mainNavigationItems(activePage, attentionCount, hasConcerts, t = (value) => value) {
  const archiveActive = ["history", "artist", "venue"].includes(activePage);
  return [
    ["home", "fa-house", t("Home"), activePage === "home", 0],
    hasConcerts && ["history", "fa-box-archive", t("nav.archive"), archiveActive, 0],
    hasConcerts && ["timeline", "fa-clock-rotate-left", t("nav.timeline"), activePage === "timeline", 0],
    hasConcerts && ["festivals", "fa-tent", t("Festivals"), activePage === "festivals", 0],
    ["next", "fa-calendar-days", t("nav.calendar"), activePage === "next", 0],
    ["suggestions", "fa-wand-magic-sparkles", t("nav.suggestions"), activePage === "suggestions", 0],
    ["stats", "fa-chart-column", t("Stats"), activePage === "stats" || activePage === "year-review", 0],
    ["friends", "fa-user-group", t("Friends"), activePage === "friends", attentionCount],
  ].filter(Boolean);
}

function DesktopNavigation({ activePage, profile, attentionCount, hasConcerts, onNavigate, onSearch }) {
  const { t } = useI18n();
  const items = mainNavigationItems(activePage, attentionCount, hasConcerts, t);
  return <aside className="adn-desktop-navigation fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[var(--adn-navigation-border)] bg-[var(--adn-navigation-surface)] lg:flex">
    <button type="button" onClick={() => onNavigate("home")} className="h-[121px] border-b border-[var(--adn-navigation-border)] px-4 text-left"><span className="block whitespace-nowrap text-[15px] font-black uppercase tracking-tight text-zinc-50">A Deafening Noise</span><span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">{t("Concert archive")}</span></button>
    <button type="button" onClick={onSearch} className="mx-3 mt-3 flex min-h-11 items-center gap-3 rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-card)] px-3 text-xs font-bold text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-100"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><span className="min-w-0 flex-1 truncate text-left">{t("Search my archive")}</span><kbd aria-hidden="true" className="shrink-0 rounded-md border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[9px] font-black leading-none text-zinc-500">CTRL K</kbd></button>
    <nav className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label={t("Main navigation")}>{items.map(([page, icon, label, active, count]) =>
      <button key={page} type="button" onClick={() => onNavigate(page)} aria-current={active ? "page" : undefined} className={`relative flex min-h-[61px] w-full items-center gap-3 px-5 text-left text-[12px] font-black uppercase tracking-wide transition-colors ${active ? "bg-[var(--adn-card-hover)] text-zinc-50 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-blue-500" : "text-zinc-400 hover:bg-[var(--adn-card-hover)] hover:text-zinc-100"}`}><i className={`fa-solid ${icon} w-5 text-center text-[17px] ${active ? "text-zinc-100" : "text-zinc-400"}`} aria-hidden="true" /><span className="truncate">{label}</span>{count > 0 && <span className="ml-auto min-w-5 rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[8px] text-white">{count}</span>}</button>
    )}</nav>
    <div className="mx-4 h-[98px] border-t border-[#2a2e34]"><button type="button" onClick={() => onNavigate("profile")} aria-current={activePage === "profile" || activePage === "admin" ? "page" : undefined} className={`group relative flex h-full w-full items-center gap-3 rounded-lg text-left transition-colors ${activePage === "profile" || activePage === "admin" ? "before:absolute before:inset-y-6 before:-left-4 before:w-0.5 before:bg-blue-500" : ""}`}><UserAvatar person={profile} size="h-8 w-8" /><span className={`min-w-0 flex-1 truncate text-xs font-bold transition-colors group-hover:text-white ${activePage === "profile" || activePage === "admin" ? "text-white" : "text-zinc-300"}`}>{profile?.displayName || profile?.username || "Profile"}</span><i className={`fa-solid fa-chevron-right text-[9px] transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-blue-400 ${activePage === "profile" || activePage === "admin" ? "text-blue-400" : "text-zinc-500"}`} aria-hidden="true" /></button></div>
  </aside>;
}

export default function App() {
  const dialogGuard = useDialogGuard();
  const guardedClose = action => dialogGuard ? dialogGuard.requestClose(action) : action();
  const { language, setLanguage, t } = useI18n();
  const initialRoute = useMemo(() => readRouteFromLocation(), []);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === "poster" ? "poster" : "archive");
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!supabaseEnabled);

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("artist");
  const [activePage, setActivePage] = useState(initialRoute.page);
  const [selectedArtist, setSelectedArtist] = useState(initialRoute.artist);
  const [selectedVenue, setSelectedVenue] = useState(initialRoute.venue);
  const [selectedCity, setSelectedCity] = useState(initialRoute.city);
  const [selectedCountry, setSelectedCountry] = useState(initialRoute.country);
  const [selectedConcertId, setSelectedConcertId] = useState(initialRoute.concert || "");
  const [selectedFestival, setSelectedFestival] = useState(initialRoute.festival || "");
  const [calendarFilter, setCalendarFilter] = useState("all");
  const [selectedReviewYear, setSelectedReviewYear] = useState(initialRoute.year || "");
  const [selectedPerson, setSelectedPerson] = useState(initialRoute.person || "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [headerControlsNode, setHeaderControlsNode] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [addInitial, setAddInitial] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, target: null });
  const [setlistTarget, setSetlistTarget] = useState(null);
  const [calendarTarget, setCalendarTarget] = useState(null);
  const [concertItems, setConcertItems] = useState(fallbackConcerts);
  const [suggestionCatalog, setSuggestionCatalog] = useState(suggestionsData.suggestions || []);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(fallbackDismissedSuggestions);
  const [suggestionReviewDates, setSuggestionReviewDates] = useState(concertsData.suggestionReviewDates || {});
  const [calendarPosition, setCalendarPosition] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("adn-calendar-month"));
      if (saved?.owner && Number.isFinite(new Date(saved.month).getTime())) return saved;
    } catch { /* Calendar still works when browser storage is unavailable. */ }
    return null;
  });
  const [listenedArtists, setListenedArtists] = useState([]);
  const [artistImageRows, setArtistImageRows] = useState([]);
  const [spotifyStatus, setSpotifyStatus] = useState({ connected: !supabaseEnabled });
  const [appProfile, setAppProfile] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [concertInvitations, setConcertInvitations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [statsFilters, setStatsFilters] = useState(() => filterScope(initialRoute.page) === "stats" ? readArchiveFilters(window.location.search) : {});
  const statsFriendIds = statsFilters.friends || [];

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
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "poster" ? "#050506" : "#09090b");
    try { localStorage.setItem("adn-theme", theme); } catch { /* Theme still works for this visit. */ }
  }, [theme]);
  useEffect(() => {
    if (appProfile?.language && appProfile.language !== language) setLanguage(appProfile.language);
  }, [appProfile?.language]);
  useEffect(() => {
    if (!successMessage) return undefined;
    const timeout = window.setTimeout(() => setSuccessMessage(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);
  passwordModalModeRef.current = passwordModalMode;
  const anyDialogOpen = globalSearchOpen || modalOpen || Boolean(editTarget) || Boolean(setlistTarget) || Boolean(calendarTarget) || Boolean(confirmRemoveFriend) || Boolean(confirmAction) || Boolean(passwordModalMode);
  const anyPageOverlayOpen = sidebarOpen || globalSearchOpen || contextMenu.open || anyDialogOpen;
  if (anyPageOverlayOpen && !pageOverlayWasOpenRef.current) overlayScrollYRef.current = window.scrollY;
  pageOverlayWasOpenRef.current = anyPageOverlayOpen;
  const currentUserId = session?.user?.id || "";
  const calendarOwner = supabaseEnabled ? currentUserId : "demo";
  const calendarToday = new Date();
  const calendarMonth = calendarPosition?.owner === calendarOwner
    ? new Date(calendarPosition.month)
    : new Date(calendarToday.getFullYear(), calendarToday.getMonth(), 1);
  function setCalendarMonth(next) {
    setCalendarPosition((previous) => {
      const current = previous?.owner === calendarOwner ? new Date(previous.month) : calendarMonth;
      const month = typeof next === "function" ? next(current) : next;
      const position = { owner: calendarOwner, month: month.toISOString() };
      try { sessionStorage.setItem("adn-calendar-month", JSON.stringify(position)); } catch { /* Retain in memory. */ }
      return position;
    });
  }
  const filterOwnerRef = useRef(currentUserId);
  useEffect(() => {
    if (filterOwnerRef.current && filterOwnerRef.current !== currentUserId) { setStatsFilters({}); setCalendarFilter("all"); clearSearchCaches(); externalCatalogCache.clear(); setlistCache.clear(); dialogGuard?.reset(); }
    filterOwnerRef.current = currentUserId;
  }, [currentUserId]);
  const currentEmail = session?.user?.email?.toLowerCase() || "";
  const { dataReady, dataOwnerId, dataLoadError, syncError, isRefreshing, reloadAppData, refreshAfterWrite, acceptArchive, retrySync } = useArchiveSync(currentUserId, applyAppData, setTheme);
  const currentUserName = appProfile?.displayName || "";
  const isAdmin = !supabaseEnabled || appProfile?.role === "admin";
  const canEdit = !supabaseEnabled || Boolean(appProfile);

  useEffect(() => {
    const openSearch = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setGlobalSearchOpen(true); }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  const isNext = canEdit && activePage === "next";
  const isHome = activePage === "home";
  const isArchive = activePage === "history";
  const isStats = activePage === "stats";
  const isTimeline = activePage === "timeline";
  const isYearReview = activePage === "year-review";
  const isFriends = activePage === "friends";
  const isActivity = activePage === "activity";
  const isProfile = activePage === "profile";
  const isFriendProfile = activePage === "friend-profile";
  const isAdminPage = isAdmin && activePage === "admin";
  const isSuggestions = canEdit && activePage === "suggestions";
  const isCityDetail = activePage === "city" && Boolean(selectedCity);
  const isCountryDetail = activePage === "country" && Boolean(selectedCountry);
  const isConcertDetail = activePage === "concert";
  const selectedFriend = isFriendProfile ? friends.find((friend) => friend.username === selectedPerson) : null;

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
  const scopedHistoryConcerts = useMemo(() => historyConcerts.filter((concert) => matchesArchiveFilters(concert, statsFilters)), [historyConcerts, statsFilters]);
  const scopedHistoryItems = useMemo(() => groupHistoryFromJson(scopedHistoryConcerts), [scopedHistoryConcerts]);
  const companionFriends = useMemo(() => friends.map((friend) => ({ ...friend, concertsTogether: historyConcerts.filter((concert) => concert.attendeeUsers?.some((person) => person.id === friend.id && person.status === "confirmed")).length })).sort((a,b)=>b.concertsTogether-a.concertsTogether||a.displayName.localeCompare(b.displayName)), [friends,historyConcerts]);
  const nextItems = useMemo(
    () => concertItems.filter((concert) => !isPastConcert(concert)),
    [concertItems]
  );
  const venueShows = selectedVenue
    ? historyItems.flatMap(({ shows }) => shows.map((show) => parseShow(show, "history"))).filter(({ venue }) => normalize(venue) === normalize(selectedVenue))
    : [];
  const isVenueDetail = activePage === "venue" && Boolean(selectedVenue);
  const cityShows = isCityDetail ? historyConcerts.filter((concert) => sameCity(concert, { city: selectedCity, country: selectedCountry })) : [];
  const countryShows = isCountryDetail ? historyConcerts.filter((concert) => String(concert.country || "").toUpperCase() === selectedCountry) : [];
  const selectedConcert = isConcertDetail ? concertItems.find((concert) => concertRouteKey(concert) === selectedConcertId) : null;
  const artistDetail = selectedArtist
    ? historyItems.find((item) => normalize(item.artist) === normalize(selectedArtist)) || { artist: selectedArtist, shows: [] }
    : null;
  const isArtistDetail = activePage === "artist" && Boolean(selectedArtist);
  const artistUpcoming = artistDetail
    ? nextItems.filter((item) => normalize(item.artist) === normalize(artistDetail.artist))
    : [];
  const mode = isNext ? "next" : "history";
  const title = isConcertDetail ? selectedConcert?.artist || t("Concert") : isCountryDetail ? countryName(selectedCountry) : isCityDetail ? selectedCity : isVenueDetail ? selectedVenue : isArtistDetail ? artistDetail.artist : isFriendProfile ? t("Profile") : isAdminPage ? t("Administration") : isSuggestions ? t("Concert Suggestions") : isProfile ? t("Profile") : isActivity ? t("Activity") : isFriends ? t("Friends") : isYearReview ? t("Year in Review") : isTimeline ? t("Concert Timeline") : isStats ? t("Archive Overview") : isNext ? t("Concert calendar") : t("Concert archive");
  const description = isConcertDetail ? selectedConcert ? `${selectedConcert.venue || t("Venue to be confirmed")} · ${selectedConcert.date}` : t("This concert isn’t available.")
    : isCountryDetail
    ? t("{count} archived concerts in this country.", { count: countryShows.length })
    : isCityDetail
    ? t("{count} archived concerts in this city.", { count: cityShows.length })
    : isVenueDetail
    ? t("{count} archived visits to this venue.", { count: venueShows.length })
    : isArtistDetail
    ? t("{count} live performances in the archive.", { count: artistDetail.shows.length })
    : isFriendProfile ? selectedFriend ? `@${selectedFriend.username}` : t("This profile isn’t available.")
    : isAdminPage ? t("Users, roles and access controls.")
    : isSuggestions ? t("Discover upcoming concerts from artists you already listen to.")
    : isProfile ? t("Your identity, privacy and account settings.")
    : isActivity ? t("Everything that needs your attention.")
    : isYearReview
    ? t("The artists, venues and moments that defined each year.")
    : isTimeline
    ? t("Every concert, year by year.")
    : isFriends
    ? t("Find friends, manage requests and review concert invitations.")
    : isStats
    ? t("A snapshot of your concert history at a glance.")
    : isNext ? t("Past concerts, upcoming shows and possibilities in one calendar.") : t("A searchable lifetime lineup of artists, venues and dates.");

  const filtered = useMemo(() => {
    const visibleItems = isNext ? nextItems : historyItems;
    return sortConcerts(filterConcerts(visibleItems, query), sortMode, mode);
  }, [historyItems, nextItems, query, sortMode, mode, isNext]);

  const calendarItems = useMemo(() => {
    const visibleConcerts = concertItems
      .filter((concert) => concert.bought || !isPastConcert(concert))
      .map((concert) => ({ ...concert, source: isPastConcert(concert) ? "history" : "next" }));
    return filterConcerts(visibleConcerts, query).filter((concert) => calendarFilter === "all" || (calendarFilter === "history" ? isPastConcert(concert) : !isPastConcert(concert) && concert.bought === (calendarFilter === "bought")));
  }, [concertItems, query, calendarFilter]);

  const artistImages = useMemo(() => new Map(artistImageRows.map(({ artist, imageUrl }) => [normalize(artist), imageUrl])), [artistImageRows]);
  const availableSuggestions = suggestionCatalog.filter((item) => isCurrentSuggestion(item));
  const suggestionReviews = useMemo(() => Object.fromEntries(availableSuggestions.flatMap((suggestion) => {
    const concert = concertItems.find((item) => suggestionKey(item) === suggestionKey(suggestion));
    if (concert) return [[suggestion.id, { decision: "interested", concert, reviewedAt: suggestionReviewDates.concerts?.[concert.concertId] || suggestionReviewDates.local?.[suggestionKey(suggestion)] }]];
    if (isDismissedSuggestion(suggestion, dismissedSuggestions)) return [[suggestion.id, { decision: "not-interested", reviewedAt: suggestionReviewDates.dismissed?.[dismissedSuggestions.find((key) => isDismissedSuggestion(suggestion, [key]))] || suggestionReviewDates.local?.[suggestionKey(suggestion)] }]];
    return [];
  })), [availableSuggestions, concertItems, dismissedSuggestions, suggestionReviewDates]);

  const artistSuggestions = useMemo(() => {
    const set = new Set();
    historyItems.forEach((i) => set.add(i.artist));
    nextItems.forEach((i) => set.add(i.artist));
    listenedArtists.forEach((artist) => set.add(uppercaseConcertLabel(artist)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [historyItems, nextItems, listenedArtists]);

  useEffect(() => {
    if (!dataReady || dataOwnerId !== currentUserId || concertItems.length || !["history", "timeline", "artist", "venue"].includes(activePage)) return;
    navigateTo({ page: "home" }, { replace: true });
  }, [activePage, concertItems.length, currentUserId, dataOwnerId, dataReady]);

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
        clearSearchCaches(); externalCatalogCache.clear(); setlistCache.clear();
        setCalendarPosition(null);
        try { sessionStorage.removeItem("adn-calendar-month"); } catch { /* In-memory state is already cleared. */ }
        void clearAppCache();
        if (!recoveryRequested || event === "SIGNED_OUT") showLoginRoute();
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);


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
    if (!isPasswordRecovery && !isLoggedOutRoot && window.location.pathname !== "/spotify/callback") window.history.replaceState({ adnRoute: true, canGoBack: false }, "", routeToPath(initial) + (filterScope(initial.page) ? window.location.search : ""));

    function restoreRoute() {
      if (dialogHistoryOpenRef.current && dialogGuard && !dialogGuard.canClose()) {
        window.history.pushState({ ...window.history.state, adnModal: true }, "", window.location.href);
        dialogGuard.requestClose(() => window.history.back());
        return;
      }
      if (dialogHistoryOpenRef.current || closingDialogWithBackRef.current) {
        const scrollY = dialogScrollYRef.current;
        dialogHistoryOpenRef.current = false;
        closingDialogWithBackRef.current = false;
        setModalOpen(false);
        setGlobalSearchOpen(false);
        setAddInitial(null);
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
      if (filterScope(route.page) === "stats") setStatsFilters(readArchiveFilters(window.location.search));
      setActivePage(route.page);
      setSelectedArtist(route.artist);
      setSelectedVenue(route.venue);
      setSelectedCity(route.city);
      setSelectedCountry(route.country);
      setSelectedConcertId(route.concert || "");
      setSelectedFestival(route.festival || "");
      setSelectedReviewYear(route.year || "");
      setSelectedPerson(route.person || "");
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
  if (!supabaseEnabled && !IS_LOCAL) return <>{passwordModal}<div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-center text-red-300">{t("A Deafening Noise is unavailable right now. Try again later.")}</div></>;
  if (passwordModalMode === "recovery") return <>{passwordModal}<div className="min-h-screen bg-zinc-950" aria-hidden="true" /></>;
  if (supabaseEnabled && !session) return <>{passwordModal}<LoginGate onSignedIn={() => navigateTo({ page: "home" }, { replace: true })} /></>;
  if (dataLoadError) return <>{passwordModal}<div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-center text-red-300">{dataLoadError}</div></>;
  if (!dataReady || (supabaseEnabled && dataOwnerId !== currentUserId)) return <>{passwordModal}<AppBootstrapShell /></>;

  function navigateTo(route, { replace = false } = {}) {
    const updateHistory = replace ? window.history.replaceState.bind(window.history) : window.history.pushState.bind(window.history);
    const scope = filterScope(route.page);
    const path = scope ? withArchiveFilters(routeToPath(route), statsFilters) : routeToPath(route);
    updateHistory({ adnRoute: true, canGoBack: !replace }, "", path);
    setActivePage(route.page);
    setSelectedArtist(route.artist || null);
    setSelectedVenue(route.venue || null);
    setSelectedCity(route.city || null);
    setSelectedCountry(route.country || null);
    setSelectedConcertId(route.concert || "");
    setSelectedFestival(route.festival || "");
    setSelectedReviewYear(route.year || "");
    setSelectedPerson(route.person || "");
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
    setSelectedCity(null);
    setSelectedCountry(null);
    setSelectedConcertId("");
    setSelectedReviewYear("");
    setQuery("");
    setSortMode("artist");
    setSidebarOpen(false);
    setStatsMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  function changePage(page) { navigateTo({ page: !canEdit && page === "next" ? "history" : page, artist: null, venue: null, city: null, country: null }); }
  function openFriendProfile(friend) { navigateTo({ page: "friend-profile", person: friend.username }); }
  function openArtistDetail(artist) {
    navigateTo({ page: "artist", artist, venue: null });
  }
  function openVenueDetail(venue) {
    if (!venue || venue === "Date confirmed") return;
    navigateTo({ page: "venue", artist: null, venue });
  }
  function openCityDetail(value) {
    const city = typeof value === "string" ? value : value?.city;
    const country = typeof value === "string" ? null : value?.country;
    if (!city) return;
    navigateTo({ page: "city", artist: null, venue: null, city, country });
  }
  function openCountryDetail(country) { if (country) navigateTo({ page: "country", artist: null, venue: null, city: null, country }); }
  function openConcertPage(concert) { if (concert) navigateTo({ page: "concert", concert: concertRouteKey(concert) }); }
  function openYearReview(year) {
    navigateTo({ page: "year-review", artist: null, venue: null, year: String(year) });
  }
  function changeReviewYear(year) {
    const route = { page: "year-review", artist: null, venue: null, year: String(year) };
    window.history.pushState({ adnRoute: true, canGoBack: true }, "", withArchiveFilters(routeToPath(route), statsFilters));
    setSelectedReviewYear(String(year));
  }
  function openConcertDetails(target) {
    const storedConcert = concertItems.find((concert) => concertMatches(concert, target));
    setSetlistTarget({
      ...target,
      ...storedConcert,
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

  function concertDataPayload(concerts, dismissed = dismissedSuggestions, reviewDates = suggestionReviewDates) {
    return { concerts, dismissedSuggestions: [...new Set(dismissed)], suggestionReviewDates: reviewDates };
  }

  function applyAppData(archive) {
    setConcertItems(archive.concerts || []);
    setSuggestionCatalog(archive.suggestions || []);
    setDismissedSuggestions(archive.dismissedSuggestions || []);
    setSuggestionReviewDates(archive.suggestionReviewDates || {});
    setListenedArtists(archive.listenedArtists || []);
    setArtistImageRows(archive.artistImages || []);
    setSpotifyStatus({ ...(archive.spotifyStatus || { connected: false }), unavailable: Boolean(archive.discoveryUnavailable) });
    setAppProfile(archive.profile || null);
    setFriends(archive.friends || []);
    setFriendRequests(archive.friendRequests || []);
    setConcertInvitations(archive.concertInvitations || []);
    setNotifications(archive.notifications || []);
  }


  async function changeTheme(nextTheme) {
    const previousTheme = theme;
    setTheme(nextTheme);
    if (!supabaseEnabled) return;
    try {
      const updatedProfile = await updateMyProfile({ theme: nextTheme });
      if (updatedProfile?.theme !== nextTheme) throw new Error("Your appearance could not be saved to your account.");
    } catch (error) {
      setTheme(previousTheme);
      setSaveError("We couldn’t save your appearance. Try again.");
      throw error;
    }
  }

  async function changeLanguage(nextLanguage) {
    const previousLanguage = language;
    setLanguage(nextLanguage);
    if (!supabaseEnabled) return;
    try {
      const updatedProfile = await updateMyProfile({ language: nextLanguage });
      if (updatedProfile?.language !== nextLanguage) throw new Error("Language was not saved.");
      setAppProfile((current) => current ? { ...current, language: nextLanguage } : current);
    } catch (error) {
      setLanguage(previousLanguage);
      setSaveError("We couldn’t save your language. Try again.");
      throw error;
    }
  }

  async function handleAddConcert(data, suggestion = null) {
    const pastConcert = isPastConcert({ date: data.date });
    const newConcert = {
      concertId: data.concertId || null,
      artist: uppercaseConcertLabel(data.artist.trim()),
      venue: uppercaseConcertLabel(canonicalVenue(data.venue?.trim())),
      city: data.city?.trim() || "",
      country: String(data.country || "").trim().toUpperCase(),
      date: data.date.trim(),
      bought: pastConcert ? true : Boolean(data.bought),
      attendeeUserIds: data.attendeeUserIds || [],
      guestAttendees: data.guestAttendees || [],
      doorsAt: data.doorsAt || "", startsAt: data.startsAt || "", address: data.address || "", latitude: data.latitude || "", longitude: data.longitude || "", promoter: data.promoter || "",
      festival: data.festival || "", tour: data.tour || "", eventStatus: data.eventStatus || "announced", lineup: data.lineup || [{ artist: uppercaseConcertLabel(data.artist.trim()) }],
      source: data.source || "", sourceEventId: data.sourceEventId || "", sourceUrl: data.sourceUrl || "",
      ...(data.setlistId ? {setlistId:data.setlistId} : {}),
      ...(data.guestAttendees?.length ? { attendees: data.guestAttendees } : {}),
      ...(!pastConcert && normalizeTicketUrl(data.ticketUrl) ? { ticketUrl: normalizeTicketUrl(data.ticketUrl) } : {}),
    };
    setIsSaving(true); setSaveError("");
    try {
      const updatedDismissed = suggestion ? dismissedSuggestions.filter((key) => !isDismissedSuggestion(suggestion, [key])) : dismissedSuggestions;
      if (supabaseEnabled) {
        await acceptArchive(suggestion ? await reviewMySuggestion(suggestion,true,dismissedSuggestions) : await upsertMyConcert(newConcert));
      } else {
        const updatedConcerts = [...concertItems, newConcert];
        const dates = suggestion ? { ...suggestionReviewDates, local: { ...suggestionReviewDates.local, [suggestionKey(suggestion)]: new Date().toISOString() } } : suggestionReviewDates;
        await saveConcertData(concertDataPayload(updatedConcerts, updatedDismissed, dates), `Add concert: ${data.artist}${data.venue ? " — " + data.venue : ""} (${data.date})`);
        setSuggestionReviewDates(dates);
        setConcertItems(updatedConcerts);
        setDismissedSuggestions(updatedDismissed);
      }
      setModalOpen(false);
      setAddInitial(null);
      if (suggestion) setSuccessMessage("Concert added to your calendar.");
    } catch { setSaveError("We couldn’t save this concert. Try again."); }
    finally { setIsSaving(false); }
  }

  async function handleEditConcert(data) {
    if (!editTarget) return;
    setIsSaving(true); setSaveError("");
    try {
      if (supabaseEnabled) {
        await acceptArchive(await upsertMyConcert({ ...data, concertId: editTarget.concertId, bought: isPastConcert(data) ? true : Boolean(data.bought) }));
      } else {
        const updatedConcerts = updateConcert(concertItems, editTarget, data);
        await saveConcertData(concertDataPayload(updatedConcerts), `Edit concert: ${data.artist}${data.venue ? " — " + data.venue : ""} (${data.date})`);
        setConcertItems(updatedConcerts);
      }
      setEditTarget(null);
    } catch { setSaveError("We couldn’t save your changes. Try again."); }
    finally { setIsSaving(false); }
  }

  function openContextMenu(e, target) { e.preventDefault(); if (isSaving || !canEdit) return; setContextMenu({ open: true, x: e.clientX, y: e.clientY, target }); }
  function openContextMenuAt(x, y, target) { if (isSaving || !canEdit) return; setContextMenu({ open: true, x, y, target }); }
  function closeContextMenu() { setContextMenu({ open: false, x: 0, y: 0, target: null }); }

  function startEditFromContext() {
    const t = contextMenu.target; closeContextMenu(); if (!t) return;
    const stored = concertItems.find(concert => concertMatches(concert, t));
    setEditTarget({ ...t, ...stored, mode: isPastConcert(stored || t) ? "history" : "next" });
  }

  function deleteFromContext() {
    const target = contextMenu.target; closeContextMenu(); if (!target) return;
    setSaveError("");
    setConfirmAction({
      title: t("Delete concert?"),
      description: t("{concert}. This action cannot be undone.", { concert: `${target.artist}${target.venue ? ` · ${target.venue}` : ""} · ${target.date}` }),
      confirmLabel: t("Delete"),
      hideIcon: true,
      action: async () => {
        if (supabaseEnabled && target.concertId) {
          await deleteMyConcert(target.concertId);
          await refreshAfterWrite();
        } else {
          const updatedConcerts = removeConcert(concertItems, target);
          await saveConcertData(concertDataPayload(updatedConcerts), `Delete concert: ${target.artist}${target.venue ? " — " + target.venue : ""} (${target.date})`);
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
    await refreshAfterWrite();
  }

  async function handleProfileExport() {
    const data = await exportMyData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `a-deafening-noise-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  }

  function reviewSuggestionAsInterested(suggestion) {
    if (isSaving || !isCurrentSuggestion(suggestion) || suggestionReviews[suggestion.id]?.decision === "interested") return;
    setSaveError("");
    void handleAddConcert({ artist: suggestion.artist, venue: suggestion.venue, city: suggestion.city || "", country: suggestion.country || "", date: suggestion.date, bought: false, ticketUrl: suggestion.sourceUrl || "", source: suggestion.source, sourceEventId: suggestion.id, sourceUrl: suggestion.sourceUrl, eventStatus: suggestion.eventStatus || "announced" }, suggestion);
  }

  function reviewSuggestionAsNotInterested(suggestion) {
    if (isSaving || suggestionReviews[suggestion.id]?.decision === "not-interested") return;
    setSaveError("");
    const matchingConcert = suggestionReviews[suggestion.id]?.concert;
    const action = async () => {
      const updatedDismissed = [...new Set([...dismissedSuggestions, suggestionKey(suggestion)])];
      const updatedConcerts = matchingConcert ? concertItems.filter((concert) => !concertMatches(concert, matchingConcert)) : concertItems;
    if (supabaseEnabled) {
        await acceptArchive(await reviewMySuggestion(suggestion,false));
      } else {
        const dates = { ...suggestionReviewDates, local: { ...suggestionReviewDates.local, [suggestionKey(suggestion)]: new Date().toISOString() } };
        await saveConcertData(concertDataPayload(updatedConcerts, updatedDismissed, dates), `Mark suggestion not interested: ${suggestion.artist} (${suggestion.date})`);
        setSuggestionReviewDates(dates);
        setConcertItems(updatedConcerts);
        setDismissedSuggestions(updatedDismissed);
      }
    };
    if (matchingConcert) {
      setConfirmAction({
        title: t("Mark as not interested?"),
        description: `${suggestion.artist} · ${suggestion.date}`,
        confirmLabel: t("Not interested"),
        hideIcon: true,
        action,
      });
      return;
    }
    setIsSaving(true);
    action().catch(() => setSaveError("We couldn’t save your choice. Try again.")).finally(() => setIsSaving(false));
  }

  function changeFilters(value) {
    setStatsFilters(value);
    window.history.replaceState(window.history.state, "", withArchiveFilters(window.location.pathname + window.location.search, value));
  }
  const statsScopeControl = <ArchiveFilters concerts={historyConcerts} friends={friends} value={statsFilters} onChange={changeFilters} stats />;
  const suggestionsPage = isSuggestions ? <DeferredPage><SuggestionsPage
    suggestions={availableSuggestions}
    artistImages={artistImages}
    reviews={suggestionReviews}
    onInterested={reviewSuggestionAsInterested}
    onNotInterested={reviewSuggestionAsNotInterested}
    onOpenProfile={() => changePage("profile")}
    spotifyConnected={spotifyStatus.connected}
    discoveryUnavailable={spotifyStatus.unavailable}
    onRetry={retrySync}
    isSaving={isSaving}
    saveError={saveError}
  /></DeferredPage> : null;

  return (
    <>
    {passwordModal}
    {isRefreshing && <span className="sr-only" role="status">{t("Syncing your latest data")}</span>}
    {syncError && <div className="fixed bottom-4 left-1/2 z-[80] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-amber-900 bg-zinc-950 px-4 py-2 text-xs font-semibold text-amber-300 shadow-2xl" role="status" aria-live="polite"><span className="whitespace-nowrap">{syncError === "offline" ? t("You’re offline") : t("Some information may be out of date.")}</span>{syncError === "refresh" && <button type="button" onClick={retrySync} disabled={isRefreshing} className="min-h-11 rounded-full px-2 font-black text-zinc-100 transition-colors hover:bg-zinc-800 disabled:opacity-50">{isRefreshing ? t("Retrying…") : t("Retry")}</button>}</div>}
    <main className="adn-shell min-h-screen bg-zinc-950 text-zinc-100 md:flex">
      <GlobalSearch open={globalSearchOpen} concerts={concertItems} friends={friends} onClose={() => setGlobalSearchOpen(false)} onArtist={openArtistDetail} onVenue={openVenueDetail} onConcert={openConcertPage} onCity={openCityDetail} onCountry={openCountryDetail} onFriend={openFriendProfile} onYear={openYearReview} />
      <DesktopNavigation activePage={activePage} profile={appProfile} attentionCount={friendRequests.filter((request) => request.direction === "incoming").length + concertInvitations.length} hasConcerts={concertItems.length > 0} onNavigate={changePage} onSearch={() => setGlobalSearchOpen(true)} />
      {/* Desktop-only fixed Menu button */}
      <button onClick={() => setSidebarOpen(true)} className="menu-button-desktop fixed left-4 top-4 z-40 h-11 w-11 rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-card)] text-sm text-zinc-100 shadow-lg transition-colors hover:border-zinc-500 hover:bg-[var(--adn-card-hover)] lg:hidden" aria-label={t("Open menu")} aria-expanded={sidebarOpen} aria-controls="main-navigation"><i className="fa-solid fa-bars text-xs" aria-hidden="true" /><span className="menu-button-label">{t("Menu")}</span></button>
      {/* Touch-device Menu starts at the top of the page and scrolls away with it */}
      <button onClick={() => setSidebarOpen(true)} className="menu-button-touch touch-target absolute left-4 top-4 z-40 h-11 w-11 rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-card)] text-sm text-zinc-100 shadow-lg transition-colors hover:border-zinc-500 hover:bg-[var(--adn-card-hover)]" aria-label={t("Open menu")} title={t("Menu")} aria-expanded={sidebarOpen} aria-controls="main-navigation"><i className="fa-solid fa-bars text-xs" aria-hidden="true" /></button>

      <button disabled={!sidebarOpen} aria-hidden={!sidebarOpen} tabIndex={sidebarOpen ? 0 : -1} className={`adn-menu-overlay fixed inset-0 z-40 bg-black/60 transition-opacity duration-150 lg:hidden ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={() => setSidebarOpen(false)} aria-label={t("Close menu overlay")} />

      <aside id="main-navigation" aria-label={t("Main navigation")} aria-hidden={!sidebarOpen} inert={!sidebarOpen ? "" : undefined} className={`adn-navigation adn-drawer-navigation fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--adn-navigation-border)] bg-[var(--adn-navigation-surface)] transition-transform duration-300 lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex min-h-[105px] items-center justify-between gap-3 border-b border-[var(--adn-navigation-border)] px-5 pt-[env(safe-area-inset-top)]">
          <button onClick={() => changePage("home")} className="min-w-0 text-left" aria-label={t("Go to dashboard")}><span className="block truncate text-[15px] font-black uppercase tracking-tight text-zinc-50">A Deafening Noise</span><span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">{t("Concert archive")}</span></button>
          <button onClick={() => setSidebarOpen(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-[var(--adn-card-hover)] hover:text-zinc-100" aria-label={t("Close menu")}><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        </div>
        <button type="button" onClick={() => { setSidebarOpen(false); setGlobalSearchOpen(true); }} className="mx-4 mt-4 flex min-h-12 w-[calc(100%-2rem)] items-center gap-3 rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-card)] px-4 text-sm font-bold text-zinc-400"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><span className="min-w-0 flex-1 truncate text-left">{t("Search my archive")}</span><kbd aria-hidden="true" className="shrink-0 rounded-md border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[9px] font-black leading-none text-zinc-500">CTRL K</kbd></button>
        <nav className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label={t("Main navigation")}>{mainNavigationItems(activePage, friendRequests.filter((request) => request.direction === "incoming").length + concertInvitations.length, concertItems.length > 0, t).map(([page, icon, label, active, count]) =>
          <button key={page} type="button" onClick={() => changePage(page)} aria-current={active ? "page" : undefined} className={`relative flex min-h-[58px] w-full items-center gap-3 px-5 text-left text-[12px] font-black uppercase tracking-wide transition-colors ${active ? "bg-[var(--adn-card-hover)] text-zinc-50 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-blue-500" : "text-zinc-400 hover:bg-[var(--adn-card-hover)] hover:text-zinc-100"}`}><i className={`fa-solid ${icon} w-5 text-center text-[17px] ${active ? "text-zinc-100" : "text-zinc-400"}`} aria-hidden="true" /><span className="truncate">{label}</span>{count > 0 && <span className="ml-auto min-w-5 rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[8px] text-white">{count}</span>}</button>
        )}</nav>
        {currentUserName && <div className="mx-4 h-[90px] shrink-0 border-t border-[#2a2e34] pb-[env(safe-area-inset-bottom)]"><button type="button" onClick={() => changePage("profile")} aria-current={activePage === "profile" || activePage === "admin" ? "page" : undefined} className={`group relative flex h-full w-full items-center gap-3 text-left transition-colors ${activePage === "profile" || activePage === "admin" ? "before:absolute before:inset-y-5 before:-left-4 before:w-0.5 before:bg-blue-500" : ""}`}><UserAvatar person={appProfile} size="h-8 w-8" /><span className={`min-w-0 flex-1 truncate text-xs font-bold transition-colors group-hover:text-white ${activePage === "profile" || activePage === "admin" ? "text-white" : "text-zinc-300"}`}>{currentUserName}</span><i className={`fa-solid fa-chevron-right text-[9px] transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-blue-400 ${activePage === "profile" || activePage === "admin" ? "text-blue-400" : "text-zinc-500"}`} aria-hidden="true" /></button></div>}
      </aside>

      <section className={`adn-content w-full overflow-x-hidden ${isHome ? "px-4 pb-8 pt-5 lg:pb-10 lg:pl-[51px] lg:pr-[56px] lg:pt-8" : "px-4 pb-8 pt-5 md:px-8 md:py-10 lg:px-[51px] lg:py-8 lg:pr-[56px]"}`}>
        {!isHome && <header className="mb-6 min-h-32 pt-14 text-left md:min-h-0 md:pt-0 lg:mb-6">
          <div className="flex flex-col items-start justify-between gap-5 lg:flex-row">
            <div className="min-w-0"><h1 className="break-words text-3xl font-black uppercase leading-none tracking-[0.025em] text-zinc-50 lg:text-[1.75rem]">{activePage === "festivals" ? selectedFestival || t("Festivals") : title}</h1>{activePage !== "festivals" && <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-zinc-400">{description}</p>}</div>
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
          spotifyConnected={spotifyStatus.connected}
          friendCount={friends.length}
          onAdd={() => { setSaveError(""); setAddInitial(null); setModalOpen(true); }}
          onOpenConcert={(concert) => setCalendarTarget({ ...concert, mode: isPastConcert(concert) ? "history" : "next" })}
          onSuggestionInterested={reviewSuggestionAsInterested}
          onSuggestionNotInterested={reviewSuggestionAsNotInterested}
          onNavigate={changePage}
          onOpenYearReview={openYearReview}
          DropdownMenu={DropdownMenu}
        /></DeferredPage> : activePage === "festivals" ? <DeferredPage><FestivalsPage concerts={concertItems} selected={selectedFestival} onSelect={(festival) => navigateTo({ page: "festivals", festival })} onOpenConcert={openConcertDetails} DropdownMenu={DropdownMenu} headerTarget={headerControlsNode} /></DeferredPage> : isConcertDetail ? (
          <DeferredPage><ConcertDetailPage concert={selectedConcert} onOpenArtist={openArtistDetail} onOpenVenue={openVenueDetail} onOpenCity={openCityDetail} onOpenCountry={openCountryDetail} onOpenSetlist={openConcertDetails} onEdit={(concert) => setEditTarget({ ...concert, mode: isPastConcert(concert) ? "history" : "next" })} Icon={Icon} /></DeferredPage>
        ) : isCountryDetail ? (
          <DeferredPage><CountryDetailPage
            country={selectedCountry}
            historyConcerts={historyConcerts}
            upcoming={nextItems}
            onOpenCity={openCityDetail}
            onOpenArtist={openArtistDetail}
            onOpenVenue={openVenueDetail}
            onOpenConcert={openConcertDetails}
            DropdownMenu={DropdownMenu}
            Icon={Icon}
          /></DeferredPage>
        ) : isCityDetail ? (
          <DeferredPage><CityDetailPage
            city={selectedCity}
            country={selectedCountry}
            historyConcerts={historyConcerts}
            upcoming={nextItems}
            onOpenArtist={openArtistDetail}
            onOpenVenue={openVenueDetail}
            onOpenCountry={openCountryDetail}
            onOpenConcert={openConcertDetails}
            DropdownMenu={DropdownMenu}
            Icon={Icon}
          /></DeferredPage>
        ) : isVenueDetail ? (
          <DeferredPage><VenueDetailPage
            venue={selectedVenue}
            historyItems={historyItems}
            historyConcerts={historyConcerts}
            upcoming={nextItems}
            onOpenArtist={openArtistDetail}
            onOpenSetlist={openConcertDetails}
            onOpenCity={openCityDetail}
            onOpenCountry={openCountryDetail}
            DropdownMenu={DropdownMenu}
            Icon={Icon}
          /></DeferredPage>
        ) : isArtistDetail ? (
          <DeferredPage><ArtistDetailPage
            item={artistDetail}
            upcoming={artistUpcoming}
            onOpenSetlist={openConcertDetails}
            onOpenVenue={openVenueDetail}
            onOpenCity={openCityDetail}
            onOpenCountry={openCountryDetail}
            Icon={Icon}
          /></DeferredPage>
        ) : isTimeline ? (
          <DeferredPage><ConcertTimelinePage
            historyItems={historyItems}
            historyConcerts={historyConcerts}
            onOpenArtist={openArtistDetail}
            onOpenSetlist={openConcertDetails}
            onOpenVenue={openVenueDetail}
            onOpenCity={openCityDetail}
            onOpenCountry={openCountryDetail}
            DropdownMenu={DropdownMenu}
            Icon={Icon}
            headerTarget={headerControlsNode}
          /></DeferredPage>
        ) : isYearReview ? (
          <>{headerControlsNode && createPortal(statsScopeControl, headerControlsNode)}<DeferredPage><YearInReviewPage
            historyItems={scopedHistoryItems}
            historyConcerts={scopedHistoryConcerts}
            selectedYear={selectedReviewYear}
            onYearChange={changeReviewYear}
            onOpenArtist={openArtistDetail}
            onOpenSetlist={openConcertDetails}
            onOpenVenue={openVenueDetail}
            onOpenCity={openCityDetail}
            onOpenCountry={openCountryDetail}
            DropdownMenu={DropdownMenu}
            Icon={Icon}
            headerTarget={headerControlsNode}
          /></DeferredPage></>
        ) : isSuggestions ? suggestionsPage
        : isAdminPage ? <DeferredPage><AdminPage currentUserId={currentUserId} onChanged={refreshAfterWrite} onConfirm={(confirmation) => { setSaveError(""); setConfirmAction(confirmation); }} /></DeferredPage>
        : isProfile ? <DeferredPage><ProfilePage profile={appProfile} futureArtists={[...new Set(concertItems.filter((concert) => !isPastConcert(concert)).map((concert) => concert.artist))]} theme={theme} language={language} isAdmin={isAdmin} onThemeChange={changeTheme} onLanguageChange={changeLanguage} onAdmin={() => changePage("admin")} onSignOut={() => supabase.auth.signOut()} onSave={async (payload) => { await updateMyProfile(payload); await refreshAfterWrite(); }} onExport={handleProfileExport} onDelete={async () => { await deleteMyAccount(); await supabase.auth.signOut(); }} onPassword={() => setPasswordModalMode("change")} onConfirm={(confirmation) => { setSaveError(""); setConfirmAction(confirmation); }} onSpotifyChanged={reloadAppData} onImported={refreshAfterWrite} /></DeferredPage>
        : isActivity ? <DeferredPage><ActivityPage notifications={notifications} onRead={async (ids) => { await markNotificationsRead(ids); await refreshAfterWrite(); }} onOpenFriends={() => changePage("friends")} onNavigate={changePage} onOpenConcert={(item) => { const concert=concertItems.find((candidate)=>candidate.concertId===item.concertId); if(concert) setCalendarTarget({ ...concert, mode:isPastConcert(concert)?"history":"next" }); }} /></DeferredPage>
        : isFriendProfile ? <DeferredPage><FriendProfilePage friend={selectedFriend} /></DeferredPage>
        : isFriends ? <DeferredPage><FriendsPage friends={friends} requests={friendRequests} invitations={concertInvitations} onSearch={searchProfiles} onSendRequest={(userId) => runSocialAction(() => sendFriendRequest(userId))} onRespondRequest={(requestId, accept) => runSocialAction(() => respondFriendRequest(requestId, accept))} onRequestRemoveFriend={(friend) => { setSaveError(""); setConfirmRemoveFriend(friend); }} onSetInvitationStatus={(concertId,status,bought) => runSocialAction(() => setConcertInvitationStatus(concertId,status,bought))} onOpenProfile={openFriendProfile} /></DeferredPage> : isStats ? <>{headerControlsNode && statsScopeControl && createPortal(statsScopeControl, headerControlsNode)}<DeferredPage><StatsPage historyItems={scopedHistoryItems} historyConcerts={scopedHistoryConcerts} selectedFriends={friends.filter((friend)=>statsFriendIds.includes(friend.id))} friendMode={statsFilters.friendMode || "all"} onOpenArtist={openArtistDetail} onOpenVenue={openVenueDetail} onOpenCountry={openCountryDetail} onOpenYearReview={openYearReview} /></DeferredPage></> : (
          <>
            {headerControlsNode && createPortal(<div className="w-full space-y-2 md:space-y-0">

                {/* Mobile layout */}
                <div className="flex items-center gap-2 md:hidden">
                  <div className="adn-search-field flex h-12 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-panel)] px-3">
                    <Icon type="search" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search…")} className="w-full min-w-0 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500" aria-label={t("Search concerts")} />
                  </div>
                  {isNext && <CalendarFilterMenu value={calendarFilter} onChange={setCalendarFilter} compact />}
                  {isNext ? <CalendarExportMenu items={nextItems} compact iconOnly /> : <ConcertSortMenu value={sortMode} onChange={setSortMode} compact iconOnly />}
                </div>

                {/* Desktop layout */}
                <div className={`hidden gap-3 md:grid ${isNext ? "md:grid-cols-[minmax(12rem,1fr)_auto_auto]" : "md:grid-cols-[minmax(18rem,1fr)_auto]"}`}>
                  <div className="adn-search-field flex h-12 items-center gap-3 rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-panel)] px-5">
                    <Icon type="search" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search artist, venue, festival, city or date")} className="w-full bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500" aria-label={t("Search concerts")} />
                  </div>
                  {isNext && <CalendarFilterMenu value={calendarFilter} onChange={setCalendarFilter} />}
                  {isNext ? <CalendarExportMenu items={nextItems} iconOnly /> : <ConcertSortMenu value={sortMode} onChange={setSortMode} iconOnly />}
                </div>
            </div>, headerControlsNode)}

            {isNext ? (
              <>
                <DeferredPage><NextConcertCalendar
                  items={calendarItems}
                  visibleMonth={calendarMonth}
                  setVisibleMonth={setCalendarMonth}
                  onOpen={(concert) => setCalendarTarget({ ...concert, mode: concert.source === "history" ? "history" : "next" })}
                  onContextMenu={(event, concert) => openContextMenu(event, { ...concert, mode: concert.source === "history" ? "history" : "next" })}
                  onContextMenuAt={(x, y, concert) => openContextMenuAt(x, y, { ...concert, mode: concert.source === "history" ? "history" : "next" })}
                /></DeferredPage>
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
                      item.bought ? <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-900/70 bg-emerald-950/30 px-3 py-1 text-xs font-bold text-emerald-300"><i className="fa-solid fa-check text-[9px]" aria-hidden="true" />{t("Ticket bought")}</span> : <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-900/60 bg-amber-950/20 px-3 py-1 text-xs font-bold text-amber-300"><i className="fa-solid fa-clock text-[9px]" aria-hidden="true" />{t("Ticket not bought")}</span>
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
                      const concertTarget = { ...target, ...storedConcert, setlistId: storedConcert?.setlistId || setlistId };
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
                          <button type="button" aria-label={t("Open {artist} at {venue} on {date}", { artist: item.artist, venue: venue || t("venue not specified"), date })} onClick={() => { if (!longPressed) openConcertDetails(concertTarget); }} className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400" />
                          <div className="adn-concert-metadata pointer-events-none relative space-y-2">
                            {!isNext && <div className="flex gap-2 text-sm font-semibold text-zinc-100"><Icon type="map" /><button onClick={() => openVenueDetail(venue)} className="pointer-events-auto truncate text-left hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{venue}</button></div>}
                            {!isNext && concertLocation(concertTarget) && <div className="flex gap-2 text-sm text-zinc-400"><i className="fa-solid fa-city mt-0.5 h-4 w-4 shrink-0 text-center text-zinc-500" aria-hidden="true" /><span className="truncate">{concertTarget.city && <button type="button" onClick={() => openCityDetail(concertTarget)} className="pointer-events-auto hover:underline">{concertTarget.city}</button>}{concertTarget.city && concertTarget.country && ", "}{concertTarget.country && <button type="button" onClick={() => openCountryDetail(concertTarget.country)} className="pointer-events-auto hover:underline">{countryName(concertTarget.country)}</button>}</span></div>}
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
            {filtered.length === 0 && <div className="mt-12"><EmptyState icon="fa-magnifying-glass" title={t("No concerts found")} description={t("Try another artist, venue, city or date.")} /></div>}
          </>
        )}
      </section>

      {isSaving && (
        <div className="adn-saving-toast pointer-events-none fixed bottom-6 right-6 z-[80] flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900/95 px-5 py-3 shadow-2xl backdrop-blur" role="status" aria-live="polite">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-100" />
          <span className="text-sm font-bold text-zinc-100">{t("Saving…")}</span>
        </div>
      )}
      {successMessage && <div className="adn-saving-toast fixed bottom-6 right-6 z-[80] max-w-[calc(100vw-2rem)] rounded-md border border-emerald-800 bg-emerald-950 px-5 py-3 text-sm font-bold text-emerald-200 shadow-2xl" role="status" aria-live="polite"><i className="fa-solid fa-circle-check mr-2" aria-hidden="true" />{t(successMessage)}<button type="button" onClick={() => setSuccessMessage("")} className="ml-4 text-emerald-400 hover:text-white" aria-label={t("Dismiss message")}><i className="fa-solid fa-xmark" aria-hidden="true" /></button></div>}

      <ConfirmActionModal confirmation={confirmRemoveFriend ? { title: t("Remove friend?"), description: t("{name} will no longer appear in concert invitations. Existing concert records remain unchanged.", { name: confirmRemoveFriend.displayName }), confirmLabel: t("Remove"), hideIcon: true } : null} onClose={() => { if (!isSaving) { setConfirmRemoveFriend(null); setSaveError(""); } }} isSaving={isSaving} error={saveError} onConfirm={async () => {
        if (!confirmRemoveFriend) return;
        setIsSaving(true); setSaveError("");
        try {
          await runSocialAction(() => removeFriend(confirmRemoveFriend.id));
          setConfirmRemoveFriend(null);
        } catch { setSaveError("We couldn’t remove this friend. Try again."); }
        finally { setIsSaving(false); }
      }} />

      <ConfirmActionModal confirmation={confirmAction} onClose={() => { if (!isSaving) { setConfirmAction(null); setSaveError(""); } }} isSaving={isSaving} error={saveError} onConfirm={async () => {
        if (!confirmAction) return;
        setIsSaving(true); setSaveError("");
        try { await confirmAction.action(); setConfirmAction(null); }
        catch (error) { setSaveError(confirmAction.errorMessage?.(error) || "We couldn’t complete this action. Try again."); }
        finally { setIsSaving(false); }
      }} />

      {canEdit && modalOpen && <React.Suspense fallback={null}><AddConcertModal isOpen={modalOpen} initial={addInitial} onClose={() => guardedClose(() => { setModalOpen(false); setAddInitial(null); })} onSave={handleAddConcert} isSaving={isSaving} saveError={saveError} friends={companionFriends} onSearchCatalog={searchAvailableConcertCatalog} /></React.Suspense>}
      {canEdit && editTarget && <React.Suspense fallback={null}><EditConcertModal isOpen={!!editTarget} mode={editTarget?.mode || mode} initial={editTarget} onClose={() => guardedClose(() => setEditTarget(null))} onSave={handleEditConcert} isSaving={isSaving} saveError={saveError} artistSuggestions={artistSuggestions} venueSuggestions={venueSuggestions} friends={companionFriends} /></React.Suspense>}
      {canEdit && <ContextMenu open={contextMenu.open} x={contextMenu.x} y={contextMenu.y} onEdit={startEditFromContext} onDelete={deleteFromContext} onClose={closeContextMenu} />}
      <SetlistModal
        target={setlistTarget}
        onClose={() => guardedClose(() => setSetlistTarget(null))}
        onEdit={canEdit ? (target) => guardedClose(() => { setSetlistTarget(null); setEditTarget(target); }) : null}
        onLeave={supabaseEnabled ? async (target) => { setSaveError(""); setSetlistTarget(null); setConfirmAction({ title: t("Remove concert?"), description: t("This concert will be removed from your archive. It will remain visible to everyone else attending."), confirmLabel: t("Remove"), hideIcon: true, action: async () => { await leaveSharedConcert(target.concertId); await refreshAfterWrite(); } }); } : null}
        onIdDiscovered={canEdit ? handleSetlistIdDiscovered : null}
      />
      <CalendarConcertModal
        target={calendarTarget}
        artistImages={artistImages}
        onClose={() => guardedClose(() => setCalendarTarget(null))}
        onEdit={canEdit ? (target) => guardedClose(() => { setCalendarTarget(null); setEditTarget(target); }) : null}
      />
    </main>
    </>
  );
}
