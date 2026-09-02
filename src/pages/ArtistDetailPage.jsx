import React, { useMemo } from "react";
import { parseDate, parseShow } from "../lib/concerts";
import ConcertHistoryList from "../components/ConcertHistoryList";
import UpcomingConcertList from "../components/UpcomingConcertList";
import { useI18n } from "../lib/i18n.jsx";

export function ArtistDetailPage({ item, upcoming = [], onOpenSetlist, onOpenVenue, Icon }) {
  const { t } = useI18n();
  const shows = useMemo(
    () => [...item.shows]
      .map((show) => ({ artist: item.artist, show, ...parseShow(show, "history") }))
      .sort((a, b) => parseDate(b.date) - parseDate(a.date)),
    [item]
  );

  const venues = new Set(shows.map(({ venue }) => venue).filter((venue) => venue && venue !== "Date confirmed"));
  const years = new Set(shows.map(({ date }) => String(date).match(/(\d{4})/)?.[1]).filter(Boolean));
  const firstShow = shows[shows.length - 1];
  const latestShow = shows[0];
  const summaryCards = [
    { label: t("Shows"), value: shows.length },
    { label: t("Venues"), value: venues.size },
    { label: t("Years seen"), value: years.size },
    { label: t("First seen"), value: firstShow?.date || "—" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      {latestShow && <p className="mb-8 text-right text-sm text-zinc-500">{t("Most recently seen {date}", { date: latestShow.date })}</p>}

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
          <h2 className="mb-5 text-lg font-black uppercase tracking-tight text-zinc-100">{t("Upcoming")}</h2>
          <UpcomingConcertList concerts={upcoming} showVenue onOpenVenue={onOpenVenue} onOpenConcert={onOpenSetlist} Icon={Icon} />
        </section>
      )}

      <section>
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="text-xl font-black uppercase tracking-tight text-zinc-100">{t("Performance history")}</h2>
          <span className="text-sm text-zinc-500">{shows.length} {t(shows.length === 1 ? "show" : "shows")}</span>
        </div>
        <ConcertHistoryList concerts={shows} showVenue onOpenVenue={onOpenVenue} onOpenConcert={onOpenSetlist} Icon={Icon} />
        {shows.length === 0 && <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-10 text-center text-sm text-zinc-500">{t("No past performances yet.")}</p>}
      </section>
    </div>
  );
}
