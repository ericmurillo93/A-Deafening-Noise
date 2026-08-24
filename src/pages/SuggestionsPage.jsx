import React from "react";
import stageImage from "../assets/dashboard-concert-stage.jpg";
import { normalize } from "../lib/concerts";
import { SuggestionDecisionButtons } from "../components/SharedUi";

const concertLabel = (value) => String(value || "").toLocaleUpperCase();

function SuggestionCard({ suggestion, artistImages, decision, isSaving, onInterested, onNotInterested }) {
  return <article className="rounded-md border border-[#30343a] bg-[#111418] p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4"><img src={suggestion.imageUrl || artistImages.get(normalize(suggestion.artist)) || stageImage} alt="" className="h-16 w-24 shrink-0 rounded-md object-cover" /><div className="min-w-0"><h3 className="truncate font-black uppercase tracking-tight text-zinc-100">{concertLabel(suggestion.artist)}</h3><p className="mt-1 text-sm text-zinc-400">{suggestion.date}{suggestion.venue ? ` · ${concertLabel(suggestion.venue)}` : ""}{suggestion.city ? ` · ${suggestion.city}` : ""}</p><a href={suggestion.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-zinc-600 transition hover:text-zinc-300">{suggestion.source} <span aria-hidden="true">↗</span></a></div></div>
      <SuggestionDecisionButtons decision={decision} disabled={isSaving} onInterested={() => onInterested(suggestion)} onNotInterested={() => onNotInterested(suggestion)} />
    </div>
  </article>;
}

function SuggestionList(props) {
  return <div className="space-y-2">{props.suggestions.map((suggestion) => <SuggestionCard key={suggestion.id} suggestion={suggestion} decision={props.reviews[suggestion.id]?.decision} {...props} />)}</div>;
}

export default function SuggestionsPage({ suggestions, artistImages, reviews, onInterested, onNotInterested, onOpenProfile, spotifyConnected, isSaving, saveError }) {
  const fresh = suggestions.filter((suggestion) => !reviews[suggestion.id]);
  const past = suggestions.filter((suggestion) => reviews[suggestion.id]);
  const listProps = { artistImages, reviews, isSaving, onInterested, onNotInterested };
  return <div className="space-y-4">
    <section className="rounded-md border border-[#30343a] bg-[#15191e] p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-sm font-black uppercase tracking-wide text-zinc-100">New suggestions</h2><span className="text-xs font-black tabular-nums text-zinc-500">{fresh.length}</span></div>
      {fresh.length ? <SuggestionList suggestions={fresh} {...listProps} /> : spotifyConnected ? <p className="rounded-md bg-[#111418] px-4 py-5 text-sm text-zinc-500">You&apos;re caught up.</p> : <div className="rounded-md bg-[#111418] px-4 py-5"><p className="text-sm font-bold text-zinc-200">Connect Spotify to personalise suggestions.</p><button type="button" onClick={onOpenProfile} className="adn-button-secondary mt-3">Open profile</button></div>}
      {saveError && <p className="mt-3 rounded-md border border-red-900 bg-red-950/40 p-3 text-center text-xs font-semibold text-red-300" role="alert">{saveError}</p>}
    </section>
    {past.length > 0 && <details className="group rounded-md border border-[#30343a] bg-[#15191e]"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 text-sm font-black uppercase tracking-wide text-zinc-100 md:px-6 [&::-webkit-details-marker]:hidden"><span>Past suggestions <span className="ml-2 text-zinc-500">{past.length}</span></span><i className="fa-solid fa-chevron-down text-xs text-zinc-500 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><div className="border-t border-[#30343a] p-4 md:p-6"><SuggestionList suggestions={past} {...listProps} /></div></details>}
  </div>;
}
