import React, { useEffect, useMemo, useRef, useState } from "react";
import spotifyIcon from "@fortawesome/fontawesome-free/svgs/brands/spotify.svg";
import {
  adminGetDataQuality,
  adminGetOperations,
  adminGetProviderStatus,
  adminListUsers,
  adminUpdateUser,
  disconnectMySpotify,
  getMySpotifyStatus,
  importMyConcerts,
  removeMyAvatar,
  supabase,
  supabaseEnabled,
  syncMySpotifyArtists,
  uploadMyAvatar,
} from "../lib/supabase";
import { importRowError, parseConcertImport } from "../lib/concert-import";
import { COUNTRIES, countryCode, countryName } from "../lib/countries";
import { useI18n } from "../lib/i18n.jsx";
import { connectSpotify, finishSpotifyConnection } from "../lib/spotify";
import { EmptyState, PanelHeading, UserAvatar } from "../components/SharedUi";
import { BucketListPanel } from "./FriendProfilePage";

function CountryMultiSelect({ value, onChange, limit = 5, className = "mt-4", showCount = true, ariaLabel, single = false }) {
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
    if (event.key === "Escape") setOpen(false);
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

function ImportConcertsModal({ open, onClose, onImported }) {
  const { locale, t } = useI18n();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState("");
  const [setlistUser, setSetlistUser] = useState("");
  const [loadingSetlist, setLoadingSetlist] = useState(false);
  if (!open) return null;
  const invalid = rows.filter(importRowError);
  function updateRow(rowNumber, key, value) {
    setRows((current) => current.map((row) => row.row === rowNumber ? { ...row, [key]: value } : row));
  }
  async function choose(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    try {
      setRows(parseConcertImport(file.name, await file.text()));
    } catch (reason) {
      setRows([]);
      setError(reason.message);
    }
  }
  async function submit() {
    setSaving(true);
    setError("");
    try {
      await importMyConcerts(rows.map(({ row, ...concert }) => concert));
      await onImported();
      onClose();
    } catch (reason) {
      setError(t("We couldn’t import these concerts. Review the highlighted entries and try again."));
    } finally {
      setSaving(false);
    }
  }
  async function loadSetlistHistory() {
    setLoadingSetlist(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/.netlify/functions/get-setlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token || ""}`,
        },
        body: JSON.stringify({
          action: "attended",
          userId: setlistUser.trim(),
          pages: 10,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error("We couldn’t load your setlist.fm concerts. Check the username and try again.");
      const imported = (result.setlist || []).map((item, index) => ({
        row: index + 1,
        artist: String(item.artist?.name || "").toUpperCase(),
        venue: String(item.venue?.name || "").toUpperCase(),
        city: item.venue?.city?.name || "",
        country: String(item.venue?.city?.country?.code || "").toUpperCase(),
        date: String(item.eventDate || "").replaceAll("-", "/"),
        bought: true,
        setlistId: item.id,
        guestAttendees: [],
      }));
      setRows(imported);
      setFileName(`${setlistUser.trim()} on setlist.fm`);
    } catch (reason) {
      setRows([]);
      setError(reason.message);
    } finally {
      setLoadingSetlist(false);
    }
  }
  return (
    <div className="adn-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="adn-modal-panel flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950 shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-zinc-800 px-6 py-5">
          <div>
            <h2
              id="import-title"
              className="text-2xl font-black uppercase text-zinc-100"
            >
              {t("Import concerts")}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {t("Import up to 500 concerts from a file or setlist.fm.")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white"
            aria-label={t("Close")}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 px-5 text-center transition hover:border-zinc-500">
            <i
              className="fa-solid fa-file-arrow-up mb-2 text-blue-400"
              aria-hidden="true"
            />
            <strong className="text-sm text-zinc-100">
              {fileName || t("Choose a concert file")}
            </strong>
            <span className="mt-1 text-xs text-zinc-500">
              {t("Some imported concerts may need a city or country before they can be saved.")}
            </span>
            <input
              type="file"
              accept=".json,.csv,.ics,application/json,text/csv,text/calendar"
              onChange={choose}
              className="sr-only"
            />
          </label>
          <div className="my-4 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-zinc-700">
            <span className="h-px flex-1 bg-zinc-800" />
            {t("or")}
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
          <div className="flex gap-2">
            <input
              value={setlistUser}
              onChange={(event) => setSetlistUser(event.target.value)}
              placeholder={t("setlist.fm username")}
              className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm text-zinc-100 outline-none"
            />
            <button
              type="button"
              disabled={setlistUser.trim().length < 1 || loadingSetlist}
              onClick={loadSetlistHistory}
              className="adn-button-secondary"
            >
              {t(loadingSetlist ? "Searching…" : "Find concerts")}
            </button>
          </div>
          {rows.length > 0 && (
            <div className="mt-5">
              <div className="mb-3 flex justify-between text-xs font-bold text-zinc-400">
                <span>{t("{count} concerts found", { count: rows.length })}</span>
                <span
                  className={
                    invalid.length ? "text-amber-300" : "text-emerald-300"
                  }
                >
                  {invalid.length
                    ? t("{count} concerts need attention", { count: invalid.length })
                    : t("Ready to import")}
                </span>
              </div>
              <div className="max-h-72 divide-y divide-zinc-800 overflow-y-auto border-y border-zinc-800">
                {rows.slice(0, 100).map((row) => (
                  <div
                    key={row.row}
                    className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 py-3 text-sm"
                  >
                    <span className="text-zinc-600">{row.row}</span>
                    <span className="min-w-0">
                      <strong className="block truncate text-zinc-200">
                        {row.artist || "Missing artist"}
                      </strong>
                      <span className="block truncate text-xs text-zinc-500">
                        {[row.venue, row.city, countryName(row.country, locale), row.date]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {importRowError(row) ? <details className="col-span-3 ml-8 rounded-xl border border-amber-900/50 bg-amber-950/10 p-3"><summary className="cursor-pointer text-xs font-bold text-amber-300">{importRowError(row)} · {t("Review concert")}</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={row.artist} onChange={(event)=>updateRow(row.row,"artist",event.target.value.toUpperCase())} placeholder={t("Artist")} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"/><input value={row.venue} onChange={(event)=>updateRow(row.row,"venue",event.target.value.toUpperCase())} placeholder={t("Venue")} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"/><input value={row.city} onChange={(event)=>updateRow(row.row,"city",event.target.value)} placeholder={t("City")} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"/><div className="grid grid-cols-[5rem_1fr] gap-2"><input value={row.country} onChange={(event)=>updateRow(row.row,"country",event.target.value.toUpperCase().slice(0,2))} placeholder="ES" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs uppercase text-zinc-100"/><input value={row.date} onChange={(event)=>updateRow(row.row,"date",event.target.value)} placeholder="DD/MM/YYYY" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"/></div></div></details> : null}
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && (
            <p
              className="mt-4 rounded-xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-300"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="adn-button-secondary"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={!rows.length || invalid.length > 0 || saving}
            onClick={submit}
            className="adn-button-primary"
          >
            {t(saving ? "Importing…" : "Import concerts")}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function ProfilePage({
  profile,
  futureArtists,
  theme,
  language,
  isAdmin,
  onThemeChange,
  onLanguageChange,
  onAdmin,
  onSignOut,
  onSave,
  onExport,
  onDelete,
  onPassword,
  onConfirm,
  onSpotifyChanged,
  onImported,
}) {
  const { t } = useI18n();
  const defaultNotifications = {
    social: { web: true, email: true },
    concertUpdates: { web: true, email: true },
    ticketUpdates: { web: true, email: true },
    suggestions: { web: true, email: true },
    spotify: { web: true, email: true },
  };
  const [form, setForm] = useState({
    displayName: "",
    avatarUrl: "",
    city: "",
    country: "",
    discoverable: true,
    suggestionEmailEnabled: true,
    discoveryCountries: [],
    notificationPreferences: defaultNotifications,
    profileVisibility: { stats: true, lastConcert: true, nextConcert: true, bucketList: true },
  });
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [themeDraft, setThemeDraft] = useState(theme);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeStatus, setThemeStatus] = useState("");
  const [languageDraft, setLanguageDraft] = useState(language);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageStatus, setLanguageStatus] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [spotify, setSpotify] = useState({
    loading: true,
    connected: false,
    error: "",
  });
  const [discoverySaving, setDiscoverySaving] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  useEffect(
    () =>
      setForm({
        displayName: profile?.displayName || "",
        avatarUrl: profile?.avatarUrl || "",
        city: profile?.city || "",
        country: countryCode(profile?.country),
        discoverable: profile?.discoverable !== false,
        suggestionEmailEnabled: profile?.suggestionEmailEnabled !== false,
        discoveryCountries: profile?.discoveryCountries || [],
        notificationPreferences:
          profile?.notificationPreferences || defaultNotifications,
        profileVisibility: profile?.profileVisibility || { stats: true, lastConcert: true, nextConcert: true, bucketList: true },
      }),
    [profile?.id],
  );
  useEffect(() => setThemeDraft(theme), [theme]);
  useEffect(() => setLanguageDraft(language), [language]);
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);
  const field = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      const avatarUrl = avatarFile
        ? await uploadMyAvatar(avatarFile)
        : form.avatarUrl;
      await onSave({ ...form, avatarUrl });
      if (avatarRemoved) await removeMyAvatar();
      setForm((current) => ({ ...current, avatarUrl }));
      setAvatarFile(null);
      setAvatarRemoved(false);
      setStatus(t("Profile saved."));
    } catch (error) {
      setStatus(t("We couldn’t save your profile. Try again."));
    } finally {
      setSaving(false);
    }
  }
  async function saveTheme() {
    setThemeSaving(true);
    setThemeStatus("");
    try {
      await onThemeChange(themeDraft);
      setThemeStatus(t("Appearance saved."));
    } catch (error) {
      setThemeStatus(t("We couldn’t save your appearance. Try again."));
    } finally {
      setThemeSaving(false);
    }
  }
  async function saveLanguage() {
    setLanguageSaving(true);
    setLanguageStatus("");
    try {
      await onLanguageChange(languageDraft);
      setLanguageStatus(t("Language saved."));
    } catch {
      setLanguageStatus(t("We couldn’t save your language. Try again."));
    } finally {
      setLanguageSaving(false);
    }
  }
  function requestAvatarRemoval() {
    onConfirm({
      title: t("Remove profile photo?"),
      description:
        t("Your current profile photo will be removed when you save your profile."),
      confirmLabel: t("Remove photo"),
      hideIcon: true,
      action: () => {
        setAvatarFile(null);
        setAvatarRemoved(true);
        setForm((current) => ({ ...current, avatarUrl: "" }));
        setStatus(t("Save your profile to remove the photo."));
      },
    });
  }
  async function removeAccount() {
    onConfirm({
      title: t("Delete account?"),
      description:
        t("This permanently deletes your profile and personal data. This action cannot be undone."),
      confirmLabel: t("Delete account"),
      confirmationText: "DELETE",
      hideIcon: true,
      action: onDelete,
    });
  }
  async function disconnectSpotify() {
    onConfirm({
      title: t("Disconnect Spotify?"),
      description:
        t("Your Spotify artists will be removed. Concert suggestions will no longer use your Spotify listening until you reconnect."),
      confirmLabel: t("Disconnect"),
      hideIcon: true,
      action: async () => {
        await disconnectMySpotify();
        await onSpotifyChanged();
        setSpotify({ loading: false, connected: false, error: "" });
      },
    });
  }
  async function saveDiscoveryCountries() {
    setDiscoverySaving(true);
    setDiscoveryStatus("");
    try {
      await onSave({ discoveryCountries: form.discoveryCountries });
      setDiscoveryStatus(t("Discovery countries saved."));
    } catch {
      setDiscoveryStatus(t("We couldn’t save your discovery countries. Try again."));
    } finally {
      setDiscoverySaving(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status =
          window.location.pathname === "/spotify/callback"
            ? await syncMySpotifyArtists(
                await finishSpotifyConnection(futureArtists),
              )
            : await getMySpotifyStatus();
        if (window.location.pathname === "/spotify/callback")
          await onSpotifyChanged();
        if (window.location.pathname === "/spotify/callback")
          window.history.replaceState(
            { adnRoute: true, canGoBack: false },
            "",
            "/profile",
          );
        if (!cancelled) setSpotify({ loading: false, error: "", ...status });
      } catch (error) {
        if (window.location.pathname === "/spotify/callback")
          window.history.replaceState(
            { adnRoute: true, canGoBack: false },
            "",
            "/profile",
          );
        if (!cancelled)
          setSpotify({
            loading: false,
            connected: false,
            error: "We couldn’t check your Spotify connection. Try again.",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <ImportConcertsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={onImported}
      />
      <form
        onSubmit={submit}
        className="order-1 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7"
      >
        <PanelHeading
          icon="fa-id-card"
          title={t("Public profile")}
          description={t("Choose how your profile appears to friends.")}
        />
        <div className="mb-6 flex items-center gap-4">
          <div className="group relative shrink-0 rounded-full">
            <UserAvatar
              person={{
                ...profile,
                ...form,
                avatarUrl: avatarPreview || form.avatarUrl,
              }}
              size="h-16 w-16"
            />
            <span className="absolute inset-0 flex items-center justify-center gap-1 rounded-full bg-black/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <label
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-white transition hover:bg-white/15"
                title={t("Change profile photo")}
              >
                <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                <span className="sr-only">{t("Choose profile photo")}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    setAvatarFile(event.target.files?.[0] || null);
                    setAvatarRemoved(false);
                  }}
                  className="sr-only"
                />
              </label>
              {(avatarPreview || form.avatarUrl) && (
                <button
                  type="button"
                  onClick={requestAvatarRemoval}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-red-300 transition hover:bg-red-500/20 hover:text-red-200"
                  title={t("Remove profile photo")}
                  aria-label={t("Remove profile photo")}
                >
                  <i
                    className="fa-solid fa-trash-can text-xs"
                    aria-hidden="true"
                  />
                </button>
              )}
            </span>
          </div>
          <div>
            <p className="font-bold text-zinc-100">
              {form.displayName || "Your name"}
            </p>
            <p className="text-sm text-zinc-500">@{profile?.username}</p>
          </div>
        </div>
        <label className="block text-xs font-bold text-zinc-400">
          {t("Display name")}
          <input
            required
            maxLength="80"
            value={form.displayName}
            onChange={field("displayName")}
            className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-400"
          />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
          <label className="text-xs font-bold text-zinc-400">
            {t("City")}
            <input
              value={form.city}
              onChange={field("city")}
              className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-400"
            />
          </label>
          <label className="text-xs font-bold text-zinc-400">
            {t("Country")}
            <CountryMultiSelect value={form.country ? [form.country] : []} onChange={(countries) => setForm((current) => ({ ...current, country: countries.at(-1) || "" }))} limit={1} className="mt-2" showCount={false} ariaLabel={t("Country")} single />
          </label>
        </div>
        <label className="mt-5 flex items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.discoverable}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                discoverable: event.target.checked,
              }))
            }
            className="h-4 w-4 accent-zinc-100"
          />
          {t("Allow other users to find me")}
        </label>
        <fieldset className="mt-6 border-t border-zinc-800 pt-5">
          <legend className="text-xs font-black uppercase tracking-widest text-zinc-400">{t("Visible to friends")}</legend>
          <p className="mt-1 text-sm text-zinc-500">{t("Choose what friends can see when they open your profile.")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[["stats","Concert statistics"],["lastConcert","Last concert"],["nextConcert","Next concert"],["bucketList","Bucket list"]].map(([key,label]) => <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm font-semibold text-zinc-300"><input type="checkbox" checked={form.profileVisibility[key]} onChange={(event) => setForm((current) => ({ ...current, profileVisibility: { ...current.profileVisibility, [key]: event.target.checked } }))} className="h-4 w-4 accent-blue-500" />{t(label)}</label>)}
          </div>
        </fieldset>
        {status && (
          <p className="mt-4 text-sm text-zinc-300" role="status">
            {status}
          </p>
        )}
        <button disabled={saving} className="adn-button-primary mt-6">
          {saving ? t("Saving…") : t("Save profile")}
        </button>
      </form>
      {supabaseEnabled && <div className="order-3"><BucketListPanel /></div>}
      <section className="order-4 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-bell"
          title={t("Notifications")}
          description={t("Choose which updates appear in the app or arrive by email.")}
        />
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <div className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-600">
            <span>{t("Updates")}</span>
            <span className="text-center">{t("Web")}</span>
            <span className="text-center">{t("Email")}</span>
          </div>
          {[
            ["social", "Friends and invitations"],
            ["concertUpdates", "Concert changes"],
            ["ticketUpdates", "Tickets and availability"],
            ["suggestions", "Concert suggestions"],
            ["spotify", "Spotify connection"],
          ].map(([key, label]) => (
            <div
              key={key}
              className="grid min-h-12 grid-cols-[minmax(0,1fr)_4rem_4rem] items-center border-b border-zinc-800 px-4 last:border-0"
            >
              <span className="text-sm font-semibold text-zinc-300">
                {t(label)}
              </span>
              {["web", "email"].map((channel) => (
                <label key={channel} className="flex justify-center">
                  <span className="sr-only">
                    {label} by {channel}
                  </span>
                  <input
                    type="checkbox"
                    checked={form.notificationPreferences[key][channel]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        suggestionEmailEnabled:
                          key === "suggestions" && channel === "email"
                            ? event.target.checked
                            : current.suggestionEmailEnabled,
                        notificationPreferences: {
                          ...current.notificationPreferences,
                          [key]: {
                            ...current.notificationPreferences[key],
                            [channel]: event.target.checked,
                          },
                        },
                      }))
                    }
                    className="h-4 w-4 accent-blue-500"
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => submit({ preventDefault() {} })}
          className="adn-button-primary mt-5"
        >
          {saving ? t("Saving…") : t("Save notification preferences")}
        </button>
      </section>
      <section className="order-5 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-palette"
          title={t("Appearance")}
          description={t("Choose how A Deafening Noise looks. Your selection is saved to your account.")}
        />
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t("Theme")}
        >
          <button
            type="button"
            role="radio"
            aria-checked={themeDraft === "archive"}
            onClick={() => {
              setThemeDraft("archive");
              setThemeStatus("");
            }}
            className={`adn-theme-choice ${themeDraft === "archive" ? "adn-theme-choice-active" : ""}`}
          >
            <span
              className="adn-theme-preview adn-theme-preview-archive"
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </span>
            <span>
              <strong>{t("Default")}</strong>
              <small>{t("Compact panels and blue actions")}</small>
            </span>
            <i className="fa-solid fa-check" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={themeDraft === "poster"}
            onClick={() => {
              setThemeDraft("poster");
              setThemeStatus("");
            }}
            className={`adn-theme-choice ${themeDraft === "poster" ? "adn-theme-choice-active" : ""}`}
          >
            <span
              className="adn-theme-preview adn-theme-preview-poster"
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </span>
            <span>
              <strong>{t("Concert poster")}</strong>
              <small>{t("Deeper blacks and bold white actions")}</small>
            </span>
            <i className="fa-solid fa-check" aria-hidden="true" />
          </button>
        </div>
        {themeStatus && (
          <p className="mt-4 text-sm text-zinc-300" role="status">
            {themeStatus}
          </p>
        )}
        <button
          type="button"
          disabled={themeSaving || themeDraft === theme}
          onClick={saveTheme}
          className="adn-button-primary mt-5"
        >
          {themeSaving ? t("Saving…") : t("Save appearance")}
        </button>
      </section>
      <section className="order-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-language"
          title={t("Language")}
          description={t("Choose the language used throughout A Deafening Noise.")}
        />
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("Language")}>
          {[["en", "English"], ["es", "Spanish"]].map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={languageDraft === value} onClick={() => { setLanguageDraft(value); setLanguageStatus(""); }} className={`adn-theme-choice ${languageDraft === value ? "adn-theme-choice-active" : ""}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-xs font-black uppercase text-blue-400" aria-hidden="true">{value}</span>
              <span><strong>{t(label)}</strong><small>{value === "en" ? "English" : "Español"}</small></span>
              <i className="fa-solid fa-check" aria-hidden="true" />
            </button>
          ))}
        </div>
        {languageStatus && <p className="mt-4 text-sm text-zinc-300" role="status">{languageStatus}</p>}
        <button type="button" disabled={languageSaving || languageDraft === language} onClick={saveLanguage} className="adn-button-primary mt-5">
          {languageSaving ? t("Saving…") : t("Save language")}
        </button>
      </section>
      <section className="order-2 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-headphones"
          title={t("Music discovery")}
          description={t("Connect Spotify and choose where you want to discover concerts.")}
        />
        <div className="mb-5 flex items-center gap-3 border-t border-zinc-800 pt-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#30343a] bg-[#111418]">
            <img
              src={spotifyIcon}
              alt=""
              className="h-4 w-4"
              style={{
                filter:
                  "invert(55%) sepia(79%) saturate(1118%) hue-rotate(98deg) brightness(90%) contrast(86%)",
              }}
            />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.025em] text-zinc-100">
              Spotify
            </h3>
            <p className="mt-1 text-sm text-zinc-400">{t("Use your top artists to personalise concert suggestions.")}</p>
          </div>
        </div>
        {spotify.loading ? (
          <p className="text-sm text-zinc-400" role="status">
            {t("Updating Spotify connection…")}
          </p>
        ) : spotify.connected ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-bold text-zinc-100">
                {t("Connected as {name}", { name: spotify.displayName })}
              </p>
              {spotify.needsReauthorization && (
                <p className="mt-2 text-sm font-semibold text-amber-300">
                  {t("Spotify access expired. Reconnect to resume daily updates.")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {spotify.needsReauthorization && (
                <button
                  type="button"
                  onClick={() =>
                    connectSpotify().catch((error) =>
                      setSpotify((current) => ({
                        ...current,
                        error: error.message,
                      })),
                    )
                  }
                  className="adn-button-secondary"
                >
                  {t("Reconnect")}
                </button>
              )}
              <button
                type="button"
                onClick={disconnectSpotify}
                className="adn-button-danger"
              >
                {t("Disconnect")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              connectSpotify().catch((error) =>
                setSpotify((current) => ({ ...current, error: error.message })),
              )
            }
            className="adn-button-primary"
          >
            <img
              src={spotifyIcon}
              alt=""
              className="h-4 w-4 brightness-0 invert"
            />
            {t("Connect Spotify")}
          </button>
        )}
        {spotify.error && (
          <p
            className="mt-4 rounded-2xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {spotify.error}
          </p>
        )}
        <fieldset className="mt-6 border-t border-zinc-800 pt-5">
          <legend className="text-xs font-black uppercase tracking-widest text-zinc-400">{t("Discovery countries")}</legend>
          <p className="mt-1 text-sm text-zinc-500">{t("Choose up to five countries where you want to discover concerts.")}</p>
          <CountryMultiSelect value={form.discoveryCountries} onChange={(discoveryCountries) => { setForm((current) => ({ ...current, discoveryCountries })); setDiscoveryStatus(""); }} />
          {discoveryStatus && <p className="mt-4 text-sm text-zinc-300" role="status">{discoveryStatus}</p>}
          <button type="button" disabled={discoverySaving || JSON.stringify(form.discoveryCountries) === JSON.stringify(profile?.discoveryCountries || [])} onClick={saveDiscoveryCountries} className="adn-button-primary mt-5">
            {discoverySaving ? t("Saving…") : t("Save countries")}
          </button>
        </fieldset>
      </section>
      <section className="order-7 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-shield-halved"
          title={t("Account and privacy")}
          description={t("Manage your password, personal data and account.")}
        />
        <div className="flex flex-wrap gap-3">
          <button onClick={onPassword} className="adn-button-secondary">
            <i className="fa-solid fa-key" aria-hidden="true" />
            {t("Change password")}
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="adn-button-secondary"
          >
            <i className="fa-solid fa-file-import" aria-hidden="true" />
            {t("Import concerts")}
          </button>
          <button onClick={onExport} className="adn-button-secondary">
            <i className="fa-solid fa-file-export" aria-hidden="true" />
            {t("Export my data")}
          </button>
          <button onClick={onSignOut} className="adn-button-secondary">
            <i
              className="fa-solid fa-arrow-right-from-bracket"
              aria-hidden="true"
            />
            {t("Sign out")}
          </button>
          <button
            onClick={removeAccount}
            className="adn-button-danger sm:ml-auto"
          >
            {t("Delete my account")}
          </button>
        </div>
        <p className="mt-5 flex gap-4 text-xs font-semibold text-zinc-500"><a href="/privacy.html" className="hover:text-zinc-200">{t("Privacy")}</a><a href="/terms.html" className="hover:text-zinc-200">{t("Terms")}</a></p>
      </section>
      {isAdmin && (
        <section className="order-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
          <PanelHeading
            icon="fa-user-shield"
            title={t("Administration")}
            description={t("Manage users and keep concert information accurate.")}
          />
          <button onClick={onAdmin} className="adn-button-secondary">
            <i className="fa-solid fa-sliders" aria-hidden="true" />
            {t("Open administration")}
          </button>
        </section>
      )}
    </div>
  );
}

const notificationPresentation = {
  friend_request: [
    "fa-user-plus",
    (item, t) => t("{name} sent you a friend request", { name: item.actorName }),
    "friends",
  ],
  friend_request_accepted: [
    "fa-user-check",
    (item, t) => t("{name} accepted your friend request", { name: item.actorName }),
    "friends",
  ],
  friend_request_declined: [
    "fa-user-xmark",
    (item, t) => t("{name} declined your friend request", { name: item.actorName }),
    "friends",
  ],
  concert_invitation: [
    "fa-ticket",
    (item, t) => t("{name} invited you to a concert", { name: item.actorName }),
    "friends",
  ],
  invitation_accepted: [
    "fa-circle-check",
    (item, t) => t("{name} confirmed attendance", { name: item.actorName }),
    "concert",
  ],
  invitation_declined: [
    "fa-circle-xmark",
    (item, t) => t("{name} declined the invitation", { name: item.actorName }),
    "concert",
  ],
  concert_changed: [
    "fa-calendar-pen",
    (item, t) => t("{name} updated a concert", { name: item.actorName || t("The organiser") }),
    "concert",
  ],
  ticket_available: ["fa-ticket", (_item, t) => t("Tickets are now available"), "concert"],
  ticket_link_changed: ["fa-link", (_item, t) => t("The ticket link changed"), "concert"],
  selling_fast: [
    "fa-fire",
    (_item, t) => t("A suggested concert is selling fast"),
    "suggestions",
  ],
  spotify_reconnect: [
    "fa-music",
    (_item, t) => t("Reconnect Spotify to keep suggestions current"),
    "profile",
  ],
};

export function ActivityPage({
  notifications,
  onRead,
  onOpenFriends,
  onOpenConcert,
  onNavigate,
}) {
  const { t } = useI18n();
  useEffect(() => {
    const unread = notifications
      .filter((item) => !item.readAt)
      .map((item) => item.id);
    if (unread.length) onRead(unread);
  }, []);
  function open(item, destination) {
    if (destination === "friends") onOpenFriends();
    else if (destination === "concert" && item.concertId) onOpenConcert(item);
    else onNavigate(destination);
  }
  return (
    <div className="mx-auto max-w-3xl">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-bell"
          title={t("Activity")}
          description={t("Updates from friends and your concerts.")}
        />
        {notifications.length ? (
          <div className="space-y-2">
            {notifications.map((item) => {
              const [icon, label, destination] = notificationPresentation[
                item.kind
              ] || ["fa-bell", (_item, t) => t("Account activity"), "activity"];
              return (
                <button
                  key={item.id}
                  onClick={() => open(item, destination)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition hover:border-zinc-600 ${item.readAt ? "border-zinc-800 bg-zinc-950/50" : "border-blue-900/60 bg-blue-950/20"}`}
                >
                  <i
                    className={`fa-solid ${icon} mt-1 w-5 text-center text-blue-400`}
                    aria-hidden="true"
                  />
                  <span>
                    <span className="block font-bold text-zinc-100">
                      {label(item, t)}
                    </span>
                    {item.artist && (
                      <span className="mt-1 block text-sm text-zinc-500">
                        {item.artist} · {item.date}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="fa-bell"
            title={t("No activity yet")}
            description={t("New friend requests and concert invitations will appear here.")}
          />
        )}
      </section>
    </div>
  );
}

const adminDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const adminTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const formatBytes = (bytes) =>
  bytes ? `${(Number(bytes) / 1024 / 1024).toFixed(1)} MB` : "—";

function HealthBadge({ status }) {
  const { t } = useI18n();
  const label = {
    success: "Healthy",
    active: "Healthy",
    running: "Running",
    preserved: "Using previous results",
    failed: "Failed",
  }[status] || "Needs attention";
  const tone =
    status === "success" || status === "active"
      ? "border-emerald-900 bg-emerald-950/50 text-emerald-300"
      : status === "running"
        ? "border-blue-900 bg-blue-950/50 text-blue-300"
        : status === "preserved"
          ? "border-amber-900 bg-amber-950/50 text-amber-300"
          : "border-red-900 bg-red-950/50 text-red-300";
  return (
    <span
      className={`inline-flex h-6 items-center rounded-md border px-2 text-[9px] font-black uppercase tracking-wide ${tone}`}
    >
      {t(label)}
    </span>
  );
}

export function AdminPage({ currentUserId, onChanged, onConfirm }) {
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [operations, setOperations] = useState(null);
  const [quality, setQuality] = useState(null);
  const [providers, setProviders] = useState(null);
  const [error, setError] = useState("");
  const [operationsError, setOperationsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  function downloadQualityReport() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(quality, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `concert-data-review-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function load() {
    setError("");
    setOperationsError("");
    const [userResult, operationsResult, providerResult, qualityResult] =
      await Promise.allSettled([
        adminListUsers(),
        adminGetOperations(),
        adminGetProviderStatus(),
        adminGetDataQuality(),
      ]);
    if (userResult.status === "fulfilled") setUsers(userResult.value);
    else setError(t("We couldn’t load user administration. Try again."));
    if (operationsResult.status === "fulfilled")
      setOperations(operationsResult.value);
    else setOperationsError(t("We couldn’t load system activity."));
    if (providerResult.status === "fulfilled")
      setProviders(providerResult.value);
    if (qualityResult.status === "fulfilled") setQuality(qualityResult.value);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);
  async function update(user, changes) {
    setUpdatingId(user.id);
    setError("");
    try {
      await adminUpdateUser(
        user.id,
        changes.role || user.role,
        changes.status || user.status,
      );
      await load();
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdatingId("");
    }
  }
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter(
      (user) =>
        (statusFilter === "all" || user.status === statusFilter) &&
        (!needle ||
          [user.displayName, user.username, user.email].some((value) =>
            value?.toLowerCase().includes(needle),
          )),
    );
  }, [users, query, statusFilter]);
  const activeRecently = users.filter(
    (user) =>
      user.lastSignInAt &&
      Date.now() - new Date(user.lastSignInAt).getTime() < 30 * 86400000,
  ).length;
  const metrics = [
    { label: "Total users", value: users.length, icon: "fa-users" },
    { label: "Active in 30 days", value: activeRecently, icon: "fa-signal" },
    {
      label: "Blocked",
      value: users.filter((user) => user.status === "blocked").length,
      icon: "fa-user-lock",
    },
    {
      label: "Concerts stored",
      value: users.reduce(
        (sum, user) => sum + Number(user.concertCount || 0),
        0,
      ),
      icon: "fa-ticket",
    },
  ];
  const latestRun = operations?.latestRun;
  const sourceCounts = new Map(
    (operations?.suggestionsBySource || []).map((source) => [
      source.source,
      source.count,
    ]),
  );
  const githubUsage = providers?.github?.configured
    ? providers.github.minutes30Days
    : operations?.usage?.githubMinutes30Days;
  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-gauge-high"
          title={t("Operations overview")}
          description={t("Monitor accounts and access across A Deafening Noise.")}
        />
        <dl className="grid grid-cols-2 divide-x divide-y divide-zinc-800 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 sm:grid-cols-4 sm:divide-y-0">
          {metrics.map((metric) => (
            <div key={metric.label} className="p-4 first:border-0">
              <dt className="flex items-center gap-2 text-[11px] font-bold text-zinc-500">
                <i
                  className={`fa-solid ${metric.icon} text-blue-400`}
                  aria-hidden="true"
                />
                {t(metric.label)}
              </dt>
              <dd className="mt-2 text-2xl font-black text-zinc-100">
                {loading ? "—" : metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-heart-pulse"
          title={t("Concert discovery")}
          description={t("Daily concert searches, suggestions and emails.")}
        />
        {operationsError ? (
          <div
            className="flex items-center justify-between gap-4 rounded-md border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm text-amber-200"
            role="status"
          >
            <span>{operationsError}</span>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="font-black"
            >
              {t("Retry")}
            </button>
          </div>
        ) : loading ? (
          <div
            className="h-36 animate-pulse rounded-md bg-zinc-950"
            role="status"
            aria-label={t("Loading concert discovery")}
          />
        ) : latestRun ? (
          <>
            <div className="grid gap-4 border-y border-zinc-800 py-4 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(7rem,0.6fr))] md:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <HealthBadge status={latestRun.status} />
                  <span className="text-xs text-zinc-500">
                    {adminTimeFormat.format(new Date(latestRun.startedAt))}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold text-zinc-100">
                  {latestRun.status === "success"
                    ? t("Discovery completed normally")
                    : latestRun.status === "running"
                      ? t("Discovery is running")
                      : t("Discovery needs attention")}
                </p>
                {latestRun.error && (
                  <p className="mt-1 text-xs text-red-300">{latestRun.error}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-zinc-600">
                  {t("Suggestions")}
                </p>
                <p className="mt-1 text-xl font-black text-zinc-100">
                  {latestRun.suggestionCount}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-zinc-600">
                  {t("New matches")}
                </p>
                <p className="mt-1 text-xl font-black text-zinc-100">
                  {latestRun.newSuggestionCount}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-zinc-600">
                  {t("Emails sent")}
                </p>
                <p className="mt-1 text-xl font-black text-zinc-100">
                  {latestRun.emailsSent}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-x-6 sm:grid-cols-2">
              {latestRun.sources.map((source) => (
                <div
                  key={source.source}
                  className="flex min-w-0 items-center gap-3 border-b border-zinc-800 py-3"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${source.status === "success" ? "bg-emerald-400" : source.status === "preserved" ? "bg-amber-400" : "bg-red-400"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-zinc-200">
                      {source.source}
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-[10px] ${source.error ? "text-amber-300" : "text-zinc-600"}`}
                    >
                      {source.error ||
                        `${source.eventsFound} events · ${source.suggestionsFound} matches · ${sourceCounts.get(source.source) || 0} current suggestions`}
                    </span>
                  </span>
                  <HealthBadge status={source.status} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon="fa-satellite-dish"
            title={t("No concert search recorded yet")}
            description={t("Results will appear after the next scheduled or manual search.")}
          />
        )}
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
          <PanelHeading
            icon="fa-triangle-exclamation"
            title={t("Needs attention")}
            description={t("Items that need to be reviewed.")}
          />
          <div className="divide-y divide-zinc-800 border-y border-zinc-800">
            <div className="flex items-center justify-between gap-4 py-4">
              <span>
                <strong className="block text-sm text-zinc-100">
                  {t("Spotify connections needing attention")}
                </strong>
                <span className="mt-1 block text-xs text-zinc-500">
                  {t("Users who need to reconnect Spotify.")}
                </span>
              </span>
              <strong
                className={`text-xl ${operations?.accounts?.spotifyReconnect ? "text-amber-300" : "text-zinc-100"}`}
              >
                {operations?.accounts?.spotifyReconnect ?? "—"}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-4 py-4">
              <span>
                <strong className="block text-sm text-zinc-100">
                  {t("Possible duplicate concerts")}
                </strong>
                <span className="mt-1 block text-xs text-zinc-500">
                  {t("Same artist, venue and date stored more than once.")}
                </span>
              </span>
              <strong
                className={`text-xl ${operations?.duplicates?.count ? "text-amber-300" : "text-zinc-100"}`}
              >
                {operations?.duplicates?.count ?? "—"}
              </strong>
            </div>
          </div>
          {operations?.duplicates?.items?.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-black text-blue-400">
                {t("Review duplicate groups")}
              </summary>
              <ul className="mt-3 space-y-2">
                {operations.duplicates.items.map((item) => (
                  <li
                    key={`${item.artist}-${item.venue}-${item.date}`}
                    className="text-xs text-zinc-400"
                  >
                    <strong className="text-zinc-200">{item.artist}</strong> ·{" "}
                    {item.venue} · {item.date}{" "}
                    <span className="text-amber-300">×{item.count}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
          <PanelHeading
            icon="fa-chart-simple"
            title={t("Service usage")}
            description={t("Usage during the last 30 days.")}
          />
          <dl className="divide-y divide-zinc-800 border-y border-zinc-800">
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm font-bold text-zinc-200">
                {t("Supabase database")}
              </dt>
              <dd className="text-sm font-black text-zinc-100">
                {formatBytes(operations?.usage?.supabaseBytes)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm font-bold text-zinc-200">
                {t("GitHub Actions")}
              </dt>
              <dd className="text-sm font-black text-zinc-100">
                {githubUsage == null ? t("Not configured") : `${githubUsage} min`}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm font-bold text-zinc-200">Resend</dt>
              <dd className="text-right text-xs font-bold text-zinc-400">
                {providers?.resend?.error ? (
                  t("Unavailable")
                ) : providers?.resend?.configured ? (
                  <>
                    <span className="text-emerald-300">
                      {providers.resend.delivered30Days} {t("delivered")}
                    </span>{" "}
                    ·{" "}
                    <span
                      className={
                        providers.resend.bounced30Days
                          ? "text-red-300"
                          : "text-zinc-400"
                      }
                    >
                      {providers.resend.bounced30Days} {t("bounced")}
                    </span>{" "}
                    · {providers.resend.failed30Days} {t("failed")}
                  </>
                ) : (
                  t("Not configured")
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm font-bold text-zinc-200">
                {t("Netlify credits")}
              </dt>
              <dd className="text-xs font-bold text-zinc-500">
                {t("Check in Netlify")}
              </dd>
            </div>
          </dl>
          {providers?.github?.latest?.url && (
            <a
              href={providers.github.latest.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-black text-blue-400 hover:text-blue-300"
            >
              View latest discovery run{" "}
              <i
                className="fa-solid fa-arrow-up-right-from-square"
                aria-hidden="true"
              />
            </a>
          )}
        </div>
      </section>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3"><PanelHeading icon="fa-database" title={t("Concert data review")} description={t("Find incomplete or unclear concert information before it affects users.")} />{quality && <button type="button" onClick={downloadQualityReport} className="adn-button-secondary"><i className="fa-solid fa-download" aria-hidden="true" />{t("Download report")}</button>}</div>
        {quality ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Possible duplicates", quality.possibleDuplicates, "fa-clone"],
              ["Different spellings of the same artist", quality.artistLabels, "fa-microphone"],
              ["Different spellings of the same venue", quality.venueLabels, "fa-building"],
              ["Different spellings of the same city", quality.cityLabels, "fa-city"],
              ["Missing locations", quality.missingLocation, "fa-location-dot"],
              ["Dates to review", quality.suspiciousDates, "fa-calendar-xmark"],
              ["Concerts without an owner", quality.missingCreator, "fa-user-slash"],
              ["Past concerts without a setlist", quality.missingSetlist, "fa-list-ol"],
              ["Missing artwork", quality.missingArtwork, "fa-image"],
              ["Links that may be outdated", quality.uncheckedLinks, "fa-link-slash"],
            ].map(([label, items, icon]) => (
              <details
                key={label}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-bold text-zinc-200 [&::-webkit-details-marker]:hidden">
                  <i
                    className={`fa-solid ${icon} text-blue-400`}
                    aria-hidden="true"
                  />
                  <span className="flex-1">{t(label)}</span>
                  <strong
                    className={
                      items?.length ? "text-amber-300" : "text-emerald-300"
                    }
                  >
                    {items?.length || 0}
                  </strong>
                </summary>
                {items?.length > 0 && (
                  <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto border-t border-zinc-800 pt-3">
                    {items.slice(0, 50).map((item, index) => (
                      <li
                        key={item.id || `${item.artist}-${index}`}
                        className="text-xs text-zinc-500"
                      >
                        <strong className="text-zinc-300">
                          {item.artist || item.source || t("Concert")}
                        </strong>
                        {item.venue ? ` · ${item.venue}` : ""}
                        {item.date ? ` · ${item.date}` : ""}
                        {item.count ? ` ×${item.count}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            We couldn’t load the concert review.
          </p>
        )}
      </section>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-user-shield"
          title={t("User access")}
          description={t("Search accounts, manage roles and suspend access.")}
          count={loading ? undefined : users.length}
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative">
            <span className="sr-only">{t("Search users")}</span>
            <i
              className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs text-zinc-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search name, username or email")}
              className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </label>
          <label>
            <span className="sr-only">{t("Filter users by status")}</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm font-bold text-zinc-200 sm:w-40"
            >
              <option value="all">{t("All accounts")}</option>
              <option value="active">{t("Active")}</option>
              <option value="blocked">{t("Blocked")}</option>
            </select>
          </label>
        </div>
        {error && (
          <div
            className="mb-4 flex items-center justify-between gap-4 rounded-md border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="shrink-0 font-black text-red-100"
            >
              Retry
            </button>
          </div>
        )}
        {loading ? (
          <div className="space-y-3" role="status" aria-label={t("Loading users")}>
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-md bg-zinc-950"
              />
            ))}
          </div>
        ) : filteredUsers.length ? (
          <div className="divide-y divide-zinc-800 border-y border-zinc-800">
            {filteredUsers.map((user) => {
              const isSelf = user.id === currentUserId;
              const busy = updatingId === user.id;
              return (
                <article
                  key={user.id}
                  className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar person={user} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-black text-zinc-100">
                          {user.displayName || user.username || t("Unnamed user")}
                        </h3>
                        {isSelf && (
                          <span className="rounded-md border border-blue-900 bg-blue-950/50 px-1.5 py-0.5 text-[9px] font-black uppercase text-blue-300">
                            {t("You")}
                          </span>
                        )}
                        {user.status === "blocked" && (
                          <span className="rounded-md border border-red-900 bg-red-950/50 px-1.5 py-0.5 text-[9px] font-black uppercase text-red-300">
                            {t("Blocked")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {user.email}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-600">
                        {user.concertCount} {t("concerts")} · {t("Joined")}{" "}
                        {user.createdAt
                          ? adminDateFormat.format(new Date(user.createdAt))
                          : t("Unknown")}{" "}
                        · {t("Last seen")}{" "}
                        {user.lastSignInAt
                          ? adminDateFormat.format(new Date(user.lastSignInAt))
                          : t("Never")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <label>
                      <span className="sr-only">
                        {t("Role for {name}", { name: user.displayName })}
                      </span>
                      <select
                        value={user.role}
                        disabled={isSelf || busy}
                        onChange={(event) => {
                          const role = event.target.value;
                          onConfirm({
                            title:
                              role === "admin"
                                ? t("Make this user an administrator?")
                                : t("Remove administrator access?"),
                            description:
                              role === "admin"
                                ? t("{name} will be able to manage every account.", { name: user.displayName })
                                : t("{name} will return to standard user access.", { name: user.displayName }),
                            confirmLabel:
                              role === "admin" ? t("Make admin") : t("Remove access"),
                            hideIcon: true,
                            action: () => update(user, { role }),
                          });
                        }}
                        className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-bold text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="user">{t("User")}</option>
                        <option value="admin">{t("Admin")}</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={isSelf || busy}
                      onClick={() =>
                        user.status === "active"
                          ? onConfirm({
                              title: t("Block user?"),
                              description: t("{name} will immediately lose access until an administrator restores the account.", { name: user.displayName }),
                              confirmLabel: t("Block"),
                              hideIcon: true,
                              action: () => update(user, { status: "blocked" }),
                            })
                          : update(user, { status: "active" })
                      }
                      className={
                        user.status === "active"
                          ? "adn-button-danger"
                          : "adn-button-success"
                      }
                    >
                      {busy
                        ? t("Updating…")
                        : user.status === "active"
                          ? t("Block")
                          : t("Restore")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="fa-user-slash"
            title={t("No users found")}
            description={t("Try another search or account filter.")}
          />
        )}
      </section>
    </div>
  );
}
