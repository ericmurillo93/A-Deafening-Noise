import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { normalize, parseDate, parseShow } from "../lib/concerts";
import { countryName } from "../lib/countries";
import { useI18n } from "../lib/i18n.jsx";

export function ConcertTimelinePage({ historyItems, historyConcerts = [], onOpenArtist, onOpenSetlist, onOpenVenue, onOpenCity, onOpenCountry, DropdownMenu, Icon, headerTarget }) {
  const { locale, t } = useI18n();
  const [artistFilter, setArtistFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [selectedYear, setSelectedYear] = useState("");

  const shows = useMemo(
    () => historyConcerts.length
      ? historyConcerts
      : historyItems.flatMap(({ artist, shows }) => shows.map((show) => ({ artist, show, ...parseShow(show, "history") }))),
    [historyConcerts, historyItems]
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
  const activeYear = groupedYears.some(([year]) => year === selectedYear) ? selectedYear : groupedYears[0]?.[0] || "";
  const hasFilters = artistFilter !== "all" || venueFilter !== "all";

  function jumpToYear(year) {
    setSelectedYear(year);
    document.getElementById(`timeline-${year}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto max-w-5xl">
      {headerTarget && createPortal(<section className="w-full">
        <div className="space-y-2 md:hidden">
          <div className="grid grid-cols-2 gap-2">
            <DropdownMenu
              value={artistFilter}
              onChange={setArtistFilter}
              ariaLabel={t("All artists")}
              groupName="timeline-filters"
              menuAlign="left"
              options={[{ value: "all", label: t("All artists") }, ...artists.map((artist) => ({ value: artist, label: artist }))]}
            />
            <DropdownMenu
              value={venueFilter}
              onChange={setVenueFilter}
              ariaLabel={t("All venues")}
              groupName="timeline-filters"
              options={[{ value: "all", label: t("All venues") }, ...venues.map((venue) => ({ value: venue, label: venue }))]}
            />
          </div>
          <div>
            <DropdownMenu
              value={activeYear}
              onChange={jumpToYear}
              ariaLabel="Jump to timeline year"
              groupName="timeline-filters"
              options={groupedYears.map(([year]) => ({ value: year, label: year }))}
            />
          </div>
        </div>
        <div className="hidden gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
          <DropdownMenu value={artistFilter} onChange={setArtistFilter} ariaLabel={t("All artists")} groupName="timeline-filters" menuAlign="left" options={[{ value: "all", label: t("All artists") }, ...artists.map((artist) => ({ value: artist, label: artist }))]} />
          <DropdownMenu value={venueFilter} onChange={setVenueFilter} ariaLabel={t("All venues")} groupName="timeline-filters" options={[{ value: "all", label: t("All venues") }, ...venues.map((venue) => ({ value: venue, label: venue }))]} />
          <DropdownMenu value={activeYear} onChange={jumpToYear} ariaLabel="Jump to timeline year" groupName="timeline-filters" options={groupedYears.map(([year]) => ({ value: year, label: year }))} />
        </div>
        {hasFilters && (
          <button onClick={() => { setArtistFilter("all"); setVenueFilter("all"); }} className="mt-3 rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:border-zinc-500">
            {t("Clear filters")}
          </button>
        )}
      </section>, headerTarget)}

      {groupedYears.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">{t("No concerts match these filters.")}</p>
      ) : (
        <div className="space-y-14">
          {groupedYears.map(([year, yearShows]) => (
            <section key={year} id={`timeline-${year}`} className="scroll-mt-36">
              <div className="mb-6 flex items-end justify-between border-b border-zinc-800 pb-4">
                <h2 className="text-4xl font-black tracking-tight text-zinc-100 md:text-6xl">{year}</h2>
                <span className="text-sm font-semibold text-zinc-500">{yearShows.length} {t(yearShows.length === 1 ? "concert" : "concerts")}</span>
              </div>
              <div className="relative space-y-4 before:absolute before:bottom-6 before:left-[7px] before:top-6 before:w-px before:bg-zinc-800">
                {yearShows.map(({ artist, show, venue, city, country, date, setlistId }, index) => (
                  <article key={`${artist}-${date}-${venue}-${index}`} className="relative flex gap-4">
                    <span className="relative z-[1] mt-7 h-[15px] w-[15px] shrink-0 rounded-full border-4 border-zinc-950 bg-zinc-500" />
                    <div className="min-w-0 flex-1 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div className="min-w-0">
                          <button onClick={() => onOpenArtist(artist)} className="break-words text-left text-xl font-black uppercase leading-tight text-zinc-100 transition hover:text-white hover:underline hover:decoration-zinc-600 hover:underline-offset-4 md:text-2xl">
                            {artist}
                          </button>
                          <div className="mt-3 flex gap-2 text-sm font-semibold text-zinc-300"><Icon type="map" /><button onClick={() => onOpenVenue(venue)} className="break-words text-left hover:underline hover:decoration-zinc-600 hover:underline-offset-4">{venue}</button></div>
                          {(city || country) && <div className="mt-2 flex gap-2 text-sm text-zinc-400"><i className="fa-solid fa-city mt-0.5 h-4 w-4 shrink-0 text-center text-zinc-500" aria-hidden="true" /><span>{city && <button type="button" onClick={() => onOpenCity({ city, country })} className="hover:underline">{city}</button>}{city && country && ", "}{country && <button type="button" onClick={() => onOpenCountry(country)} className="hover:underline">{countryName(country, locale)}</button>}</span></div>}
                          <div className="mt-2 flex gap-2 text-sm text-zinc-400"><Icon type="calendar" /><span>{date}</span></div>
                        </div>
                        <button
                          onClick={() => onOpenSetlist({ artist, venue, city, country, date, setlistId, show })}
                          className="flex shrink-0 items-center gap-2 self-start rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100"
                        >
                          <Icon type="music" />
                          {t("Setlist")}
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
