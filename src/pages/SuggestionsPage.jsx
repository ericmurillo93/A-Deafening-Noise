import React from "react";
import stageImage from "../assets/dashboard-concert-stage.jpg";
import { normalize } from "../lib/concerts";
import { sortReviewedSuggestions } from "../lib/suggestions";
import { useI18n } from "../lib/i18n.jsx";
import { SuggestionDecisionButtons } from "../components/SharedUi";
import RecordInformation, { recordDate } from "../components/RecordInformation";

const concertLabel = (value) => String(value || "").toLocaleUpperCase();

function SuggestionCard({ suggestion, artistImages, decision, reviewedAt, isSaving, onInterested, onNotInterested }) {
  const { t, locale } = useI18n();
  return <article className="rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-card)] p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <img src={suggestion.imageUrl || artistImages.get(normalize(suggestion.artist)) || stageImage} alt="" className="h-16 w-24 shrink-0 rounded-md object-cover" />
        <div className="min-w-0">
          <h3 className="truncate font-black uppercase tracking-tight text-zinc-100">{concertLabel(suggestion.artist)}</h3>
          <p className="mt-1 text-sm text-zinc-400">{suggestion.date}{suggestion.venue ? ` · ${concertLabel(suggestion.venue)}` : ""}{suggestion.city ? ` · ${suggestion.city}` : ""}</p>
          <p className="mt-1 text-xs text-blue-400">{t("Matched to your music profile")}</p>
          {suggestion.sourceUrl && <a href={suggestion.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-zinc-600 transition hover:text-zinc-300">{t("Tickets and event details")} <span aria-hidden="true">↗</span></a>}
        </div>
      </div>
      <SuggestionDecisionButtons decision={decision} disabled={isSaving} onInterested={() => onInterested(suggestion)} onNotInterested={() => onNotInterested(suggestion)} />
    </div>
    <RecordInformation><dl className="space-y-3">
      <div><dt className="font-semibold text-zinc-300">{t(suggestion.firstSeenEstimated ? "Tracked since" : "Suggestion created")}</dt><dd>{recordDate(suggestion.firstSeenAt,locale) || t("Date unavailable")}</dd></div>
      {decision && <div><dt className="font-semibold text-zinc-300">{t(decision === "interested" ? "Marked Interested" : "Marked Not Interested")}</dt><dd>{recordDate(reviewedAt,locale) || t("Date unavailable")}</dd></div>}
    </dl></RecordInformation>
  </article>;
}

function SuggestionList(props) {
  return <div className="space-y-2">{props.suggestions.map((suggestion) => <SuggestionCard key={suggestion.id} suggestion={suggestion} decision={props.reviews[suggestion.id]?.decision} reviewedAt={props.reviews[suggestion.id]?.reviewedAt} {...props} />)}</div>;
}

export default function SuggestionsPage({ suggestions, artistImages, reviews, onInterested, onNotInterested, onOpenProfile, spotifyConnected, discoveryUnavailable, onRetry, isSaving, saveError }) {
  const { t } = useI18n();
  const fresh = suggestions.filter((suggestion) => !reviews[suggestion.id]);
  const past = sortReviewedSuggestions(suggestions, reviews);
  const listProps = { artistImages, reviews, isSaving, onInterested, onNotInterested };
  return <div className="space-y-4">
    {discoveryUnavailable && <p role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-panel)] p-4 text-sm text-zinc-300">{t("Suggestions could not be refreshed. Your archive is still available.")}<button type="button" className="adn-button-secondary" onClick={onRetry}>{t("Retry")}</button></p>}
    <section className="rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-panel)] p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-sm font-black uppercase tracking-wide text-zinc-100">{t("New suggestions")}</h2><span className="text-xs font-black tabular-nums text-zinc-500">{fresh.length}</span></div>
      {fresh.length ? <SuggestionList suggestions={fresh} {...listProps} /> : discoveryUnavailable ? null : spotifyConnected ? <p className="rounded-md bg-[var(--adn-card)] px-4 py-5 text-sm text-zinc-500">{t("You’re caught up.")}</p> : <div className="rounded-md bg-[var(--adn-card)] px-4 py-5"><p className="text-sm font-bold text-zinc-200">{t("Connect Spotify to personalise suggestions.")}</p><button type="button" onClick={onOpenProfile} className="adn-button-secondary mt-3">{t("Spotify settings")}</button></div>}
      {saveError && <p className="mt-3 rounded-md border border-red-900 bg-red-950/40 p-3 text-center text-xs font-semibold text-red-300" role="alert">{saveError}</p>}
    </section>
    {past.length > 0 && <details className="group rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-panel)]"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 text-sm font-black uppercase tracking-wide text-zinc-100 md:px-6 [&::-webkit-details-marker]:hidden"><span>{t("Reviewed suggestions")} <span className="ml-2 text-zinc-500">{past.length}</span></span><i className="fa-solid fa-chevron-down text-xs text-zinc-500 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><div className="border-t border-[var(--adn-border-strong)] p-4 md:p-6"><SuggestionList suggestions={past} {...listProps} /></div></details>}
  </div>;
}
