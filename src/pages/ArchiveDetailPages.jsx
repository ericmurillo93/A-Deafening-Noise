import React, { useMemo, useState } from "react";
import { normalize, parseDate, parseShow } from "../lib/concerts";

export function ArtistDetailPage({ item, upcoming = [], onOpenSetlist, onOpenVenue, Icon }) {
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
      {latestShow && <p className="mb-8 text-right text-sm text-zinc-500">Most recently seen {latestShow.date}</p>}

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

export function VenueDetailPage({ venue, historyItems, onOpenArtist, onOpenSetlist, Icon }) {
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
      {latestVisit && <p className="mb-8 text-right text-sm text-zinc-500">Last visited {latestVisit.date}</p>}

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

export function ConcertTimelinePage({ historyItems, onShowCardView, onOpenArtist, onOpenSetlist, onOpenVenue, DropdownMenu, Icon }) {
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
            <button onClick={onShowCardView} className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-200 transition hover:border-zinc-500 hover:text-white" aria-label="Show concert cards" title="Card view">
              <i className="fa-solid fa-table-cells-large" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="hidden gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)_auto]">
          <DropdownMenu value={artistFilter} onChange={setArtistFilter} ariaLabel="Filter timeline by artist" groupName="timeline-filters" menuAlign="left" options={[{ value: "all", label: "All artists" }, ...artists.map((artist) => ({ value: artist, label: artist }))]} />
          <DropdownMenu value={venueFilter} onChange={setVenueFilter} ariaLabel="Filter timeline by venue" groupName="timeline-filters" options={[{ value: "all", label: "All venues" }, ...venues.map((venue) => ({ value: venue, label: venue }))]} />
          <DropdownMenu value="" onChange={jumpToYear} ariaLabel="Jump to timeline year" buttonLabel="Years" groupName="timeline-filters" menuAlign="left" options={groupedYears.map(([year, yearShows]) => ({ value: year, label: `${year} · ${yearShows.length} ${yearShows.length === 1 ? "concert" : "concerts"}` }))} />
          <button onClick={onShowCardView} className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-200 transition hover:border-zinc-500 hover:text-white" aria-label="Show concert cards" title="Card view"><i className="fa-solid fa-table-cells-large" aria-hidden="true" /></button>
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
