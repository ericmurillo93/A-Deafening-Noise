const normalized = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export const legacySuggestionKey = ({ artist, date }) => `${normalized(artist)}|${date}`;
export const suggestionKey = (item) => `v2|${[item.artist, item.date, item.venue, item.city, item.country].map(normalized).join("|")}`;
export function isCurrentSuggestion(item, now = new Date()) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(item.date || "");
  if (!match) return false;
  const [, day, month, year] = match;
  const date = new Date(+year, +month - 1, +day);
  return date.getFullYear() === +year && date.getMonth() === +month - 1 && date.getDate() === +day
    && date >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
export const isDismissedSuggestion = (item, keys) => keys.includes(suggestionKey(item)) || keys.includes(legacySuggestionKey(item));
