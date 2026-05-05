import React, { useEffect, useMemo, useState } from "react";
import concertsData from "../data/concerts.json";

function groupHistoryFromJson(rows) {
  const grouped = rows.reduce((acc, { artist, venue, date }) => {
    if (!acc[artist]) acc[artist] = [];
    acc[artist].push(`${venue} - ${date}`);
    return acc;
  }, {});
  return Object.entries(grouped).map(([artist, shows]) => ({ artist, shows }));
}

const fallbackConcertHistory = groupHistoryFromJson(concertsData.history);
const fallbackNextConcerts = concertsData.next;

const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD;

async function saveToGitHub(updatedData, commitMessage = "Update concerts via web") {
  const res = await fetch("/.netlify/functions/save-concerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: updatedData, commitMessage, password: APP_PASSWORD })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Save failed (${res.status})`);
  }
}




function Icon({ type }) {
  const common = {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "mt-0.5 h-4 w-4 shrink-0 text-zinc-500"
  };

  if (type === "search") {
    return (
      <svg {...common} className="h-5 w-5 shrink-0 text-zinc-500">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    );
  }

  if (type === "calendar") {
    return (
      <svg {...common} className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600">
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function parseShow(show, mode) {
  const dateOnly = /^(\d{1,2}\/\d{1,2}\/\d{4})(\s-\s\d{1,2}\/\d{1,2}\/\d{4})?$/.test(show);
  if (mode === "next" || dateOnly) return { venue: "Date confirmed", date: show };

  const parts = show.split(" - ");
  const date = parts[parts.length - 1] || "";
  const venue = parts.slice(0, -1).join(" - ") || show;
  return { venue, date };
}

function normalize(value) {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseDate(date) {
  const match = String(date).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return 0;

  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

function getMostRecentShowDate(item, mode) {
  return Math.max(...item.shows.map((show) => parseDate(parseShow(show, mode).date)));
}

function filterConcerts(items, query) {
  const q = normalize(query.trim());
  if (!q) return items;

  return items
    .map((item) => {
      const artistMatches = normalize(item.artist).includes(q);

      // Next-mode item: no shows array, just date (and optional venue).
      if (!item.shows) {
        const haystack = normalize(`${item.artist} ${item.date} ${item.venue || ""}`);
        return haystack.includes(q) ? item : null;
      }

      // History-mode item: filter the shows array down to matching shows.
      if (artistMatches) return item;
      const matchingShows = item.shows.filter((show) => normalize(show).includes(q));
      if (matchingShows.length === 0) return null;
      return { ...item, shows: matchingShows };
    })
    .filter(Boolean);
}

function sortConcerts(items, sortMode, mode) {
  const sorted = [...items];

  if (mode === "next") {
    return sorted.sort((a, b) => parseDate(a.date) - parseDate(b.date) || a.artist.localeCompare(b.artist));
  }

  if (sortMode === "concerts") {
    return sorted.sort((a, b) => b.shows.length - a.shows.length || a.artist.localeCompare(b.artist));
  }

  if (sortMode === "recent") {
    return sorted.sort((a, b) => getMostRecentShowDate(b, mode) - getMostRecentShowDate(a, mode) || a.artist.localeCompare(b.artist));
  }

  return sorted.sort((a, b) => a.artist.localeCompare(b.artist));
}

function getVisibleNextConcerts(items, ticketFilter) {
  if (ticketFilter === "bought") return items.filter((item) => item.bought);
  if (ticketFilter === "pending") return items.filter((item) => !item.bought);
  return items;
}

function addHistoryConcert(items, artist, venue, date) {
  const cleanedArtist = artist.trim();
  const cleanedVenue = venue.trim();
  const cleanedDate = date.trim();
  const show = `${cleanedVenue} - ${cleanedDate}`;
  const existingIndex = items.findIndex((item) => normalize(item.artist) === normalize(cleanedArtist));

  if (existingIndex >= 0) {
    return items.map((item, index) => (index === existingIndex ? { ...item, shows: [...item.shows, show] } : item));
  }

  return [...items, { artist: cleanedArtist, shows: [show] }];
}

function addNextConcert(items, artist, date, bought, venue) {
  return [...items, { artist: artist.trim(), date: date.trim(), bought, venue: venue ? venue.trim() : "" }];
}

function editHistoryConcert(items, originalArtist, originalShow, newArtist, newVenue, newDate) {
  const cleanedNewArtist = newArtist.trim();
  const newShow = `${newVenue.trim()} - ${newDate.trim()}`;
  const sameArtist = normalize(originalArtist) === normalize(cleanedNewArtist);

  if (sameArtist) {
    return items.map((item) => {
      if (normalize(item.artist) !== normalize(originalArtist)) return item;
      return { ...item, shows: item.shows.map((s) => (s === originalShow ? newShow : s)) };
    });
  }

  // Artist changed: remove old show; add to existing artist or create new artist entry.
  const withoutOld = items
    .map((item) => {
      if (normalize(item.artist) !== normalize(originalArtist)) return item;
      const remaining = item.shows.filter((s) => s !== originalShow);
      return remaining.length ? { ...item, shows: remaining } : null;
    })
    .filter(Boolean);

  return addHistoryConcert(withoutOld, cleanedNewArtist, newVenue, newDate);
}

function deleteHistoryConcert(items, artist, show) {
  return items
    .map((item) => {
      if (normalize(item.artist) !== normalize(artist)) return item;
      const remaining = item.shows.filter((s) => s !== show);
      return remaining.length ? { ...item, shows: remaining } : null;
    })
    .filter(Boolean);
}

function editNextConcert(items, originalArtist, originalDate, newArtist, newDate, newBought, newVenue) {
  return items.map((item) => {
    if (normalize(item.artist) === normalize(originalArtist) && item.date === originalDate) {
      return { artist: newArtist.trim(), date: newDate.trim(), bought: newBought, venue: newVenue ? newVenue.trim() : "" };
    }
    return item;
  });
}

function deleteNextConcert(items, artist, date) {
  return items.filter((item) => !(normalize(item.artist) === normalize(artist) && item.date === date));
}

// Plain text date field — kept simple, free-form so festival ranges work too.
function DateField({ value, onChange }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="DD/MM/YYYY"
      className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400"
    />
  );
}

function AutoSuggestField({ value, onChange, suggestions, placeholder }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const matches = useMemo(() => {
    const q = normalize(value || "").trim();
    if (!q) return [];
    return suggestions
      .filter((s) => normalize(s).includes(q) && normalize(s) !== q)
      .slice(0, 6);
  }, [value, suggestions]);

  function pick(item) {
    onChange(item);
    setOpen(false);
    setHighlight(-1);
  }

  function handleKey(e) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && highlight >= 0) { e.preventDefault(); pick(matches[highlight]); }
    else if (e.key === "Escape") { setOpen(false); setHighlight(-1); }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400"
      />
      {open && matches.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
          {matches.map((m, i) => (
            <li
              key={m}
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer px-4 py-2 text-sm ${i === highlight ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-900"}`}
            >
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditConcertModal({ isOpen, mode, initial, onClose, onSave, onDelete, isSaving, saveError, artistSuggestions = [], venueSuggestions = [] }) {
  const [artist, setArtist] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [bought, setBought] = useState(false);

  useEffect(() => {
    if (isOpen && initial) {
      setArtist(initial.artist || "");
      setVenue(initial.venue || "");
      setDate(initial.date || "");
      setBought(!!initial.bought);
    }
  }, [isOpen, initial]);

  if (!isOpen || !initial) return null;

  const isNextMode = mode === "next";

  function submit(event) {
    event.preventDefault();
    if (!artist.trim() || !date.trim()) return;
    if (!isNextMode && !venue.trim()) return;
    onSave({ artist: artist.trim(), venue: venue.trim(), date: date.trim(), bought });
  }

  function handleDelete() {
    if (window.confirm(`Delete "${initial.artist}" — ${initial.venue || initial.date}? This can't be undone.`)) {
      onDelete();
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-3xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">Edit concert</h2>
            <p className="mt-1 text-sm text-zinc-500">{isNextMode ? "Edit upcoming concert details." : "Edit concert details."}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:border-zinc-500">Close</button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Artist</span>
            <AutoSuggestField value={artist} onChange={setArtist} suggestions={artistSuggestions} placeholder="Artist name" />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Venue {isNextMode && <span className="ml-1 normal-case tracking-normal text-zinc-600">(optional)</span>}</span>
            <AutoSuggestField value={venue} onChange={setVenue} suggestions={venueSuggestions} placeholder="Venue or festival" />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Date</span>
            <DateField value={date} onChange={setDate} />
          </label>

          {isNextMode && (
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              <input type="checkbox" checked={bought} onChange={(event) => setBought(event.target.checked)} />
              <span>💰 Ticket bought</span>
            </label>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="submit" disabled={isSaving} className="flex-1 rounded-2xl bg-zinc-100 px-5 py-3 font-black text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Saving..." : "Save changes"}</button>
          <button type="button" onClick={handleDelete} disabled={isSaving} className="rounded-2xl border border-red-900 bg-red-950/40 px-5 py-3 font-black text-red-200 transition hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-50">Delete</button>
        </div>
        {saveError && <div className="mt-3 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{saveError}</div>}
      </form>
    </div>
  );
}

function ContextMenu({ open, x, y, onEdit, onDelete, onMoveToHistory, onClose, showMoveToHistory }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[55]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-[56] min-w-[160px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl"
        style={{ left: x, top: y }}
      >
        <button onClick={onEdit} className="block w-full px-4 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800">Edit</button>
        {showMoveToHistory && (
          <button onClick={onMoveToHistory} className="block w-full px-4 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800">Move to history</button>
        )}
        <button onClick={onDelete} className="block w-full px-4 py-2 text-left text-sm text-red-300 hover:bg-zinc-800">Delete</button>
      </div>
    </>
  );
}

function AddConcertModal({ isOpen, mode, onClose, onSave, isSaving, saveError, artistSuggestions = [], venueSuggestions = [] }) {
  const [artist, setArtist] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [bought, setBought] = useState(false);

  if (!isOpen) return null;

  const isNextMode = mode === "next";

  function submit(event) {
    event.preventDefault();
    if (!artist.trim() || !date.trim()) return;
    if (!isNextMode && !venue.trim()) return;
    onSave({ artist, venue, date, bought });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-3xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">Add concert</h2>
            <p className="mt-1 text-sm text-zinc-500">{isNextMode ? "Add an upcoming concert." : "Add a concert to the archive."}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:border-zinc-500">Close</button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Artist</span>
            <AutoSuggestField value={artist} onChange={setArtist} suggestions={artistSuggestions} placeholder="Artist name" />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Venue {isNextMode && <span className="ml-1 normal-case tracking-normal text-zinc-600">(optional)</span>}</span>
            <AutoSuggestField value={venue} onChange={setVenue} suggestions={venueSuggestions} placeholder="Venue or festival" />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Date</span>
            <DateField value={date} onChange={setDate} />
          </label>

          {isNextMode && (
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              <input type="checkbox" checked={bought} onChange={(event) => setBought(event.target.checked)} />
              <span>💰 Ticket bought</span>
            </label>
          )}
        </div>

        <button type="submit" disabled={isSaving} className="mt-6 w-full rounded-2xl bg-zinc-100 px-5 py-3 font-black text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Saving..." : "Add concert"}</button>
        {saveError && <div className="mt-3 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{saveError}</div>}
      </form>
    </div>
  );
}

function runTests() {
  console.assert(parseShow("SANT JORDI CLUB - 20/10/2010", "history").venue === "SANT JORDI CLUB", "parseShow should extract venue");
  console.assert(parseShow("LES DOCKS - LAUSANNE - 26/02/2023", "history").venue === "LES DOCKS - LAUSANNE", "parseShow should support venue names containing hyphens");
  console.assert(parseShow("16/05/2026", "next").date === "16/05/2026", "next concerts should support date-only items");
  console.assert(filterConcerts(fallbackConcertHistory, "avenged sevenfold").length === 1, "search should find Avenged Sevenfold");
  console.assert(filterConcerts(fallbackConcertHistory, "zurich").length >= 1, "search should be accent-insensitive for Zürich/Zurich");
  console.assert(filterConcerts(fallbackConcertHistory, "not-a-real-band").length === 0, "search should return no results for unknown terms");
  console.assert(sortConcerts(fallbackConcertHistory, "artist", "history")[0].artist === "ADELE", "artist sort should be alphabetical");
  console.assert(sortConcerts(fallbackConcertHistory, "concerts", "history")[0].artist === "LEPROUS", "concert count sort should place Leprous first");
  console.assert(sortConcerts(fallbackNextConcerts, "recent", "next")[0].artist === "Amaia", "next concerts should default to newest date first");
  console.assert(fallbackNextConcerts.filter((item) => item.bought).length === 4, "next concerts should track bought ticket items");
  console.assert(getVisibleNextConcerts(fallbackNextConcerts, "bought").every((item) => item.bought), "bought filter should only show bought items");
  console.assert(getVisibleNextConcerts(fallbackNextConcerts, "pending").every((item) => !item.bought), "pending filter should only show not bought items");
  console.assert(addHistoryConcert([{ artist: "TEST", shows: [] }], "TEST", "VENUE", "01/01/2026")[0].shows.length === 1, "history add should append to existing artists");
  console.assert(addNextConcert([], "TEST", "01/01/2026", true)[0].bought === true, "next add should store bought status");
}

runTests();

function LoginGate({ onUnlock }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  function attempt(event) {
    event.preventDefault();
    if (input === APP_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setInput("");
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className={`w-full max-w-sm ${shake ? "animate-shake" : ""}`}>
        <div className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.45em] text-zinc-500">A Deafening Noise</p>
          <h1 className="text-4xl font-black uppercase tracking-tight text-zinc-100">Private Archive</h1>
          <p className="mt-3 text-sm text-zinc-500">Enter the password to continue.</p>
        </div>
        <form onSubmit={attempt} className="space-y-4">
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(false); }}
            placeholder="Password"
            autoFocus
            className={`w-full rounded-2xl border px-5 py-4 text-center text-lg tracking-widest bg-zinc-900 text-zinc-100 outline-none transition placeholder:tracking-normal placeholder:text-zinc-600 ${error ? "border-red-700 text-red-300" : "border-zinc-700 focus:border-zinc-400"}`}
          />
          {error && <p className="text-center text-sm text-red-400">Incorrect password.</p>}
          <button type="submit" className="w-full rounded-2xl bg-zinc-100 py-4 font-black uppercase tracking-widest text-zinc-950 transition hover:bg-white">
            Unlock
          </button>
        </form>
      </div>
    </div>
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

function StatsPage({ historyItems }) {
  const stats = useMemo(() => {
    const totalArtists = historyItems.length;
    const totalShows = historyItems.reduce((s, i) => s + i.shows.length, 0);

    // venue counts
    const venueCounts = {};
    const yearCounts = {};
    let earliestYear = Infinity;
    let latestYear = -Infinity;

    historyItems.forEach(({ shows }) => {
      shows.forEach((show) => {
        const { venue, date } = parseShow(show, "history");
        if (venue && venue !== "Date confirmed") {
          venueCounts[venue] = (venueCounts[venue] || 0) + 1;
        }
        const yr = String(date).match(/\/(\d{4})/);
        if (yr) {
          const y = Number(yr[1]);
          yearCounts[y] = (yearCounts[y] || 0) + 1;
          if (y < earliestYear) earliestYear = y;
          if (y > latestYear) latestYear = y;
        }
      });
    });

    const topArtists = historyItems
      .map((i) => [i.artist, i.shows.length])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10);

    const topVenues = Object.entries(venueCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10);

    // build full year range so bars are continuous
    const years = [];
    if (Number.isFinite(earliestYear) && Number.isFinite(latestYear)) {
      for (let y = earliestYear; y <= latestYear; y++) {
        years.push([String(y), yearCounts[y] || 0]);
      }
    }

    const yearsActive = years.length;
    const avgPerYear = yearsActive ? (totalShows / yearsActive).toFixed(1) : "0";
    const topArtist = topArtists[0]?.[0] || "—";
    const topArtistShows = topArtists[0]?.[1] || 0;
    const topVenue = topVenues[0]?.[0] || "—";
    const topVenueShows = topVenues[0]?.[1] || 0;

    return {
      totalArtists, totalShows, yearsActive, avgPerYear,
      topArtist, topArtistShows, topVenue, topVenueShows,
      topArtists, topVenues, years,
      maxArtist: topArtists[0]?.[1] || 1,
      maxVenue: topVenues[0]?.[1] || 1,
      maxYear: years.length ? Math.max(...years.map(([, v]) => v)) : 1,
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
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards.map(({ label, value }) => (
          <div key={label} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center">
            <div className="text-3xl font-black text-zinc-100 md:text-4xl">{value}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Highlight cards */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Most-seen artist</div>
          <div className="mt-2 text-2xl font-black uppercase text-zinc-100">{stats.topArtist}</div>
          <div className="mt-1 text-sm text-zinc-400">{stats.topArtistShows} {stats.topArtistShows === 1 ? "show" : "shows"}</div>
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Top venue</div>
          <div className="mt-2 text-2xl font-black uppercase text-zinc-100">{stats.topVenue}</div>
          <div className="mt-1 text-sm text-zinc-400">{stats.topVenueShows} {stats.topVenueShows === 1 ? "show" : "shows"}</div>
        </div>
      </div>

      {/* Top artists */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-5 text-lg font-black uppercase tracking-tight text-zinc-100">Top 10 artists</h3>
        <StatsBar data={stats.topArtists} max={stats.maxArtist} label="shows" accent="bg-zinc-100" />
      </div>

      {/* Top venues */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-5 text-lg font-black uppercase tracking-tight text-zinc-100">Top 10 venues</h3>
        <StatsBar data={stats.topVenues} max={stats.maxVenue} label="shows" accent="bg-zinc-300" />
      </div>

      {/* Concerts per year */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-5 text-lg font-black uppercase tracking-tight text-zinc-100">Concerts per year</h3>
        {stats.years.length === 0 ? (
          <p className="text-sm text-zinc-500">No data yet.</p>
        ) : (
          <div className="flex items-end gap-2 overflow-x-auto pb-2">
            {stats.years.map(([year, count]) => {
              const heightPct = stats.maxYear ? (count / stats.maxYear) * 100 : 0;
              return (
                <div key={year} className="flex min-w-[36px] flex-col items-center gap-2">
                  <div className="flex h-44 w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-zinc-100 transition-all hover:bg-white"
                      style={{ height: `${count === 0 ? 2 : heightPct}%`, opacity: count === 0 ? 0.15 : 1 }}
                      title={`${count} ${count === 1 ? "show" : "shows"} in ${year}`}
                    />
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

export default function App() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem("adn_unlocked") === "1");

  function handleUnlock() {
    sessionStorage.setItem("adn_unlocked", "1");
    setUnlocked(true);
  }
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("artist");
  const [ticketFilter, setTicketFilter] = useState("all");
  const [activePage, setActivePage] = useState("history");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, target: null });
  const [historyItems, setHistoryItems] = useState(fallbackConcertHistory);
  const [nextItems, setNextItems] = useState(fallbackNextConcerts);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const isNext = activePage === "next";
  const isStats = activePage === "stats";
  const currentItems = isNext ? nextItems : historyItems;
  const mode = isNext ? "next" : "history";
  const title = isStats ? "Stats" : isNext ? "Next Concerts" : "Concert Archive";
  const description = isStats
    ? "A snapshot of your concert history at a glance."
    : isNext ? "Upcoming shows, festivals and planned concerts." : "A searchable lifetime lineup of artists, venues and dates.";

  const filtered = useMemo(() => {
    const visibleItems = isNext ? getVisibleNextConcerts(currentItems, ticketFilter) : currentItems;
    return sortConcerts(filterConcerts(visibleItems, query), sortMode, mode);
  }, [currentItems, query, sortMode, mode, isNext, ticketFilter]);

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

  if (!unlocked) return <LoginGate onUnlock={handleUnlock} />;



  function changePage(page) {
    setActivePage(page);
    setQuery("");
    setSortMode("artist");
    setTicketFilter("all");
    setSidebarOpen(false);
  }

  function flattenHistory(historyArr) {
    return historyArr.flatMap(({ artist, shows }) =>
      shows.map((show) => {
        const parts = show.split(" - ");
        const date = parts[parts.length - 1];
        const venue = parts.slice(0, -1).join(" - ");
        return { artist, venue, date };
      })
    );
  }

  async function handleAddConcert(data) {
    setIsSaving(true);
    setSaveError("");
    try {
      let updatedHistory = historyItems;
      let updatedNext = nextItems;

      if (isNext) {
        updatedNext = sortConcerts(addNextConcert(nextItems, data.artist, data.date, data.bought, data.venue), "next", "next");
      } else {
        updatedHistory = addHistoryConcert(historyItems, data.artist, data.venue, data.date);
      }

      await saveToGitHub(
        { history: flattenHistory(updatedHistory), next: updatedNext },
        `Add concert: ${data.artist}${data.venue ? " — " + data.venue : ""} (${data.date})`
      );

      if (isNext) setNextItems(updatedNext);
      else setHistoryItems(updatedHistory);

      setModalOpen(false);
    } catch (error) {
      setSaveError(error.message || "Could not save concert");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEditConcert(data) {
    if (!editTarget) return;
    setIsSaving(true);
    setSaveError("");
    try {
      let updatedHistory = historyItems;
      let updatedNext = nextItems;

      if (editTarget.mode === "next") {
        updatedNext = sortConcerts(
          editNextConcert(nextItems, editTarget.artist, editTarget.date, data.artist, data.date, data.bought, data.venue),
          "next", "next"
        );
      } else {
        updatedHistory = editHistoryConcert(historyItems, editTarget.artist, editTarget.show, data.artist, data.venue, data.date);
      }

      await saveToGitHub(
        { history: flattenHistory(updatedHistory), next: updatedNext },
        `Edit concert: ${data.artist}${data.venue ? " — " + data.venue : ""} (${data.date})`
      );

      if (editTarget.mode === "next") setNextItems(updatedNext);
      else setHistoryItems(updatedHistory);

      setEditTarget(null);
    } catch (error) {
      setSaveError(error.message || "Could not save changes");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteConcert() {
    if (!editTarget) return;
    setIsSaving(true);
    setSaveError("");
    try {
      let updatedHistory = historyItems;
      let updatedNext = nextItems;

      if (editTarget.mode === "next") {
        updatedNext = deleteNextConcert(nextItems, editTarget.artist, editTarget.date);
      } else {
        updatedHistory = deleteHistoryConcert(historyItems, editTarget.artist, editTarget.show);
      }

      await saveToGitHub(
        { history: flattenHistory(updatedHistory), next: updatedNext },
        `Delete concert: ${editTarget.artist}${editTarget.venue ? " — " + editTarget.venue : ""} (${editTarget.date})`
      );

      if (editTarget.mode === "next") setNextItems(updatedNext);
      else setHistoryItems(updatedHistory);

      setEditTarget(null);
    } catch (error) {
      setSaveError(error.message || "Could not delete concert");
    } finally {
      setIsSaving(false);
    }
  }

  function openContextMenu(event, target) {
    event.preventDefault();
    if (isSaving) return;
    setContextMenu({ open: true, x: event.clientX, y: event.clientY, target });
  }

  function openContextMenuAt(x, y, target) {
    if (isSaving) return;
    setContextMenu({ open: true, x, y, target });
  }

  function closeContextMenu() {
    setContextMenu({ open: false, x: 0, y: 0, target: null });
  }

  function startEditFromContext() {
    const t = contextMenu.target;
    closeContextMenu();
    if (!t) return;
    if (t.mode === "next") {
      setEditTarget({ mode: "next", artist: t.artist, date: t.date, bought: t.bought, venue: t.venue || "" });
    } else {
      setEditTarget({ mode: "history", artist: t.artist, show: t.show, venue: t.venue, date: t.date });
    }
  }

  async function deleteFromContext() {
    const t = contextMenu.target;
    closeContextMenu();
    if (!t) return;
    const label = t.mode === "next" ? `${t.artist}${t.venue ? " — " + t.venue : ""} (${t.date})` : `${t.artist} — ${t.venue} (${t.date})`;
    if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
    setIsSaving(true);
    setSaveError("");
    try {
      let updatedHistory = historyItems;
      let updatedNext = nextItems;

      if (t.mode === "next") {
        updatedNext = deleteNextConcert(nextItems, t.artist, t.date);
      } else {
        updatedHistory = deleteHistoryConcert(historyItems, t.artist, t.show);
      }

      await saveToGitHub(
        { history: flattenHistory(updatedHistory), next: updatedNext },
        `Delete concert: ${label}`
      );

      if (t.mode === "next") setNextItems(updatedNext);
      else setHistoryItems(updatedHistory);
    } catch (error) {
      setSaveError(error.message || "Could not delete concert");
      window.alert("Delete failed: " + (error.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  }

  async function moveToHistoryFromContext() {
    const t = contextMenu.target;
    closeContextMenu();
    if (!t || t.mode !== "next") return;

    // Default the venue: if missing, ask the user (since history requires a venue)
    let venueValue = t.venue;
    if (!venueValue || !venueValue.trim()) {
      venueValue = window.prompt(`Enter the venue for ${t.artist} on ${t.date}:`, "");
      if (venueValue === null) return; // user cancelled
      if (!venueValue.trim()) {
        window.alert("Venue is required to move a concert to history.");
        return;
      }
    }

    setIsSaving(true);
    setSaveError("");
    try {
      const updatedNext = deleteNextConcert(nextItems, t.artist, t.date);
      const updatedHistory = addHistoryConcert(historyItems, t.artist, venueValue, t.date);

      await saveToGitHub(
        { history: flattenHistory(updatedHistory), next: updatedNext },
        `Move to history: ${t.artist} — ${venueValue} (${t.date})`
      );

      setNextItems(updatedNext);
      setHistoryItems(updatedHistory);
    } catch (error) {
      setSaveError(error.message || "Could not move concert");
      window.alert("Move failed: " + (error.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 md:flex">
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-100 shadow-2xl transition hover:border-zinc-500"
        aria-label="Open menu"
      >
        Menu
      </button>

      {sidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu overlay"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-zinc-800 bg-zinc-950/95 p-5 backdrop-blur transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col">
          <div className="mb-8 flex items-center justify-between gap-4">
            <button onClick={() => changePage("history")} className="text-left text-xl font-black text-zinc-100">A Deafening Noise</button>
            <button onClick={() => setSidebarOpen(false)} className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:border-zinc-500">Close</button>
          </div>
          <nav className="space-y-2 text-sm">
            <button onClick={() => changePage("history")} className={`block w-full rounded-2xl px-4 py-3 text-left transition hover:bg-zinc-900 hover:text-zinc-100 ${activePage === "history" ? "bg-zinc-900 text-zinc-100" : "text-zinc-400"}`}>Concert history</button>
            <button onClick={() => changePage("next")} className={`block w-full rounded-2xl px-4 py-3 text-left transition hover:bg-zinc-900 hover:text-zinc-100 ${activePage === "next" ? "bg-zinc-900 text-zinc-100" : "text-zinc-400"}`}>Next concerts</button>
            <button onClick={() => changePage("stats")} className={`block w-full rounded-2xl px-4 py-3 text-left transition hover:bg-zinc-900 hover:text-zinc-100 ${activePage === "stats" ? "bg-zinc-900 text-zinc-100" : "text-zinc-400"}`}>Stats</button>
          </nav>
        </div>
      </aside>

      <section className="mx-auto w-full max-w-7xl px-5 py-16 md:px-8 md:py-14">
        <header className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.45em] text-zinc-400">A Deafening Noise</p>
          <h1 className="text-5xl font-black uppercase tracking-tight md:text-8xl">{title}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-zinc-400 md:text-lg">{description}</p>
        </header>

        {isStats ? (
          <StatsPage historyItems={historyItems} />
        ) : (
        <>
        <div className="sticky top-0 z-10 mb-8 border-y border-zinc-800 bg-zinc-950/90 py-4 backdrop-blur">
          <div className={`mx-auto grid max-w-6xl gap-3 ${isNext ? "md:grid-cols-[220px_1fr_360px]" : "md:grid-cols-[220px_1fr_280px]"}`}>
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-black text-zinc-100 shadow-2xl transition hover:border-zinc-500"
            >
              + Add concert
            </button>

            <div className="flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 shadow-2xl">
              <Icon type="search" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search artist, venue, festival, city or date"
                className="w-full bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500"
                aria-label="Search concerts"
              />
            </div>

            {isNext ? (
              <div className="grid grid-cols-3 rounded-full border border-zinc-700 bg-zinc-900 p-1 text-sm text-zinc-300 shadow-2xl">
                <button onClick={() => setTicketFilter("all")} className={`rounded-full px-3 py-2 transition ${ticketFilter === "all" ? "bg-zinc-100 text-zinc-950" : "hover:text-zinc-100"}`}>All</button>
                <button onClick={() => setTicketFilter("bought")} className={`rounded-full px-3 py-2 transition ${ticketFilter === "bought" ? "bg-zinc-100 text-zinc-950" : "hover:text-zinc-100"}`}>Bought</button>
                <button onClick={() => setTicketFilter("pending")} className={`rounded-full px-3 py-2 transition ${ticketFilter === "pending" ? "bg-zinc-100 text-zinc-950" : "hover:text-zinc-100"}`}>Not bought</button>
              </div>
            ) : (
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value)}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-base text-zinc-100 shadow-2xl outline-none"
                aria-label="Sort concerts"
              >
                <option value="artist">Sort by artist</option>
                <option value="concerts">Sort by number of concerts</option>
                <option value="recent">Sort by most recent</option>
              </select>
            )}
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <article key={item.artist} className="group rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl transition hover:-translate-y-1 hover:border-zinc-500">
              <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4">
                <h2 className="text-2xl font-black uppercase leading-none tracking-tight md:text-3xl">{item.artist}</h2>
                {isNext ? (
                  item.bought ? (
                    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-300">💰 Bought</span>
                  ) : (
                    <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs font-bold text-zinc-500">Pending</span>
                  )
                ) : (
                  <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-400">{item.shows.length}</span>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {(isNext ? [item.date] : [...item.shows].sort((a, b) => parseDate(parseShow(b, mode).date) - parseDate(parseShow(a, mode).date))).map((show) => {
                  const { venue, date } = parseShow(show, mode);
                  const target = isNext
                    ? { mode: "next", artist: item.artist, date: item.date, bought: item.bought, venue: item.venue || "" }
                    : { mode: "history", artist: item.artist, show, venue, date };
                  let touchTimer = null;
                  let touchMoved = false;
                  const handleTouchStart = (e) => {
                    touchMoved = false;
                    const touch = e.touches[0];
                    const startX = touch.clientX;
                    const startY = touch.clientY;
                    touchTimer = setTimeout(() => {
                      if (!touchMoved) {
                        if (navigator.vibrate) navigator.vibrate(20);
                        openContextMenuAt(startX, startY, target);
                      }
                    }, 500);
                  };
                  const handleTouchMove = (e) => {
                    touchMoved = true;
                    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
                  };
                  const handleTouchEnd = () => {
                    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
                  };
                  return (
                    <div
                      key={`${item.artist}-${show}`}
                      className="select-none rounded-2xl bg-zinc-950 p-4 transition hover:bg-zinc-900"
                      onContextMenu={(e) => openContextMenu(e, target)}
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                      style={{ WebkitTouchCallout: "none" }}
                    >
                      {!isNext && (
                        <div className="flex gap-2 text-sm font-semibold text-zinc-100">
                          <Icon type="map" />
                          <span>{venue}</span>
                        </div>
                      )}
                      {isNext && item.venue && (
                        <div className="flex gap-2 text-sm font-semibold text-zinc-100">
                          <Icon type="map" />
                          <span>{item.venue}</span>
                        </div>
                      )}
                      <div className={`${(!isNext || item.venue) ? "mt-2" : ""} flex gap-2 text-sm text-zinc-400`}>
                        <Icon type="calendar" />
                        <span>{date}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>

        {filtered.length === 0 && (
          <div className="mt-16 text-center text-zinc-500">No concerts found.</div>
        )}
        </>
        )}
      </section>

      {isSaving && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[80] flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900/95 px-5 py-3 shadow-2xl backdrop-blur">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-100" />
          <span className="text-sm font-bold text-zinc-100">Saving…</span>
        </div>
      )}

      <AddConcertModal isOpen={modalOpen} mode={mode} onClose={() => setModalOpen(false)} onSave={handleAddConcert} isSaving={isSaving} saveError={saveError} artistSuggestions={artistSuggestions} venueSuggestions={venueSuggestions} />

      <EditConcertModal
        isOpen={!!editTarget}
        mode={editTarget?.mode || mode}
        initial={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={handleEditConcert}
        onDelete={handleDeleteConcert}
        isSaving={isSaving}
        saveError={saveError}
        artistSuggestions={artistSuggestions}
        venueSuggestions={venueSuggestions}
      />

      <ContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        onEdit={startEditFromContext}
        onDelete={deleteFromContext}
        onMoveToHistory={moveToHistoryFromContext}
        showMoveToHistory={contextMenu.target?.mode === "next"}
        onClose={closeContextMenu}
      />
    </main>
  );
}
