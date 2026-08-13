export function normalize(value) {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function parseDate(date) {
  const match = String(date).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return 0;
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

export function parseShow(show, mode) {
  let body = show;
  let setlistId = "";
  const pipeIdx = String(show).lastIndexOf(" | ");
  if (pipeIdx !== -1) {
    setlistId = String(show).slice(pipeIdx + 3).trim();
    body = String(show).slice(0, pipeIdx);
  }
  const dateOnly = /^(\d{1,2}\/\d{1,2}\/\d{4})(\s-\s\d{1,2}\/\d{1,2}\/\d{4})?$/.test(body);
  if (mode === "next" || dateOnly) return { venue: "Date confirmed", date: body, setlistId };
  const parts = body.split(" - ");
  const hasDateRange = parts.length >= 3
    && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(parts[parts.length - 2])
    && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(parts[parts.length - 1]);
  const date = hasDateRange ? parts.slice(-2).join(" - ") : parts[parts.length - 1] || "";
  const venue = parts.slice(0, hasDateRange ? -2 : -1).join(" - ") || body;
  return { venue, date, setlistId };
}

export function getMostRecentShowDate(item, mode) {
  return Math.max(...item.shows.map((show) => parseDate(parseShow(show, mode).date)));
}
