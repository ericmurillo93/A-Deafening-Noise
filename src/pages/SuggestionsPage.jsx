import React from "react";

const concertLabel = (value) => String(value || "").toLocaleUpperCase();

function formatUpdatedAt(value) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

export default function SuggestionsPage({ generatedAt, suggestions, reviews, onInterested, onNotInterested, onSave, onOpenProfile, spotifyConnected, isSaving, saveError }) {
  const pendingCount = Object.keys(reviews).length;

  return (
    <section className="mx-auto max-w-5xl rounded-3xl border border-zinc-800 bg-zinc-900 p-4 md:p-6">
      <p className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">Updated daily · Last update {formatUpdatedAt(generatedAt)}</p>
      {suggestions.length ? <div className="space-y-2">{suggestions.map((suggestion) => (
        <article key={suggestion.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><h3 className="truncate font-black uppercase tracking-tight text-zinc-100">{concertLabel(suggestion.artist)}</h3><p className="mt-1 text-sm text-zinc-400">{suggestion.date}{suggestion.venue ? ` · ${concertLabel(suggestion.venue)}` : ""}{suggestion.city ? ` · ${suggestion.city}` : ""}</p><a href={suggestion.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-zinc-600 transition hover:text-zinc-300">{suggestion.source} <span aria-hidden="true">↗</span></a></div>
            <div className="flex shrink-0 gap-2"><button type="button" onClick={() => onInterested(suggestion)} className={`flex-1 rounded-full border px-4 py-2.5 text-sm font-black transition sm:flex-none ${reviews[suggestion.id]?.decision === "interested" ? "border-emerald-500 bg-emerald-950 text-emerald-200" : "border-zinc-600 bg-zinc-900 text-zinc-100 hover:border-emerald-600"}`}>Interested</button><button type="button" onClick={() => onNotInterested(suggestion)} className={`flex-1 rounded-full border px-4 py-2.5 text-sm font-black transition sm:flex-none ${reviews[suggestion.id]?.decision === "not-interested" ? "border-red-700 bg-red-950/60 text-red-200" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-red-800 hover:text-red-200"}`}>Not interested</button></div>
          </div>
        </article>
      ))}</div> : spotifyConnected ? <p className="rounded-2xl bg-zinc-950 px-4 py-5 text-sm text-zinc-500">No new suggestions right now.</p> : <div className="rounded-2xl bg-zinc-950 px-4 py-5"><p className="text-sm font-bold text-zinc-200">Connect Spotify to personalise suggestions.</p><button type="button" onClick={onOpenProfile} className="mt-3 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-bold text-zinc-100 hover:border-zinc-500">Open profile</button></div>}
      {pendingCount > 0 && <div className="sticky bottom-3 mt-3 rounded-2xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur"><button type="button" onClick={onSave} disabled={isSaving} className="w-full rounded-xl bg-zinc-100 px-5 py-3 text-sm font-black text-zinc-950 transition hover:bg-white disabled:opacity-50">{isSaving ? "Saving decisions..." : `Save ${pendingCount} ${pendingCount === 1 ? "decision" : "decisions"}`}</button>{saveError && <p className="mt-2 text-center text-xs font-semibold text-red-300">{saveError}</p>}</div>}
    </section>
  );
}
