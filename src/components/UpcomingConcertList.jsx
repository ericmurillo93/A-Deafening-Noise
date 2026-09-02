import React from "react";
import { countryName } from "../lib/countries";
import { useI18n } from "../lib/i18n.jsx";

export default function UpcomingConcertList({ concerts, showArtist = false, showVenue = false, showCity = false, showCountry = false, onOpenArtist, onOpenVenue, onOpenCity, onOpenCountry, onOpenConcert, Icon }) {
  const { locale, t } = useI18n();
  if (!concerts.length) return null;
  return <div className="grid gap-3 md:grid-cols-2">{concerts.map((concert) => <article key={concert.concertId || `${concert.artist}-${concert.venue}-${concert.date}`} className="rounded-2xl bg-zinc-950 p-4">
    {showArtist && <button type="button" onClick={() => onOpenArtist(concert.artist)} className="block break-words text-left font-black uppercase text-zinc-100 hover:underline">{concert.artist}</button>}
    {showVenue && concert.venue && <div className={`${showArtist ? "mt-3 " : ""}flex gap-2 text-sm font-semibold text-zinc-200`}><Icon type="map" /><button type="button" onClick={() => onOpenVenue(concert.venue)} className="text-left hover:underline">{concert.venue}</button></div>}
    {showCity && concert.city && <div className="mt-2 flex gap-2 text-sm text-zinc-400"><i className="fa-solid fa-city mt-0.5 w-4 text-center" aria-hidden="true" /><button type="button" onClick={() => onOpenCity(concert)} className="hover:underline">{concert.city}</button></div>}
    {showCountry && concert.country && <div className="mt-2 flex gap-2 text-sm text-zinc-400"><i className="fa-solid fa-earth-europe mt-0.5 w-4 text-center" aria-hidden="true" /><button type="button" onClick={() => onOpenCountry(concert.country)} className="hover:underline">{countryName(concert.country, locale)}</button></div>}
    <div className="mt-2 flex items-center gap-2 text-sm text-zinc-400"><Icon type="calendar" /><span>{concert.date}</span><button type="button" onClick={() => onOpenConcert(concert)} className="ml-auto min-h-11 px-2 text-xs font-black uppercase text-blue-400 hover:text-blue-300">{t("View concert")}</button></div>
  </article>)}</div>;
}
