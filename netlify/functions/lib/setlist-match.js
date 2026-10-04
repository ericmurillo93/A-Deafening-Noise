import { canonicalVenue } from "../../../src/lib/suggestions.js";

const normalize = value => canonicalVenue(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export function matchSetlist(setlists = [], venue) {
  if (!venue) return setlists.length === 1 ? setlists[0] : null;
  const matches = setlists.filter(item => normalize(item.venue?.name || "") === normalize(venue));
  return matches.length === 1 ? matches[0] : null;
}
