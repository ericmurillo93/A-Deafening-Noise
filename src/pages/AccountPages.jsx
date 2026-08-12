import React, { useEffect, useState } from "react";
import spotifyIcon from "@fortawesome/fontawesome-free/svgs/brands/spotify.svg";
import { adminListUsers, adminUpdateUser, disconnectMySpotify, getMySpotifyStatus, syncMySpotifyArtists } from "../lib/supabase";
import { connectSpotify, finishSpotifyConnection } from "../lib/spotify";
import { EmptyState, PanelHeading, UserAvatar } from "../components/SharedUi";

export function ProfilePage({ profile, onSave, onExport, onDelete, onPassword }) {
  const [form, setForm] = useState({ displayName: "", avatarUrl: "", city: "", country: "", discoverable: true });
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [spotify, setSpotify] = useState({ loading: true, connected: false, error: "" });
  useEffect(() => setForm({ displayName: profile?.displayName || "", avatarUrl: profile?.avatarUrl || "", city: profile?.city || "", country: profile?.country || "", discoverable: profile?.discoverable !== false }), [profile]);
  const field = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setSaving(true); setStatus("");
    try { await onSave(form); setStatus("Profile saved."); } catch (error) { setStatus(error.message || "Could not save your profile."); } finally { setSaving(false); }
  }
  async function removeAccount() {
    if (window.prompt("Type DELETE to permanently delete your account and personal data.") !== "DELETE") return;
    await onDelete();
  }
  async function disconnectSpotify() {
    if (!window.confirm("Disconnect Spotify and remove your synced artists?")) return;
    setSpotify((current) => ({ ...current, loading: true, error: "" }));
    try { await disconnectMySpotify(); setSpotify({ loading: false, connected: false, error: "" }); }
    catch (error) { setSpotify((current) => ({ ...current, loading: false, error: error.message || "Spotify could not be disconnected." })); }
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = window.location.pathname === "/spotify/callback"
          ? await syncMySpotifyArtists(await finishSpotifyConnection())
          : await getMySpotifyStatus();
        if (window.location.pathname === "/spotify/callback") window.history.replaceState({ adnRoute: true, canGoBack: false }, "", "/profile");
        if (!cancelled) setSpotify({ loading: false, error: "", ...status });
      } catch (error) {
        if (window.location.pathname === "/spotify/callback") window.history.replaceState({ adnRoute: true, canGoBack: false }, "", "/profile");
        if (!cancelled) setSpotify({ loading: false, connected: false, error: error.message || "Spotify could not be connected." });
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return <div className="mx-auto max-w-3xl space-y-6">
    <form onSubmit={submit} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
      <PanelHeading icon="fa-id-card" title="Public profile" description="This information helps friends recognise you." />
      <div className="mb-6 flex items-center gap-4"><UserAvatar person={{ ...profile, ...form }} size="h-16 w-16" /><div><p className="font-bold text-zinc-100">{form.displayName || "Your name"}</p><p className="text-sm text-zinc-500">@{profile?.username}</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold text-zinc-400">Display name<input required maxLength="80" value={form.displayName} onChange={field("displayName")} className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-400" /></label>
        <label className="text-xs font-bold text-zinc-400">Avatar URL<input type="url" value={form.avatarUrl} onChange={field("avatarUrl")} placeholder="https://…" className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-400" /></label>
        <label className="text-xs font-bold text-zinc-400">City<input value={form.city} onChange={field("city")} className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-400" /></label>
        <label className="text-xs font-bold text-zinc-400">Country<input value={form.country} onChange={field("country")} className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-400" /></label>
      </div>
      <label className="mt-5 flex items-center gap-3 text-sm text-zinc-300"><input type="checkbox" checked={form.discoverable} onChange={(event) => setForm((current) => ({ ...current, discoverable: event.target.checked }))} className="h-4 w-4 accent-zinc-100" />Allow other users to find me</label>
      {status && <p className="mt-4 text-sm text-zinc-300" role="status">{status}</p>}
      <button disabled={saving} className="mt-6 rounded-2xl bg-zinc-100 px-5 py-3 text-sm font-black text-zinc-950 disabled:opacity-50">{saving ? "Saving…" : "Save profile"}</button>
    </form>
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
      <div className="mb-5 flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950"><img src={spotifyIcon} alt="" className="h-4 w-4 brightness-0 invert" /></div><div><h2 className="text-lg font-black uppercase tracking-tight text-zinc-100">Spotify</h2><p className="mt-1 text-sm text-zinc-500">Use your top artists to personalise concert suggestions.</p></div></div>
      {spotify.loading ? <p className="text-sm text-zinc-400" role="status">Updating Spotify connection…</p> : spotify.connected ? <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate font-bold text-zinc-100">Connected as {spotify.displayName}</p><p className="mt-1 text-sm text-zinc-500">{spotify.artistCount} top artists synced</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => connectSpotify().catch((error) => setSpotify((current) => ({ ...current, error: error.message })))} className="rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-200 hover:border-zinc-500">Refresh Spotify</button><button type="button" onClick={disconnectSpotify} className="rounded-2xl px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-950/30 hover:text-red-300">Disconnect</button></div></div> : <button type="button" onClick={() => connectSpotify().catch((error) => setSpotify((current) => ({ ...current, error: error.message })))} className="inline-flex items-center rounded-2xl bg-[#1ed760] px-5 py-3 text-sm font-black text-zinc-950 transition hover:bg-[#3be477] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1ed760]"><img src={spotifyIcon} alt="" className="mr-2 h-4 w-4" />Connect Spotify</button>}
      {spotify.error && <p className="mt-4 rounded-2xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-200" role="alert">{spotify.error}</p>}
    </section>
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7"><PanelHeading icon="fa-shield-halved" title="Account and privacy" description="Control your credentials and personal data." /><div className="grid gap-3 sm:grid-cols-2"><button onClick={onPassword} className="rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-200 hover:border-zinc-500">Change password</button><button onClick={onExport} className="rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-200 hover:border-zinc-500">Export my data</button></div><button onClick={removeAccount} className="mt-6 text-sm font-bold text-red-400 hover:text-red-300">Delete my account</button></section>
  </div>;
}

export function ActivityPage({ notifications, onRead, onOpenFriends }) {
  useEffect(() => { const unread = notifications.filter((item) => !item.readAt).map((item) => item.id); if (unread.length) onRead(unread); }, []);
  return <div className="mx-auto max-w-3xl"><section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7"><PanelHeading icon="fa-bell" title="Activity" description="Invitations, requests and shared concert updates." />{notifications.length ? <div className="space-y-2">{notifications.map((item) => <button key={item.id} onClick={onOpenFriends} className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition hover:border-zinc-600 ${item.readAt ? "border-zinc-800 bg-zinc-950/50" : "border-amber-900/60 bg-amber-950/20"}`}><i className={`fa-solid ${item.kind === "friend_request" ? "fa-user-plus" : "fa-ticket"} mt-1 w-5 text-center text-zinc-500`} aria-hidden="true" /><span><span className="block font-bold text-zinc-100">{item.kind === "friend_request" ? `${item.actorName} sent you a friend request` : item.kind === "invitation_accepted" ? `${item.actorName} confirmed attendance` : `${item.actorName} invited you to a concert`}</span>{item.artist && <span className="mt-1 block text-sm text-zinc-500">{item.artist} · {item.date}</span>}</span></button>)}</div> : <EmptyState icon="fa-bell" title="No activity yet" description="New friend requests and concert invitations will appear here." />}</section></div>;
}

export function AdminPage({ currentUserId, onChanged }) {
  const [users, setUsers] = useState([]); const [error, setError] = useState("");
  async function load() { try { setUsers(await adminListUsers()); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  async function update(user, changes) { try { await adminUpdateUser(user.id, changes.role || user.role, changes.status || user.status); await load(); onChanged(); } catch (e) { setError(e.message); } }
  return <div className="mx-auto max-w-5xl"><section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7"><PanelHeading icon="fa-user-shield" title="User administration" description="Manage roles and access without exposing private credentials." />{error && <p className="mb-4 text-sm text-red-300">{error}</p>}<div className="space-y-3">{users.map((user) => <div key={user.id} className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:grid-cols-[1fr_auto_auto] md:items-center"><div className="min-w-0"><p className="truncate font-bold">{user.displayName}</p><p className="truncate text-xs text-zinc-500">{user.email} · {user.concertCount} concerts</p></div><select aria-label={`Role for ${user.displayName}`} value={user.role} disabled={user.id === currentUserId} onChange={(e) => update(user, { role: e.target.value })} className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"><option value="user">User</option><option value="admin">Admin</option></select><button disabled={user.id === currentUserId} onClick={() => update(user, { status: user.status === "active" ? "blocked" : "active" })} className={`rounded-xl border px-4 py-2 text-xs font-black disabled:opacity-40 ${user.status === "active" ? "border-red-900 text-red-300" : "border-emerald-900 text-emerald-300"}`}>{user.status === "active" ? "Block" : "Restore"}</button></div>)}</div></section></div>;
}
