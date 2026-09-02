import React, { useEffect, useMemo, useRef, useState } from "react";
import { cityKey, parseShow } from "../lib/concerts";
import { countryName } from "../lib/countries";
import { useDialogFocus } from "../hooks/useUi";
import { useI18n } from "../lib/i18n.jsx";

const GROUP_ICONS = {
  Artists: "fa-microphone",
  Venues: "fa-location-dot",
  Concerts: "fa-ticket",
  Cities: "fa-city",
  Countries: "fa-earth-europe",
  Friends: "fa-user-group",
  Years: "fa-calendar",
};

export default function GlobalSearch({
  open,
  concerts,
  friends,
  onClose,
  onArtist,
  onVenue,
  onConcert,
  onCity,
  onCountry,
  onFriend,
  onYear,
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const dialogRef = useDialogFocus(open);
  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  useEffect(() => {
    const listener = (event) => {
      if (event.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [open, onClose]);
  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (needle.length < 2) return [];
    const shows = concerts.flatMap((item) =>
      item.shows
        ? item.shows.map((show) => ({
            artist: item.artist,
            ...parseShow(show, "history"),
          }))
        : [item],
    );
    const unique = (values, key) =>
      [
        ...new Map(
          values.map((value) => [key(value).toLocaleLowerCase(), value]),
        ).values(),
      ].slice(0, 6);
    return [
      [
        "Artists",
        unique(
          shows.filter((show) =>
            show.artist.toLocaleLowerCase().includes(needle),
          ),
          (show) => show.artist,
        ).map((show) => ({
          label: show.artist,
          action: () => onArtist(show.artist),
        })),
      ],
      [
        "Venues",
        unique(
          shows.filter((show) =>
            show.venue?.toLocaleLowerCase().includes(needle),
          ),
          (show) => show.venue,
        ).map((show) => ({
          label: show.venue,
          detail: show.city,
          action: () => onVenue(show.venue),
        })),
      ],
      [
        "Concerts",
        shows
          .filter((show) =>
            [show.artist, show.venue, show.city, show.date].some((value) =>
              value?.toLocaleLowerCase().includes(needle),
            ),
          )
          .slice(0, 6)
          .map((show) => ({
            label: show.artist,
            detail: `${show.venue} · ${show.date}`,
            action: () => onConcert(show),
          })),
      ],
      [
        "Cities",
        unique(
          shows.filter((show) =>
            show.city?.toLocaleLowerCase().includes(needle),
          ),
          (show) => cityKey(show.city, show.country),
        ).map((show) => ({
          label: show.city,
          detail: countryName(show.country, locale) || t("View concerts in this city"),
          action: () => onCity(show),
        })),
      ],
      [
        "Countries",
        unique(shows.filter((show) => countryName(show.country, locale).toLocaleLowerCase().includes(needle)), (show) => show.country).map((show) => ({
          label: countryName(show.country, locale),
          detail: t("View your concert history in this country"),
          action: () => onCountry(show.country),
        })),
      ],
      [
        "Friends",
        friends
          .filter((friend) =>
            [friend.displayName, friend.username].some((value) =>
              value?.toLocaleLowerCase().includes(needle),
            ),
          )
          .slice(0, 6)
          .map((friend) => ({
            label: friend.displayName,
            detail: `@${friend.username}`,
            action: () => onFriend(friend),
          })),
      ],
      [
        "Years",
        [
          ...new Set(
            shows
              .map((show) => show.date?.match(/(\d{4})/)?.[1])
              .filter(Boolean),
          ),
        ]
          .filter((year) => year.includes(needle))
          .sort()
          .reverse()
          .slice(0, 6)
          .map((year) => ({
            label: year,
            detail: t("Open year in review"),
            action: () => onYear(year),
          })),
      ],
    ].filter(([, items]) => items.length);
  }, [
    query,
    t,
    locale,
    concerts,
    friends,
    onArtist,
    onVenue,
    onConcert,
    onCity,
    onCountry,
    onFriend,
    onYear,
  ]);
  const indexedGroups = useMemo(() => {
    let index = 0;
    return groups.map(([group, items]) => [group, items.map((item) => ({ ...item, index: index++ }))]);
  }, [groups]);
  const results = indexedGroups.flatMap(([, items]) => items);
  useEffect(() => { setActiveIndex(-1); }, [query]);
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`archive-search-result-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  function handleSearchKeyDown(event) {
    if (!results.length || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowDown") setActiveIndex((current) => current < results.length - 1 ? current + 1 : 0);
    else if (event.key === "ArrowUp") setActiveIndex((current) => current > 0 ? current - 1 : results.length - 1);
    else if (activeIndex >= 0) { results[activeIndex].action(); onClose(); }
  }
  if (!open) return null;
  return (
    <div
      className="adn-modal-backdrop fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-4 pt-[10dvh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && window.matchMedia("(pointer: coarse)").matches) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("Search my archive")}
        className="adn-modal-panel w-full max-w-2xl overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 shadow-2xl"
      >
        <div className="flex h-16 items-center gap-3 border-b border-zinc-800 px-5">
          <i
            className="fa-solid fa-magnifying-glass text-zinc-500"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={results.length > 0}
            aria-controls="archive-search-results"
            aria-activedescendant={activeIndex >= 0 ? `archive-search-result-${activeIndex}` : undefined}
            aria-label={t("Search my archive")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("Search concerts, artists, venues, cities, countries or years")}
            className="min-w-0 flex-1 bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
            aria-label={t("Close search")}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div id="archive-search-results" role="listbox" className="max-h-[65dvh] overflow-y-auto p-3">
          {query.trim().length < 2 ? (
            <p className="px-3 py-10 text-center text-sm text-zinc-500">
              {t("Search concerts, artists, venues, cities, countries or years.")}
            </p>
          ) : groups.length ? (
            indexedGroups.map(([group, items]) => (
              <section key={group} className="mb-4 last:mb-0">
                <h2 className="mb-1 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-600">
                  {t(group)}
                </h2>
                {items.map((item) => (
                  <button
                    id={`archive-search-result-${item.index}`}
                    key={`${item.label}-${item.index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === item.index}
                    onMouseEnter={() => setActiveIndex(item.index)}
                    onClick={() => {
                      item.action();
                      onClose();
                    }}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors ${activeIndex === item.index ? "bg-blue-950/60 ring-1 ring-inset ring-blue-700" : "hover:bg-zinc-900"}`}
                  >
                    <i
                      className={`fa-solid ${GROUP_ICONS[group]} w-5 text-center text-xs text-blue-400`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-zinc-100">
                        {item.label}
                      </strong>
                      {item.detail && (
                        <span className="block truncate text-xs text-zinc-500">
                          {item.detail}
                        </span>
                      )}
                    </span>
                    <i
                      className="fa-solid fa-arrow-right text-[10px] text-zinc-600"
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </section>
            ))
          ) : (
            <p className="px-3 py-10 text-center text-sm text-zinc-500">
              {t("No matching results.")}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
