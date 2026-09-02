import React from "react";
import { countryName } from "../lib/countries";
import { useI18n } from "../lib/i18n.jsx";

export default function ConcertHistoryList({ concerts, showArtist = false, showVenue = false, showCity = false, showCountry = false, onOpenArtist, onOpenVenue, onOpenCity, onOpenCountry, onOpenConcert, Icon }) {
  const { locale, t } = useI18n();
  const hasContext = showArtist || showVenue || showCity || showCountry;
  return <div className="relative space-y-4 before:absolute before:bottom-6 before:left-[7px] before:top-6 before:w-px before:bg-zinc-800">
    {concerts.map((concert) => <article key={concert.concertId || `${concert.artist}-${concert.venue}-${concert.date}`} className="relative flex gap-4">
      <span className="relative z-[1] mt-7 h-[15px] w-[15px] shrink-0 rounded-full border-4 border-zinc-950 bg-zinc-500" />
      <div className="min-w-0 flex-1 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0">
            {showArtist && <button type="button" onClick={() => onOpenArtist(concert.artist)} className="break-words text-left text-xl font-black uppercase text-zinc-100 hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{concert.artist}</button>}
            {showVenue && <div className={`${showArtist ? "mt-3 " : ""}flex gap-2 text-sm font-semibold text-zinc-300`}><Icon type="map" /><button type="button" onClick={() => onOpenVenue(concert.venue)} className="text-left hover:underline">{concert.venue}</button></div>}
            {showCity && concert.city && <div className="mt-2 flex gap-2 text-sm text-zinc-400"><i className="fa-solid fa-city mt-0.5 h-4 w-4 shrink-0 text-center text-zinc-500" aria-hidden="true" /><button type="button" onClick={() => onOpenCity(concert)} className="text-left hover:underline">{concert.city}</button></div>}
            {showCountry && concert.country && <div className="mt-2 flex gap-2 text-sm text-zinc-400"><i className="fa-solid fa-earth-europe mt-0.5 h-4 w-4 shrink-0 text-center text-zinc-500" aria-hidden="true" /><button type="button" onClick={() => onOpenCountry(concert.country)} className="text-left hover:underline">{countryName(concert.country, locale)}</button></div>}
            <div className={`${hasContext ? "mt-2 " : ""}flex gap-2 text-sm text-zinc-400`}><Icon type="calendar" /><span>{concert.date}</span></div>
          </div>
          <button type="button" onClick={() => onOpenConcert(concert)} className="flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full border border-zinc-700 px-4 text-sm font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100"><Icon type="music" />{t("Setlist")}</button>
        </div>
      </div>
    </article>)}
  </div>;
}
