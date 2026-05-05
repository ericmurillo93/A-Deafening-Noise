import React, { useMemo, useState } from "react";
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

const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD;
const GITHUB_API_URL = "https://api.github.com/repos/ericmurillo93/A-Deafening-Noise/contents/data/concerts.json";

async function saveToGitHub(updatedData) {
  const getRes = await fetch(GITHUB_API_URL, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" }
  });
  if (!getRes.ok) throw new Error("Could not fetch concerts.json from GitHub");
  const { sha } = await getRes.json();

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(updatedData, null, 2))));

  const putRes = await fetch(GITHUB_API_URL, {
    method: "PUT",
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Add concert via web", content, sha })
  });
  if (!putRes.ok) throw new Error("Could not save concerts.json to GitHub");
}

const externalLinks = {
  albums: "https://www.discogs.com/es/user/eric.murillo93/collection",
  spotify: "https://open.spotify.com/user/ericmurillospotify?si=47fbb5f4096a4be8&nd=1&dlsi=b38e7009347e48a4"
};



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
  return items.filter((item) => normalize(`${item.artist} ${item.shows ? item.shows.join(" ") : item.date}`).includes(q));
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

function addNextConcert(items, artist, date, bought) {
  return [...items, { artist: artist.trim(), date: date.trim(), bought }];
}

function AddConcertModal({ isOpen, mode, onClose, onSave, isSaving, saveError }) {
  const [artist, setArtist] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
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
            <p className="mt-1 text-sm text-zinc-500">{isNextMode ? "Add an upcoming concert." : "Add a concert to the archive."}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:border-zinc-500">Close</button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Artist</span>
            <input value={artist} onChange={(event) => setArtist(event.target.value)} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" placeholder="Artist name" />
          </label>

          {!isNextMode && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Location / Venue</span>
              <input value={venue} onChange={(event) => setVenue(event.target.value)} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" placeholder="Venue or festival" />
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Date</span>
            <input value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" placeholder="DD/MM/YYYY" />
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

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("artist");
  const [ticketFilter, setTicketFilter] = useState("all");
  const [activePage, setActivePage] = useState("history");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState(fallbackConcertHistory);
  const [nextItems, setNextItems] = useState(fallbackNextConcerts);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const isNext = activePage === "next";
  const currentItems = isNext ? nextItems : historyItems;
  const mode = isNext ? "next" : "history";
  const title = isNext ? "Next Concerts" : "Concert Archive";
  const description = isNext ? "Upcoming shows, festivals and planned concerts." : "A searchable lifetime lineup of artists, venues and dates.";

  const filtered = useMemo(() => {
    const visibleItems = isNext ? getVisibleNextConcerts(currentItems, ticketFilter) : currentItems;
    return sortConcerts(filterConcerts(visibleItems, query), sortMode, mode);
  }, [currentItems, query, sortMode, mode, isNext, ticketFilter]);

  if (!unlocked) return <LoginGate onUnlock={() => setUnlocked(true)} />;

  const totalShows = currentItems.reduce((sum, item) => sum + (item.shows ? item.shows.length : 0), 0);

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
      let updatedHistory = historyItems;
      let updatedNext = nextItems;

      if (isNext) {
        updatedNext = sortConcerts(addNextConcert(nextItems, data.artist, data.date, data.bought), "next", "next");
      } else {
        updatedHistory = addHistoryConcert(historyItems, data.artist, data.venue, data.date);
      }

      const flatHistory = updatedHistory.flatMap(({ artist, shows }) =>
        shows.map((show) => {
          const parts = show.split(" - ");
          const date = parts[parts.length - 1];
          const venue = parts.slice(0, -1).join(" - ");
          return { artist, venue, date };
        })
      );

      await saveToGitHub({ history: flatHistory, next: updatedNext });

      if (isNext) setNextItems(updatedNext);
      else setHistoryItems(updatedHistory);

      setModalOpen(false);
    } catch (error) {
      setSaveError(error.message || "Could not save concert");
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
            <a href={externalLinks.albums} target="_blank" rel="noreferrer" className="block rounded-2xl px-4 py-3 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100">Album collection</a>
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
        </header>

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

        {!isNext && (
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center">
              <div className="text-3xl font-black">{currentItems.length}</div>
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
                  return (
                    <div key={`${item.artist}-${show}`} className="rounded-2xl bg-zinc-950 p-4">
                      {!isNext && (
                        <div className="flex gap-2 text-sm font-semibold text-zinc-100">
                          <Icon type="map" />
                          <span>{venue}</span>
                        </div>
                      )}
                      <div className={`${!isNext ? "mt-2" : ""} flex gap-2 text-sm text-zinc-400`}>
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
      </section>

      <AddConcertModal isOpen={modalOpen} mode={mode} onClose={() => setModalOpen(false)} onSave={handleAddConcert} isSaving={isSaving} saveError={saveError} />
    </main>
  );
}
