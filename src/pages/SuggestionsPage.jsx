import React from "react";
import stageImage from "../assets/dashboard-concert-stage.jpg";
import { normalize } from "../lib/concerts";
import { SuggestionDecisionButtons } from "../components/SharedUi";

const concertLabel = (value) => String(value || "").toLocaleUpperCase();

export default function SuggestionsPage({ suggestions, artistImages, reviews, onInterested, onNotInterested, onOpenProfile, spotifyConnected, isSaving, saveError }) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 md:p-6">
      {suggestions.length ? <div className="space-y-2">{suggestions.map((suggestion) => (
        <article key={suggestion.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4"><img src={artistImages.get(normalize(suggestion.artist)) || stageImage} alt="" className="h-16 w-24 shrink-0 rounded-md object-cover" /><div className="min-w-0"><h3 className="truncate font-black uppercase tracking-tight text-zinc-100">{concertLabel(suggestion.artist)}</h3><p className="mt-1 text-sm text-zinc-400">{suggestion.date}{suggestion.venue ? ` · ${concertLabel(suggestion.venue)}` : ""}{suggestion.city ? ` · ${suggestion.city}` : ""}</p><a href={suggestion.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-zinc-600 transition hover:text-zinc-300">{suggestion.source} <span aria-hidden="true">↗</span></a></div></div>
            <SuggestionDecisionButtons decision={reviews[suggestion.id]?.decision} disabled={isSaving} onInterested={() => onInterested(suggestion)} onNotInterested={() => onNotInterested(suggestion)} />
          </div>
        </article>
      ))}</div> : spotifyConnected ? <p className="rounded-2xl bg-zinc-950 px-4 py-5 text-sm text-zinc-500">No new suggestions right now.</p> : <div className="rounded-2xl bg-zinc-950 px-4 py-5"><p className="text-sm font-bold text-zinc-200">Connect Spotify to personalise suggestions.</p><button type="button" onClick={onOpenProfile} className="adn-button-secondary mt-3">Open profile</button></div>}
      {saveError && <p className="mt-3 rounded-md border border-red-900 bg-red-950/40 p-3 text-center text-xs font-semibold text-red-300" role="alert">{saveError}</p>}
    </section>
  );
}
