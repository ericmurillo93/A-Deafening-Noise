import React, { useMemo, useState } from "react";
import { cityKey, normalize, parseDate, parseShow } from "../lib/concerts";
import { countryName } from "../lib/countries";
import ConcertHistoryList from "../components/ConcertHistoryList";
import UpcomingConcertList from "../components/UpcomingConcertList";
import { useI18n } from "../lib/i18n.jsx";

export function VenueDetailPage({ venue, historyItems, historyConcerts = [], upcoming = [], onOpenArtist, onOpenSetlist, onOpenCity, onOpenCountry, DropdownMenu, Icon }) {
  const { locale, t } = useI18n();
  const [year, setYear] = useState("all");
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
  const visibleShows = year === "all" ? shows : shows.filter(({ date }) => String(date).endsWith(year));
  const next = upcoming.filter((concert) => normalize(concert.venue) === normalize(venue)).sort((a, b) => parseDate(a.date) - parseDate(b.date));
  const firstVisit = shows[shows.length - 1];
  const latestVisit = shows[0];
  const topArtist = artists[0];
  const locations = [...new Map([...historyConcerts, ...upcoming]
    .filter((concert) => normalize(concert.venue) === normalize(venue) && concert.city)
    .map((concert) => [cityKey(concert.city, concert.country), concert])).values()];
  const summaryCards = [
    { label: t("Visits"), value: shows.length },
    { label: t("Artists"), value: artists.length },
    { label: t("Years active"), value: years.size },
    { label: t("First visit"), value: firstVisit?.date || "—" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      {latestVisit && <p className="mb-8 text-right text-sm text-zinc-500">{t("Last visited {date}", { date: latestVisit.date })}</p>}

      {locations.length > 0 && <div className="mb-6 flex flex-wrap gap-x-5 gap-y-2">{locations.map((location) => <span key={cityKey(location.city, location.country)} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold"><i className="fa-solid fa-city text-blue-400" aria-hidden="true" /><button type="button" onClick={() => onOpenCity(location)} className="text-zinc-300 hover:text-zinc-100 hover:underline">{location.city}</button>{location.country && <><span className="text-zinc-700">·</span><button type="button" onClick={() => onOpenCountry(location.country)} className="text-zinc-500 hover:text-zinc-100 hover:underline">{countryName(location.country, locale)}</button></>}</span>)}</div>}

      {locations.some(({ address, latitude, longitude }) => address || (latitude && longitude)) && <section className="mb-3 rounded-3xl border border-zinc-800 bg-zinc-900 p-5">{locations.map((location) => <div key={`map-${cityKey(location.city, location.country)}`} className="flex items-center gap-3 text-sm text-zinc-300"><i className="fa-solid fa-location-crosshairs text-blue-400" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{location.address || `${location.city}, ${countryName(location.country, locale)}`}</span>{location.latitude && location.longitude && <a href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(location.latitude)}&mlon=${encodeURIComponent(location.longitude)}#map=16/${encodeURIComponent(location.latitude)}/${encodeURIComponent(location.longitude)}`} target="_blank" rel="noreferrer" className="font-bold text-blue-400 hover:text-blue-300">{t("Map")} ↗</a>}</div>)}</section>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards.map(({ label, value }) => (
          <div key={label} className="min-w-0 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center">
            <div className="truncate text-2xl font-black text-zinc-100 md:text-3xl" title={String(value)}>{value}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      {next.length > 0 && <section className="mt-10 rounded-3xl border border-zinc-700 bg-zinc-900 p-6"><div className="mb-5 flex items-end justify-between"><h2 className="text-xl font-black uppercase text-zinc-100">{t("Upcoming")}</h2><span className="text-sm text-zinc-500">{next.length}</span></div><UpcomingConcertList concerts={next} showArtist onOpenArtist={onOpenArtist} onOpenConcert={onOpenSetlist} Icon={Icon} /></section>}

      {topArtist && (
        <section className="mt-3 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t("Most seen here")}</div>
          <button onClick={() => onOpenArtist(topArtist[0])} className="mt-2 text-left text-2xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{topArtist[0]}</button>
          <p className="mt-1 text-sm text-zinc-400">{topArtist[1]} {t(topArtist[1] === 1 ? "performance" : "performances")}</p>
        </section>
      )}

      <section className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="text-xl font-black uppercase tracking-tight text-zinc-100">{t("Artists at this venue")}</h2>
          <span className="text-sm text-zinc-500">{artists.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {artists.map(([artist, count]) => (
            <button key={artist} onClick={() => onOpenArtist(artist)} className="rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white">
              {artist} <span className="ml-1 text-zinc-600">{count}</span>
            </button>
          ))}{artists.length === 0 && <p className="text-sm text-zinc-500">{t("No past concerts at this venue yet.")}</p>}
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 pb-4">
          <div><h2 className="text-2xl font-black uppercase tracking-tight text-zinc-100">{t("Visit history")}</h2><span className="text-sm text-zinc-500">{visibleShows.length} {year === "all" ? t("total") : t("in {year}", { year })}</span></div>
          {years.size > 1 && <div className="w-32"><DropdownMenu value={year} onChange={setYear} ariaLabel={t("Filter history by year")} options={[{ value: "all", label: t("All years") }, ...[...years].sort((a, b) => b.localeCompare(a)).map((value) => ({ value, label: value }))]} /></div>}
        </div>
        <ConcertHistoryList concerts={visibleShows} showArtist onOpenArtist={onOpenArtist} onOpenConcert={onOpenSetlist} Icon={Icon} />
        {visibleShows.length === 0 && <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-10 text-center text-sm text-zinc-500">{t(year === "all" ? "No past concerts to show." : "No past concerts to show in {year}.", { year })}</p>}
      </section>
    </div>
  );
}
