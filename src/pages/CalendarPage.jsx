import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../lib/i18n.jsx";
import { parseConcertDateRange } from "../lib/concerts.js";

export default function NextConcertCalendar({ items, visibleMonth, setVisibleMonth, onOpen, onContextMenu, onContextMenuAt }) {
  const { t, locale } = useI18n();
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [highlightedDay, setHighlightedDay] = useState(null);
  const monthPickerRef = useRef(null);
  const swipeStartRef = useRef(null);
  const datedItems = useMemo(
    () => items
      .map((concert) => {
        const range = parseConcertDateRange(concert.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return { ...concert, range, isPast: Boolean(range && range.end < today) };
      })
      .filter(({ range }) => range)
      .sort((a, b) => a.range.start - b.range.start),
    [items]
  );
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingDays = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(visibleMonth);
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, index + 1)));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    if (!monthPickerOpen) return undefined;
    function dismiss(event) {
      if (!monthPickerRef.current?.contains(event.target)) setMonthPickerOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [monthPickerOpen]);

  function moveMonth(offset) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    setHighlightedDay(null);
  }

  function eventInteractionProps(concert) {
    return {
      onClick(event) {
        if (!event.currentTarget._adnLongPressed && !event.currentTarget._adnTouchMoved) onOpen(concert);
      },
      onContextMenu(event) {
        onContextMenu(event, concert);
      },
      onTouchStart(event) {
        const touch = event.touches[0];
        const button = event.currentTarget;
        button._adnTouchMoved = false;
        button._adnTouchTimer = setTimeout(() => {
          if (!button._adnTouchMoved) {
            button._adnLongPressed = true;
            if (navigator.vibrate) navigator.vibrate(20);
            onContextMenuAt(touch.clientX, touch.clientY, concert);
          }
        }, 500);
      },
      onTouchMove(event) {
        event.currentTarget._adnTouchMoved = true;
        clearTimeout(event.currentTarget._adnTouchTimer);
      },
      onTouchEnd(event) {
        const button = event.currentTarget;
        clearTimeout(button._adnTouchTimer);
        setTimeout(() => { button._adnLongPressed = false; }, 400);
      },
      onTouchCancel(event) {
        clearTimeout(event.currentTarget._adnTouchTimer);
        event.currentTarget._adnLongPressed = false;
      },
    };
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-3 md:p-6">
      <div ref={monthPickerRef} className="relative mb-5 flex flex-wrap items-center justify-start gap-2">
        <button onClick={() => { setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setHighlightedDay(null); setMonthPickerOpen(false); }} className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm font-black text-zinc-100 transition hover:border-zinc-500">{t("Today")}</button>
        <button onClick={() => moveMonth(-1)} className="rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white" aria-label={t("Previous month")}><i className="fa-solid fa-chevron-up" aria-hidden="true" /></button>
        <button onClick={() => moveMonth(1)} className="rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white" aria-label={t("Next month")}><i className="fa-solid fa-chevron-down" aria-hidden="true" /></button>
        <button onClick={() => setMonthPickerOpen((open) => !open)} className="rounded-xl px-4 py-2 text-xl font-black text-zinc-100 transition hover:bg-zinc-800 md:text-2xl" aria-label={t("Choose month, {month}", { month: monthLabel })} aria-expanded={monthPickerOpen}>
          {monthLabel} <i className="fa-solid fa-chevron-down ml-2 text-xs text-zinc-500" aria-hidden="true" />
        </button>
        {monthPickerOpen && (
          <div className="absolute right-0 top-full z-30 mt-2 w-full max-w-sm rounded-3xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl sm:right-auto">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xl font-black text-zinc-100">{year}</span>
              <div className="flex gap-1">
                <button onClick={() => { setVisibleMonth(new Date(year - 1, month, 1)); setHighlightedDay(null); }} className="rounded-xl px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label={t("Previous year")}><i className="fa-solid fa-chevron-up" aria-hidden="true" /></button>
                <button onClick={() => { setVisibleMonth(new Date(year + 1, month, 1)); setHighlightedDay(null); }} className="rounded-xl px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label={t("Next year")}><i className="fa-solid fa-chevron-down" aria-hidden="true" /></button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }, (_, monthIndex) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2020, monthIndex, 1))).map((label, monthIndex) => (
                <button key={label} onClick={() => { setVisibleMonth(new Date(year, monthIndex, 1)); setHighlightedDay(null); setMonthPickerOpen(false); }} className={`rounded-xl px-2 py-3 text-sm font-semibold transition ${monthIndex === month ? "bg-zinc-100 text-zinc-950" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="grid grid-cols-7 gap-1 md:gap-2"
        style={{ touchAction: "pan-y" }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = swipeStartRef.current;
          swipeStartRef.current = null;
          if (!start || !event.changedTouches[0]) return;
          const touch = event.changedTouches[0];
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
          moveMonth(deltaX > 0 ? -1 : 1);
          setMonthPickerOpen(false);
        }}
        onTouchCancel={() => { swipeStartRef.current = null; }}
      >
        {weekdays.map((day) => <div key={day} className="pb-2 text-center text-[10px] font-bold uppercase text-zinc-600 md:text-xs">{day}</div>)}
        {Array.from({ length: leadingDays }).map((_, index) => <div key={`empty-${index}`} className="min-h-20 rounded-xl bg-zinc-950/30 md:min-h-32" />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const calendarDay = new Date(year, month, day);
          const concerts = datedItems.filter(({ range }) => calendarDay >= range.start && calendarDay <= range.end);
          const isToday = calendarDay.getTime() === today.getTime();
          return (
            <div key={day} className={`relative h-20 overflow-hidden rounded-xl border p-1.5 md:h-auto md:min-h-32 md:overflow-visible md:rounded-2xl md:p-2 ${concerts.length ? "border-zinc-700 bg-zinc-950" : "border-zinc-800/60 bg-zinc-950/40"}`}>
              <div className="mb-1 flex justify-end text-[10px] font-bold md:text-xs"><span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${isToday ? "bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/30" : "text-zinc-600"}`} aria-current={isToday ? "date" : undefined}>{day}</span></div>
              {concerts.length > 0 && (
                <div className="md:hidden">
                  <button type="button" aria-pressed={highlightedDay === calendarDay.getTime()} aria-label={concerts.length === 1 ? t("Highlight {artist} in the monthly list", { artist: concerts[0].artist }) : t("Highlight {count} concerts in the monthly list", { count: concerts.length })} onClick={() => setHighlightedDay(calendarDay.getTime())} className={`block w-full truncate rounded-md border px-1 py-1 text-center text-[8px] font-bold text-zinc-100 transition-[filter,box-shadow] ${concerts.some((concert) => concert.isPast) ? "border-blue-700 bg-blue-950" : concerts.some((concert) => concert.bought) ? "border-emerald-700 bg-emerald-900" : "border-amber-700 bg-amber-950"} ${highlightedDay === calendarDay.getTime() ? "brightness-110 ring-1 ring-inset ring-white/40" : ""}`}>
                    {concerts.length === 1 ? concerts[0].artist : t("{count} shows", { count: concerts.length })}
                  </button>
                </div>
              )}
              <div className="hidden space-y-1 md:block">
                {concerts.map((concert) => (
                  <button
                    key={`${concert.source}-${concert.artist}-${concert.date}-${concert.show || ""}`}
                    {...eventInteractionProps(concert)}
                    onClick={(event) => { event.stopPropagation(); eventInteractionProps(concert).onClick(event); }}
                    className={`block w-full overflow-hidden rounded-md border px-1.5 py-1 text-left text-[8px] font-bold leading-tight text-zinc-100 transition hover:brightness-110 md:rounded-lg md:px-2 md:py-1.5 md:text-[11px] ${concert.isPast ? "border-blue-700 bg-blue-950" : concert.bought ? "border-emerald-700 bg-emerald-900" : "border-amber-700 bg-amber-950"}`}
                    title={`${concert.artist} — ${concert.date}${concert.venue ? ` — ${concert.venue}` : ""}`}
                  >
                    <span className="block truncate">{concert.artist}</span>
                    {concert.date.includes(" - ") && <span className="mt-0.5 hidden font-medium opacity-90 md:block">{concert.date}</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {datedItems.some(({ range }) => range.start <= new Date(year, month + 1, 0) && range.end >= new Date(year, month, 1)) && (
        <section className="mt-4 md:hidden">
          <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">{t("This month")}</h3>
          <div className="space-y-2">
            {datedItems.filter(({ range }) => range.start <= new Date(year, month + 1, 0) && range.end >= new Date(year, month, 1)).map((concert) => {
              const highlighted = highlightedDay !== null && highlightedDay >= concert.range.start.getTime() && highlightedDay <= concert.range.end.getTime();
              return <button key={`month-${concert.source}-${concert.artist}-${concert.date}-${concert.venue || ""}`} data-calendar-highlighted={highlighted || undefined} {...eventInteractionProps(concert)} className={`flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-[filter,box-shadow] ${concert.isPast ? "border-blue-700 bg-blue-950" : concert.bought ? "border-emerald-700 bg-emerald-900" : "border-amber-700 bg-amber-950"} ${highlighted ? "brightness-110 ring-1 ring-inset ring-white/40" : ""}`}>
                <span className="w-12 shrink-0 text-xs font-black tabular-nums text-zinc-100">{concert.date.slice(0, 5)}</span>
                <span className="min-w-0"><span className="block truncate text-xs font-black uppercase text-zinc-100">{concert.artist}</span>{concert.venue && <span className="mt-0.5 block truncate text-[10px] text-zinc-300">{concert.venue}</span>}</span>
              </button>;
            })}
          </div>
        </section>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-blue-700 bg-blue-950" /> {t("History")}</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-emerald-700 bg-emerald-900" /> {t("Ticket bought")}</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-amber-700 bg-amber-950" /> {t("Ticket not bought")}</span>
      </div>

    </section>
  );
}
