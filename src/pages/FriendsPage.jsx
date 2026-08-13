import React, { useState } from "react";
import { EmptyState, PanelHeading } from "../components/SharedUi";

export default function FriendsPage({ friends, requests, invitations, onSearch, onSendRequest, onRespondRequest, onRequestRemoveFriend, onRespondInvitation }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitSearch(event) {
    event.preventDefault();
    if (search.trim().length < 2) return;
    setLoading(true);
    setError("");
    try { setResults(await onSearch(search.trim())); }
    catch (searchError) { setError(searchError.message || "Could not search users."); }
    finally { setLoading(false); }
  }

  async function act(action) {
    setError("");
    try {
      await action();
      if (search.trim().length >= 2) setResults(await onSearch(search.trim()));
    } catch (actionError) { setError(actionError.message || "Could not update friends."); }
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-3"><div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center"><strong className="block text-2xl text-zinc-100">{friends.length}</strong><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Friends</span></div><div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center"><strong className="block text-2xl text-zinc-100">{requests.filter((item) => item.direction === "incoming").length}</strong><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Requests</span></div><div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center"><strong className="block text-2xl text-zinc-100">{invitations.length}</strong><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Invites</span></div></div>
      {invitations.length > 0 && (
        <section className="rounded-3xl border border-amber-900/60 bg-gradient-to-br from-amber-950/30 to-zinc-950 p-5 md:p-7">
          <PanelHeading icon="fa-ticket" title="Concert invitations" description="Choose your ticket status to add the concert to your archive." />
          <div className="space-y-3">
            {invitations.map((invitation) => (
              <div key={invitation.concertId} className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="truncate font-black uppercase tracking-tight text-zinc-100">{invitation.artist}</p><p className="mt-1 text-sm text-zinc-500"><i className="fa-solid fa-location-dot mr-1.5 text-zinc-700" aria-hidden="true" />{invitation.venue || "Venue not specified"}</p><p className="mt-1 text-xs text-zinc-600">{invitation.date} · invited by <span className="text-zinc-400">{invitation.invitedBy}</span></p></div>
                <div className="grid grid-cols-2 gap-2 sm:flex"><button onClick={() => act(() => onRespondInvitation(invitation.concertId, true, true))} className="rounded-xl bg-emerald-200 px-4 py-2.5 text-xs font-black text-emerald-950 transition hover:bg-emerald-100">Bought</button><button onClick={() => act(() => onRespondInvitation(invitation.concertId, true, false))} className="rounded-xl bg-amber-200 px-4 py-2.5 text-xs font-black text-amber-950 transition hover:bg-amber-100">Not bought</button><button onClick={() => act(() => onRespondInvitation(invitation.concertId, false, false))} className="col-span-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-bold text-zinc-400 transition hover:border-red-900 hover:text-red-300">Decline</button></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading icon="fa-user-plus" title="Find people" description="Search by display name or username." />
        <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row"><div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 focus-within:border-zinc-500"><i className="fa-solid fa-magnifying-glass h-5 w-5 shrink-0 text-center text-zinc-500" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or username" className="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600" /></div><button disabled={loading || search.trim().length < 2} className="rounded-2xl bg-zinc-100 px-6 py-3 font-black text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Searching…" : "Search"}</button></form>
        {error && <p className="mt-4 rounded-2xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</p>}
        {results.length > 0 && <div className="mt-5 divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">{results.map((person) => <div key={person.id} className="flex items-center gap-3 px-4 py-3.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-xs font-black text-zinc-400">{person.displayName.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate font-bold text-zinc-100">{person.displayName}</p><p className="truncate text-xs text-zinc-600">@{person.username}</p></div>{person.relationship === "accepted" ? <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400"><i className="fa-solid fa-check" aria-hidden="true" />Friends</span> : person.relationship === "pending" ? <span className="text-xs font-bold text-zinc-500">Pending</span> : <button onClick={() => act(() => onSendRequest(person.id))} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-black text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900">Add</button>}</div>)}</div>}
      </section>

      {requests.filter((request) => request.direction === "incoming").length > 0 && <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7"><PanelHeading icon="fa-user-clock" title="Friend requests" description="Requests waiting for your response." /><div className="space-y-2">{requests.filter((request) => request.direction === "incoming").map((request) => <div key={request.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate font-bold">{request.displayName}</p><p className="truncate text-xs text-zinc-600">@{request.username}</p></div><div className="flex gap-2"><button onClick={() => act(() => onRespondRequest(request.id, true))} className="flex-1 rounded-xl bg-zinc-100 px-4 py-2 text-xs font-black text-zinc-950 transition hover:bg-white">Accept</button><button onClick={() => act(() => onRespondRequest(request.id, false))} className="flex-1 rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-400 transition hover:border-red-900 hover:text-red-300">Decline</button></div></div>)}</div></section>}
      {requests.some((request) => request.direction === "outgoing") && <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7"><PanelHeading icon="fa-paper-plane" title="Sent requests" description="Waiting for the other person to respond." /><div className="flex flex-wrap gap-2">{requests.filter((request) => request.direction === "outgoing").map((request) => <span key={request.id} className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">{request.displayName} · Pending</span>)}</div></section>}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7"><PanelHeading icon="fa-user-group" title="Your friends" description="Friends can be invited when adding or editing a concert." />{friends.length ? <div className="grid gap-3 sm:grid-cols-2">{friends.map((friend) => <div key={friend.id} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-sm font-black text-zinc-400">{friend.displayName.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate font-bold">{friend.displayName}</p><p className="truncate text-xs text-zinc-600">@{friend.username}</p></div><button onClick={() => onRequestRemoveFriend(friend)} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-700 transition hover:bg-red-950/40 hover:text-red-300" aria-label={`Remove ${friend.displayName}`}><i className="fa-solid fa-user-minus text-xs" aria-hidden="true" /></button></div>)}</div> : <EmptyState icon="fa-user-group" title="No friends yet" description="Use the search above to find people you know." />}</section>
    </div>
  );
}
