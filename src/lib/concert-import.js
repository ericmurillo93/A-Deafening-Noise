function parseCsvRows(text) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index += 1; row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = ""; }
    else value += char;
  }
  row.push(value); if (row.some(Boolean)) rows.push(row); return rows;
}

function fromCsv(text) {
  const [header = [], ...rows] = parseCsvRows(text);
  const keys = header.map((key) => key.trim());
  return rows.map((row) => Object.fromEntries(keys.map((key, index) => [key, row[index]?.trim() || ""])));
}

function fromIcs(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  return [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map(([, body]) => {
    const get = (name) => body.match(new RegExp(`(?:^|\\r?\\n)${name}(?:;[^:]*)?:(.*)`, "i"))?.[1]?.trim() || "";
    const rawDate = get("DTSTART").replace(/[^0-9]/g, "").slice(0, 8);
    const date = rawDate.length === 8 ? `${rawDate.slice(6, 8)}/${rawDate.slice(4, 6)}/${rawDate.slice(0, 4)}` : "";
    const summary = get("SUMMARY").replace(/\\([,;])/g, "$1");
    const location = get("LOCATION").replace(/\\([,;])/g, "$1");
    return { artist: summary.replace(/^Concierto\s+/i, "").replace(/\s+-\s+no comprado$/i, ""), venue: location, date, ticketUrl: get("URL"), city: "", country: "", bought: !/no comprado/i.test(summary) };
  });
}

export function parseConcertImport(name, text) {
  const extension = name.toLowerCase().split(".").pop();
  let rows;
  if (extension === "json") { const parsed = JSON.parse(text); rows = Array.isArray(parsed) ? parsed : parsed.concerts; }
  else if (extension === "csv") rows = fromCsv(text);
  else if (extension === "ics") rows = fromIcs(text);
  else throw new Error("Choose a JSON, CSV or ICS file.");
  if (!Array.isArray(rows) || !rows.length) throw new Error("No concerts were found in this file.");
  if (rows.length > 500) throw new Error("Import up to 500 concerts at a time.");
  return rows.map((row, index) => ({
    ...row, row: index + 1, artist: String(row.artist || "").trim().toUpperCase(), venue: String(row.venue || "").trim().toUpperCase(),
    city: String(row.city || "").trim(), country: String(row.country || "").trim().toUpperCase(), date: String(row.date || "").trim(),
    bought: row.bought === true || String(row.bought).toLowerCase() === "true", guestAttendees: Array.isArray(row.guestAttendees) ? row.guestAttendees : String(row.guestAttendees || "").split(";").map((item) => item.trim()).filter(Boolean),
  }));
}

export function importRowError(row) {
  if (!row.artist || !row.date) return "Artist and date are required";
  if (!/^\d{2}\/\d{2}\/\d{4}( - \d{2}\/\d{2}\/\d{4})?$/.test(row.date)) return "Use DD/MM/YYYY";
  if (!row.city || !/^[A-Z]{2}$/.test(row.country)) return "City and two-letter country are required";
  return "";
}
