import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { normalize, parseDate, parseShow } from "../lib/concerts";

const GeographicStatsMap = React.lazy(() => import("../components/GeographicStats"));
function GeographicStats(props) {
  return <React.Suspense fallback={<div className="flex h-[32rem] items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900" role="status"><span className="flex items-center gap-3 text-sm font-semibold text-zinc-400"><i className="fa-solid fa-circle-notch animate-spin text-blue-400" aria-hidden="true" />Opening concert map…</span></div>}><GeographicStatsMap {...props} /></React.Suspense>;
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
                <div className={`h-full ${accent} transition-[width,background-color]`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatsPage({ historyItems, onOpenArtist, onOpenVenue, onOpenYearReview }) {
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
    <div className="space-y-4">
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
          <button onClick={() => stats.topArtist !== "—" && onOpenArtist(stats.topArtist)} className="mt-2 text-left text-2xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{stats.topArtist}</button>
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
                <button type="button" key={year} onClick={() => onOpenYearReview(year)} className="group flex min-w-[36px] flex-1 cursor-pointer flex-col items-center gap-2 rounded-xl px-1 py-2 transition hover:bg-zinc-800 focus-visible:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600" aria-label={`Open ${year} year in review: ${count} ${count === 1 ? "concert" : "concerts"}`}>
                  <div className="flex h-44 w-full items-end">
                    <div className="w-full rounded-t-md bg-zinc-300 transition-[height,background-color] group-hover:bg-white" style={{ height: `${count === 0 ? 2 : heightPct}%`, opacity: count === 0 ? 0.15 : 1 }} title={`${count} ${count === 1 ? "show" : "shows"} in ${year}`} />
                  </div>
                  <div className="text-[10px] font-semibold text-zinc-500 transition group-hover:text-zinc-300">'{year.slice(-2)}</div>
                  <div className="text-[11px] font-bold text-zinc-300 transition group-hover:text-white">{count}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default StatsPage;

export function YearInReviewPage({ historyItems, selectedYear, onYearChange, onOpenArtist, onOpenSetlist, onOpenVenue, DropdownMenu, Icon, headerTarget }) {
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
      {headerTarget && createPortal(<div className="flex justify-end">
        <DropdownMenu
          value={activeYear}
          onChange={onYearChange}
          ariaLabel="Choose review year"
          className="w-40"
          centered
          options={years.map((year) => ({ value: year, label: year }))}
        />
      </div>, headerTarget)}

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

      <div className="mt-4">
        <GeographicStats shows={review.shows} title={`${activeYear} geography`} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
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

      <section className="mt-6">
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
