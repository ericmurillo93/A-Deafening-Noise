function parseRouteParts(pagePart = "home", valueParts = []) {
  let value = null;
  try {
    value = valueParts.length ? decodeURIComponent(valueParts.join("/")) : null;
  } catch {
    value = valueParts.join("/") || null;
  }
  if (pagePart === "artist" && value) return { page: "artist", artist: value, venue: null };
  if (pagePart === "venue" && value) return { page: "venue", artist: null, venue: value };
  if (pagePart === "city" && value) {
    const hasCountry = valueParts.length > 1 && /^[A-Z]{2}$/i.test(valueParts[0]);
    const city = hasCountry ? value.split("/").slice(1).join("/") : value;
    return { page: "city", artist: null, venue: null, city, country: hasCountry ? valueParts[0].toUpperCase() : null };
  }
  if (pagePart === "country" && /^[A-Z]{2}$/i.test(value || "")) return { page: "country", artist: null, venue: null, country: value.toUpperCase() };
  if (pagePart === "concert" && value) return { page: "concert", artist: null, venue: null, concert: value };
  if (pagePart === "people" && value) return { page: "friend-profile", artist: null, venue: null, person: value };
  if (pagePart === "year-review" && /^\d{4}$/.test(value || "")) return { page: "year-review", artist: null, venue: null, year: value };
  if (pagePart === "spotify" && value === "callback") return { page: "profile", artist: null, venue: null, year: null };
  const pageAliases = { home: "home", calendar: "next", suggestions: "suggestions", history: "history", timeline: "timeline", stats: "stats", "year-review": "year-review", friends: "friends", activity: "activity", profile: "profile", admin: "admin" };
  return { page: pageAliases[pagePart] || "home", artist: null, venue: null, year: null };
}

export function readRouteFromLocation() {
  if (typeof window === "undefined") return { page: "home", artist: null, venue: null };
  const pathParts = window.location.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (pathParts.length) return parseRouteParts(pathParts[0], pathParts.slice(1));

  const legacyParts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return legacyParts.length ? parseRouteParts(legacyParts[0], legacyParts.slice(1)) : parseRouteParts();
}

export function routeToPath({ page, artist, venue, city, country, concert, year, person }) {
  if (page === "artist" && artist) return `/artist/${encodeURIComponent(artist)}`;
  if (page === "venue" && venue) return `/venue/${encodeURIComponent(venue)}`;
  if (page === "city" && city) return `/city/${country ? `${encodeURIComponent(country)}/` : ""}${encodeURIComponent(city)}`;
  if (page === "country" && country) return `/country/${encodeURIComponent(country)}`;
  if (page === "concert" && concert) return `/concert/${encodeURIComponent(concert)}`;
  if (page === "year-review" && year) return `/year-review/${encodeURIComponent(year)}`;
  if (page === "friend-profile" && person) return `/people/${encodeURIComponent(person)}`;
  if (page === "next") return "/calendar";
  return `/${page || "home"}`;
}
