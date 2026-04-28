import React, { useEffect, useMemo, useState } from "react";

// ── GitHub config ──────────────────────────────────────────────────────────
const GITHUB_OWNER = "ericmurillo93";
const GITHUB_REPO  = "A-Deafening-Noise";
const GITHUB_FILE  = "data/concerts.json";
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;

const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${GITHUB_FILE}`;
const API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

async function fetchConcerts() {
  const res = await fetch(`${RAW_URL}?t=${Date.now()}`);
  if (!res.ok) throw new Error("Could not load concerts.json");
  return res.json();
}

async function saveConcerts(data, sha) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const res = await fetch(API_URL, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Add concert via web`,
      content,
      sha,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Could not save to GitHub");
  }
  return res.json();
}

async function getFileSha() {
  const res = await fetch(API_URL, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
  });
  if (!res.ok) throw new Error("Could not get file SHA");
  const data = await res.json();
  return data.sha;
}
// ──────────────────────────────────────────────────────────────────────────

function formatSheetDate(value) {
  if (!value) return "";
  if (typeof value === "string" && value.includes("/")) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const day   = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year  = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

function normalizeBought(value) {
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

function groupHistoryRows(rows) {
  const grouped = rows.reduce((acc, row) => {
    const artist = String(row.artist || "").trim();
    const venue  = String(row.venue  || "").trim();
    const date   = formatSheetDate(row.date);
    if (!artist || !venue || !date) return acc;
    if (!acc[artist]) acc[artist] = [];
    acc[artist].push(`${venue} - ${date}`);
    return acc;
  }, {});
  return Object.entries(grouped).map(([artist, shows]) => ({ artist, shows }));
}

function mapNextRows(rows) {
  return rows
    .map((row) => ({
      artist: String(row.artist || "").trim(),
      date:   formatSheetDate(row.date),
      bought: normalizeBought(row.bought),
    }))
    .filter((item) => item.artist && item.date);
}

function Icon({ type }) {
  const common = {
    width: "16", height: "16", viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor", strokeWidth: "2",
    strokeLinecap: "round", strokeLinejoin: "round",
    className: "mt-0.5 h-4 w-4 shrink-0 text-zinc-500",
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
        <path d="M8 2v4" /><path d="M16 2v4" />
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
  const date  = parts[parts.length - 1] || "";
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
  return items.filter((item) =>
    normalize(`${item.artist} ${item.shows ? item.shows.join(" ") : item.date}`).includes(q)
  );
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
    return sorted.sort(
      (a, b) => getMostRecentShowDate(b, mode) - getMostRecentShowDate(a, mode) || a.artist.localeCompare(b.artist)
    );
  }
  return sorted.sort((a, b) => a.artist.localeCompare(b.artist));
}

function getVisibleNextConcerts(items, ticketFilter) {
  if (ticketFilter === "bought")   return items.filter((item) => item.bought);
  if (ticketFilter === "pending")  return items.filter((item) => !item.bought);
  return items;
}

function AddConcertModal({ isOpen, mode, onClose, onSave, isSaving, saveError }) {
  const [artist, setArtist] = useState("");
  const [venue,  setVenue]  = useState("");
  const [date,   setDate]   = useState("");
  const [bought, setBought] = useState(false);

  if (!isOpen) return null;
  const isNextMode = mode === "next";

  function submit(event) {
    event.preventDefault();
    if (!artist.trim() || !date.trim() || (!isNextMode && !venue.trim())) return;
    onSave({ artist, venue, date, bought });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-3xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">Add concert</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {isNextMode ? "Add an upcoming concert." : "Add a concert to the archive."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:border-zinc-500">
            Close
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Artist</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" placeholder="Artist name" />
          </label>

          {!isNextMode && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Location / Venue</span>
              <input value={venue} onChange={(e) => setVenue(e.target.value)} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" placeholder="Venue or festival" />
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Date</span>
            <input value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" placeholder="DD/MM/YYYY" />
          </label>

          {isNextMode && (
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              <input type="checkbox" checked={bought} onChange={(e) => setBought(e.target.checked)} />
              <span>💰 Ticket bought</span>
            </label>
          )}
        </div>

        {saveError && (
          <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {saveError}
          </div>
        )}

        <button type="submit" disabled={isSaving} className="mt-6 w-full rounded-2xl bg-zinc-100 px-5 py-3 font-black text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
          {isSaving ? "Saving…" : "Add concert"}
        </button>
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          Saves directly to <strong>data/concerts.json</strong> in GitHub. Netlify redesplegará la web en ~30 segundos.
        </p>
      </form>
    </div>
  );
}

const externalLinks = {
  albums:  "https://www.discogs.com/es/user/eric.murillo93/collection",
  spotify: "https://open.spotify.com/user/ericmurillospotify?si=47fbb5f4096a4be8&nd=1&dlsi=b38e7009347e48a4",
};

export default function App() {
  const [query,        setQuery]        = useState("");
  const [sortMode,     setSortMode]     = useState("artist");
  const [ticketFilter, setTicketFilter] = useState("all");
  const [activePage,   setActivePage]   = useState("history");
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [isLoading,    setIsLoading]    = useState(true);
  const [loadError,    setLoadError]    = useState("");
  const [isSaving,     setIsSaving]     = useState(false);
  const [saveError,    setSaveError]    = useState("");
  const [rawData,      setRawData]      = useState({ history: [], next: [] });
  const [historyItems, setHistoryItems] = useState([]);
  const [nextItems,    setNextItems]    = useState([]);

  useEffect(() => {
    let mounted = true;
    fetchConcerts()
      .then((data) => {
        if (!mounted) return;
        setRawData(data);
        setHistoryItems(groupHistoryRows(data.history || []));
        setNextItems(mapNextRows(data.next || []));
        setLoadError("");
      })
      .catch(() => {
        if (mounted) setLoadError("Could not load concerts.json from GitHub.");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const isNext       = activePage === "next";
  const currentItems = isNext ? nextItems : historyItems;
  const mode         = isNext ? "next" : "history";
  const title        = isNext ? "Next Concerts" : "Concert Archive";
  const description  = isNext
    ? "Upcoming shows, festivals and planned concerts."
    : "A searchable lifetime lineup of artists, venues and dates.";

  const filtered = useMemo(() => {
    const visible = isNext ? getVisibleNextConcerts(currentItems, ticketFilter) : currentItems;
    return sortConcerts(filterConcerts(visible, query), sortMode, mode);
  }, [currentItems, query, sortMode, mode, isNext, ticketFilter]);

  const totalShows = historyItems.reduce((sum, item) => sum + (item.shows ? item.shows.length : 0), 0);

  function changePage(page) {
    setActivePage(page);
    setQuery("");
    setSortMode("artist");
    setTicketFilter("all");
    setSidebarOpen(false);
  }

  async function handleAddConcert(data) {
    setIsSaving(true);
    setSaveError("");
    try {
      const sha        = await getFileSha();
      const newHistory = isNext ? rawData.history : [
        ...rawData.history,
        { artist: data.artist.trim(), venue: data.venue.trim(), date: data.date.trim() },
      ];
      const newNext = isNext
        ? [...rawData.next, { artist: data.artist.trim(), date: data.date.trim(), bought: data.bought }]
        : rawData.next;

      const newRaw = { history: newHistory, next: newNext };
      await saveConcerts(newRaw, sha);

      setRawData(newRaw);
      setHistoryItems(groupHistoryRows(newRaw.history));
      setNextItems(mapNextRows(newRaw.next));
      setModalOpen(false);
    } catch (error) {
      setSaveError(error.message || "Could not save concert");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 md:flex">
      <button onClick={() => setSidebarOpen(true)} className="fixed left-4 top-4 z-40 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-100 shadow-2xl transition hover:border-zinc-500" aria-label="Open menu">
        Menu
      </button>

      {sidebarOpen && (
        <button className="fixed inset-0 z-40 bg-black/60" onClick={() => setSidebarOpen(false)} aria-label="Close menu overlay" />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-zinc-800 bg-zinc-950/95 p-5 backdrop-blur transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col">
          <div className="mb-8 flex items-center justify-between gap-4">
            <button onClick={() => changePage("history")} className="text-left text-xl font-black text-zinc-100">A Deafening Noise</button>
            <button onClick={() => setSidebarOpen(false)} className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:border-zinc-500">Close</button>
          </div>
          <nav className="space-y-2 text-sm">
            <button onClick={() => changePage("history")} className={`block w-full rounded-2xl px-4 py-3 text-left transition hover:bg-zinc-900 hover:text-zinc-100 ${activePage === "history" ? "bg-zinc-900 text-zinc-100" : "text-zinc-400"}`}>Concert history</button>
            <button onClick={() => changePage("next")}    className={`block w-full rounded-2xl px-4 py-3 text-left transition hover:bg-zinc-900 hover:text-zinc-100 ${activePage === "next"    ? "bg-zinc-900 text-zinc-100" : "text-zinc-400"}`}>Next concerts</button>
            <a href={externalLinks.albums}  target="_blank" rel="noreferrer" className="block rounded-2xl px-4 py-3 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100">Album collection</a>
            <a href={externalLinks.spotify} target="_blank" rel="noreferrer" className="block rounded-2xl px-4 py-3 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100">Spotify</a>
          </nav>
          <div className="mt-auto text-xs text-zinc-600">Concert archive project</div>
        </div>
      </aside>

      <section className="mx-auto w-full max-w-7xl px-5 py-16 md:px-8 md:py-14">
        <header className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.45em] text-zinc-400">A Deafening Noise</p>
          <h1 className="text-5xl font-black uppercase tracking-tight md:text-8xl">{title}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-zinc-400 md:text-lg">{description}</p>
          {isLoading  && <p className="mt-3 text-sm text-zinc-500">Loading concerts…</p>}
          {loadError  && <p className="mt-3 text-sm text-red-300">{loadError}</p>}
          <button onClick={() => setModalOpen(true)} className="mt-6 rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-black text-zinc-100 shadow-2xl transition hover:border-zinc-500">
            + Add concert
          </button>
        </header>

        <div className="sticky top-0 z-10 mb-8 border-y border-zinc-800 bg-zinc-950/90 py-4 backdrop-blur">
          <div className={`mx-auto grid max-w-5xl gap-3 ${isNext ? "md:grid-cols-[1fr_360px]" : "md:grid-cols-[1fr_280px]"}`}>
            <div className="flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 shadow-2xl">
              <Icon type="search" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search artist, venue, festival, city or date" className="w-full bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500" aria-label="Search concerts" />
            </div>
            {isNext ? (
              <div className="grid grid-cols-3 rounded-full border border-zinc-700 bg-zinc-900 p-1 text-sm text-zinc-300 shadow-2xl">
                <button onClick={() => setTicketFilter("all")}     className={`rounded-full px-3 py-2 transition ${ticketFilter === "all"     ? "bg-zinc-100 text-zinc-950" : "hover:text-zinc-100"}`}>All</button>
                <button onClick={() => setTicketFilter("bought")}  className={`rounded-full px-3 py-2 transition ${ticketFilter === "bought"  ? "bg-zinc-100 text-zinc-950" : "hover:text-zinc-100"}`}>Bought</button>
                <button onClick={() => setTicketFilter("pending")} className={`rounded-full px-3 py-2 transition ${ticketFilter === "pending" ? "bg-zinc-100 text-zinc-950" : "hover:text-zinc-100"}`}>Not bought</button>
              </div>
            ) : (
              <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-base text-zinc-100 shadow-2xl outline-none" aria-label="Sort concerts">
                <option value="artist">Sort by artist</option>
                <option value="concerts">Sort by number of concerts</option>
                <option value="recent">Sort by most recent</option>
              </select>
            )}
          </div>
        </div>

        {!isNext && (
          <div className="mb-8 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center">
              <div className="text-3xl font-black">{historyItems.length}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-zinc-500">Artists</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center">
              <div className="text-3xl font-black">{totalShows}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-zinc-500">Shows</div>
            </div>
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <article key={item.artist} className="group rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl transition hover:-translate-y-1 hover:border-zinc-500">
              <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4">
                <h2 className="text-2xl font-black uppercase leading-none tracking-tight md:text-3xl">{item.artist}</h2>
                {isNext ? (
                  item.bought
                    ? <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-300">💰 Bought</span>
                    : <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs font-bold text-zinc-500">Pending</span>
                ) : (
                  <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-400">{item.shows.length}</span>
                )}
              </div>
              <div className="mt-4 space-y-3">
                {(isNext ? [item.date] : [...item.shows].sort((a, b) => parseDate(parseShow(b, "history").date) - parseDate(parseShow(a, "history").date))).map((show) => {
                  const { venue, date } = parseShow(show, mode);
                  return (
                    <div key={`${item.artist}-${show}`} className="rounded-2xl bg-zinc-950 p-4">
                      {!isNext && (
                        <div className="flex gap-2 text-sm font-semibold text-zinc-100">
                          <Icon type="map" /><span>{venue}</span>
                        </div>
                      )}
                      <div className={`${!isNext ? "mt-2" : ""} flex gap-2 text-sm text-zinc-400`}>
                        <Icon type="calendar" /><span>{date}</span>
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
      </section>

      <AddConcertModal
        isOpen={modalOpen}
        mode={mode}
        onClose={() => setModalOpen(false)}
        onSave={handleAddConcert}
        isSaving={isSaving}
        saveError={saveError}
      />
    </main>
  );
}