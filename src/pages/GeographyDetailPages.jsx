import React, { useMemo, useState } from "react";
import { cityKey, parseDate, sameCity } from "../lib/concerts";
import { countryName } from "../lib/countries";
import ConcertHistoryList from "../components/ConcertHistoryList";
import UpcomingConcertList from "../components/UpcomingConcertList";
import { useI18n } from "../lib/i18n.jsx";

export function CityDetailPage({ city, country, historyConcerts, upcoming = [], onOpenArtist, onOpenVenue, onOpenCountry, onOpenConcert, DropdownMenu, Icon }) {
  const { locale, t } = useI18n();
  const [year, setYear] = useState("all");
  const target = { city, country };
  const history = useMemo(() => historyConcerts.filter((concert) => sameCity(concert, target))
    .sort((a, b) => parseDate(b.date) - parseDate(a.date) || a.artist.localeCompare(b.artist)), [city, country, historyConcerts]);
  const next = useMemo(() => upcoming.filter((concert) => sameCity(concert, target))
    .sort((a, b) => parseDate(a.date) - parseDate(b.date)), [city, country, upcoming]);
  const counts = (field) => Object.entries(history.reduce((all, concert) => ({ ...all, [concert[field]]: (all[concert[field]] || 0) + 1 }), {}))
    .filter(([label]) => label).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const artists = counts("artist");
  const venues = counts("venue");
  const firstVisit = history.at(-1);
  const years = [...new Set(history.map(({ date }) => String(date).slice(-4)).filter((year) => /^\d{4}$/.test(year)))];
  const visibleHistory = year === "all" ? history : history.filter(({ date }) => String(date).endsWith(year));
  const mappedVenues = [...new Map([...history, ...next].filter(({ latitude, longitude }) => latitude && longitude).map((concert) => [concert.venue, concert])).values()];
  const summary = [
    [t("Concerts"), history.length],
    [t("Artists"), artists.length],
    [t("Venues"), venues.length],
    [t("First visit"), firstVisit?.date || "—"],
  ];

  return <div className="mx-auto max-w-5xl">
    {country && <button type="button" onClick={() => onOpenCountry(country)} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-zinc-400 hover:text-zinc-100"><i className="fa-solid fa-earth-europe text-blue-400" aria-hidden="true" />{countryName(country, locale)}</button>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{summary.map(([label, value]) => <div key={label} className="min-w-0 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center"><div className="truncate text-2xl font-black text-zinc-100 md:text-3xl" title={String(value)}>{value}</div><div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{label}</div></div>)}</div>

    {next.length > 0 && <section className="mt-10 rounded-3xl border border-zinc-700 bg-zinc-900 p-6"><div className="mb-5 flex items-end justify-between gap-4"><h2 className="text-xl font-black uppercase tracking-tight text-zinc-100">{t("Upcoming")}</h2><span className="text-sm text-zinc-500">{next.length}</span></div><UpcomingConcertList concerts={next} showArtist showVenue onOpenArtist={onOpenArtist} onOpenVenue={onOpenVenue} onOpenConcert={onOpenConcert} Icon={Icon} /></section>}

    <div className="mt-10 grid gap-3 md:grid-cols-2">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6"><div className="mb-4 flex items-end justify-between"><h2 className="text-lg font-black uppercase text-zinc-100">{t("Venues")}</h2><span className="text-sm text-zinc-500">{venues.length}</span></div><div className="flex flex-wrap gap-2">{venues.map(([venue, count]) => <button key={venue} type="button" onClick={() => onOpenVenue(venue)} className="rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white">{venue} <span className="ml-1 text-zinc-600">{count}</span></button>)}{venues.length === 0 && <p className="text-sm text-zinc-500">{t("No past venues yet.")}</p>}</div></section>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6"><div className="mb-4 flex items-end justify-between"><h2 className="text-lg font-black uppercase text-zinc-100">{t("Artists")}</h2><span className="text-sm text-zinc-500">{artists.length}</span></div><div className="flex flex-wrap gap-2">{artists.map(([artist, count]) => <button key={artist} type="button" onClick={() => onOpenArtist(artist)} className="rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white">{artist} <span className="ml-1 text-zinc-600">{count}</span></button>)}{artists.length === 0 && <p className="text-sm text-zinc-500">{t("No past artists yet.")}</p>}</div></section>
    </div>

    {(artists[0] || venues[0]) && <section className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"><span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t("Most seen artist")}</span>{artists[0] && <button type="button" onClick={() => onOpenArtist(artists[0][0])} className="mt-2 block text-left text-lg font-black uppercase text-zinc-100 hover:underline">{artists[0][0]}</button>}</div><div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"><span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t("Most visited venue")}</span>{venues[0] && <button type="button" onClick={() => onOpenVenue(venues[0][0])} className="mt-2 block text-left text-lg font-black uppercase text-zinc-100 hover:underline">{venues[0][0]}</button>}</div><div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"><span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t("Years active")}</span><strong className="mt-2 block text-2xl font-black text-zinc-100">{years.length}</strong></div></section>}

    {mappedVenues.length > 0 && <section className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900 p-6"><div className="mb-4 flex items-end justify-between"><h2 className="text-lg font-black uppercase text-zinc-100">{t("Venue locations")}</h2><span className="text-sm text-zinc-500">{mappedVenues.length}</span></div><div className="grid gap-2 sm:grid-cols-2">{mappedVenues.map((venue) => <a key={venue.venue} href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(venue.latitude)}&mlon=${encodeURIComponent(venue.longitude)}#map=16/${encodeURIComponent(venue.latitude)}/${encodeURIComponent(venue.longitude)}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-2xl bg-zinc-950 px-4 text-sm font-bold text-zinc-300 hover:text-white"><Icon type="map" /><span className="truncate">{venue.venue}</span><i className="fa-solid fa-arrow-up-right-from-square ml-auto text-[10px] text-zinc-600" aria-hidden="true" /></a>)}</div></section>}

    <section className="mt-12"><div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 pb-4"><div><h2 className="text-2xl font-black uppercase tracking-tight text-zinc-100">{t("Concert history")}</h2><span className="text-sm text-zinc-500">{year === "all" ? t("{count} total", { count: visibleHistory.length }) : t("{count} in {year}", { count: visibleHistory.length, year })}</span></div>{years.length > 1 && <div className="w-32"><DropdownMenu value={year} onChange={setYear} ariaLabel={t("Filter history by year")} options={[{ value: "all", label: t("All years") }, ...years.sort((a, b) => b.localeCompare(a)).map((value) => ({ value, label: value }))]} /></div>}</div><ConcertHistoryList concerts={visibleHistory} showArtist showVenue onOpenArtist={onOpenArtist} onOpenVenue={onOpenVenue} onOpenConcert={onOpenConcert} Icon={Icon} />{visibleHistory.length === 0 && <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-10 text-center text-sm text-zinc-500">{year === "all" ? t("No past concerts to show.") : t("No past concerts to show in {year}.", { year })}</p>}</section>
  </div>;
}

export function CountryDetailPage({ country, historyConcerts, upcoming = [], onOpenCity, onOpenArtist, onOpenVenue, onOpenConcert, DropdownMenu, Icon }) {
  const { t } = useI18n();
  const [year, setYear] = useState("all");
  const history = useMemo(() => historyConcerts.filter((concert) => String(concert.country || "").toUpperCase() === country)
    .sort((a, b) => parseDate(b.date) - parseDate(a.date)), [country, historyConcerts]);
  const next = useMemo(() => upcoming.filter((concert) => String(concert.country || "").toUpperCase() === country)
    .sort((a, b) => parseDate(a.date) - parseDate(b.date)), [country, upcoming]);
  const cities = useMemo(() => [...history.reduce((groups, concert) => {
    const key = cityKey(concert.city, concert.country);
    const current = groups.get(key) || { city: concert.city, country: concert.country, count: 0 };
    current.count += 1; groups.set(key, current); return groups;
  }, new Map()).values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)), [history]);
  const artists = useMemo(() => Object.entries(history.reduce((counts, concert) => { counts[concert.artist] = (counts[concert.artist] || 0) + 1; return counts; }, {})).sort((a, b) => b[1] - a[1]), [history]);
  const venues = useMemo(() => Object.entries(history.reduce((counts, concert) => { if (concert.venue) counts[concert.venue] = (counts[concert.venue] || 0) + 1; return counts; }, {})).sort((a, b) => b[1] - a[1]), [history]);
  const years = [...new Set(history.map(({ date }) => String(date).slice(-4)).filter((value) => /^\d{4}$/.test(value)))];
  const mappedVenues = [...new Map([...history, ...next].filter(({ latitude, longitude }) => latitude && longitude).map((concert) => [`${concert.venue}|${concert.city}`, concert])).values()];
  const visibleHistory = year === "all" ? history : history.filter(({ date }) => String(date).endsWith(year));
  const first = history.at(-1);
  return <div className="mx-auto max-w-5xl">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[[t("Concerts"), history.length], [t("Cities"), cities.length], [t("Artists"), artists.length], [t("First visit"), first?.date || "—"]].map(([label, value]) => <div key={label} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center"><div className="truncate text-2xl font-black text-zinc-100 md:text-3xl">{value}</div><div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{label}</div></div>)}</div>
    {next.length > 0 && <section className="mt-10 rounded-3xl border border-zinc-700 bg-zinc-900 p-6"><h2 className="mb-5 text-xl font-black uppercase text-zinc-100">{t("Upcoming")}</h2><UpcomingConcertList concerts={next} showArtist showVenue showCity onOpenArtist={onOpenArtist} onOpenVenue={onOpenVenue} onOpenCity={onOpenCity} onOpenConcert={onOpenConcert} Icon={Icon} /></section>}
    <section className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900 p-6"><div className="mb-5 flex items-end justify-between"><h2 className="text-xl font-black uppercase text-zinc-100">{t("Cities")}</h2><span className="text-sm text-zinc-500">{cities.length}</span></div><div className="grid gap-2 sm:grid-cols-2">{cities.map((item) => <button key={cityKey(item.city, item.country)} type="button" onClick={() => onOpenCity(item)} className="flex min-h-12 items-center rounded-2xl bg-zinc-950 px-4 text-left text-sm font-bold text-zinc-200 hover:bg-zinc-800"><i className="fa-solid fa-city mr-3 text-blue-400" aria-hidden="true" /><span className="truncate">{item.city}</span><span className="ml-auto text-zinc-600">{item.count}</span></button>)}{cities.length === 0 && <p className="text-sm text-zinc-500">{t("No past cities yet.")}</p>}</div></section>
    {(artists[0] || venues[0]) && <section className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"><span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t("Most seen artist")}</span>{artists[0] && <button type="button" onClick={() => onOpenArtist(artists[0][0])} className="mt-2 block text-left text-lg font-black uppercase text-zinc-100 hover:underline">{artists[0][0]}</button>}<span className="mt-1 block text-sm text-zinc-500">{artists[0]?.[1] || 0} {t("shows")}</span></div><div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"><span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t("Most visited venue")}</span>{venues[0] && <button type="button" onClick={() => onOpenVenue(venues[0][0])} className="mt-2 block text-left text-lg font-black uppercase text-zinc-100 hover:underline">{venues[0][0]}</button>}<span className="mt-1 block text-sm text-zinc-500">{venues[0]?.[1] || 0} {t("visits")}</span></div><div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"><span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{t("Years active")}</span><strong className="mt-2 block text-2xl font-black text-zinc-100">{years.length}</strong></div></section>}
    {mappedVenues.length > 0 && <section className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900 p-6"><div className="mb-4 flex items-end justify-between"><h2 className="text-lg font-black uppercase text-zinc-100">{t("Venue locations")}</h2><span className="text-sm text-zinc-500">{mappedVenues.length}</span></div><div className="grid gap-2 sm:grid-cols-2">{mappedVenues.map((venue) => <a key={`${venue.venue}-${venue.city}`} href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(venue.latitude)}&mlon=${encodeURIComponent(venue.longitude)}#map=16/${encodeURIComponent(venue.latitude)}/${encodeURIComponent(venue.longitude)}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-2xl bg-zinc-950 px-4 text-sm font-bold text-zinc-300 hover:text-white"><Icon type="map" /><span className="min-w-0 flex-1 truncate">{venue.venue} · {venue.city}</span><i className="fa-solid fa-arrow-up-right-from-square text-[10px] text-zinc-600" aria-hidden="true" /></a>)}</div></section>}
    <section className="mt-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 pb-4">
        <div><h2 className="text-2xl font-black uppercase tracking-tight text-zinc-100">{t("Concert history")}</h2><span className="text-sm text-zinc-500">{year === "all" ? t("{count} total", { count: visibleHistory.length }) : t("{count} in {year}", { count: visibleHistory.length, year })}</span></div>
        {years.length > 1 && <div className="w-32"><DropdownMenu value={year} onChange={setYear} ariaLabel={t("Filter history by year")} options={[{ value: "all", label: t("All years") }, ...years.sort((a, b) => b.localeCompare(a)).map((value) => ({ value, label: value }))]} /></div>}
      </div>
      <ConcertHistoryList concerts={visibleHistory} showArtist showVenue showCity onOpenArtist={onOpenArtist} onOpenVenue={onOpenVenue} onOpenCity={onOpenCity} onOpenConcert={onOpenConcert} Icon={Icon} />
      {visibleHistory.length === 0 && <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-10 text-center text-sm text-zinc-500">{year === "all" ? t("No past concerts to show.") : t("No past concerts to show in {year}.", { year })}</p>}
    </section>
  </div>;
}
