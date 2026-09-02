import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { normalize, parseDate, parseShow } from "../lib/concerts";
import { getSocialComparison } from "../lib/supabase";
import ConcertHistoryList from "../components/ConcertHistoryList";
import { useI18n } from "../lib/i18n.jsx";

const GeographicStatsMap = React.lazy(
  () => import("../components/GeographicStats"),
);
function GeographicStats(props) {
  const { t } = useI18n();
  return (
    <React.Suspense
      fallback={
        <div
          className="flex h-[32rem] items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900"
          role="status"
        >
          <span className="flex items-center gap-3 text-sm font-semibold text-zinc-400">
            <i
              className="fa-solid fa-circle-notch animate-spin text-blue-400"
              aria-hidden="true"
            />
            {t("Opening concert map…")}
          </span>
        </div>
      }
    >
      <GeographicStatsMap {...props} />
    </React.Suspense>
  );
}

function StatsBar({ data, max, accent = "bg-zinc-100", label }) {
  const { t } = useI18n();
  if (!data.length)
    return <p className="text-sm text-zinc-500">{t("No concert data for this selection.")}</p>;
  return (
    <div className="space-y-3">
      {data.map(([name, value]) => {
        const pct = max ? Math.max(4, (value / max) * 100) : 0;
        return (
          <div
            key={name}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4"
          >
            <div className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold text-zinc-100">
                  {name}
                </span>
                <span className="text-zinc-500">
                  {value}
                  {label ? ` ${label}` : ""}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                <div
                  className={`h-full ${accent} transition-[width,background-color]`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatsPage({
  historyItems,
  historyConcerts = [],
  selectedFriends = [],
  onOpenArtist,
  onOpenVenue,
  onOpenCountry,
  onOpenYearReview,
}) {
  const { t } = useI18n();
  const [comparison, setComparison] = useState(null);
  useEffect(() => {
    let active = true;
    setComparison(null);
    if (selectedFriends.length === 1)
      getSocialComparison(selectedFriends[0].id)
        .then((value) => {
          if (active) setComparison(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedFriends.length, selectedFriends[0]?.id]);
  const geographyShows = useMemo(
    () => historyConcerts.length
      ? historyConcerts.map((concert) => ({ ...concert }))
      : historyItems.flatMap(({ artist, shows }) =>
          shows.map((show) => ({ artist, ...parseShow(show, "history") })),
        ),
    [historyConcerts, historyItems],
  );
  const stats = useMemo(() => {
    const totalArtists = historyItems.length;
    const totalShows = historyItems.reduce((s, i) => s + i.shows.length, 0);
    const venueCounts = {},
      yearCounts = {};
    let earliestYear = Infinity,
      latestYear = -Infinity;
    historyItems.forEach(({ shows }) => {
      shows.forEach((show) => {
        const { venue, date } = parseShow(show, "history");
        if (venue && venue !== "Date confirmed")
          venueCounts[venue] = (venueCounts[venue] || 0) + 1;
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
    const years = [];
    if (Number.isFinite(earliestYear) && Number.isFinite(latestYear))
      for (let y = earliestYear; y <= latestYear; y++)
        years.push([String(y), yearCounts[y] || 0]);
    return {
      totalArtists,
      totalShows,
      yearsActive: years.length,
      avgPerYear: years.length ? (totalShows / years.length).toFixed(1) : "0",
      topArtist: topArtists[0]?.[0] || "—",
      topArtistShows: topArtists[0]?.[1] || 0,
      topVenue: topVenues[0]?.[0] || "—",
      topVenueShows: topVenues[0]?.[1] || 0,
      topArtists,
      topVenues,
      years,
      maxArtist: topArtists[0]?.[1] || 1,
      maxVenue: topVenues[0]?.[1] || 1,
      maxYear: years.length ? Math.max(...years.map(([, v]) => v)) : 1,
    };
  }, [historyItems]);

  const summaryCards = [
    { label: t("Total artists"), value: stats.totalArtists },
    { label: t("Total shows"), value: stats.totalShows },
    { label: t("Years active"), value: stats.yearsActive },
    { label: t("Avg shows/year"), value: stats.avgPerYear },
  ];
  const together = useMemo(() => {
    if (!selectedFriends.length || !geographyShows.length) return null;
    const ordered = [...geographyShows].sort(
      (a, b) => parseDate(a.date) - parseDate(b.date),
    );
    const cities = {};
    const years = {};
    geographyShows.forEach((show) => {
      if (show.city) cities[show.city] = (cities[show.city] || 0) + 1;
      const year = show.date?.match(/(\d{4})/)?.[1];
      if (year) years[year] = (years[year] || 0) + 1;
    });
    const peak = Object.entries(years).sort((a, b) => b[1] - a[1])[0];
    const city = Object.entries(cities).sort((a, b) => b[1] - a[1])[0];
    return { first: ordered[0], last: ordered.at(-1), peak, city };
  }, [geographyShows, selectedFriends]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center"
          >
            <div className="text-3xl font-black text-zinc-100 md:text-4xl">
              {value}
            </div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
              {label}
            </div>
          </div>
        ))}
      </div>
      {together && (
        <section className="rounded-3xl border border-blue-900/60 bg-blue-950/20 p-5 md:p-6">
          <div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                {t("Together with")}
              </p>
              <h2 className="mt-1 text-xl font-black text-zinc-100">
                {selectedFriends
                  .map((friend) => friend.displayName)
                  .join(" + ")}
              </h2>
            </div>
          </div>
          <dl className="mt-5 grid gap-4 border-t border-blue-900/40 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                t("First concert"),
                together.first &&
                  `${together.first.artist || ""} ${together.first.date}`,
              ],
              [
                t("Last concert"),
                together.last &&
                  `${together.last.artist || ""} ${together.last.date}`,
              ],
              [t("Most shared city"), together.city?.[0]],
              [
                t("Peak year"),
                together.peak &&
                  `${together.peak[0]} · ${together.peak[1]} ${t(together.peak[1] === 1 ? "concert" : "concerts")}`,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-bold text-zinc-200">
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {comparison && (
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">{t("Stats with friends")}</p>
          <h2 className="mt-1 text-xl font-black text-zinc-100">{t("You and {name}", { name: selectedFriends[0].displayName })}</h2>
          <div className="mt-5 grid grid-cols-3 divide-x divide-zinc-800 border-y border-zinc-800 py-4 text-center">
            {[["Your archive",comparison.myConcerts],["Their archive",comparison.friendConcerts],["Concerts in common",comparison.sameEvents]].map(([label,value])=><div key={label}><strong className={`text-2xl ${label==="Concerts in common"?"text-blue-400":"text-white"}`}>{value}</strong><span className="mt-1 block text-[9px] uppercase text-zinc-600">{t(label)}</span></div>)}
          </div>
          {comparison.sharedArtists?.length>0&&<p className="mt-4 text-sm text-zinc-400"><strong className="text-zinc-200">{t("Artists you both saw:")}</strong> {comparison.sharedArtists.map((item)=>item.artist).join(" · ")}</p>}
        </section>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            {t("Most-seen artist")}
          </div>
          <button
            onClick={() =>
              stats.topArtist !== "—" && onOpenArtist(stats.topArtist)
            }
            className="mt-2 text-left text-2xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4"
          >
            {stats.topArtist}
          </button>
          <div className="mt-1 text-sm text-zinc-400">
            {stats.topArtistShows}{" "}
            {t(stats.topArtistShows === 1 ? "show" : "shows")}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            {t("Top venue")}
          </div>
          <button
            onClick={() =>
              stats.topVenue !== "—" && onOpenVenue(stats.topVenue)
            }
            className="mt-2 text-left text-2xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4"
          >
            {stats.topVenue}
          </button>
          <div className="mt-1 text-sm text-zinc-400">
            {stats.topVenueShows} {t(stats.topVenueShows === 1 ? "show" : "shows")}
          </div>
        </div>
      </div>
      <GeographicStats shows={geographyShows} title={t("Lifetime geography")} onOpenCountry={onOpenCountry} />
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-5 text-lg font-black uppercase tracking-tight text-zinc-100">
          {t("Top 10 artists")}
        </h3>
        <StatsBar
          data={stats.topArtists}
          max={stats.maxArtist}
          label={t("shows")}
          accent="bg-zinc-100"
        />
      </div>
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-5 text-lg font-black uppercase tracking-tight text-zinc-100">
          {t("Top 10 venues")}
        </h3>
        <StatsBar
          data={stats.topVenues}
          max={stats.maxVenue}
          label={t("shows")}
          accent="bg-zinc-300"
        />
      </div>
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-5 text-lg font-black uppercase tracking-tight text-zinc-100">
          {t("Concerts per year")}
        </h3>
        {stats.years.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("No concert data for this selection.")}</p>
        ) : (
          <div className="flex items-end gap-2 overflow-x-auto pb-2">
            {stats.years.map(([year, count]) => {
              const heightPct = stats.maxYear
                ? (count / stats.maxYear) * 100
                : 0;
              return (
                <button
                  type="button"
                  key={year}
                  onClick={() => onOpenYearReview(year)}
                  className="group flex min-w-[36px] flex-1 cursor-pointer flex-col items-center gap-2 rounded-xl px-1 py-2 transition hover:bg-zinc-800 focus-visible:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
                  aria-label={t("Open {year} year in review: {count} concerts", { year, count })}
                >
                  <div className="flex h-44 w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-zinc-300 transition-[height,background-color] group-hover:bg-white"
                      style={{
                        height: `${count === 0 ? 2 : heightPct}%`,
                        opacity: count === 0 ? 0.15 : 1,
                      }}
                      title={t("{count} shows in {year}", { count, year })}
                    />
                  </div>
                  <div className="text-[10px] font-semibold text-zinc-500 transition group-hover:text-zinc-300">
                    '{year.slice(-2)}
                  </div>
                  <div className="text-[11px] font-bold text-zinc-300 transition group-hover:text-white">
                    {count}
                  </div>
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

export function YearInReviewPage({
  historyItems,
  historyConcerts = [],
  selectedYear,
  onYearChange,
  onOpenArtist,
  onOpenSetlist,
  onOpenVenue,
  onOpenCity,
  onOpenCountry,
  DropdownMenu,
  Icon,
  headerTarget,
}) {
  const { t, locale } = useI18n();
  const allShows = useMemo(
    () => historyConcerts.length
      ? historyConcerts
      : historyItems.flatMap(({ artist, shows }) => shows.map((show) => ({ artist, show, ...parseShow(show, "history") }))),
    [historyConcerts, historyItems],
  );
  const years = useMemo(
    () =>
      [
        ...new Set(
          allShows
            .map(({ date }) => String(date).match(/(\d{4})/)?.[1])
            .filter(Boolean),
        ),
      ].sort((a, b) => Number(b) - Number(a)),
    [allShows],
  );
  const activeYear = years.includes(selectedYear)
    ? selectedYear
    : years[0] || "";

  const review = useMemo(() => {
    if (!activeYear) return null;
    const yearShows = allShows
      .filter(({ date }) => String(date).match(/(\d{4})/)?.[1] === activeYear)
      .sort(
        (a, b) =>
          parseDate(a.date) - parseDate(b.date) ||
          a.artist.localeCompare(b.artist),
      );
    const previousYear = String(Number(activeYear) - 1);
    const previousShows = allShows.filter(
      ({ date }) => String(date).match(/(\d{4})/)?.[1] === previousYear,
    );
    const artistFirstYear = new Map();
    allShows.forEach(({ artist, date }) => {
      const year = String(date).match(/(\d{4})/)?.[1];
      if (!year) return;
      const key = normalize(artist);
      if (
        !artistFirstYear.has(key) ||
        Number(year) < Number(artistFirstYear.get(key))
      )
        artistFirstYear.set(key, year);
    });
    const uniqueArtists = [...new Set(yearShows.map(({ artist }) => artist))];
    const newArtists = uniqueArtists.filter(
      (artist) => artistFirstYear.get(normalize(artist)) === activeYear,
    );
    const returningArtists = uniqueArtists.filter(
      (artist) => artistFirstYear.get(normalize(artist)) !== activeYear,
    );
    const venueCounts = {};
    const monthCounts = {};
    yearShows.forEach(({ venue, date }) => {
      if (venue && venue !== "Date confirmed")
        venueCounts[venue] = (venueCounts[venue] || 0) + 1;
      const month = String(date).match(/^\d{1,2}\/(\d{1,2})\//)?.[1];
      if (month) monthCounts[month] = (monthCounts[month] || 0) + 1;
    });
    const topVenue = Object.entries(venueCounts).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    const busiestMonth = Object.entries(monthCounts).sort(
      (a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]),
    )[0];
    return {
      shows: yearShows,
      uniqueArtists,
      newArtists,
      returningArtists,
      firstShow: yearShows[0],
      lastShow: yearShows[yearShows.length - 1],
      topVenue: topVenue?.[0] || "—",
      topVenueCount: topVenue?.[1] || 0,
      busiestMonth: busiestMonth
        ? new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2020, Number(busiestMonth[0]) - 1, 1))
        : "—",
      busiestMonthCount: busiestMonth?.[1] || 0,
      previousYear,
      previousCount: previousShows.length,
      change: yearShows.length - previousShows.length,
    };
  }, [activeYear, allShows]);

  if (!review)
    return (
      <p className="py-16 text-center text-zinc-500">
        {t("No yearly concert data yet.")}
      </p>
    );

  const summaryCards = [
    { label: t("Concerts"), value: review.shows.length },
    { label: t("Artists"), value: review.uniqueArtists.length },
    { label: t("New artists"), value: review.newArtists.length },
    { label: t("Returning"), value: review.returningArtists.length },
  ];
  const comparisonText =
    review.previousCount === 0
      ? t("No concerts recorded in {year}", { year: review.previousYear })
      : review.change === 0
        ? t("The same number as {year}", { year: review.previousYear })
        : t(review.change > 0 ? "{count} more than {year}" : "{count} fewer than {year}", { count: Math.abs(review.change), year: review.previousYear });

  return (
    <div className="mx-auto max-w-5xl">
      {headerTarget &&
        createPortal(
          <div className="flex justify-end">
            <DropdownMenu
              value={activeYear}
              onChange={onYearChange}
              ariaLabel={t("Choose review year")}
              className="w-40"
              centered
              options={years.map((year) => ({ value: year, label: year }))}
            />
          </div>,
          headerTarget,
        )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center"
          >
            <div className="text-3xl font-black text-zinc-100 md:text-4xl">
              {value}
            </div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
              {label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            {t("Top venue")}
          </div>
          <button
            onClick={() =>
              review.topVenue !== "—" && onOpenVenue(review.topVenue)
            }
            className="mt-2 break-words text-left text-xl font-black text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4"
          >
            {review.topVenue}
          </button>
          <div className="mt-1 text-sm text-zinc-400">
            {review.topVenueCount}{" "}
            {t(review.topVenueCount === 1 ? "visit" : "visits")}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            {t("Busiest month")}
          </div>
          <div className="mt-2 text-xl font-black text-zinc-100">
            {review.busiestMonth}
          </div>
          <div className="mt-1 text-sm text-zinc-400">
            {review.busiestMonthCount}{" "}
            {t(review.busiestMonthCount === 1 ? "concert" : "concerts")}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            {t("Year over year")}
          </div>
          <div
            className={`mt-2 text-xl font-black ${review.change > 0 ? "text-emerald-400" : review.change < 0 ? "text-amber-400" : "text-zinc-100"}`}
          >
            {review.change > 0 ? "+" : ""}
            {review.change}
          </div>
          <div className="mt-1 text-sm text-zinc-400">{comparisonText}</div>
        </div>
      </div>

      <div className="mt-4">
        <GeographicStats
          shows={review.shows}
          title={t("{year} geography", { year: activeYear })}
          onOpenCountry={onOpenCountry}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            {t("The year began with")}
          </div>
          {review.firstShow && (
            <>
              <button
                onClick={() => onOpenArtist(review.firstShow.artist)}
                className="mt-2 text-left text-xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4"
              >
                {review.firstShow.artist}
              </button>
              <p className="mt-1 text-sm text-zinc-400">
                {review.firstShow.venue} · {review.firstShow.date}
              </p>
            </>
          )}
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            {t("The year ended with")}
          </div>
          {review.lastShow && (
            <>
              <button
                onClick={() => onOpenArtist(review.lastShow.artist)}
                className="mt-2 text-left text-xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4"
              >
                {review.lastShow.artist}
              </button>
              <p className="mt-1 text-sm text-zinc-400">
                {review.lastShow.venue} · {review.lastShow.date}
              </p>
            </>
          )}
        </div>
      </div>

      <section className="mt-6">
        <div className="mb-6 flex items-end justify-between border-b border-zinc-800 pb-4">
          <h2 className="text-2xl font-black uppercase tracking-tight text-zinc-100">
            {t("The year in concerts")}
          </h2>
          <span className="text-sm text-zinc-500">
            {t("{count} total", { count: review.shows.length })}
          </span>
        </div>
        <ConcertHistoryList concerts={review.shows} showArtist showVenue showCity showCountry onOpenArtist={onOpenArtist} onOpenVenue={onOpenVenue} onOpenCity={onOpenCity} onOpenCountry={onOpenCountry} onOpenConcert={onOpenSetlist} Icon={Icon} />
      </section>
    </div>
  );
}
