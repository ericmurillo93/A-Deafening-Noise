import React, { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../lib/i18n.jsx";

export default function ConcertDialog({ concert, location, primaryLabel, journalEnabled, dialogRef, onEdit, onClose, testId, children }) {
  const { t } = useI18n();
  const id = useId();
  const [tab,setTab] = useState("details");
  const buttons = useRef([]);
  const body = useRef(null);
  const tabs = [{id:"details",label:primaryLabel},{id:"memories",label:t("My memories")},{id:"activity",label:t("Activity")}];
  useEffect(()=>{setTab("details");},[concert.concertId,concert.artist,concert.date]);
  useEffect(()=>{if(body.current)body.current.scrollTop=0;},[tab]);
  useEffect(()=>{
    const escape=event=>{if(event.key==="Escape"){event.stopPropagation();onClose();}};
    window.addEventListener("keydown",escape);
    return()=>window.removeEventListener("keydown",escape);
  },[onClose]);
  function navigateTabs(event,index) {
    const next=event.key==="ArrowRight"?(index+1)%3:event.key==="ArrowLeft"?(index+2)%3:event.key==="Home"?0:event.key==="End"?2:null;
    if(next===null)return;
    event.preventDefault();setTab(tabs[next].id);buttons.current[next]?.focus();
  }
  return <div data-testid={testId} className="adn-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 sm:p-6">
    <article ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="adn-modal-panel adn-concert-dialog flex h-[min(44rem,calc(100dvh-1.5rem))] max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden text-zinc-100 sm:max-h-[88dvh]">
      <header className="shrink-0 px-5 pb-5 pt-4 sm:px-7 sm:pt-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id={`${id}-title`} className="min-w-0 self-center break-words text-2xl font-black uppercase leading-tight tracking-tight sm:text-3xl">{concert.artist}</h2>
          <div className="shrink-0 text-right">
            <div className="flex items-center gap-1">
              {onEdit && <button type="button" className="adn-concert-action" aria-label={t("Edit concert")} title={t("Edit concert")} onClick={()=>onEdit(concert)}><i className="fa-solid fa-pencil" aria-hidden="true" /></button>}
              <button type="button" className="adn-concert-action" aria-label={t("Close")} title={t("Close")} onClick={onClose}><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
            </div>
            {concert.creator?.displayName && <p className="mt-1 max-w-28 truncate text-[10px] text-zinc-400" title={t("Created by {name}",{name:concert.creator.displayName})}>{t("Created by {name}",{name:concert.creator.displayName})}</p>}
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold tabular-nums text-zinc-300">{concert.date}</p>
        <p className="mt-1 break-words text-sm font-semibold text-zinc-100">{concert.venue || t("Venue to be confirmed")}</p>
        {location && <p className="mt-0.5 break-words text-sm text-zinc-400">{location}</p>}
      </header>
      {journalEnabled && <div role="tablist" aria-label={t("Concert details")} className="flex shrink-0 gap-5 border-b border-[var(--adn-border-strong)] px-5 sm:gap-7 sm:px-7">{tabs.map((item,index)=><button type="button" role="tab" key={item.id} ref={element=>{buttons.current[index]=element;}} id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel`} aria-selected={tab===item.id} tabIndex={tab===item.id?0:-1} onKeyDown={event=>navigateTabs(event,index)} onClick={()=>setTab(item.id)} className="adn-concert-tab">{item.label}</button>)}</div>}
      <div ref={body} id={`${id}-panel`} role={journalEnabled?"tabpanel":undefined} aria-labelledby={journalEnabled?`${id}-tab-${tab}`:undefined} tabIndex={journalEnabled?0:undefined} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
        {children(tab,id)}
      </div>
    </article>
  </div>;
}
