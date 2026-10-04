import React, { useEffect, useState } from "react";
import { getMyConcertJournal, saveMyConcertMemory, supabaseEnabled } from "../lib/supabase";
import { useI18n } from "../lib/i18n.jsx";
import { countryName } from "../lib/countries";
import RecordInformation, { recordDate } from "./RecordInformation";
import ConcertPhotoGallery from "./ConcertPhotoGallery";
import { usePendingDialogChanges } from "./DialogGuard";

const labels = { concert_date: "Date", venue: "Venue", city: "City", country: "Country", event_status: "Status", ticket_url: "Ticket link", festival: "Festival" };
export default function ConcertJournal({ concert, view = "all" }) {
  const { t, locale } = useI18n();
  const [journal, setJournal] = useState(null);
  const [note, setNote] = useState("");
  const [rating, setRating] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
  usePendingDialogChanges(Boolean(journal && (note !== (journal.memory?.note || "") || Number(rating || 0) !== Number(journal.memory?.rating || 0))), busy);
  const displayValue = (field, value) => !value ? "—" : field === "country" ? countryName(value,locale) : field === "event_status" ? t(({announced:"Announced",postponed:"Postponed",cancelled:"Cancelled",sold_out:"Sold out"})[value] || value) : value;
  useEffect(() => {
    let active = true;
    setJournal(null); setError(""); setSaved(false);
    if (!supabaseEnabled || !concert.concertId) return;
    getMyConcertJournal(concert.concertId).then(async (data) => {
      if (!active) return;
      setJournal(data); setNote(data.memory?.note || ""); setRating(Number(data.memory?.rating) || "");
    }).catch(() => { if (active) setError(t("Could not load your concert memories.")); });
    return () => { active = false; };
  }, [concert.concertId,reload]);
  async function save(event) {
    event.preventDefault();setBusy(true);setError("");setSaved(false);
    try {
      const memory = { note, rating: rating || null };
      await saveMyConcertMemory(concert.concertId,memory);
      setJournal((old) => ({ ...old, memory:{...old.memory,...memory} }));setSaved(true);
    } catch { setError(t("Could not save your memories. Try again.")); }
    finally { setBusy(false); }
  }
  if (!supabaseEnabled || !concert.concertId) return null;
  const memories = journal && <form onSubmit={save}>
      <fieldset disabled={busy} className="space-y-5">
        <p className="text-xs text-zinc-400">{t("Only you can see these memories.")}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-300">{t("Rating")}
          <span role="group" aria-label={t("Rating")} className="inline-flex">
            {[1,2,3,4,5].map((value) => <button type="button" key={value} aria-pressed={rating===value} aria-label={t("Rate {value} out of 5",{value})} onClick={() => {setRating(rating===value?"":value);setSaved(false);}} className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" style={{color:rating>=value?"var(--adn-primary)":"var(--adn-text-muted, #71717a)"}}><i className="fa-solid fa-star" aria-hidden="true" /></button>)}
          </span>
        </div>
        <label className="block text-sm font-semibold text-zinc-300">{t("Note")}<textarea value={note} maxLength={5000} onChange={(event) => {setNote(event.target.value);setSaved(false);}} className="mt-2 min-h-28 w-full resize-y rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-card)] p-3 text-base font-normal" /></label>
        <div className="flex flex-wrap items-center gap-3"><button disabled={busy} className="adn-button-primary">{t(busy ? "Saving..." : "Save changes")}</button>{saved && <p role="status" className="text-xs text-zinc-300">{t("Memories saved")}</p>}</div>
        <div className="border-t border-[var(--adn-border-strong)] pt-5"><h3 className="mb-3 text-sm font-semibold text-zinc-300">{t("Photos")}</h3><ConcertPhotoGallery concertId={concert.concertId} paths={journal.memory?.photoPaths || (journal.memory?.photoPath ? [journal.memory.photoPath] : [])} onChanged={photoPaths=>setJournal(old=>({...old,memory:{...old.memory,photoPaths,photoPath:photoPaths[0] || null}}))} /></div>
      </fieldset>
    </form>;
  const activity = journal && <div className="space-y-5 text-sm text-zinc-400">
      <dl className="space-y-4"><div><dt className="font-semibold text-zinc-200">{t("Added to your archive")}</dt><dd className="mt-1 tabular-nums">{recordDate(journal.addedAt,locale) || t("Date unavailable")}</dd></div>{journal.firstObservedAt && <div><dt className="font-semibold text-zinc-200">{t("First recorded")}</dt><dd className="mt-1 tabular-nums">{recordDate(journal.firstObservedAt,locale)}</dd></div>}</dl>
      {journal.changes.length>0 && <><h3 className="font-semibold text-zinc-300">{t("Changes")}</h3><ol className="space-y-3">{journal.changes.map((change) => <li key={change.id}><span className="font-semibold text-zinc-200">{t(labels[change.field] || change.field)}</span>: {displayValue(change.field,change.before_value)} → {displayValue(change.field,change.after_value)}<time className="mt-1 block text-xs" dateTime={change.changed_at}>{recordDate(change.changed_at,locale)}</time></li>)}</ol></>}
    </div>;
  return <section className={view==="all"?"my-5 space-y-4 border-t border-[var(--adn-border-strong)] pt-4":"space-y-4"}>
    {!journal&&!error&&<p role="status" className="py-4 text-sm text-zinc-400">{t("Loading…")}</p>}
    {view==="all"?<><details><summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-zinc-300">{t("My memories")}</summary>{memories}</details><RecordInformation>{activity}</RecordInformation></>:<><div hidden={view==="activity"}>{memories}</div><div hidden={view!=="activity"}>{activity}</div></>}
    {error && <div role="alert" className="space-y-3 text-sm text-red-300"><p>{error}</p>{!journal&&<button className="adn-button-secondary" onClick={()=>setReload(value=>value+1)}>{t("Retry")}</button>}</div>}
  </section>;
}
