import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../lib/i18n.jsx";
import { useDialogFocus } from "../hooks/useUi";
import { COUNTRIES, countryName } from "../lib/countries";
import { normalize, parseDate, parseConcertDateRange, isPastConcert, uppercaseConcertLabel, normalizeTicketUrl, concertLocation } from "../lib/concerts";
import { canonicalVenue } from "../lib/suggestions";
import { Icon, ModalCloseButton } from "./SharedUi";
import CountrySelect from "./CountrySelect";
import { usePendingDialogChanges } from "./DialogGuard";

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

function ConcertCatalogField({ field, value, context = {}, onChange, onPick, onSearch, placeholder, seedResults = [] }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [highlight, setHighlight] = useState(-1);
  const blurTimer = useRef(null);
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
        const found = await onSearch(field, query, context);
        if (!cancelled) setResults(found || []);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [field, value, context.artist, context.venue, context.date, context.year, context.city, context.country, open, onSearch]);
  const query = normalize(value.trim());
  const options = [...new Map([...seedResults, ...results].map((concert) => [normalize(concert[field]), concert])).values()]
    .filter((concert) => concert[field] && (!query || normalize(concert[field]).includes(query)))
    .sort((a, b) => String(a[field]).localeCompare(String(b[field])));
  function pick(concert) { onPick(concert); setOpen(false); setHighlight(-1); }
  function handleKey(event) {
    if (event.key === "Escape") { setOpen(false); setHighlight(-1); return; }
    if (!options.length || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
    if (event.key === "Enter" && highlight < 0) return;
    event.preventDefault();
    if (event.key === "ArrowDown") { setOpen(true); setHighlight((current) => Math.min(current + 1, options.length - 1)); }
    else if (event.key === "ArrowUp") { setOpen(true); setHighlight((current) => current < 0 ? options.length - 1 : Math.max(current - 1, 0)); }
    else pick(options[highlight]);
  }
  useEffect(() => {
    if (highlight >= 0) document.getElementById(`${listId}-${highlight}`)?.scrollIntoView({ block: "nearest" });
  }, [highlight, listId]);
  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  return (
    <div className="relative">
      <input role="combobox" aria-autocomplete="list" aria-expanded={open && options.length > 0} aria-controls={listId} aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined} type="text" value={value} onChange={(event) => { window.clearTimeout(blurTimer.current); onChange(event.target.value); setOpen(true); setHighlight(-1); }} onFocus={() => { window.clearTimeout(blurTimer.current); setOpen(true); }} onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 150); }} onKeyDown={handleKey} placeholder={placeholder} autoComplete="off" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 uppercase text-zinc-100 outline-none focus:border-zinc-400" />
      {open && options.length > 0 && <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-1 shadow-2xl">{options.map((concert, index) => <li id={`${listId}-${index}`} role="option" aria-selected={index === highlight} key={`${field}-${concert[field]}`} onMouseDown={(event) => { event.preventDefault(); pick(concert); }} onMouseEnter={() => setHighlight(index)} className={`cursor-pointer rounded-xl px-3 py-2.5 text-left text-sm font-bold uppercase ${index === highlight ? "bg-zinc-800 text-zinc-100" : "text-zinc-200 hover:bg-zinc-900"}`}>{concert[field]}</li>)}</ul>}
    </div>
  );
}

function ConcertFinder({ onSearch, onPick, onManual }) {
  const { locale, t } = useI18n();
  const [artist, setArtist] = useState("");
  const [country, setCountry] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [city, setCity] = useState("");
  const [year, setYear] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const selectedYear = /^\d{4}$/.test(year) ? year : "";
  const countryResults = COUNTRIES.map(({ code }) => ({ country: code, countryName: countryName(code, locale) }))
    .sort((a, b) => a.countryName.localeCompare(b.countryName, locale));
  const cityResults = results.filter((concert) => !selectedYear || concert.date.endsWith(selectedYear));
  const yearResults = results.filter((concert) => !city || normalize(concert.city) === normalize(city))
    .map((concert) => ({ ...concert, year: String(concert.date || "").slice(-4) }))
    .filter((concert) => /^\d{4}$/.test(concert.year));
  const visible = results.filter((concert) => (!city || normalize(concert.city) === normalize(city)) && (!selectedYear || concert.date.endsWith(selectedYear)))
    .sort((a, b) => parseDate(b.date) - parseDate(a.date));
  const hasSetlistResults = results.some((concert) => concert.source === "setlist.fm");

  function resetSearch() { setResults([]); setSearched(false); setSearchError(""); setCity(""); setYear(""); }
  async function submitSearch(event) {
    event.preventDefault();
    const query = artist.trim();
    if (query.length < 2 || !country || !onSearch) return;
    setLoading(true); setSearched(false); setSearchError(""); setCity(""); setYear("");
    try {
      const found = await onSearch("artist", query, { artist: query, country });
      setPartial(Boolean(found?.partial));
      setResults((found || []).filter((concert) => normalize(concert.artist) === normalize(query) && String(concert.country || "").toUpperCase() === country));
      setSearched(true);
    } catch {
      setResults([]); setSearched(true); setSearchError(t("We couldn’t search for concerts. Check your connection and try again."));
    } finally { setLoading(false); }
  }

  return <div className="space-y-5">
    <form onSubmit={submitSearch} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Artist")}
          <input value={artist} onChange={(event) => { setArtist(uppercaseConcertLabel(event.target.value)); resetSearch(); }} placeholder={t("Artist name").toUpperCase()} autoFocus autoComplete="off" className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" />
        </label>
        <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Country")}
          <div className="mt-2"><ConcertCatalogField field="countryName" value={countryQuery} seedResults={countryResults} onChange={(value) => { setCountryQuery(uppercaseConcertLabel(value)); setCountry(""); resetSearch(); }} onPick={(item) => { setCountryQuery(uppercaseConcertLabel(item.countryName)); setCountry(item.country); resetSearch(); }} placeholder={t("Choose a country")} /></div>
        </label>
      </div>
      <button type="submit" disabled={loading || artist.trim().length < 2 || !country} className="adn-button-primary mt-4 w-full sm:w-auto sm:min-w-40">{loading ? <><i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />{t("Searching…")}</> : <><i className="fa-solid fa-magnifying-glass" aria-hidden="true" />{t("Search concerts")}</>}</button>
    </form>
    {searched && results.length > 0 && <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><strong className="block text-sm font-black uppercase text-zinc-100">{t("{count} concerts found", { count: results.length })}</strong><span className="text-xs text-zinc-500">{t("Filter by city, year, or both.")}</span>{partial && <p role="status" className="mt-1 text-xs text-amber-300">{t("Some concerts could not be included. City and year filters cover the results shown.")}</p>}</div>
        {(city || year) && <button type="button" onClick={() => { setCity(""); setYear(""); }} className="min-h-11 px-2 text-xs font-bold text-zinc-400 hover:text-zinc-100">{t("Clear filters")}</button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("City")}
          <div className="mt-2"><ConcertCatalogField field="city" value={city} seedResults={cityResults} onChange={(value) => setCity(uppercaseConcertLabel(value))} onPick={(concert) => setCity(uppercaseConcertLabel(concert.city))} placeholder={t("All cities")} /></div>
        </label>
        <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Year")}
          <div className="mt-2"><ConcertCatalogField field="year" value={year} seedResults={yearResults} onChange={(value) => setYear(value.replace(/\D/g, "").slice(0, 4))} onPick={(concert) => setYear(concert.year)} placeholder={t("All years")} /></div>
        </label>
      </div>
      <div className="space-y-2">
        {visible.length > 0 ? visible.map((concert) => <button key={concert.concertId || `${concert.source}-${concert.sourceEventId}`} type="button" onClick={() => onPick(concert)} className="group flex min-h-[72px] w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-left transition-colors hover:border-zinc-600"><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-black uppercase text-zinc-100">{concert.artist}</strong><span className="mt-1 block truncate text-xs uppercase text-zinc-500">{concert.venue || t("Venue to be confirmed")} · {concertLocation(concert)} · {concert.date}</span></span><span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-blue-400 group-hover:text-blue-300">{t("Add")}</span></button>) : <p className="rounded-2xl border border-zinc-800 py-8 text-center text-sm text-zinc-500">{t("No concerts match these filters.")}</p>}
        {hasSetlistResults && <p className="pt-2 text-center text-[10px] text-zinc-600">{t("Historical concert information provided by")} <a href="https://www.setlist.fm" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-300">setlist.fm</a>.</p>}
      </div>
    </>}
    {searched && results.length === 0 && <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-8 text-center"><strong className="block text-sm font-black uppercase text-zinc-200">{t("No concerts found")}</strong><p className="mt-2 text-sm text-zinc-500">{t("Try another country or add the concert manually.")}</p></div>}
    {searchError && <p role="alert" className="rounded-2xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-200">{searchError}</p>}
    <div className="border-t border-zinc-900 pt-4 text-center"><button type="button" onClick={onManual} className="min-h-11 px-3 text-xs font-bold text-zinc-400 hover:text-zinc-100">{t("Can’t find it? Add manually")}</button></div>
  </div>;
}

function FriendAttendeePicker({ friends, selectedIds, lockedIds = [], onChange }) {
  const { t } = useI18n();
  const selected = new Set(selectedIds);
  const locked = new Set(lockedIds);
  function toggle(id) { if (!locked.has(id)) onChange(selected.has(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]); }
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-300 transition hover:border-zinc-600 [&::-webkit-details-marker]:hidden"><i className="fa-solid fa-user-group text-xs text-zinc-600" aria-hidden="true" /><span className="flex-1">{selectedIds.length ? t(selectedIds.length === 1 ? "{count} friend selected" : "{count} friends selected", { count: selectedIds.length }) : t("Select friends")}</span><i className="fa-solid fa-chevron-down text-[10px] text-zinc-600 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-2">
        {friends.length ? friends.map((friend,index) => <label key={friend.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-300 ${locked.has(friend.id) ? "cursor-default" : "cursor-pointer hover:bg-zinc-900"}`}><input type="checkbox" checked={selected.has(friend.id)} disabled={locked.has(friend.id)} onChange={() => toggle(friend.id)} className="accent-zinc-100" /><span>{friend.displayName}</span>{locked.has(friend.id) ? <span className="text-xs text-emerald-500">{t("Confirmed")}</span> : index<2&&friend.concertsTogether>0 ? <span className="text-[10px] font-bold text-blue-400">{t("Often together")}</span>:null}<span className="ml-auto text-xs text-zinc-600">@{friend.username}</span></label>) : <p className="px-3 py-2 text-sm text-zinc-600">{t("Add friends from the Friends page first.")}</p>}
      </div>
    </details>
  );
}

const EMPTY_EVENT_DETAILS = { doorsAt: "", startsAt: "", address: "", latitude: "", longitude: "", promoter: "", festival: "", tour: "", eventStatus: "announced", lineup: "" };
function EventDetailsFields({ value, onChange, disabled = false }) {
  const { t } = useI18n();
  const field = (key) => (event) => onChange({ ...value, [key]: event.target.value });
  return <details className="group rounded-2xl border border-zinc-800 bg-zinc-900">
    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 text-sm font-bold text-zinc-300 [&::-webkit-details-marker]:hidden"><i className="fa-solid fa-circle-info text-xs text-blue-400" aria-hidden="true" /><span className="flex-1">{t("Event details")}</span><i className="fa-solid fa-chevron-down text-[10px] text-zinc-600 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
    <div className="grid gap-4 border-t border-zinc-800 p-4 sm:grid-cols-2">
      <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Doors")}<input disabled={disabled} type="datetime-local" value={value.doorsAt} onChange={field("doorsAt")} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100" /></label>
      <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Start")}<input disabled={disabled} type="datetime-local" value={value.startsAt} onChange={field("startsAt")} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100" /></label>
      <label className="sm:col-span-2 text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Address")}<input disabled={disabled} value={value.address} onChange={field("address")} placeholder={t("Street and number")} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100" /></label>
      <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Latitude")}<input disabled={disabled} type="number" step="any" value={value.latitude} onChange={field("latitude")} placeholder="41.3851" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100" /></label>
      <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Longitude")}<input disabled={disabled} type="number" step="any" value={value.longitude} onChange={field("longitude")} placeholder="2.1734" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100" /></label>
      <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Promoter")}<input disabled={disabled} value={value.promoter} onChange={field("promoter")} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100" /></label>
      <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Status")}<select disabled={disabled} value={value.eventStatus} onChange={field("eventStatus")} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100"><option value="announced">{t("Announced")}</option><option value="postponed">{t("Postponed")}</option><option value="cancelled">{t("Cancelled")}</option><option value="sold_out">{t("Sold out")}</option></select></label>
      <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Festival")}<input disabled={disabled} value={value.festival} onChange={field("festival")} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100" /></label>
      <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Tour")}<input disabled={disabled} value={value.tour} onChange={field("tour")} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100" /></label>
      <label className="sm:col-span-2 text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Supporting artists")}<input disabled={disabled} value={value.lineup} onChange={field("lineup")} placeholder={t("Comma separated")} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100" /></label>
    </div>
  </details>;
}

export function EditConcertModal({ isOpen, mode, initial, onClose, onSave, isSaving, saveError, artistSuggestions = [], venueSuggestions = [], friends = [] }) {
  const [dirty, setDirty] = useState(false);
  usePendingDialogChanges(dirty, isSaving);
  const { t } = useI18n();
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
  const [eventDetails, setEventDetails] = useState(EMPTY_EVENT_DETAILS);
  const [validationError, setValidationError] = useState("");
  const dialogRef = useDialogFocus(isOpen);

  useEffect(() => {
    if (isOpen && initial) {
      setDirty(false);
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
      setEventDetails({ ...EMPTY_EVENT_DETAILS, doorsAt: initial.doorsAt?.slice(0, 16) || "", startsAt: initial.startsAt?.slice(0, 16) || "", address: initial.address || "", latitude: initial.latitude || "", longitude: initial.longitude || "", promoter: initial.promoter || "", festival: initial.festival || "", tour: initial.tour || "", eventStatus: initial.eventStatus || "announced", lineup: (initial.lineup || []).slice(1).map((item) => item.artist).join(", ") });
      setValidationError("");
    }
  }, [isOpen, initial]);

  if (!isOpen || !initial) return null;
  const isNextMode = !isPastConcert({ date });
  const canEditEvent = initial.canEditEvent !== false;

  function submit() {
    if (!parseConcertDateRange(date)) { setValidationError(t("Enter a valid date in DD/MM/YYYY format.")); return; }
    if (!artist.trim() || !date.trim() || !city.trim() || !/^[A-Z]{2}$/i.test(country.trim())) { setValidationError(t("Add the artist, date, city and country before saving.")); return; }
    if (!isNextMode && !venue.trim()) { setValidationError(t("Add a venue for this past concert.")); return; }
    setValidationError("");
    onSave({
      artist: uppercaseConcertLabel(artist.trim()),
      venue: uppercaseConcertLabel(canonicalVenue(venue.trim())),
      city: city.trim(),
      country: country.trim().toUpperCase(),
      date: date.trim(),
      bought,
      setlistId: setlistId.trim(),
      attendeeUserIds,
      guestAttendees: [...new Set(guestAttendees.split(",").map((name) => name.trim()).filter(Boolean))],
      ticketUrl: normalizeTicketUrl(ticketUrl),
      ...eventDetails,
      lineup: [artist, ...eventDetails.lineup.split(",").map((name) => uppercaseConcertLabel(name.trim())).filter(Boolean)].map((name) => ({ artist: name })),
    });
  }

  return (
    <div onChangeCapture={() => setDirty(true)} className="adn-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="edit-concert-title" className="adn-modal-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 shadow-2xl md:max-h-[90dvh]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-900 px-6 py-5">
          <div className="min-w-0">
            <h2 id="edit-concert-title" className="text-2xl font-black uppercase tracking-tight">{t("Edit concert")}</h2>
            <p className="mt-1 truncate text-sm text-zinc-500">{artist || "Concert"}{venue ? ` · ${venue}` : ""}{date ? ` · ${date}` : ""}</p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 overscroll-contain">
          {!canEditEvent && <p className="rounded-2xl border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">{t("You can manage your ticket and guests. Only the person who added the concert can change its main details.")}</p>}
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Artist")}</span>
            {canEditEvent ? <AutoSuggestField value={artist} onChange={(value) => setArtist(uppercaseConcertLabel(value))} suggestions={artistSuggestions} placeholder={t("Artist name")} /> : <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-500">{artist}</div>}
          </label>
          <EventDetailsFields value={eventDetails} onChange={setEventDetails} disabled={!canEditEvent} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("City")}</span><input value={city} onChange={(event) => setCity(event.target.value)} disabled={!canEditEvent} placeholder={t("City")} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400 disabled:border-zinc-800 disabled:text-zinc-500" /></label>
            <div><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Country")}</span><CountrySelect value={country} onChange={setCountry} disabled={!canEditEvent} /></div>
          </div>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Venue")} {isNextMode && <span className="ml-1 normal-case tracking-normal text-zinc-600">({t("optional")})</span>}</span>
            {canEditEvent ? <AutoSuggestField value={venue} onChange={(value) => setVenue(uppercaseConcertLabel(value))} suggestions={venueSuggestions} placeholder={t("Venue or festival")} /> : <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-500">{venue || "—"}</div>}
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Date")}</span>
            <input type="text" value={date} onChange={(e) => setDate(e.target.value)} disabled={!canEditEvent} placeholder="DD/MM/YYYY" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400 disabled:border-zinc-800 disabled:text-zinc-500" />
          </label>
          {isNextMode && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Ticket / event link")} <span className="normal-case tracking-normal text-zinc-600">({t("optional")})</span></span>
              <input type="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} disabled={!canEditEvent} placeholder="https://…" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400 disabled:border-zinc-800 disabled:text-zinc-500" />
            </label>
          )}
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Attended with")} <span className="normal-case tracking-normal text-zinc-600">({t("optional")})</span></span>
            <FriendAttendeePicker friends={friends} selectedIds={attendeeUserIds} lockedIds={(initial.attendeeUsers || []).filter((person) => person.status === "confirmed").map((person) => person.id)} onChange={setAttendeeUserIds} />
            <input type="text" value={guestAttendees} onChange={(e) => setGuestAttendees(e.target.value)} placeholder={t("Other attendees (comma separated)")} className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" />
            <span className="mt-1 block text-xs text-zinc-600">{t("Separate multiple names with commas.")}</span>
          </label>
          {isNextMode && (
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              <input type="checkbox" checked={bought} onChange={(e) => setBought(e.target.checked)} />
              <i className="fa-solid fa-ticket text-zinc-500" aria-hidden="true" /><span>{t("Ticket bought")}</span>
            </label>
          )}
        </div>
        <div className="shrink-0 border-t border-zinc-900 bg-zinc-950 px-6 py-4">
          <button onClick={submit} disabled={isSaving} className="adn-button-primary adn-save-button w-full">{isSaving && <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />}{t(isSaving ? "Saving..." : "Save changes")}</button>
          {validationError && <div className="mt-3 rounded-2xl border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm font-semibold text-amber-200" role="alert">{validationError}</div>}
          {saveError && <div className="mt-3 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{saveError}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── AddConcertModal ──────────────────────────────────────────────────────────

export function AddConcertModal({ isOpen, initial, onClose, onSave, isSaving, saveError, friends = [], onSearchCatalog }) {
  const [dirty, setDirty] = useState(false);
  usePendingDialogChanges(dirty, isSaving);
  const { t } = useI18n();
  const [entryMode, setEntryMode] = useState("find");
  const [artist, setArtist] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [date, setDate] = useState("");
  const [bought, setBought] = useState(false);
  const [attendeeUserIds, setAttendeeUserIds] = useState([]);
  const [guestAttendees, setGuestAttendees] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [eventDetails, setEventDetails] = useState(EMPTY_EVENT_DETAILS);
  const [catalogSelection, setCatalogSelection] = useState(null);
  const [validationError, setValidationError] = useState("");
  const dialogRef = useDialogFocus(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    setEntryMode(initial ? "manual" : "find");
    setArtist(uppercaseConcertLabel(initial?.artist));
    setVenue(uppercaseConcertLabel(initial?.venue));
    setCity(initial?.city || "");
    setCountry(String(initial?.country || "").toUpperCase());
    setDate(initial?.date || "");
    setBought(Boolean(initial?.bought));
    setAttendeeUserIds((initial?.attendeeUsers || []).map((person) => person.id));
    setGuestAttendees((initial?.guestAttendees || []).join(", "));
    setTicketUrl(initial?.ticketUrl || "");
    setEventDetails({ ...EMPTY_EVENT_DETAILS, doorsAt: initial?.doorsAt?.slice(0, 16) || "", startsAt: initial?.startsAt?.slice(0, 16) || "", address: initial?.address || "", latitude: initial?.latitude || "", longitude: initial?.longitude || "", promoter: initial?.promoter || "", festival: initial?.festival || "", tour: initial?.tour || "", eventStatus: initial?.eventStatus || "announced", lineup: (initial?.lineup || []).slice(1).map((item) => item.artist).join(", ") });
    setCatalogSelection(null);
    setValidationError("");
  }, [isOpen, initial]);

  if (!isOpen) return null;
  const isPastDate = isPastConcert({ date });

  function submit() {
    if (!parseConcertDateRange(date)) { setValidationError(t("Enter a valid date in DD/MM/YYYY format.")); return; }
    if (!artist.trim() || !date.trim() || !city.trim() || !/^[A-Z]{2}$/i.test(country.trim())) { setValidationError(t("Add the artist, date, city and country before saving.")); return; }
    if (isPastDate && !venue.trim()) { setValidationError(t("Add a venue for this past concert.")); return; }
    setValidationError("");
    onSave({ concertId: catalogSelection?.concertId || initial?.concertId || null, setlistId: catalogSelection?.setlistId || initial?.setlistId || "", artist, venue, city: city.trim(), country: country.trim().toUpperCase(), date, bought: isPastDate ? true : bought, ticketUrl: isPastDate ? "" : normalizeTicketUrl(ticketUrl), attendeeUserIds, guestAttendees: [...new Set(guestAttendees.split(",").map((name) => name.trim()).filter(Boolean))], ...eventDetails, lineup: [artist, ...eventDetails.lineup.split(",").map((name) => uppercaseConcertLabel(name.trim())).filter(Boolean)].map((name) => ({ artist: name })), source: catalogSelection?.source || "", sourceEventId: catalogSelection?.sourceEventId || "", sourceUrl: catalogSelection?.sourceUrl || "" });
  }

  function pickCatalogConcert(concert) {
    setDirty(true);
    setArtist(uppercaseConcertLabel(concert.artist));
    setVenue(uppercaseConcertLabel(concert.venue));
    setCity(concert.city || "");
    setCountry(String(concert.country || "").toUpperCase());
    setDate(concert.date || "");
    if (!ticketUrl && concert.ticketUrl) setTicketUrl(concert.ticketUrl);
    setEventDetails({ ...EMPTY_EVENT_DETAILS, doorsAt: concert.doorsAt?.slice(0, 16) || "", startsAt: concert.startsAt?.slice(0, 16) || "", address: concert.address || "", latitude: concert.latitude || "", longitude: concert.longitude || "", promoter: concert.promoter || "", festival: concert.festival || "", tour: concert.tour || "", eventStatus: concert.eventStatus || "announced", lineup: (concert.lineup || []).slice(1).map((item) => item.artist).join(", ") });
    setCatalogSelection(concert);
    setEntryMode("manual");
  }

  const catalogContext = { artist, venue, city, country, date };

  return (
    <div onChangeCapture={() => setDirty(true)} className="adn-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="add-concert-title" data-testid="add-concert-modal" className="adn-modal-panel relative flex h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 shadow-2xl md:h-[min(48rem,90dvh)]">
        <div data-testid="add-concert-header" className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-900 px-6 py-5">
          <div className="min-w-0">
            <h2 id="add-concert-title" className="text-2xl font-black uppercase tracking-tight">{t("Add concert")}</h2>
            <p className="mt-1 truncate text-sm text-zinc-500">{t(entryMode === "find" ? "Search by artist and country, then narrow the results by city or year." : catalogSelection ? "Review the concert details before adding it." : "Enter the concert details.")}</p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>
        <div data-testid="add-concert-scroll" className="min-h-0 flex-1 overflow-y-auto px-6 py-5 overscroll-contain">
        {entryMode === "find" ? <ConcertFinder onSearch={onSearchCatalog} onPick={pickCatalogConcert} onManual={() => { setCatalogSelection(null); setEntryMode("manual"); }} /> : <div className="space-y-4">
          {!initial && <button type="button" onClick={() => setEntryMode("find")} className="min-h-11 text-xs font-bold text-zinc-400 hover:text-zinc-100"><i className="fa-solid fa-arrow-left mr-2" aria-hidden="true" />{t("Find a concert")}</button>}
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Artist")}</span>
            <ConcertCatalogField field="artist" value={artist} context={catalogContext} onChange={(value) => { setArtist(uppercaseConcertLabel(value)); setCatalogSelection(null); }} onPick={(concert) => { setArtist(uppercaseConcertLabel(concert.artist)); setCatalogSelection(null); }} onSearch={onSearchCatalog} placeholder={t("Artist name")} />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("City")}</span><ConcertCatalogField field="city" value={city} context={catalogContext} onChange={(value) => { setCity(value); setCountry(""); setCatalogSelection(null); }} onPick={(concert) => { setCity(concert.city); setCountry(String(concert.country || "").toUpperCase()); setCatalogSelection(null); }} onSearch={onSearchCatalog} placeholder={t("City")} /></label>
            <div><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Country")}</span><CountrySelect value={country} onChange={setCountry} /></div>
          </div>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Venue")} {!isPastDate && <span className="ml-1 normal-case tracking-normal text-zinc-600">({t("optional")})</span>}</span>
            <ConcertCatalogField field="venue" value={venue} context={catalogContext} onChange={(value) => { setVenue(uppercaseConcertLabel(value)); setCatalogSelection(null); }} onPick={(concert) => { setVenue(uppercaseConcertLabel(concert.venue)); setCatalogSelection(null); }} onSearch={onSearchCatalog} placeholder={t("Venue or festival")} />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Date")}</span>
            <ConcertCatalogField field="date" value={date} context={catalogContext} onChange={(value) => { setDate(value); setCatalogSelection(null); }} onPick={(concert) => { setDate(concert.date); setCatalogSelection(null); }} onSearch={onSearchCatalog} placeholder="DD/MM/YYYY" />
          </label>
          {!isPastDate && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Ticket / event link")} <span className="normal-case tracking-normal text-zinc-600">({t("optional")})</span></span>
              <input type="url" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} placeholder="https://…" className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" />
            </label>
          )}
          <EventDetailsFields value={eventDetails} onChange={setEventDetails} />
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">{t("Attended with")} <span className="normal-case tracking-normal text-zinc-600">({t("optional")})</span></span>
            <FriendAttendeePicker friends={friends} selectedIds={attendeeUserIds} onChange={setAttendeeUserIds} />
            <input type="text" value={guestAttendees} onChange={(e) => setGuestAttendees(e.target.value)} placeholder={t("Other attendees (comma separated)")} className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" />
            <span className="mt-1 block text-xs text-zinc-600">{t("Separate multiple names with commas.")}</span>
          </label>
          {!isPastDate && (
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              <input type="checkbox" checked={bought} onChange={(e) => setBought(e.target.checked)} />
              <i className="fa-solid fa-ticket text-zinc-500" aria-hidden="true" /><span>{t("Ticket bought")}</span>
            </label>
          )}
        </div>}
        </div>
        {entryMode === "manual" && <div className="shrink-0 border-t border-zinc-900 bg-zinc-950 px-6 py-4">
          <button onClick={submit} disabled={isSaving} className="adn-button-primary adn-save-button w-full">{isSaving && <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />}{t(isSaving ? "Saving..." : "Add concert")}</button>
          {validationError && <div className="mt-3 rounded-2xl border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm font-semibold text-amber-200" role="alert">{validationError}</div>}
          {saveError && <div className="mt-3 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{saveError}</div>}
        </div>}
      </div>
    </div>
  );
}

// ─── Upcoming concert calendar ────────────────────────────────────────────────
