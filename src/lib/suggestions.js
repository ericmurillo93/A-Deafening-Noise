const normalized = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export function canonicalVenue(value) {
  const label = normalized(value);
  const razz = /^(?:sala )?razzmatazz(?: ([123]))?$/.exec(label);
  if (razz) return `RAZZMATAZZ ${razz[1] || "1"}`;
  if (label === "apolo" || label === "sala apolo") return "SALA APOLO";
  return value;
}
export const legacySuggestionKey = ({ artist, date }) => `${normalized(artist)}|${date}`;
export const suggestionKey = (item) => `v2|${[item.artist, item.date, canonicalVenue(item.venue), item.city, item.country].map(normalized).join("|")}`;
export function canonicalSuggestionKey(key) {
  const parts = key.split("|");
  if (parts.length === 6 && parts[0] === "v2") parts[3] = normalized(canonicalVenue(parts[3]));
  return parts.join("|");
}
export function isCurrentSuggestion(item, now = new Date()) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(item.date || "");
  if (!match) return false;
  const [, day, month, year] = match;
  const date = new Date(+year, +month - 1, +day);
  return date.getFullYear() === +year && date.getMonth() === +month - 1 && date.getDate() === +day
    && date >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
export const isDismissedSuggestion = (item, keys) => keys.some((key) => canonicalSuggestionKey(key) === suggestionKey(item) || key === legacySuggestionKey(item));

export function dateSuggestions(items, previous, detectedAt) {
  const byId = new Map(previous.map((item) => [item.id, item]));
  const byKey = new Map(previous.map((item) => [suggestionKey(item), item]));
  return items.map((item) => {
    const old = byId.get(item.id) || byKey.get(suggestionKey(item));
    return { ...item, firstSeenAt: old?.firstSeenAt || detectedAt, firstSeenEstimated: old ? old.firstSeenEstimated ?? !old.firstSeenAt : false };
  });
}

export function sortReviewedSuggestions(suggestions, reviews) {
  const time = (item) => Date.parse(reviews[item.id]?.reviewedAt) || 0;
  return suggestions.filter((item) => reviews[item.id]).sort((a, b) => time(b) - time(a));
}
