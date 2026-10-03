import React from "react";
import { useI18n } from "../lib/i18n.jsx";

export function recordDate(value, locale) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : null;
}

// Secondary metadata stays out of the primary concert/suggestion content.
export default function RecordInformation({ children }) {
  const { t } = useI18n();
  return <details className="adn-record-information mt-2">
    <summary aria-label={t("Information")} title={t("Information")} className="ml-auto flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 [&::-webkit-details-marker]:hidden">
      <i className="fa-solid fa-circle-info" aria-hidden="true" />
    </summary>
    <div className="space-y-3 border-t border-[var(--adn-border-strong)] py-3 text-sm text-zinc-400">{children}</div>
  </details>;
}
