import React, { useEffect, useRef, useState } from "react";
import { COUNTRIES, countryName } from "../lib/countries";
import { useI18n } from "../lib/i18n.jsx";

export function CountryMultiSelect({ value, onChange, limit = 5, className = "mt-4", showCount = true, ariaLabel, single = false }) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const root = useRef(null);
  const listId = React.useId();
  const selected = new Set(value);
  const normalizedQuery = query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const inputValue = single && value[0] && !query ? countryName(value[0], locale) : query;
  const options = COUNTRIES.map(({ code }) => ({ code, name: countryName(code, locale) }))
    .filter(({ code, name }) => !selected.has(code) && (!normalizedQuery || code.toLowerCase().startsWith(normalizedQuery) || name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalizedQuery)))
    .sort((a, b) => a.name.localeCompare(b.name, locale)).slice(0, single ? undefined : 8);
  useEffect(() => {
    const close = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  function select(country) {
    if (!country || (!single && value.length >= limit)) return;
    onChange(single ? [country.code] : [...value, country.code]);
    setQuery(""); setHighlight(-1); setOpen(false);
  }
  function keyDown(event) {
    if (event.key === "ArrowDown" && options.length) { event.preventDefault(); setOpen(true); setHighlight((current) => (current + 1) % options.length); }
    if (event.key === "ArrowUp" && options.length) { event.preventDefault(); setOpen(true); setHighlight((current) => (current <= 0 ? options.length - 1 : current - 1)); }
    if (event.key === "Enter" && open && highlight >= 0) { event.preventDefault(); select(options[highlight]); }
    if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); }
  }
  return <div ref={root} className={`relative ${className}`}>
    <div className={single ? "rounded-2xl border border-zinc-700 bg-zinc-950 focus-within:border-zinc-400" : "flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-950 p-2 focus-within:border-zinc-400"}>
      {!single && value.map((code) => <span key={code} className="flex min-h-8 items-center gap-2 rounded-lg bg-zinc-800 px-2.5 text-xs font-bold text-zinc-100">
        {countryName(code, locale)}<span className="text-zinc-500">{code}</span>
        <button type="button" onClick={() => onChange(value.filter((item) => item !== code))} className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100" aria-label={t("Remove {country}", { country: countryName(code, locale) })}><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
      </span>)}
      <input role="combobox" aria-label={ariaLabel || t("Search countries")} aria-autocomplete="list" aria-expanded={open && options.length > 0} aria-controls={listId} aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined} value={inputValue} disabled={!single && value.length >= limit} onChange={(event) => { if (single && value.length) onChange([]); setQuery(event.target.value); setOpen(true); setHighlight(-1); }} onFocus={() => setOpen(true)} onKeyDown={keyDown} placeholder={t(single ? "Country" : value.length >= limit ? "Maximum selected" : value.length ? "Add another country" : "Search countries")} autoComplete="off" className={single ? "w-full bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600" : "h-8 min-w-40 flex-1 bg-transparent px-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed"} />
    </div>
    {open && options.length > 0 && (single || value.length < limit) && <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-1 shadow-2xl">
      {options.map((country, index) => <li id={`${listId}-${index}`} role="option" aria-selected={index === highlight} key={country.code} onMouseDown={(event) => { event.preventDefault(); select(country); }} onMouseEnter={() => setHighlight(index)} className={`flex min-h-11 cursor-pointer items-center justify-between rounded-xl px-3 text-sm ${index === highlight ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-900"}`}><span className="font-semibold">{country.name}</span>{!single && <span className="text-xs font-black text-zinc-500">{country.code}</span>}</li>)}
    </ul>}
    {showCount && <p className="mt-2 text-xs text-zinc-600">{t("{count} of {limit} countries selected", { count: value.length, limit })}</p>}
  </div>;
}

export default function CountrySelect({ value, onChange, disabled = false }) {
  return <fieldset disabled={disabled}><CountryMultiSelect value={value ? [value] : []} onChange={countries => onChange(countries.at(-1) || "")} limit={1} className="" showCount={false} single /></fieldset>;
}
