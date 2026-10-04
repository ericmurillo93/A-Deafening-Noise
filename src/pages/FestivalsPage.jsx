import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { festivalEditions } from "../lib/festivals";
import { useI18n } from "../lib/i18n.jsx";
import { countryName } from "../lib/countries";
const concertLocation = (concert, locale) => [concert.city,countryName(concert.country,locale)].filter(Boolean).join(", ");

export default function FestivalsPage({ concerts, selected, onSelect, onOpenConcert, DropdownMenu, headerTarget }) {
  const { t, locale } = useI18n();
  const [festivalFilter, setFestivalFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const editions = useMemo(() => festivalEditions(concerts), [concerts]);
  const edition = editions.find((item) => item.key === selected);
  const filtered = editions.filter(item => (festivalFilter === "all" || item.name === festivalFilter) && (yearFilter === "all" || item.year === yearFilter));
  const names = [...new Set(editions.filter(item => yearFilter === "all" || item.year === yearFilter).map(item => item.name))].sort((a,b) => a.localeCompare(b));
  const years = [...new Set(editions.filter(item => festivalFilter === "all" || item.name === festivalFilter).map(item => item.year))].sort((a,b) => b.localeCompare(a));
  if (selected && !edition) return <p className="text-sm text-zinc-400">{t("Festival not found in your archive.")}</p>;
  if (!editions.length) return <p className="text-sm text-zinc-400">{t("Add a festival name when editing a concert to group its performances here.")}</p>;
  if (!edition) return <>
    {headerTarget && createPortal(<div className="grid w-full grid-cols-[minmax(0,1fr)_8rem] gap-2 lg:min-w-80">
      <DropdownMenu value={festivalFilter} onChange={setFestivalFilter} ariaLabel={t("All festivals")} groupName="festival-filters" menuAlign="left" options={[{value:"all",label:t("All festivals")},...names.map(name => ({value:name,label:name}))]} />
      <DropdownMenu value={yearFilter} onChange={setYearFilter} ariaLabel={t("All years")} groupName="festival-filters" options={[{value:"all",label:t("All years")},...years.map(year => ({value:year,label:year}))]} />
    </div>,headerTarget)}
    <div className="grid gap-4 md:grid-cols-2">{filtered.map((item) => <button type="button" key={item.key} onClick={() => onSelect(item.key)} className="rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-card)] p-5 text-left hover:border-zinc-500"><h2 className="break-words text-xl font-black text-zinc-100">{item.name}</h2><p className="mt-2 text-sm text-zinc-400">{item.year} · {t("{count} performances", {count:item.concerts.length})}</p></button>)}</div>
  </>;
  const days = [...new Set(edition.concerts.map((concert) => concert.date))];
  const friends = [...new Set(edition.concerts.flatMap((concert) => concert.attendees || []))];
  return <div className="space-y-6"><section className="rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-panel)] p-5"><h2 className="text-xl font-black text-zinc-100">{edition.key}</h2><p className="mt-2 text-sm text-zinc-400">{t("{count} performances",{count:edition.concerts.length})} · {t("{count} seen live",{count:edition.seen})}</p>{friends.length>0 && <p className="mt-3 text-sm text-zinc-300">{t("Attended with")}: {friends.join(" · ")}</p>}</section>{days.map((day) => <section key={day}><h3 className="mb-3 text-sm font-bold text-zinc-400">{day}</h3><div className="space-y-2">{edition.concerts.filter((concert) => concert.date===day).map((concert,index) => <button key={concert.concertId || `${concert.artist}-${index}`} type="button" onClick={() => onOpenConcert(concert)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-card)] p-4 text-left hover:border-zinc-500"><span className="font-bold text-zinc-100">{concert.artist}</span><span className="text-sm text-zinc-400">{[concert.venue,concertLocation(concert, locale)].filter(Boolean).join(" · ")}</span></button>)}</div></section>)}</div>;
}
