import React, { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import worldGeography from "world-atlas/countries-110m.json";
import { countryName } from "../lib/countries";
import { useI18n } from "../lib/i18n.jsx";

const COUNTRY_IDS = { ES: "724", PT: "620", FR: "250", GB: "826", CH: "756" };
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function countryForVenue(venue) {
  const value = normalize(venue);
  if (/(zurich|fribourg|geneve|lausanne|docks|montreux|metropole|yverdon|basel|pratteln|bern)/.test(value)) return "CH";
  if (value.includes("hellfest")) return "FR";
  if (value.includes("o2 arena")) return "GB";
  if (value.includes("braga")) return "PT";
  return "ES";
}

export default function GeographicStats({ shows, title = "Concert geography", onOpenCountry }) {
  const { locale, t } = useI18n();
  const [mapZoom, setMapZoom] = useState(3.2);
  const [mapCenter, setMapCenter] = useState([10, 50]);
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const countries = useMemo(() => {
    const counts = {};
    shows.forEach(({ venue, country: countryCode }) => {
      if (!venue || venue === "Date confirmed") return;
      const code = String(countryCode || countryForVenue(venue)).toUpperCase();
      counts[code] = (counts[code] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || countryName(a[0], locale).localeCompare(countryName(b[0], locale), locale));
  }, [locale, shows]);
  const maxCount = countries[0]?.[1] || 1;
  const countsById = useMemo(() => Object.fromEntries(countries.map(([code, count]) => [COUNTRY_IDS[code], { country: countryName(code, locale), count }])), [countries, locale]);
  const resetMap = () => { setMapCenter([10, 50]); setMapZoom(3.2); };

  return <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
    <div className="mb-5 flex items-end justify-between gap-4"><div><h3 className="text-lg font-black uppercase tracking-tight text-zinc-100">{title}</h3><p className="mt-1 text-sm text-zinc-500">{t("Concerts by country")}</p></div><span className="text-sm font-semibold text-zinc-500">{countries.length} {t(countries.length === 1 ? "country" : "countries")}</span></div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(220px,0.65fr)]">
      <div className="relative min-h-64 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <ComposableMap width={760} height={420} className="h-full min-h-64 w-full" aria-label={t("Map of concert countries in Europe")}><ZoomableGroup center={mapCenter} zoom={mapZoom} minZoom={1} maxZoom={8} onMoveEnd={({ coordinates, zoom }) => { setMapCenter(coordinates); setMapZoom(zoom); }}><Geographies geography={worldGeography}>{({ geographies }) => geographies.map((geo) => { const entry = countsById[String(geo.id).padStart(3, "0")]; const intensity = entry ? entry.count / maxCount : 0; const fill = entry ? intensity > 0.66 ? "#fafafa" : intensity > 0.25 ? "#a1a1aa" : "#71717a" : "#27272a"; return <Geography key={geo.rsmKey} geography={geo} fill={fill} stroke="#09090b" strokeWidth={0.55} onMouseEnter={() => entry && setHoveredCountry(entry)} onMouseLeave={() => setHoveredCountry(null)} style={{ default: { outline: "none" }, hover: { fill: entry ? "#ffffff" : "#3f3f46", outline: "none" }, pressed: { fill, outline: "none" } }} />; })}</Geographies></ZoomableGroup></ComposableMap>
        {hoveredCountry && <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-sm font-bold text-zinc-100 shadow-xl backdrop-blur">{hoveredCountry.country}: {hoveredCountry.count} {t(hoveredCountry.count === 1 ? "concert" : "concerts")}</div>}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1"><button onClick={resetMap} className="adn-icon-button shadow-lg" aria-label={t("Reset map")}><i className="fa-solid fa-house" aria-hidden="true" /></button><button onClick={() => setMapZoom((zoom) => Math.min(8, zoom * 1.35))} className="adn-icon-button shadow-lg" aria-label={t("Zoom map in")}><i className="fa-solid fa-plus" aria-hidden="true" /></button><button onClick={() => setMapZoom((zoom) => Math.max(1, zoom / 1.35))} className="adn-icon-button shadow-lg" aria-label={t("Zoom map out")}><i className="fa-solid fa-minus" aria-hidden="true" /></button></div>
        <div className="pointer-events-none absolute bottom-3 left-4 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">{t("Drag to explore")}</div>
      </div>
      <div className="space-y-2">{countries.map(([code, count], index) => { const country = countryName(code, locale); const content = <><span className="w-5 text-xs font-black text-zinc-600">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3"><span className="truncate text-sm font-bold text-zinc-100">{country}</span><span className="text-sm font-black text-zinc-300">{count}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-zinc-200" style={{ width: `${(count / maxCount) * 100}%` }} /></div></div></>; return onOpenCountry ? <button key={code} type="button" onClick={() => onOpenCountry(code)} className="flex w-full items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-left hover:border-zinc-600">{content}</button> : <div key={code} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">{content}</div>; })}</div>
    </div>
  </section>;
}
