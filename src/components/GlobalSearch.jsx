import React, { useEffect, useMemo, useRef, useState } from "react";
import { parseShow } from "../lib/concerts";
import { useDialogFocus } from "../hooks/useUi";

const GROUP_ICONS = {
  Artists: "fa-microphone",
  Venues: "fa-location-dot",
  Concerts: "fa-ticket",
  Cities: "fa-city",
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
  onFriends,
  onYear,
}) {
  const [query, setQuery] = useState("");
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
          (show) => show.city,
        ).map((show) => ({
          label: show.city,
          detail: "Search concert archive",
          action: () => onCity(show.city),
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
            action: onFriends,
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
            detail: "Open year in review",
            action: () => onYear(year),
          })),
      ],
    ].filter(([, items]) => items.length);
  }, [
    query,
    concerts,
    friends,
    onArtist,
    onVenue,
    onConcert,
    onCity,
    onFriends,
    onYear,
  ]);
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
        aria-label="Search A Deafening Noise"
        className="adn-modal-panel w-full max-w-2xl overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 shadow-2xl"
      >
        <label className="flex h-16 items-center gap-3 border-b border-zinc-800 px-5">
          <i
            className="fa-solid fa-magnifying-glass text-zinc-500"
            aria-hidden="true"
          />
          <span className="sr-only">Search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search artists, venues, concerts, cities, friends or years"
            className="min-w-0 flex-1 bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <kbd className="hidden rounded-md border border-zinc-700 px-2 py-1 text-[10px] font-bold text-zinc-500 sm:block">
            ESC
          </kbd>
        </label>
        <div className="max-h-[65dvh] overflow-y-auto p-3">
          {query.trim().length < 2 ? (
            <p className="px-3 py-10 text-center text-sm text-zinc-500">
              Type at least two characters.
            </p>
          ) : groups.length ? (
            groups.map(([group, items]) => (
              <section key={group} className="mb-4 last:mb-0">
                <h2 className="mb-1 px-3 text-[10px] font-black uppercase tracking-widest text-zinc-600">
                  {group}
                </h2>
                {items.map((item, index) => (
                  <button
                    key={`${item.label}-${index}`}
                    type="button"
                    onClick={() => {
                      item.action();
                      onClose();
                    }}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-zinc-900"
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
              No matching results.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
