import React, { useEffect, useMemo, useRef, useState } from "react";
import spotifyIcon from "@fortawesome/fontawesome-free/svgs/brands/spotify.svg";
import stageImage from "../assets/dashboard-concert-stage.jpg";
import { normalize, parseDate } from "../lib/concerts";
import { SuggestionDecisionButtons, UserAvatar } from "../components/SharedUi";

const dayFormat = new Intl.DateTimeFormat("en", { day: "2-digit" });
const monthFormat = new Intl.DateTimeFormat("en", { month: "short" });
const weekdayFormat = new Intl.DateTimeFormat("en", { weekday: "short" });
const fullDateFormat = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const suggestionDateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});
const relativeTimeFormat = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
  style: "narrow",
});

function dateOf(concert) {
  return new Date(parseDate(concert.date));
}
function greeting() {
  const hour = new Date().getHours();
  return hour < 12
    ? "Good morning"
    : hour < 18
      ? "Good afternoon"
      : "Good evening";
}
function countdown(concert, now) {
  const remaining = Math.max(0, parseDate(concert.date) - now);
  return [
    Math.floor(remaining / 86_400_000),
    Math.floor(remaining / 3_600_000) % 24,
    Math.floor(remaining / 60_000) % 60,
    Math.floor(remaining / 1_000) % 60,
  ];
}
function timeAgo(value, now) {
  const seconds = (new Date(value).getTime() - now) / 1000;
  const [divisor, unit] =
    Math.abs(seconds) < 3600
      ? [60, "minute"]
      : Math.abs(seconds) < 86_400
        ? [3600, "hour"]
        : [86_400, "day"];
  return Number.isFinite(seconds)
    ? relativeTimeFormat.format(Math.round(seconds / divisor), unit)
    : "";
}
function concertCountry(concert) {
  if (concert.country)
    return (
      {
        ES: "Spain",
        CH: "Switzerland",
        FR: "France",
        GB: "United Kingdom",
        PT: "Portugal",
      }[concert.country.toUpperCase()] || concert.country
    );
  const venue = String(concert.venue || "").toLowerCase();
  if (
    /(zurich|fribourg|geneve|lausanne|docks|montreux|metropole|yverdon|basel|pratteln|bern)/.test(
      venue,
    )
  )
    return "Switzerland";
  if (venue.includes("hellfest")) return "France";
  if (venue.includes("o2 arena")) return "United Kingdom";
  if (venue.includes("braga")) return "Portugal";
  return "Spain";
}

function Status({ bought }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-black uppercase tracking-wide ${bought ? "text-emerald-400" : "text-amber-400"}`}
    >
      <i
        className={`fa-solid ${bought ? "fa-circle-check" : "fa-circle-exclamation"}`}
        aria-hidden="true"
      />
      {bought ? "Ticket bought" : "Not bought"}
    </span>
  );
}

function SectionTitle({ title, action, onAction, showArrow = true }) {
  return (
    <div className="flex h-7 items-center justify-between gap-4">
      <h2 className="text-xs font-black uppercase tracking-[0.06em] text-zinc-100">
        {title}
      </h2>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="relative inline-flex h-7 items-center gap-1.5 whitespace-nowrap text-[10px] font-black uppercase tracking-wide text-blue-400 transition-colors after:absolute after:-inset-y-2 hover:text-blue-300"
        >
          {action}
          {showArrow && (
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}

function EmptyArchiveOnboarding({
  firstName,
  spotifyConnected,
  friendCount,
  onAdd,
  onNavigate,
}) {
  const steps = [
    {
      icon: "fa-ticket",
      title: "Add your first concert",
      description: "Start with any show you remember.",
      complete: false,
      action: onAdd,
      label: "Add concert",
    },
    {
      iconSrc: spotifyIcon,
      title: "Connect Spotify",
      description: "Get suggestions from artists you listen to.",
      complete: spotifyConnected,
      action: () => onNavigate("profile"),
      label: spotifyConnected ? "Connected" : "Connect",
    },
    {
      icon: "fa-user-group",
      title: "Find your people",
      description: "Add friends and share attendance.",
      complete: friendCount > 0,
      action: () => onNavigate("friends"),
      label: friendCount > 0 ? "Friends added" : "Find friends",
    },
    {
      icon: "fa-file-import",
      title: "Bring an existing archive",
      description: "Import JSON, CSV, ICS or setlist.fm history.",
      complete: false,
      action: () => onNavigate("profile"),
      label: "Import",
    },
  ];
  return (
    <div className="adn-home space-y-5">
      <header className="pb-2 pt-14 lg:pt-2">
        <h1 className="text-3xl font-black uppercase leading-none tracking-[0.025em] text-zinc-50 lg:text-[1.75rem]">
          Welcome, {firstName}
        </h1>
        <p className="mt-2.5 text-sm text-zinc-500">
          Your concert archive starts here.
        </p>
      </header>
      <div className="grid overflow-hidden rounded-md border border-[#30343a] bg-[#15191e] lg:grid-cols-[1.2fr_0.8fr]">
        <section className="relative flex min-h-[360px] items-end overflow-hidden p-6 sm:p-8">
          <img
            src={stageImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/20" />
          <div className="relative max-w-xl">
            <h2 className="text-4xl font-black uppercase leading-[0.95] text-white sm:text-5xl">
              Start with a show you remember
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-zinc-300">
              One concert unlocks your timeline, statistics and year review. Add
              the artist, venue and date — everything else is optional.
            </p>
            <button
              type="button"
              onClick={onAdd}
              className="adn-button-primary mt-6 min-h-12 px-6"
            >
              <i className="fa-solid fa-plus" aria-hidden="true" />
              Add your first concert
            </button>
          </div>
        </section>
        <section
          className="p-5 sm:p-7"
          aria-labelledby="onboarding-steps-title"
        >
          <h2
            id="onboarding-steps-title"
            className="text-lg font-black uppercase text-zinc-100"
          >
            Make it yours
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
          Useful places to begin. Explore in any order.
          </p>
          <ol className="mt-5 divide-y divide-[#30343a]">
            {steps.map((step) => (
              <li key={step.title} className="flex items-center gap-4 py-4">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${step.complete ? "border-emerald-800 bg-emerald-950/40 text-emerald-400" : "border-[#30343a] bg-[#111418] text-blue-400"}`}
                >
                  {step.iconSrc ? (
                    <img
                      src={step.iconSrc}
                      alt=""
                      className="h-4 w-4"
                      style={{
                        filter:
                          "invert(55%) sepia(79%) saturate(1118%) hue-rotate(98deg) brightness(90%) contrast(86%)",
                      }}
                    />
                  ) : (
                    <i className={`fa-solid ${step.icon}`} aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-black text-zinc-100">
                    {step.title}
                  </strong>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">
                    {step.description}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={step.action}
                  className={`min-h-11 shrink-0 px-2 text-xs font-black ${step.complete ? "text-emerald-400" : "text-blue-400 transition-colors hover:text-blue-300"}`}
                >
                  {step.complete && (
                    <i
                      className="fa-solid fa-check mr-1.5"
                      aria-hidden="true"
                    />
                  )}
                  {step.label}
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

export default function HomePage({
  profile,
  concerts,
  suggestions,
  artistImages,
  suggestionReviews,
  suggestionError,
  notifications,
  spotifyConnected,
  friendCount,
  onAdd,
  onOpenConcert,
  onSuggestionInterested,
  onSuggestionNotInterested,
  onNavigate,
  onOpenYearReview,
  DropdownMenu,
}) {
  const upcomingRef = useRef(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();
  const currentYear = today.getFullYear();
  const availableYears = useMemo(
    () =>
      [
        ...new Set(
          concerts
            .filter((concert) => concert.bought)
            .map((concert) => dateOf(concert).getFullYear())
            .filter(Number.isFinite),
        ),
      ].sort((a, b) => b - a),
    [concerts],
  );
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const activeYear = availableYears.includes(selectedYear)
    ? selectedYear
    : availableYears[0] || currentYear;
  const upcoming = useMemo(
    () =>
      concerts
        .filter((concert) => parseDate(concert.date) >= todayTime)
        .sort((a, b) => parseDate(a.date) - parseDate(b.date)),
    [concerts, todayTime],
  );
  const yearConcerts = useMemo(
    () =>
      concerts.filter(
        (concert) =>
          concert.bought && dateOf(concert).getFullYear() === activeYear,
      ),
    [activeYear, concerts],
  );
  const next = upcoming[0];
  const nextIsToday = next && parseDate(next.date) === todayTime;
  const nextCountdown = next ? countdown(next, now) : [];
  const recentNotifications = notifications
    .filter(
      (item) => new Date(item.createdAt).getTime() >= now - 7 * 86_400_000,
    )
    .slice(0, 5);
  const firstName = (profile?.displayName || profile?.username || "there")
    .trim()
    .split(/\s+/)[0];
  const yearUpcoming = yearConcerts.filter(
    (concert) => parseDate(concert.date) >= todayTime,
  ).length;
  const yearPast = yearConcerts.length - yearUpcoming;
  const valuesFor = (key) => new Set(yearConcerts.map(key).filter(Boolean));
  const newInYear = (values, key) =>
    [...values].filter(
      (value) =>
        !concerts.some(
          (concert) =>
            key(concert) === value &&
            dateOf(concert).getFullYear() < activeYear,
        ),
    ).length;
  const artists = valuesFor((concert) => concert.artist);
  const cities = valuesFor((concert) => concert.city || concert.venue);
  const countries = valuesFor(concertCountry);
  const newSuggestions = suggestions.filter(
    (suggestion) => !suggestionReviews[suggestion.id],
  );
  const metrics = [
    {
      icon: "fa-ticket",
      value: yearConcerts.length,
      label: "Concerts",
      detail: (
        <>
          <em className="text-emerald-400">{yearUpcoming}</em> upcoming&nbsp; ·
          &nbsp;<em className="text-blue-400">{yearPast}</em> past
        </>
      ),
      green: true,
    },
    {
      icon: "fa-microphone-lines",
      value: artists.size,
      label: "Artists",
      detail: (
        <>
          New:{" "}
          <em className="text-blue-400">
            {newInYear(artists, (concert) => concert.artist)}
          </em>
        </>
      ),
    },
    {
      icon: "fa-location-dot",
      value: cities.size,
      label: "Cities",
      detail: (
        <>
          <em className="text-blue-400">
            {newInYear(cities, (concert) => concert.city || concert.venue)}
          </em>{" "}
          new
        </>
      ),
    },
    {
      icon: "fa-globe",
      value: countries.size,
      label: "Countries",
      detail: (
        <>
          <em className="text-blue-400">
            {newInYear(countries, concertCountry)}
          </em>{" "}
          new
        </>
      ),
    },
  ];
  if (concerts.length === 0)
    return (
      <EmptyArchiveOnboarding
        firstName={firstName}
        spotifyConnected={spotifyConnected}
        friendCount={friendCount}
        onAdd={onAdd}
        onNavigate={onNavigate}
      />
    );
  return (
    <div className="adn-home space-y-3">
      <header className="flex flex-col gap-5 pb-2 pt-14 sm:flex-row sm:items-start sm:justify-between lg:h-[71px] lg:pt-2">
        <div>
          <h1 className="text-3xl font-black uppercase leading-none tracking-[0.025em] text-zinc-50 lg:text-[1.75rem]">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-2.5 text-sm text-zinc-500">
            Here&apos;s what&apos;s happening in your concert world.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="adn-button-primary h-12 px-7 text-sm"
        >
          <i className="fa-solid fa-plus" aria-hidden="true" />
          Add concert
        </button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[718fr_532fr]">
        <section className="relative min-h-[360px] overflow-hidden rounded-md border border-[#30343a] bg-zinc-950 lg:h-[318px] lg:min-h-0">
          <img
            src={
              next?.imageUrl ||
              artistImages.get(normalize(next?.artist)) ||
              stageImage
            }
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center opacity-65"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/10" />
          {next ? (
            <button
              type="button"
              onClick={() => onOpenConcert(next)}
              className="relative flex min-h-[360px] w-full flex-col p-[22px] text-left lg:h-full lg:min-h-0"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="text-[11px] font-black uppercase tracking-wide text-zinc-200">
                  Next concert
                </span>
                <Status bought={next.bought} />
              </div>
              <div className="my-auto py-3">
                <h2 className="max-w-[75%] break-words text-[2.55rem] font-black uppercase leading-[0.92] tracking-[0.01em] text-white">
                  {next.artist}
                </h2>
                <p className="mt-3 text-base font-black uppercase text-zinc-100">
                  {next.venue || "Venue to be confirmed"}
                </p>
                <p className="mt-1 text-[11px] font-bold uppercase text-zinc-400">
                  {next.city ? `${next.city}, ` : ""}
                  {concertCountry(next)}
                </p>
                <p className="mt-3 flex items-center gap-2 text-xs text-zinc-300">
                  <i
                    className="fa-solid fa-calendar-days w-4 text-zinc-400"
                    aria-hidden="true"
                  />
                  {fullDateFormat.format(dateOf(next))}
                </p>
              </div>
              <div className="flex items-end justify-between gap-4 border-t border-white/15 pt-3">
                <div className="flex gap-7">
                  {nextIsToday ? (
                    <span>
                      <strong className="block text-2xl font-black uppercase text-blue-400">
                        Today
                      </strong>
                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                        Concert day
                      </span>
                    </span>
                  ) : (
                    nextCountdown.map((value, index) => (
                      <span key={index}>
                        <strong className="block text-2xl font-black tabular-nums text-blue-400">
                          {String(value).padStart(2, "0")}
                        </strong>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                          {["Days", "Hrs", "Mins", "Secs"][index]}
                        </span>
                      </span>
                    ))
                  )}
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-black/45 px-4 py-2 text-[10px] font-bold text-zinc-200">
                  View details{" "}
                  <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                </span>
              </div>
            </button>
          ) : (
            <div className="relative flex min-h-[18rem] flex-col justify-between p-6">
              <span className="text-[11px] font-black uppercase tracking-wide">
                Next concert
              </span>
              <div>
                <h2 className="text-4xl font-black uppercase">
                  Your calendar is clear
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate("suggestions")}
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-blue-400"
                >
                  Browse suggestions{" "}
                  <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="relative z-10 h-[318px] overflow-visible rounded-md border border-[#30343a] bg-gradient-to-br from-[#171b20] to-[#11161b] px-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex h-11 items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onOpenYearReview(activeYear)}
              className="flex min-h-11 items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-100 transition-colors hover:text-blue-300"
            >
              Your year{" "}
              <i
                className="fa-solid fa-chevron-down text-[9px] text-zinc-300"
                aria-hidden="true"
              />
            </button>
            <DropdownMenu
              value={activeYear}
              onChange={(year) => setSelectedYear(Number(year))}
              compact
              bare
              ariaLabel="Choose review year"
              className="adn-home-year-select w-20"
              menuAlign="right"
              options={availableYears.map((year) => ({
                value: year,
                label: String(year),
              }))}
            />
          </div>
          <div className="grid grid-cols-2 border-b border-zinc-800">
            {metrics.map(({ icon, value, label, detail, green }, index) => (
              <div
                key={label}
                className={`flex min-h-[113px] items-start gap-4 py-4 ${index % 2 === 0 ? "border-r border-zinc-800 pr-4" : "pl-4"} ${index < 2 ? "border-b border-zinc-800" : ""}`}
              >
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border text-xl ${green ? "border-emerald-500 text-zinc-100" : "border-blue-500 text-zinc-100"}`}
                >
                  <i
                    className={`fa-solid ${icon} ${green ? "-rotate-[35deg]" : ""}`}
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0 pt-1">
                  <span className="flex items-baseline gap-2">
                    <strong className="text-[1.75rem] font-medium leading-none tabular-nums text-zinc-100">
                      {value}
                    </strong>
                    <b className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                      {label}
                    </b>
                  </span>
                  <span className="mt-2 block whitespace-nowrap text-[11px] font-medium text-zinc-500 [&_em]:not-italic">
                    {detail}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onNavigate("stats")}
            className="flex h-12 items-center gap-1.5 text-xs font-black uppercase tracking-wide text-blue-400 transition-colors hover:text-blue-300"
          >
            View stats{" "}
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </button>
        </section>
      </div>

      {upcoming.length > 0 && (
        <section className="relative rounded-md border border-[#30343a] bg-[#15191e] p-3">
          <SectionTitle
            title="Upcoming"
            action="View calendar"
            onAction={() => onNavigate("next")}
          />
          <div
            ref={upcomingRef}
            className="adn-upcoming-track flex min-h-[111px] snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {upcoming.map((concert) => {
              const date = dateOf(concert);
              return (
                <button
                  type="button"
                  key={concert.concertId || `${concert.artist}-${concert.date}`}
                  onClick={() => onOpenConcert(concert)}
                  className="group flex min-w-[min(18rem,85vw)] shrink-0 snap-start items-center rounded-md border border-[#30343a] bg-[#111418] text-left transition-colors hover:border-zinc-500 sm:min-w-0 sm:basis-[calc((100%-0.75rem)/2)] xl:basis-[calc((100%-2.25rem)/4)]"
                >
                  <div
                    className={`h-full w-0.5 shrink-0 rounded-l-md ${concert.bought ? "bg-emerald-500" : "bg-amber-500"}`}
                  />
                  <div className="w-14 shrink-0 px-2 text-center">
                    <span className="block text-[10px] font-black uppercase text-zinc-400">
                      {monthFormat.format(date)}
                    </span>
                    <strong className="block text-2xl font-medium tabular-nums text-zinc-100">
                      {dayFormat.format(date)}
                    </strong>
                    <span className="block text-[9px] font-bold uppercase text-zinc-400">
                      {weekdayFormat.format(date)}
                    </span>
                  </div>
                  <img
                    src={
                      artistImages.get(normalize(concert.artist)) || stageImage
                    }
                    alt=""
                    className="h-20 w-[4.25rem] shrink-0 rounded object-cover opacity-80"
                  />
                  <div className="min-w-0 flex-1 px-3 py-2">
                    <p className="truncate text-xs font-black uppercase text-zinc-100">
                      {concert.artist}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-medium uppercase text-zinc-400">
                      {concert.venue || "Venue TBC"}
                    </p>
                    <p className="mt-1 truncate text-[9px] uppercase text-zinc-500">
                      {concert.city ? `${concert.city}, ` : ""}
                      {concertCountry(concert)}
                    </p>
                    <div className="mt-1.5">
                      <Status bought={concert.bought} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {upcoming.length > 4 && (
            <button
              type="button"
              onClick={() =>
                upcomingRef.current?.scrollBy({
                  left: upcomingRef.current.clientWidth * 0.8,
                  behavior: "smooth",
                })
              }
              className="absolute -right-3 top-[58%] z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#30343a] bg-[#171b20] text-zinc-100 shadow-xl transition hover:border-zinc-500 hover:bg-zinc-800"
              aria-label="Show more upcoming concerts"
            >
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </button>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[608fr_649fr]">
        <section className="min-h-[328px] rounded-md border border-[#30343a] bg-[#15191e] p-3">
          <SectionTitle
            title="Recent activity"
            action="View all"
            onAction={() => onNavigate("activity")}
            showArrow={false}
          />
          {recentNotifications.length ? (
            <div className="divide-y divide-[#292d32]">
              {recentNotifications.map((item) => {
                const invitation = item.kind === "concert_invitation";
                const friendResponse =
                  item.kind === "friend_request_accepted" ||
                  item.kind === "friend_request_declined";
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() =>
                      onNavigate(
                        item.kind === "friend_request" ||
                          friendResponse ||
                          invitation
                          ? "friends"
                          : "activity",
                      )
                    }
                    className="group flex min-h-[52px] w-full items-start gap-3 py-2 text-left sm:items-center"
                  >
                    <UserAvatar
                      person={{
                        displayName: item.actorName,
                        avatarUrl: item.actorAvatarUrl,
                      }}
                      size="h-9 w-9"
                    />
                    <i
                      className={`fa-solid ${invitation ? "fa-ticket" : item.kind === "friend_request_accepted" ? "fa-user-check" : item.kind === "friend_request_declined" ? "fa-user-xmark" : "fa-user-group"} mt-0.5 w-5 shrink-0 text-center text-base sm:mt-0 ${invitation ? "rotate-[-35deg] text-emerald-400" : item.kind === "friend_request_declined" ? "text-red-400" : "text-blue-400"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 text-sm leading-5 text-zinc-500">
                      <strong className="font-bold text-zinc-200">
                        {item.actorName}
                      </strong>
                      {item.kind === "friend_request" ? (
                        " sent you a friend request."
                      ) : item.kind === "friend_request_accepted" ? (
                        " accepted your friend request."
                      ) : item.kind === "friend_request_declined" ? (
                        " declined your friend request."
                      ) : item.kind === "invitation_accepted" ? (
                        <>
                          {" "}
                          is going to{" "}
                          <strong className="font-bold text-zinc-200">
                            {item.artist}
                          </strong>{" "}
                          with you.
                        </>
                      ) : (
                        <>
                          {" "}
                          invited you to{" "}
                          <strong className="font-bold text-zinc-200">
                            {item.artist || "a concert"}
                          </strong>
                          .
                        </>
                      )}
                    </span>
                    <time
                      dateTime={item.createdAt}
                      className="shrink-0 pt-0.5 text-[10px] text-zinc-500 sm:pt-0"
                    >
                      {timeAgo(item.createdAt, now)}
                    </time>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-5 text-sm text-zinc-500">
              Nothing new. Your invitations and friend updates will appear here.
            </p>
          )}
        </section>
        <section className="flex min-h-[328px] flex-col rounded-md border border-[#30343a] bg-[#15191e] p-3">
          <SectionTitle
            title="New suggestions"
            action="View all"
            onAction={() => onNavigate("suggestions")}
            showArrow={false}
          />
          {newSuggestions.length ? (
            <div className="divide-y divide-[#30343a]">
              {newSuggestions.slice(0, 3).map((suggestion) => (
                <div
                  key={suggestion.id}
                  data-suggestion-id={suggestion.id}
                  className="flex min-h-20 flex-col gap-3 py-2 md:flex-row md:items-center"
                >
                  <img
                    src={
                      suggestion.imageUrl ||
                      artistImages.get(normalize(suggestion.artist)) ||
                      stageImage
                    }
                    alt=""
                    className="h-[3.75rem] w-24 shrink-0 rounded object-cover opacity-85"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black uppercase tracking-wide text-zinc-100">
                      {suggestion.artist}
                    </span>
                    <span className="mt-1 block truncate text-[10px] font-bold uppercase text-zinc-400">
                      {suggestion.venue || "Venue TBC"}
                    </span>
                    <span className="mt-1 block truncate text-[9px] font-medium uppercase text-zinc-500">
                      {suggestionDateFormat.format(dateOf(suggestion))}{" "}
                      <span className="px-1 text-zinc-700">·</span>{" "}
                      {suggestion.city ? `${suggestion.city}, ` : ""}
                      {concertCountry(suggestion)}
                    </span>
                  </span>
                  <SuggestionDecisionButtons
                    onInterested={() => onSuggestionInterested(suggestion)}
                    onNotInterested={() =>
                      onSuggestionNotInterested(suggestion)
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="py-5 text-sm text-zinc-500">You&apos;re caught up.</p>
          )}
          {suggestionError && (
            <p className="py-2 text-xs font-semibold text-red-300" role="alert">
              {suggestionError}
            </p>
          )}
          {newSuggestions.length > 3 && (
            <button
              type="button"
              onClick={() => onNavigate("suggestions")}
              className="relative mt-auto flex h-7 items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-blue-400 after:absolute after:-inset-y-2"
            >
              More suggestions{" "}
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
