const exactDate = (value) => /^\d{2}\/\d{2}\/\d{4}$/.test(String(value || "").trim());
const isoDate = (value) => {
  const [day, month, year] = String(value || "").split("/");
  return year && month && day ? `${year}-${month}-${day}` : "";
};
const displayDate = (value) => {
  const [year, month, day] = String(value || "").slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
};

function setlistResult(item) {
  const city = item.venue?.city;
  return {
    artist: item.artist?.name || "",
    venue: item.venue?.name || "",
    city: city?.name || "",
    country: city?.country?.code || "",
    date: String(item.eventDate || "").replaceAll("-", "/"),
    setlistId: item.id || "",
    source: "setlist.fm",
    sourceEventId: item.id || "",
    sourceUrl: item.url || "",
  };
}

function ticketmasterResult(item) {
  const venue = item._embedded?.venues?.[0] || {};
  const attractions = item._embedded?.attractions || [];
  const localDate = item.dates?.start?.localDate || "";
  const status = item.dates?.status?.code;
  return {
    artist: attractions[0]?.name || item.name || "",
    venue: venue.name || "",
    city: venue.city?.name || "",
    country: venue.country?.countryCode || "",
    date: displayDate(localDate),
    startsAt: item.dates?.start?.dateTime || "",
    address: [venue.address?.line1, venue.postalCode].filter(Boolean).join(", "),
    latitude: venue.location?.latitude || "",
    longitude: venue.location?.longitude || "",
    promoter: item.promoter?.name || "",
    eventStatus: status === "cancelled" ? "cancelled" : status === "postponed" || status === "rescheduled" ? "postponed" : "announced",
    lineup: attractions.map(({ name }) => ({ artist: name })).filter(({ artist }) => artist),
    ticketUrl: item.url || "",
    source: "ticketmaster",
    sourceEventId: item.id || "",
    sourceUrl: item.url || "",
  };
}

export async function searchExternalConcertCatalog(criteria, env, request = fetch) {
  const field = ["artist", "venue", "city", "date"].includes(criteria.field) ? criteria.field : "artist";
  const value = String(criteria.value || "").trim().slice(0, 100);
  if (value.length < 2) return [];
  const artist = String(criteria.artist || (field === "artist" ? value : "")).trim().slice(0, 100);
  const venue = String(criteria.venue || (field === "venue" ? value : "")).trim().slice(0, 100);
  const date = String(criteria.date || (field === "date" ? value : "")).trim();
  const year = /^\d{4}$/.test(String(criteria.year || "").trim()) ? String(criteria.year).trim() : "";
  const city = String(criteria.city || (field === "city" ? value : "")).trim().slice(0, 100);
  const country = /^[A-Z]{2}$/i.test(criteria.country || "") ? String(criteria.country).toUpperCase() : "";
  const searches = [];
  if (date && !exactDate(date)) return [];

  if (env.SETLIST_API_KEY && (artist.length >= 2 || venue.length >= 2) && (!date || exactDate(date))) {
    const params = new URLSearchParams({ p: "1" });
    if (artist) params.set("artistName", artist);
    if (venue) params.set("venueName", venue);
    if (city) params.set("cityName", city);
    if (country) params.set("countryCode", country);
    if (exactDate(date)) params.set("date", date.replaceAll("/", "-"));
    else if (year) params.set("year", year);
    const fetchPage = async (page) => {
      params.set("p", String(page));
      const response = await request(`https://api.setlist.fm/rest/1.0/search/setlists?${params}`, {
        headers: { "x-api-key": env.SETLIST_API_KEY, Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`setlist.fm search failed (${response.status})`);
      return response.json();
    };
    searches.push((async () => {
      const first = await fetchPage(1);
      const pageCount = country && !city && !year && !date
        ? Math.min(10, Math.ceil(Number(first.total || 0) / Number(first.itemsPerPage || 20)))
        : 1;
      const pages = [first];
      for (let page = 2; page <= pageCount; page += 1) pages.push(await fetchPage(page));
      return pages.flatMap((result) => result.setlist?.map(setlistResult) || []).slice(0, 200);
    })());
  }

  const now = new Date();
  const past = exactDate(date) ? new Date(`${isoDate(date)}T23:59:59`) < now : year && Number(year) < now.getFullYear();
  if (env.TICKETMASTER_API_KEY && !past && (artist.length >= 2 || venue.length >= 2 || exactDate(date))) {
    const params = new URLSearchParams({ apikey: env.TICKETMASTER_API_KEY, classificationName: "music", size: "12", sort: "date,asc" });
    if (artist || venue) params.set("keyword", artist || venue);
    if (country) params.set("countryCode", country);
    if (city) params.set("city", city);
    if (exactDate(date)) {
      const day = isoDate(date);
      params.set("startDateTime", `${day}T00:00:00Z`);
      params.set("endDateTime", `${day}T23:59:59Z`);
    } else if (year) {
      const start = Number(year) === now.getFullYear() ? now.toISOString().replace(/\.\d{3}Z$/, "Z") : `${year}-01-01T00:00:00Z`;
      params.set("startDateTime", start);
      params.set("endDateTime", `${year}-12-31T23:59:59Z`);
    } else params.set("startDateTime", now.toISOString().replace(/\.\d{3}Z$/, "Z"));
    searches.push(request(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Ticketmaster search failed (${response.status})`);
        return ((await response.json())._embedded?.events?.map(ticketmasterResult) || []).slice(0, 5);
      }));
  }

  const settled = await Promise.allSettled(searches);
  if (settled.length && settled.every(({ status }) => status === "rejected")) throw settled[0].reason;
  const results = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []).filter((item) => item.artist && item.date);
  const filteredByVenue = venue ? results.filter((item) => item.venue.toLocaleLowerCase().includes(venue.toLocaleLowerCase()) || field !== "venue") : results;
  const filtered = city ? filteredByVenue.filter((item) => item.city.toLocaleLowerCase().startsWith(city.toLocaleLowerCase())) : filteredByVenue;
  return [...new Map(filtered.map((item) => [`${item.source}|${item.sourceEventId || `${item.artist}|${item.venue}|${item.date}`}`, item])).values()];
}
