import React from "react";

export function PanelHeading({ icon, title, description, count }) {
  return <div className="mb-5 flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#30343a] bg-[#111418] text-blue-400"><i className={`fa-solid ${icon}`} aria-hidden="true" /></div><div className="min-w-0 flex-1"><h2 className="text-base font-black uppercase tracking-[0.025em] text-zinc-100">{title}</h2>{description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}</div>{count !== undefined && <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-[#30343a] bg-[#111418] px-2 text-xs font-black text-zinc-300">{count}</span>}</div>;
}

export function EmptyState({ icon = "fa-music", title, description }) {
  return <div className="rounded-md border border-dashed border-zinc-700 bg-[#111418] px-5 py-8 text-center"><i className={`fa-solid ${icon} mb-3 text-xl text-zinc-500`} aria-hidden="true" /><p className="text-sm font-bold text-zinc-300">{title}</p>{description && <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">{description}</p>}</div>;
}

export function UserAvatar({ person, size = "h-10 w-10" }) {
  const name = person?.displayName || "User";
  return person?.avatarUrl
    ? <img src={person.avatarUrl} alt="" className={`${size} shrink-0 rounded-full border border-zinc-700 object-cover`} />
    : <div aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-sm font-black text-zinc-300`}>{name.slice(0, 1).toUpperCase()}</div>;
}

export function SuggestionDecisionButtons({ decision, disabled = false, onInterested, onNotInterested }) {
  return <div className="flex w-full shrink-0 gap-3 sm:w-auto"><button type="button" aria-pressed={decision === "interested"} disabled={disabled || decision === "interested"} onClick={onInterested} className={`adn-suggestion-choice flex-1 disabled:cursor-default sm:flex-none ${decision === "interested" ? "adn-suggestion-choice-active" : ""}`}>{decision === "interested" && <i className="fa-solid fa-check" aria-hidden="true" />}Interested</button><button type="button" aria-pressed={decision === "not-interested"} disabled={disabled || decision === "not-interested"} onClick={onNotInterested} className={`adn-suggestion-choice flex-1 disabled:cursor-default sm:flex-none ${decision === "not-interested" ? "adn-suggestion-choice-rejected" : ""}`}>{decision === "not-interested" && <i className="fa-solid fa-xmark" aria-hidden="true" />}Not interested</button></div>;
}
