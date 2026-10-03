import React, { useEffect, useState } from "react";
import { adminConcertDuplicates, adminMergeConcerts, supabaseEnabled } from "../lib/supabase";
import { useI18n } from "../lib/i18n.jsx";

export default function AdminConcertMerge({ onConfirm, onChanged }) {
  const { t } = useI18n();
  const [groups,setGroups] = useState([]);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  async function load() {
    try { setGroups(await adminConcertDuplicates());setError(""); }
    catch { setError(t("Could not load duplicate concerts.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { if(supabaseEnabled) void load();else setLoading(false); },[]);
  return <section className="rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-panel)] p-5"><h2 className="text-lg font-black text-zinc-100">{t("Consolidate duplicate concerts")}</h2><p className="mt-2 text-sm text-zinc-400">{t("Choose the concert to keep. Attendance and source information are preserved.")}</p>{error && <p role="alert" className="mt-3 text-sm text-red-300">{error}<button onClick={load} className="adn-button-secondary ml-3">{t("Retry")}</button></p>}{!loading&&!error&&!groups.length&&<p className="mt-4 text-sm text-zinc-400">{t("No duplicate concerts found.")}</p>}<div className="mt-4 space-y-4">{groups.map((group) => <div key={`${group.artist}-${group.date}-${group.city}`} className="border-t border-[var(--adn-border-strong)] pt-4"><h3 className="font-bold text-zinc-100">{group.artist} · {group.date}</h3><p className="mt-1 text-sm text-zinc-400">{group.city}</p><div className="mt-3 space-y-2">{group.events.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-zinc-300">{event.venue} · #{event.id} · {t("{count} attendees",{count:event.participants})}</span>{group.events.filter((other) => other.id!==event.id).map((other) => <button key={other.id} className="adn-button-secondary" onClick={() => onConfirm({ title:t("Consolidate concerts"), description:t("Keep {venue} and combine the duplicate?",{venue:event.venue}), confirmLabel:t("Consolidate"), errorMessage:(error)=>t(error.message === "Personal memories need review before merging" ? "These concerts have different personal memories. Resolve them before merging." : error.message === "Attendance conflict needs review" || error.message === "Hidden attendance needs review" ? "Attendance choices differ. Review them before merging." : "Could not consolidate these concerts. Refresh and try again."), action:async()=>{await adminMergeConcerts(event.id,other.id);await load();await onChanged();} })}>{t("Keep #{id}, merge #{other}",{id:event.id,other:other.id})}</button>)}</div>)}</div></div>)}</div></section>;
}
