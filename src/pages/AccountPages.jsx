import React, { useEffect, useMemo, useState } from "react";
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
  syncMySpotifyArtists,
  uploadMyAvatar,
} from "../lib/supabase";
import { importRowError, parseConcertImport } from "../lib/concert-import";
import { connectSpotify, finishSpotifyConnection } from "../lib/spotify";
import { EmptyState, PanelHeading, UserAvatar } from "../components/SharedUi";

function ImportConcertsModal({ open, onClose, onImported }) {
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
      setError(reason.message || "Could not import concerts.");
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
        throw new Error(result.error || "Could not load setlist.fm history.");
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
              Import concerts
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              JSON, CSV, ICS or setlist.fm · up to 500 concerts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white"
            aria-label="Close"
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
              {fileName || "Choose an archive file"}
            </strong>
            <span className="mt-1 text-xs text-zinc-500">
              ICS rows usually need city and country before import.
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
            or
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
          <div className="flex gap-2">
            <input
              value={setlistUser}
              onChange={(event) => setSetlistUser(event.target.value)}
              placeholder="setlist.fm username"
              className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm text-zinc-100 outline-none"
            />
            <button
              type="button"
              disabled={setlistUser.trim().length < 1 || loadingSetlist}
              onClick={loadSetlistHistory}
              className="adn-button-secondary"
            >
              {loadingSetlist ? "Loading…" : "Load history"}
            </button>
          </div>
          {rows.length > 0 && (
            <div className="mt-5">
              <div className="mb-3 flex justify-between text-xs font-bold text-zinc-400">
                <span>{rows.length} concerts found</span>
                <span
                  className={
                    invalid.length ? "text-amber-300" : "text-emerald-300"
                  }
                >
                  {invalid.length
                    ? `${invalid.length} need attention`
                    : "Ready to import"}
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
                        {[row.venue, row.city, row.country, row.date]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {importRowError(row) ? <details className="col-span-3 ml-8 rounded-xl border border-amber-900/50 bg-amber-950/10 p-3"><summary className="cursor-pointer text-xs font-bold text-amber-300">{importRowError(row)} · Fix row</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={row.artist} onChange={(event)=>updateRow(row.row,"artist",event.target.value.toUpperCase())} placeholder="Artist" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"/><input value={row.venue} onChange={(event)=>updateRow(row.row,"venue",event.target.value.toUpperCase())} placeholder="Venue" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"/><input value={row.city} onChange={(event)=>updateRow(row.row,"city",event.target.value)} placeholder="City" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"/><div className="grid grid-cols-[5rem_1fr] gap-2"><input value={row.country} onChange={(event)=>updateRow(row.row,"country",event.target.value.toUpperCase().slice(0,2))} placeholder="ES" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs uppercase text-zinc-100"/><input value={row.date} onChange={(event)=>updateRow(row.row,"date",event.target.value)} placeholder="DD/MM/YYYY" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"/></div></div></details> : null}
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
            Cancel
          </button>
          <button
            type="button"
            disabled={!rows.length || invalid.length > 0 || saving}
            onClick={submit}
            className="adn-button-primary"
          >
            {saving ? "Importing…" : "Import concerts"}
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
  isAdmin,
  onThemeChange,
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
  const defaultNotifications = {
    social: { web: true, email: true },
    concertUpdates: { web: true, email: true },
    ticketUpdates: { web: true, email: true },
    suggestions: { web: true, email: false },
    spotify: { web: true, email: true },
  };
  const [form, setForm] = useState({
    displayName: "",
    avatarUrl: "",
    city: "",
    country: "",
    discoverable: true,
    suggestionEmailEnabled: false,
    notificationPreferences: defaultNotifications,
  });
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [themeDraft, setThemeDraft] = useState(theme);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeStatus, setThemeStatus] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [spotify, setSpotify] = useState({
    loading: true,
    connected: false,
    error: "",
  });
  const [importOpen, setImportOpen] = useState(false);
  useEffect(
    () =>
      setForm({
        displayName: profile?.displayName || "",
        avatarUrl: profile?.avatarUrl || "",
        city: profile?.city || "",
        country: profile?.country || "",
        discoverable: profile?.discoverable !== false,
        suggestionEmailEnabled: profile?.suggestionEmailEnabled === true,
        notificationPreferences:
          profile?.notificationPreferences || defaultNotifications,
      }),
    [profile?.id],
  );
  useEffect(() => setThemeDraft(theme), [theme]);
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
      setStatus("Profile saved.");
    } catch (error) {
      setStatus(error.message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }
  async function saveTheme() {
    setThemeSaving(true);
    setThemeStatus("");
    try {
      await onThemeChange(themeDraft);
      setThemeStatus("Appearance saved.");
    } catch (error) {
      setThemeStatus(error.message || "Could not save your appearance.");
    } finally {
      setThemeSaving(false);
    }
  }
  function requestAvatarRemoval() {
    onConfirm({
      title: "Remove profile photo?",
      description:
        "Your current profile photo will be removed when you save your profile.",
      confirmLabel: "Remove photo",
      hideIcon: true,
      action: () => {
        setAvatarFile(null);
        setAvatarRemoved(true);
        setForm((current) => ({ ...current, avatarUrl: "" }));
        setStatus("Save your profile to remove the photo.");
      },
    });
  }
  async function removeAccount() {
    onConfirm({
      title: "Delete account?",
      description:
        "This permanently deletes your profile and personal data. This action cannot be undone.",
      confirmLabel: "Delete account",
      confirmationText: "DELETE",
      hideIcon: true,
      action: onDelete,
    });
  }
  async function disconnectSpotify() {
    onConfirm({
      title: "Disconnect Spotify?",
      description:
        "Your synced artists will be removed and concert suggestions will no longer use your Spotify taste until you reconnect.",
      confirmLabel: "Disconnect",
      hideIcon: true,
      action: async () => {
        await disconnectMySpotify();
        await onSpotifyChanged();
        setSpotify({ loading: false, connected: false, error: "" });
      },
    });
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
            error: "Spotify connection could not be loaded. Try again.",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="space-y-4">
      <ImportConcertsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={onImported}
      />
      <form
        onSubmit={submit}
        className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7"
      >
        <PanelHeading
          icon="fa-id-card"
          title="Public profile"
          description="This information helps friends recognise you."
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
                title="Change profile photo"
              >
                <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                <span className="sr-only">Choose profile photo</span>
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
                  title="Remove profile photo"
                  aria-label="Remove profile photo"
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
          Display name
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
            City
            <input
              value={form.city}
              onChange={field("city")}
              className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-400"
            />
          </label>
          <label className="text-xs font-bold text-zinc-400">
            Country
            <input
              value={form.country}
              onChange={field("country")}
              className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-400"
            />
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
          Allow other users to find me
        </label>
        {status && (
          <p className="mt-4 text-sm text-zinc-300" role="status">
            {status}
          </p>
        )}
        <button disabled={saving} className="adn-button-primary mt-6">
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-bell"
          title="Notifications"
          description="Choose where each type of update reaches you."
        />
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <div className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-600">
            <span>Updates</span>
            <span className="text-center">Web</span>
            <span className="text-center">Email</span>
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
                {label}
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
          {saving ? "Saving…" : "Save notification preferences"}
        </button>
      </section>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-palette"
          title="Appearance"
          description="Choose how your concert archive feels on this device."
        />
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Theme"
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
              <strong>Default</strong>
              <small>Compact panels and blue actions</small>
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
              <strong>Concert poster</strong>
              <small>Deeper blacks and bold white actions</small>
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
          {themeSaving ? "Saving…" : "Save appearance"}
        </button>
      </section>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#30343a] bg-[#111418]">
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
            <h2 className="text-base font-black uppercase tracking-[0.025em] text-zinc-100">
              Spotify
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Use your top artists to personalise concert suggestions.
            </p>
          </div>
        </div>
        {spotify.loading ? (
          <p className="text-sm text-zinc-400" role="status">
            Updating Spotify connection…
          </p>
        ) : spotify.connected ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-bold text-zinc-100">
                Connected as {spotify.displayName}
              </p>
              {spotify.needsReauthorization && (
                <p className="mt-2 text-sm font-semibold text-amber-300">
                  Spotify access expired. Reconnect to resume daily updates.
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
                  Reconnect
                </button>
              )}
              <button
                type="button"
                onClick={disconnectSpotify}
                className="adn-button-danger"
              >
                Disconnect
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
            Connect Spotify
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
      </section>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-shield-halved"
          title="Account and privacy"
          description="Control your credentials and personal data."
        />
        <div className="flex flex-wrap gap-3">
          <button onClick={onPassword} className="adn-button-secondary">
            <i className="fa-solid fa-key" aria-hidden="true" />
            Change password
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="adn-button-secondary"
          >
            <i className="fa-solid fa-file-import" aria-hidden="true" />
            Import concerts
          </button>
          <button onClick={onExport} className="adn-button-secondary">
            <i className="fa-solid fa-file-export" aria-hidden="true" />
            Export my data
          </button>
          <button onClick={onSignOut} className="adn-button-secondary">
            <i
              className="fa-solid fa-arrow-right-from-bracket"
              aria-hidden="true"
            />
            Sign out
          </button>
          <button
            onClick={removeAccount}
            className="adn-button-danger sm:ml-auto"
          >
            Delete my account
          </button>
        </div>
      </section>
      {isAdmin && (
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
          <PanelHeading
            icon="fa-user-shield"
            title="Administration"
            description="Manage users, data quality and platform operations."
          />
          <button onClick={onAdmin} className="adn-button-secondary">
            <i className="fa-solid fa-sliders" aria-hidden="true" />
            Open administration
          </button>
        </section>
      )}
    </div>
  );
}

const notificationPresentation = {
  friend_request: [
    "fa-user-plus",
    (item) => `${item.actorName} sent you a friend request`,
    "friends",
  ],
  friend_request_accepted: [
    "fa-user-check",
    (item) => `${item.actorName} accepted your friend request`,
    "friends",
  ],
  friend_request_declined: [
    "fa-user-xmark",
    (item) => `${item.actorName} declined your friend request`,
    "friends",
  ],
  concert_invitation: [
    "fa-ticket",
    (item) => `${item.actorName} invited you to a concert`,
    "friends",
  ],
  invitation_accepted: [
    "fa-circle-check",
    (item) => `${item.actorName} confirmed attendance`,
    "concert",
  ],
  invitation_declined: [
    "fa-circle-xmark",
    (item) => `${item.actorName} declined the invitation`,
    "concert",
  ],
  concert_changed: [
    "fa-calendar-pen",
    (item) => `${item.actorName || "The organiser"} updated a concert`,
    "concert",
  ],
  ticket_available: ["fa-ticket", () => "Tickets are now available", "concert"],
  ticket_link_changed: ["fa-link", () => "The ticket link changed", "concert"],
  selling_fast: [
    "fa-fire",
    () => "A suggested concert is selling fast",
    "suggestions",
  ],
  spotify_reconnect: [
    "fa-music",
    () => "Reconnect Spotify to keep suggestions current",
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
          title="Activity"
          description="Invitations, requests and shared concert updates."
        />
        {notifications.length ? (
          <div className="space-y-2">
            {notifications.map((item) => {
              const [icon, label, destination] = notificationPresentation[
                item.kind
              ] || ["fa-bell", () => "Account activity", "activity"];
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
                      {label(item)}
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
            title="No activity yet"
            description="New friend requests and concert invitations will appear here."
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
      {status}
    </span>
  );
}

export function AdminPage({ currentUserId, onChanged, onConfirm }) {
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
    else setError("User administration could not be loaded. Try again.");
    if (operationsResult.status === "fulfilled")
      setOperations(operationsResult.value);
    else setOperationsError("Operational telemetry could not be loaded.");
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
          title="Operations overview"
          description="Monitor accounts and access across A Deafening Noise."
        />
        <dl className="grid grid-cols-2 divide-x divide-y divide-zinc-800 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 sm:grid-cols-4 sm:divide-y-0">
          {metrics.map((metric) => (
            <div key={metric.label} className="p-4 first:border-0">
              <dt className="flex items-center gap-2 text-[11px] font-bold text-zinc-500">
                <i
                  className={`fa-solid ${metric.icon} text-blue-400`}
                  aria-hidden="true"
                />
                {metric.label}
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
          title="Discovery health"
          description="Daily scraper, suggestion and notification pipeline."
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
              Retry
            </button>
          </div>
        ) : loading ? (
          <div
            className="h-36 animate-pulse rounded-md bg-zinc-950"
            role="status"
            aria-label="Loading discovery health"
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
                    ? "Discovery completed normally"
                    : latestRun.status === "running"
                      ? "Discovery is running"
                      : "Discovery needs attention"}
                </p>
                {latestRun.error && (
                  <p className="mt-1 text-xs text-red-300">{latestRun.error}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-zinc-600">
                  Suggestions
                </p>
                <p className="mt-1 text-xl font-black text-zinc-100">
                  {latestRun.suggestionCount}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-zinc-600">
                  New matches
                </p>
                <p className="mt-1 text-xl font-black text-zinc-100">
                  {latestRun.newSuggestionCount}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-zinc-600">
                  Emails accepted
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
                        `${source.eventsFound} events · ${source.suggestionsFound} matches · ${sourceCounts.get(source.source) || 0} live`}
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
            title="No discovery run recorded yet"
            description="The next scheduled or manual GitHub Action will populate source health here."
          />
        )}
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
          <PanelHeading
            icon="fa-triangle-exclamation"
            title="Attention required"
            description="Operational issues that need a decision."
          />
          <div className="divide-y divide-zinc-800 border-y border-zinc-800">
            <div className="flex items-center justify-between gap-4 py-4">
              <span>
                <strong className="block text-sm text-zinc-100">
                  Spotify reconnections
                </strong>
                <span className="mt-1 block text-xs text-zinc-500">
                  Profiles whose daily artist refresh has expired.
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
                  Canonical duplicates
                </strong>
                <span className="mt-1 block text-xs text-zinc-500">
                  Same artist, venue and date stored more than once.
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
                Review duplicate groups
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
            title="Provider usage"
            description="Rolling 30-day operational footprint."
          />
          <dl className="divide-y divide-zinc-800 border-y border-zinc-800">
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm font-bold text-zinc-200">
                Supabase database
              </dt>
              <dd className="text-sm font-black text-zinc-100">
                {formatBytes(operations?.usage?.supabaseBytes)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm font-bold text-zinc-200">
                GitHub Actions
              </dt>
              <dd className="text-sm font-black text-zinc-100">
                {githubUsage == null ? "Not configured" : `${githubUsage} min`}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm font-bold text-zinc-200">Resend</dt>
              <dd className="text-right text-xs font-bold text-zinc-400">
                {providers?.resend?.error ? (
                  "Unavailable"
                ) : providers?.resend?.configured ? (
                  <>
                    <span className="text-emerald-300">
                      {providers.resend.delivered30Days} delivered
                    </span>{" "}
                    ·{" "}
                    <span
                      className={
                        providers.resend.bounced30Days
                          ? "text-red-300"
                          : "text-zinc-400"
                      }
                    >
                      {providers.resend.bounced30Days} bounced
                    </span>{" "}
                    · {providers.resend.failed30Days} failed
                  </>
                ) : (
                  "Not configured"
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm font-bold text-zinc-200">
                Netlify credits
              </dt>
              <dd className="text-xs font-bold text-zinc-500">
                Provider dashboard only
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
              Open latest GitHub run{" "}
              <i
                className="fa-solid fa-arrow-up-right-from-square"
                aria-hidden="true"
              />
            </a>
          )}
        </div>
      </section>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-database"
          title="Data quality"
          description="Find incomplete or ambiguous catalog records before they affect users."
        />
        {quality ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Possible duplicates", quality.possibleDuplicates, "fa-clone"],
              ["Artist label variants", quality.artistLabels, "fa-microphone"],
              ["Venue label variants", quality.venueLabels, "fa-building"],
              ["Missing locations", quality.missingLocation, "fa-location-dot"],
              ["Suspicious dates", quality.suspiciousDates, "fa-calendar-xmark"],
              ["Missing creators", quality.missingCreator, "fa-user-slash"],
              ["Missing past setlists", quality.missingSetlist, "fa-list-ol"],
              ["Missing artwork", quality.missingArtwork, "fa-image"],
              ["Links to recheck", quality.uncheckedLinks, "fa-link-slash"],
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
                  <span className="flex-1">{label}</span>
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
                          {item.artist || item.source || "Catalog item"}
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
            Data-quality telemetry is unavailable.
          </p>
        )}
      </section>
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-user-shield"
          title="User access"
          description="Search accounts, manage roles and suspend access."
          count={loading ? undefined : users.length}
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative">
            <span className="sr-only">Search users</span>
            <i
              className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs text-zinc-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, username or email"
              className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </label>
          <label>
            <span className="sr-only">Filter users by status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm font-bold text-zinc-200 sm:w-40"
            >
              <option value="all">All accounts</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
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
          <div className="space-y-3" role="status" aria-label="Loading users">
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
                          {user.displayName || user.username || "Unnamed user"}
                        </h3>
                        {isSelf && (
                          <span className="rounded-md border border-blue-900 bg-blue-950/50 px-1.5 py-0.5 text-[9px] font-black uppercase text-blue-300">
                            You
                          </span>
                        )}
                        {user.status === "blocked" && (
                          <span className="rounded-md border border-red-900 bg-red-950/50 px-1.5 py-0.5 text-[9px] font-black uppercase text-red-300">
                            Blocked
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {user.email}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-600">
                        {user.concertCount} concerts · Joined{" "}
                        {user.createdAt
                          ? adminDateFormat.format(new Date(user.createdAt))
                          : "Unknown"}{" "}
                        · Last seen{" "}
                        {user.lastSignInAt
                          ? adminDateFormat.format(new Date(user.lastSignInAt))
                          : "Never"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <label>
                      <span className="sr-only">
                        Role for {user.displayName}
                      </span>
                      <select
                        value={user.role}
                        disabled={isSelf || busy}
                        onChange={(event) => {
                          const role = event.target.value;
                          onConfirm({
                            title:
                              role === "admin"
                                ? "Make this user an administrator?"
                                : "Remove administrator access?",
                            description:
                              role === "admin"
                                ? `${user.displayName} will be able to manage every account.`
                                : `${user.displayName} will return to standard user access.`,
                            confirmLabel:
                              role === "admin" ? "Make admin" : "Remove access",
                            hideIcon: true,
                            action: () => update(user, { role }),
                          });
                        }}
                        className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-bold text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={isSelf || busy}
                      onClick={() =>
                        user.status === "active"
                          ? onConfirm({
                              title: "Block user?",
                              description: `${user.displayName} will immediately lose access until an administrator restores the account.`,
                              confirmLabel: "Block",
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
                        ? "Updating…"
                        : user.status === "active"
                          ? "Block"
                          : "Restore"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="fa-user-slash"
            title="No users found"
            description="Try another search or account filter."
          />
        )}
      </section>
    </div>
  );
}
