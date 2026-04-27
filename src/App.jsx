import React, { useEffect, useMemo, useState } from "react";

const fallbackConcertHistory = [
  {
    "artist": "ADELE",
    "shows": [
      "PALAU SANT JORDI - 24/05/2016"
    ]
  },
  {
    "artist": "AGENT FRESCO",
    "shows": [
      "SALA BIKINI - 10/11/2017"
    ]
  },
  {
    "artist": "ALCEST",
    "shows": [
      "RESURRECTION FEST - 28/06/2023"
    ]
  },
  {
    "artist": "ANATHEMA",
    "shows": [
      "BE PROG! MY FRIEND - 31/06/2017"
    ]
  },
  {
    "artist": "ANIMALS AS LEADERS",
    "shows": [
      "BE PROG! MY FRIEND - 30/06/2017"
    ]
  },
  {
    "artist": "ARCHITECTS",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 30/06/2019",
      "RESURRECTION FEST - 01/07/2023"
    ]
  },
  {
    "artist": "AVATAR",
    "shows": [
      "PALAU OLÍMPIC - 25/11/2013",
      "DOWNLOAD FESTIVAL MADRID - 24/06/2017",
      "SALA BIKINI - 25/03/2018",
      "Riyadh Air Metropolitano - 05/07/2025",
      "SALA RAZZMATAZZ - 04/02/2026"
    ]
  },
  {
    "artist": "AVENGED SEVENFOLD",
    "shows": [
      "SANT JORDI CLUB - 20/10/2010",
      "PALAU OLÍMPIC - 25/11/2013",
      "ST. JAKOBSHALLE BASEL - 11/06/2024",
      "RESURRECTION FEST - 29/06/2024"
    ]
  },
  {
    "artist": "A PERFECT CIRCLE",
    "shows": [
      "BE PROG! MY FRIEND - 29/06/2018"
    ]
  },
  {
    "artist": "BARONESS",
    "shows": [
      "BE PROG! MY FRIEND - 29/06/2018"
    ]
  },
  {
    "artist": "BEHEMOTH",
    "shows": [
      "RESURRECTION FEST - 28/06/2023"
    ]
  },
  {
    "artist": "BETWEEN THE BURIED AND ME",
    "shows": [
      "SALA RAZZMATAZZ - 04/02/2017"
    ]
  },
  {
    "artist": "BLACK PUMAS",
    "shows": [
      "MONTREUX JAZZ FESTIVAL - 06/07/2022"
    ]
  },
  {
    "artist": "BLEED FROM WITHIN",
    "shows": [
      "HALLENSTADION ZÜRICH - 11/12/2024"
    ]
  },
  {
    "artist": "BORN OF OSIRIS",
    "shows": [
      "RESURRECTION FEST - 09/06/2023"
    ]
  },
  {
    "artist": "BRING ME THE HORIZON",
    "shows": [
      "O2 ARENA - 30/10/2016",
      "RESURRECTION FEST - 03/07/2022",
      "RESURRECTION FEST - 27/06/2024"
    ]
  },
  {
    "artist": "CALIGULA'S HORSE",
    "shows": [
      "BE PROG! MY FRIEND - 30/06/2017"
    ]
  },
  {
    "artist": "CODE ORANGE",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 22/06/2017"
    ]
  },
  {
    "artist": "DESAKATO",
    "shows": [
      "RESURRECTION FEST - 01/07/2023"
    ]
  },
  {
    "artist": "DEVIN TOWNSEND",
    "shows": [
      "SALA RAZZMATAZZ - 04/02/2017",
      "BE PROG! MY FRIEND - 31/06/2017"
    ]
  },
  {
    "artist": "DREAM THEATER",
    "shows": [
      "CLUB SANT JORDI - 24/02/2012",
      "SALA RAZZMATAZZ - 28/04/2017",
      "SAMSUNG HALL, ZÚRICH - 14/02/2020"
    ]
  },
  {
    "artist": "ENTER SHIKARI",
    "shows": [
      "SALA APOLO - 20/03/2016",
      "O2 ARENA - 30/10/2016",
      "RAZZMATAZZ - 06/11/2025"
    ]
  },
  {
    "artist": "ESTOPA",
    "shows": [
      "GIRONA - 03/06/2022",
      "ESTADI LLUIS COMPANYS - 10/07/2024",
      "MALEDUCATS 2025 - 17/05/2025"
    ]
  },
  {
    "artist": "FEVER 333",
    "shows": [
      "RESURRECTION FEST - 29/06/2023"
    ]
  },
  {
    "artist": "GUITARRICADELAFUENTE",
    "shows": [
      "POBLE ESPANYOL - 02/07/2025"
    ]
  },
  {
    "artist": "HAKEN",
    "shows": [
      "BE PROG MY FRIEND - 26/09/2024"
    ]
  },
  {
    "artist": "HEAVEN SHALL BURN",
    "shows": [
      "RESURRECTION FEST - 03/07/2022"
    ]
  },
  {
    "artist": "GAZPACHO",
    "shows": [
      "BE PROG! MY FRIEND - 30/06/2018"
    ]
  },
  {
    "artist": "GHOST",
    "shows": [
      "RESURRECTION FEST - 28/06/2023"
    ]
  },
  {
    "artist": "GOJIRA",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 22/06/2017",
      "RESURRECTION FEST - 02/07/2022"
    ]
  },
  {
    "artist": "GUNS N' ROSES",
    "shows": [
      "ESTADI OLÍMPIC LLUÍS COMPANYS - 01/07/2018"
    ]
  },
  {
    "artist": "IN FLAMES",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 24/06/2017"
    ]
  },
  {
    "artist": "INTERVALS",
    "shows": [
      "RAZZMATAZZ 3 - 22/11/2017"
    ]
  },
  {
    "artist": "IRON MAIDEN",
    "shows": [
      "RIYADH AIR METROPOLITANO - 05/07/2025"
    ]
  },
  {
    "artist": "JARDIN DE LA CROIX",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 22/06/2017",
      "BE PROG! MY FRIEND - 31/06/2017"
    ]
  },
  {
    "artist": "JETHRO TULL",
    "shows": [
      "BE PROG! MY FRIEND - 31/06/2017",
      "SALLE MÉTROPOLE LAUSANNE - 11/03/2023"
    ]
  },
  {
    "artist": "JINJER",
    "shows": [
      "RESURRECTION FEST - 01/07/2022",
      "GENEVE ARENA - 01/08/2022"
    ]
  },
  {
    "artist": "KVELERTAK",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 24/06/2017",
      "RAZZMATAZZ - 15/02/2019"
    ]
  },
  {
    "artist": "LA MARAVILLOSA ORQUESTA DEL ALCOHOL",
    "shows": [
      "LA RIVIERA - 26/02/2022",
      "GRANADA SOUND - 15/09/2023",
      "SALA RAZZMATAZZ - 13/02/2026"
    ]
  },
  {
    "artist": "LEPROUS",
    "shows": [
      "SALA RAZZMATAZZ - 04/02/2017",
      "BE PROG! MY FRIEND - 31/06/2017",
      "SALA BIKINI - 10/11/2017",
      "DOWNLOAD FESTIVAL MADRID - 29/06/2019",
      "SALA APOLO - 16/11/2019",
      "FRI-SON, FRIBOURG - 11/02/2020",
      "SALA APOLO - 20 ANNIVERSARY TOUR - 10/12/2021",
      "LES DOCKS - LAUSANNE - 26/02/2023"
    ]
  },
  {
    "artist": "LINKIN PARK",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 22/06/2017"
    ]
  },
  {
    "artist": "MACHINE HEAD",
    "shows": [
      "RESURRECTION FEST - 26/06/2024"
    ]
  },
  {
    "artist": "MARILLION",
    "shows": [
      "BE PROG! MY FRIEND - 30/06/2017"
    ]
  },
  {
    "artist": "MASTODON",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 23/06/2017",
      "RAZZMATAZZ - 15/02/2019",
      "RESURRECTION FEST - 02/07/2022"
    ]
  },
  {
    "artist": "MASSIVE ATTACK",
    "shows": [
      "MONTREUX JAZZ FESTIVAL - 15/07/2024"
    ]
  },
  {
    "artist": "MEGADETH",
    "shows": [
      "RESURRECTION FEST - 29/06/2024"
    ]
  },
  {
    "artist": "MESHUGGAH",
    "shows": [
      "RESURRECTION FEST - 30/06/2023",
      "SALE MÉTROPOLE - 21/03/2024"
    ]
  },
  {
    "artist": "MICHAEL KIWANUKA",
    "shows": [
      "MONTREUX JAZZ FESTIVAL - 06/07/2022",
      "MONTREUX JAZZ FESTIVAL - 19/07/2024"
    ]
  },
  {
    "artist": "MIKE PORTNOY - SHATTERED FORTRESS",
    "shows": [
      "BE PROG! MY FRIEND - 31/06/2017"
    ]
  },
  {
    "artist": "MORCHEEBA",
    "shows": [
      "LES NITS DE BARCELONA 2025 - JARDINS DEL PALAU DE PEDRALBES - 07/07/2025"
    ]
  },
  {
    "artist": "MORGAN",
    "shows": [
      "PALAU DE LA MÚSICA CATALANA - 25/04/2025"
    ]
  },
  {
    "artist": "MUSE",
    "shows": [
      "BERN - 12/07/2023"
    ]
  },
  {
    "artist": "NATHY PELUSO",
    "shows": [
      "SÓNAR 2025 - 14/06/2025",
      "PALAU SANT JORDI - 14/02/2026"
    ]
  },
  {
    "artist": "NICK JOHNSTON",
    "shows": [
      "RAZZMATAZZ 3 - 22/11/2017"
    ]
  },
  {
    "artist": "OPETH",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 23/06/2017"
    ]
  },
  {
    "artist": "PAIN OF SALVATION",
    "shows": [
      "SALA BIKINI - 8/04/2017",
      "BE PROG! MY FRIEND - 29/06/2018",
      "BE PROG MY FRIEND - 27/09/2024"
    ]
  },
  {
    "artist": "PANTERA",
    "shows": [
      "RESURRECTION FEST - 29/06/2023"
    ]
  },
  {
    "artist": "PAPA ROACH",
    "shows": [
      "RESURRECTION FEST - 30/06/2023"
    ]
  },
  {
    "artist": "PARKWAY DRIVE",
    "shows": [
      "RESURRECTION FEST - 01/07/2023"
    ]
  },
  {
    "artist": "PLINI",
    "shows": [
      "BE PROG! MY FRIEND - 30/06/2018",
      "LES DOCKS - 12/06/2024"
    ]
  },
  {
    "artist": "POLYPHIA",
    "shows": [
      "RAZZMATAZZ 3 - 22/11/2017",
      "KOMPLEX 457 ZURICH - 24/05/2023",
      "LES DOCKS - 12/06/2024"
    ]
  },
  {
    "artist": "PORCUPINE TREE",
    "shows": [
      "HALLE 622 ZURICH - 09/11/2022"
    ]
  },
  {
    "artist": "RESIDENTE",
    "shows": [
      "POBLE ESPANYOL - 19/07/2018",
      "PALAU SANT JORDI - 14/09/2024",
      "POBLE ESPANYOL - 14/07/2025"
    ]
  },
  {
    "artist": "RISE AGAINST",
    "shows": [
      "RESURRECTION FEST - 01/07/2022"
    ]
  },
  {
    "artist": "RIVERSIDE",
    "shows": [
      "SALAMANDRA - 13/05/2017",
      "SALAMANDRA - 05/11/2018"
    ]
  },
  {
    "artist": "ROGER WATERS",
    "shows": [
      "PALAU SANT JORDI - 13/04/2018"
    ]
  },
  {
    "artist": "ROSALIA",
    "shows": [
      "BRAGA - 25/11/2022",
      "PALAU SANT JORDI - 18/04/2026"
    ]
  },
  {
    "artist": "SOEN",
    "shows": [
      "Z7 - PRATTELN - 20/04/2023"
    ]
  },
  {
    "artist": "SÓLSTAFIR",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 24/06/2017",
      "RAZZMATAZZ 2 - 25/11/2017"
    ]
  },
  {
    "artist": "SONS OF APOLLO",
    "shows": [
      "BE PROG! MY FRIEND - 30/06/2018"
    ]
  },
  {
    "artist": "SOULFLY",
    "shows": [
      "RESURRECTION FEST - 01/07/2023"
    ]
  },
  {
    "artist": "STEVE HACKETT",
    "shows": [
      "BE PROG! MY FRIEND - 30/06/2018"
    ]
  },
  {
    "artist": "STEVEN WILSON",
    "shows": [
      "Sala Paral·lel 62 - 13/06/2025"
    ]
  },
  {
    "artist": "SLEEP TOKEN",
    "shows": [
      "HALLE 622 ZÜRICH - 06/11/2024"
    ]
  },
  {
    "artist": "SLIPKNOT",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 29/06/2019",
      "GENEVE ARENA - 01/08/2022",
      "RESURRECTION FEST - 30/06/2023",
      "HALLENSTADION ZÜRICH - 11/12/2024"
    ]
  },
  {
    "artist": "SNARKY PUPPY",
    "shows": [
      "L'AUDITORI - 09/02/2026"
    ]
  },
  {
    "artist": "SYSTEM OF A DOWN",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 23/06/2017"
    ]
  },
  {
    "artist": "SUM41",
    "shows": [
      "RESURRECTION FEST - 26/06/2024"
    ]
  },
  {
    "artist": "TESSERACT",
    "shows": [
      "SALA APOLO - 20/01/2024",
      "Les Docks Lausanne - 11/01/2025",
      "BE PROG! MY FRIEND - 26/09/2025"
    ]
  },
  {
    "artist": "THE GHOST INSIDE",
    "shows": [
      "RESURRECTION FEST - 28/06/2023"
    ]
  },
  {
    "artist": "TIGRAN HAMASYAN",
    "shows": [
      "THÉÂTRE BENNO BESSON, YVERDON-LES-BAINS - 29/01/2022"
    ]
  },
  {
    "artist": "TOOL",
    "shows": [
      "DOWNLOAD FESTIVAL MADRID - 30/06/2019"
    ]
  },
  {
    "artist": "TRIVIUM",
    "shows": [
      "RAZZMATAZZ 2 - 08/04/2018"
    ]
  },
  {
    "artist": "VETUSTA MORLA",
    "shows": [
      "GRANADA SOUND - 16/09/2023"
    ]
  },
  {
    "artist": "WHILE SHE SLEEPS",
    "shows": [
      "RAZZMATAZZ 2 - 18/01/2018"
    ]
  },
  {
    "artist": "YERAI CORTÉS",
    "shows": [
      "PALAU DE LA MÚSICA CATALANA - 09/12/2025"
    ]
  }
];

const fallbackNextConcerts = [
  {
    "artist": "PLINI",
    "date": "16/05/2026",
    "bought": false
  },
  {
    "artist": "The Aristocrats",
    "date": "20/05/2026",
    "bought": false
  },
  {
    "artist": "RIGOBERTA BANDINI",
    "date": "05/06/2026",
    "bought": true
  },
  {
    "artist": "BAD BUNNY",
    "date": "06/06/2026",
    "bought": true
  },
  {
    "artist": "HELLFEST",
    "date": "18/06/2026 - 21/06/2026",
    "bought": true
  },
  {
    "artist": "BE PROG MY FRIEND",
    "date": "25/09/2026 - 26/09/2026",
    "bought": true
  },
  {
    "artist": "AMARAL",
    "date": "18/12/2026",
    "bought": false
  },
  {
    "artist": "Amaia",
    "date": "20/12/2026",
    "bought": false
  }
];

const externalLinks = {
  albums: "https://www.discogs.com/es/user/eric.murillo93/collection",
  spotify: "https://open.spotify.com/user/ericmurillospotify?si=47fbb5f4096a4be8&nd=1&dlsi=b38e7009347e48a4"
};

const GOOGLE_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbxZ2iAFTWkjYeQRcvesTO7Rzc3OSPR78jEFsbWV6vUEsi0FmHEGYOgQ_j28Dj4zAn5pow/exec";

function formatSheetDate(value) {
  if (!value) return "";
  if (typeof value === "string" && value.includes("/")) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

function normalizeBought(value) {
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

function groupHistoryRows(rows) {
  const grouped = rows.reduce((acc, row) => {
    const artist = String(row.artist || "").trim();
    const venue = String(row.venue || "").trim();
    const date = formatSheetDate(row.date);

    if (!artist || !venue || !date) return acc;
    if (!acc[artist]) acc[artist] = [];
    acc[artist].push(`${venue} - ${date}`);
    return acc;
  }, {});

  return Object.entries(grouped).map(([artist, shows]) => ({ artist, shows }));
}

function mapNextRows(rows) {
  return rows
    .map((row) => ({
      artist: String(row.artist || "").trim(),
      date: formatSheetDate(row.date),
      bought: normalizeBought(row.bought)
    }))
    .filter((item) => item.artist && item.date);
}

async function fetchSheetData() {
  const response = await fetch(GOOGLE_SHEET_API_URL);
  if (!response.ok) throw new Error("Could not load Google Sheet data");

  const data = await response.json();
  return {
    history: groupHistoryRows(data.history || []),
    next: mapNextRows(data.next || [])
  };
}

async function postConcertToSheet(payload) {
  const response = await fetch(GOOGLE_SHEET_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Could not save concert");
  return result;
}

function Icon({ type }) {
  const common = {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "mt-0.5 h-4 w-4 shrink-0 text-zinc-500"
  };

  if (type === "search") {
    return (
      <svg {...common} className="h-5 w-5 shrink-0 text-zinc-500">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    );
  }

  if (type === "calendar") {
    return (
      <svg {...common} className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600">
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function parseShow(show, mode) {
  const dateOnly = /^(\d{1,2}\/\d{1,2}\/\d{4})(\s-\s\d{1,2}\/\d{1,2}\/\d{4})?$/.test(show);
  if (mode === "next" || dateOnly) return { venue: "Date confirmed", date: show };

  const parts = show.split(" - ");
  const date = parts[parts.length - 1] || "";
  const venue = parts.slice(0, -1).join(" - ") || show;
  return { venue, date };
}

function normalize(value) {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseDate(date) {
  const match = String(date).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return 0;

  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

function getMostRecentShowDate(item, mode) {
  return Math.max(...item.shows.map((show) => parseDate(parseShow(show, mode).date)));
}

function filterConcerts(items, query) {
  const q = normalize(query.trim());
  if (!q) return items;
  return items.filter((item) => normalize(`${item.artist} ${item.shows ? item.shows.join(" ") : item.date}`).includes(q));
}

function sortConcerts(items, sortMode, mode) {
  const sorted = [...items];

  if (mode === "next") {
    return sorted.sort((a, b) => parseDate(b.date) - parseDate(a.date) || a.artist.localeCompare(b.artist));
  }

  if (sortMode === "concerts") {
    return sorted.sort((a, b) => b.shows.length - a.shows.length || a.artist.localeCompare(b.artist));
  }

  if (sortMode === "recent") {
    return sorted.sort((a, b) => getMostRecentShowDate(b, mode) - getMostRecentShowDate(a, mode) || a.artist.localeCompare(b.artist));
  }

  return sorted.sort((a, b) => a.artist.localeCompare(b.artist));
}

function getVisibleNextConcerts(items, ticketFilter) {
  if (ticketFilter === "bought") return items.filter((item) => item.bought);
  if (ticketFilter === "pending") return items.filter((item) => !item.bought);
  return items;
}

function addHistoryConcert(items, artist, venue, date) {
  const cleanedArtist = artist.trim();
  const cleanedVenue = venue.trim();
  const cleanedDate = date.trim();
  const show = `${cleanedVenue} - ${cleanedDate}`;
  const existingIndex = items.findIndex((item) => normalize(item.artist) === normalize(cleanedArtist));

  if (existingIndex >= 0) {
    return items.map((item, index) => (index === existingIndex ? { ...item, shows: [...item.shows, show] } : item));
  }

  return [...items, { artist: cleanedArtist, shows: [show] }];
}

function addNextConcert(items, artist, date, bought) {
  return [...items, { artist: artist.trim(), date: date.trim(), bought }];
}

function AddConcertModal({ isOpen, mode, onClose, onSave, isSaving, saveError }) {
  const [artist, setArtist] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [bought, setBought] = useState(false);
  const [token, setToken] = useState("");

  if (!isOpen) return null;

  const isNextMode = mode === "next";

  function submit(event) {
    event.preventDefault();
    if (!artist.trim() || !date.trim() || (!isNextMode && !venue.trim())) return;
    onSave({ artist, venue, date, bought, token });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-3xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">Add concert</h2>
            <p className="mt-1 text-sm text-zinc-500">{isNextMode ? "Add an upcoming concert." : "Add a concert to the archive."}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:border-zinc-500">Close</button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Artist</span>
            <input value={artist} onChange={(event) => setArtist(event.target.value)} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" placeholder="Artist name" />
          </label>

          {!isNextMode && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Location / Venue</span>
              <input value={venue} onChange={(event) => setVenue(event.target.value)} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" placeholder="Venue or festival" />
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Date</span>
            <input value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" placeholder="DD/MM/YYYY" />
          </label>

          {isNextMode && (
            <label className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              <input type="checkbox" checked={bought} onChange={(event) => setBought(event.target.checked)} />
              <span>💰 Ticket bought</span>
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Admin password</span>
            <input type="password" value={token} onChange={(event) => setToken(event.target.value)} className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-zinc-400" placeholder="Password" />
          </label>
        </div>

        {saveError && <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{saveError}</div>}

        <button type="submit" disabled={isSaving} className="mt-6 w-full rounded-2xl bg-zinc-100 px-5 py-3 font-black text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Saving..." : "Add concert"}</button>
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">This writes directly to your Google Sheet through your Apps Script web app.</p>
      </form>
    </div>
  );
}

function runTests() {
  console.assert(parseShow("SANT JORDI CLUB - 20/10/2010", "history").venue === "SANT JORDI CLUB", "parseShow should extract venue");
  console.assert(parseShow("LES DOCKS - LAUSANNE - 26/02/2023", "history").venue === "LES DOCKS - LAUSANNE", "parseShow should support venue names containing hyphens");
  console.assert(parseShow("16/05/2026", "next").date === "16/05/2026", "next concerts should support date-only items");
  console.assert(filterConcerts(fallbackConcertHistory, "avenged sevenfold").length === 1, "search should find Avenged Sevenfold");
  console.assert(filterConcerts(fallbackConcertHistory, "zurich").length >= 1, "search should be accent-insensitive for Zürich/Zurich");
  console.assert(filterConcerts(fallbackConcertHistory, "not-a-real-band").length === 0, "search should return no results for unknown terms");
  console.assert(sortConcerts(fallbackConcertHistory, "artist", "history")[0].artist === "ADELE", "artist sort should be alphabetical");
  console.assert(sortConcerts(fallbackNextConcerts, "recent", "next")[0].artist === "Amaia", "next concerts should default to newest date first");
  console.assert(fallbackNextConcerts.filter((item) => item.bought).length === 4, "next concerts should track bought ticket items");
  console.assert(getVisibleNextConcerts(fallbackNextConcerts, "bought").every((item) => item.bought), "bought filter should only show bought items");
  console.assert(getVisibleNextConcerts(fallbackNextConcerts, "pending").every((item) => !item.bought), "pending filter should only show not bought items");
  console.assert(addHistoryConcert([{ artist: "TEST", shows: [] }], "TEST", "VENUE", "01/01/2026")[0].shows.length === 1, "history add should append to existing artists");
  console.assert(addNextConcert([], "TEST", "01/01/2026", true)[0].bought === true, "next add should store bought status");
  console.assert(groupHistoryRows([{ artist: "A", venue: "V", date: "01/01/2026" }])[0].shows[0] === "V - 01/01/2026", "sheet history rows should map to grouped concerts");
  console.assert(mapNextRows([{ artist: "A", date: "01/01/2026", bought: "TRUE" }])[0].bought === true, "sheet next rows should map bought TRUE to boolean true");
}

runTests();

export default function App() {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("artist");
  const [ticketFilter, setTicketFilter] = useState("all");
  const [activePage, setActivePage] = useState("history");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [historyItems, setHistoryItems] = useState(fallbackConcertHistory);
  const [nextItems, setNextItems] = useState(fallbackNextConcerts);

  useEffect(() => {
    let isMounted = true;

    fetchSheetData()
      .then((data) => {
        if (!isMounted) return;
        setHistoryItems(data.history.length ? data.history : fallbackConcertHistory);
        setNextItems(data.next.length ? data.next : fallbackNextConcerts);
        setLoadError("");
      })
      .catch(() => {
        if (!isMounted) return;
        setLoadError("Could not load Google Sheet data. Showing embedded fallback data.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingData(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const isNext = activePage === "next";
  const currentItems = isNext ? nextItems : historyItems;
  const mode = isNext ? "next" : "history";
  const title = isNext ? "Next Concerts" : "Concert Archive";
  const description = isNext ? "Upcoming shows, festivals and planned concerts." : "A searchable lifetime lineup of artists, venues and dates.";

  const filtered = useMemo(() => {
    const visibleItems = isNext ? getVisibleNextConcerts(currentItems, ticketFilter) : currentItems;
    return sortConcerts(filterConcerts(visibleItems, query), sortMode, mode);
  }, [currentItems, query, sortMode, mode, isNext, ticketFilter]);

  const totalShows = currentItems.reduce((sum, item) => sum + (item.shows ? item.shows.length : 0), 0);

  function changePage(page) {
    setActivePage(page);
    setQuery("");
    setSortMode("artist");
    setTicketFilter("all");
    setSidebarOpen(false);
  }

  async function handleAddConcert(data) {
    setIsSaving(true);
    setSaveError("");

    const payload = isNext
      ? { type: "next", token: data.token, artist: data.artist.trim(), date: data.date.trim(), bought: data.bought }
      : { type: "history", token: data.token, artist: data.artist.trim(), venue: data.venue.trim(), date: data.date.trim() };

    try {
      await postConcertToSheet(payload);

      if (isNext) {
        setNextItems((items) => sortConcerts(addNextConcert(items, data.artist, data.date, data.bought), "recent", "next"));
      } else {
        setHistoryItems((items) => addHistoryConcert(items, data.artist, data.venue, data.date));
      }

      setModalOpen(false);
    } catch (error) {
      setSaveError(error.message || "Could not save concert");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 md:flex">
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-100 shadow-2xl transition hover:border-zinc-500"
        aria-label="Open menu"
      >
        Menu
      </button>

      {sidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu overlay"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-zinc-800 bg-zinc-950/95 p-5 backdrop-blur transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col">
          <div className="mb-8 flex items-center justify-between gap-4">
            <button onClick={() => changePage("history")} className="text-left text-xl font-black text-zinc-100">A Deafening Noise</button>
            <button onClick={() => setSidebarOpen(false)} className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:border-zinc-500">Close</button>
          </div>
          <nav className="space-y-2 text-sm">
            <button onClick={() => changePage("history")} className={`block w-full rounded-2xl px-4 py-3 text-left transition hover:bg-zinc-900 hover:text-zinc-100 ${activePage === "history" ? "bg-zinc-900 text-zinc-100" : "text-zinc-400"}`}>Concert history</button>
            <button onClick={() => changePage("next")} className={`block w-full rounded-2xl px-4 py-3 text-left transition hover:bg-zinc-900 hover:text-zinc-100 ${activePage === "next" ? "bg-zinc-900 text-zinc-100" : "text-zinc-400"}`}>Next concerts</button>
            <a href={externalLinks.albums} target="_blank" rel="noreferrer" className="block rounded-2xl px-4 py-3 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100">Album collection</a>
            <a href={externalLinks.spotify} target="_blank" rel="noreferrer" className="block rounded-2xl px-4 py-3 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100">Spotify</a>
          </nav>
          <div className="mt-auto text-xs text-zinc-600">Concert archive project</div>
        </div>
      </aside>

      <section className="mx-auto w-full max-w-7xl px-5 py-16 md:px-8 md:py-14">
        <header className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.45em] text-zinc-400">A Deafening Noise</p>
          <h1 className="text-5xl font-black uppercase tracking-tight md:text-8xl">{title}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-zinc-400 md:text-lg">{description}</p>
          {isLoadingData && <p className="mt-3 text-sm text-zinc-500">Loading Google Sheet data...</p>}
          {loadError && <p className="mt-3 text-sm text-red-300">{loadError}</p>}
          <button
            onClick={() => setModalOpen(true)}
            className="mt-6 rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-black text-zinc-100 shadow-2xl transition hover:border-zinc-500"
          >
            + Add concert
          </button>
        </header>

        <div className="sticky top-0 z-10 mb-8 border-y border-zinc-800 bg-zinc-950/90 py-4 backdrop-blur">
          <div className={`mx-auto grid max-w-5xl gap-3 ${isNext ? "md:grid-cols-[1fr_360px]" : "md:grid-cols-[1fr_280px]"}`}>
            <div className="flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 shadow-2xl">
              <Icon type="search" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search artist, venue, festival, city or date"
                className="w-full bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500"
                aria-label="Search concerts"
              />
            </div>

            {isNext ? (
              <div className="grid grid-cols-3 rounded-full border border-zinc-700 bg-zinc-900 p-1 text-sm text-zinc-300 shadow-2xl">
                <button onClick={() => setTicketFilter("all")} className={`rounded-full px-3 py-2 transition ${ticketFilter === "all" ? "bg-zinc-100 text-zinc-950" : "hover:text-zinc-100"}`}>All</button>
                <button onClick={() => setTicketFilter("bought")} className={`rounded-full px-3 py-2 transition ${ticketFilter === "bought" ? "bg-zinc-100 text-zinc-950" : "hover:text-zinc-100"}`}>Bought</button>
                <button onClick={() => setTicketFilter("pending")} className={`rounded-full px-3 py-2 transition ${ticketFilter === "pending" ? "bg-zinc-100 text-zinc-950" : "hover:text-zinc-100"}`}>Not bought</button>
              </div>
            ) : (
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value)}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-base text-zinc-100 shadow-2xl outline-none"
                aria-label="Sort concerts"
              >
                <option value="artist">Sort by artist</option>
                <option value="concerts">Sort by number of concerts</option>
                <option value="recent">Sort by most recent</option>
              </select>
            )}
          </div>
        </div>

        {!isNext && (
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center">
              <div className="text-3xl font-black">{currentItems.length}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-zinc-500">Artists</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center">
              <div className="text-3xl font-black">{totalShows}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-zinc-500">Shows</div>
            </div>
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <article key={item.artist} className="group rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl transition hover:-translate-y-1 hover:border-zinc-500">
              <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4">
                <h2 className="text-2xl font-black uppercase leading-none tracking-tight md:text-3xl">{item.artist}</h2>
                {isNext ? (
                  item.bought ? (
                    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-300">💰 Bought</span>
                  ) : (
                    <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs font-bold text-zinc-500">Pending</span>
                  )
                ) : (
                  <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-400">{item.shows.length}</span>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {(isNext ? [item.date] : item.shows).map((show) => {
                  const { venue, date } = parseShow(show, mode);
                  return (
                    <div key={`${item.artist}-${show}`} className="rounded-2xl bg-zinc-950 p-4">
                      {!isNext && (
                        <div className="flex gap-2 text-sm font-semibold text-zinc-100">
                          <Icon type="map" />
                          <span>{venue}</span>
                        </div>
                      )}
                      <div className={`${!isNext ? "mt-2" : ""} flex gap-2 text-sm text-zinc-400`}>
                        <Icon type="calendar" />
                        <span>{date}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>

        {filtered.length === 0 && (
          <div className="mt-16 text-center text-zinc-500">No concerts found.</div>
        )}
      </section>

      <AddConcertModal isOpen={modalOpen} mode={mode} onClose={() => setModalOpen(false)} onSave={handleAddConcert} isSaving={isSaving} saveError={saveError} />
    </main>
  );
}
