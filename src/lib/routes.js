function parseRouteParts(pagePart = "history", valueParts = []) {
  let value = null;
  try {
    value = valueParts.length ? decodeURIComponent(valueParts.join("/")) : null;
  } catch {
    value = valueParts.join("/") || null;
  }
  if (pagePart === "artist" && value) return { page: "artist", artist: value, venue: null };
  if (pagePart === "venue" && value) return { page: "venue", artist: null, venue: value };
  if (pagePart === "year-review" && /^\d{4}$/.test(value || "")) return { page: "year-review", artist: null, venue: null, year: value };
  if (pagePart === "spotify" && value === "callback") return { page: "profile", artist: null, venue: null, year: null };
  const pageAliases = { calendar: "next", suggestions: "suggestions", history: "history", timeline: "timeline", stats: "stats", "year-review": "year-review", friends: "friends", activity: "activity", profile: "profile", admin: "admin" };
  return { page: pageAliases[pagePart] || "history", artist: null, venue: null, year: null };
}

export function readRouteFromLocation() {
  if (typeof window === "undefined") return { page: "history", artist: null, venue: null };
  const pathParts = window.location.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (pathParts.length) return parseRouteParts(pathParts[0], pathParts.slice(1));

  const legacyParts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return legacyParts.length ? parseRouteParts(legacyParts[0], legacyParts.slice(1)) : parseRouteParts();
}

export function routeToPath({ page, artist, venue, year }) {
  if (page === "artist" && artist) return `/artist/${encodeURIComponent(artist)}`;
  if (page === "venue" && venue) return `/venue/${encodeURIComponent(venue)}`;
  if (page === "year-review" && year) return `/year-review/${encodeURIComponent(year)}`;
  if (page === "next") return "/calendar";
  return `/${page || "history"}`;
}
