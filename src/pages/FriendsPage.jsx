import React, { useEffect, useState } from "react";
import { EmptyState, PanelHeading, UserAvatar } from "../components/SharedUi";
import { getMyStatsShares, setStatsSharing } from "../lib/supabase";
import { useI18n } from "../lib/i18n.jsx";

export default function FriendsPage({
  friends,
  requests,
  invitations,
  onSearch,
  onSendRequest,
  onRespondRequest,
  onRequestRemoveFriend,
  onSetInvitationStatus,
  onOpenProfile,
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statsShares, setStatsShares] = useState([]);
  useEffect(() => {
    getMyStatsShares()
      .then(setStatsShares)
      .catch(() => {});
  }, []);

  async function submitSearch(event) {
    event.preventDefault();
    if (search.trim().length < 2) return;
    setLoading(true);
    setError("");
    try {
      setResults(await onSearch(search.trim()));
    } catch {
      setError(t("We couldn’t search for people. Try again."));
    } finally {
      setLoading(false);
    }
  }

  async function act(action) {
    setError("");
    try {
      await action();
      if (search.trim().length >= 2) setResults(await onSearch(search.trim()));
    } catch {
      setError(t("We couldn’t update your friends. Try again."));
    }
  }
  async function toggleStats(friend) {
    const enabled =
      statsShares.find((share) => share.userId === friend.id)?.sharedByMe ===
      true;
    await act(async () => {
      await setStatsSharing(friend.id, !enabled);
      setStatsShares(await getMyStatsShares());
    });
  }

  return (
    <div className="space-y-4">
      {invitations.length > 0 && (
        <section className="rounded-3xl border border-amber-900/60 bg-zinc-900 p-5 md:p-6">
          <PanelHeading
            icon="fa-ticket"
            title={t("Concert invitations")}
            description={t("Choose whether you’re going and whether you already have a ticket.")}
            count={invitations.length}
          />
          <div className="space-y-3">
            {invitations.map((invitation) => (
              <div
                key={invitation.concertId}
                className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-black uppercase tracking-tight text-zinc-100">
                    {invitation.artist}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    <i
                      className="fa-solid fa-location-dot mr-1.5 text-zinc-700"
                      aria-hidden="true"
                    />
                    {invitation.venue || "Venue to be confirmed"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {invitation.date} · invited by{" "}
                    <span className="text-zinc-400">
                      {invitation.invitedBy}
                    </span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button
                    disabled={invitation.status === "interested"}
                    onClick={() =>
                      act(() =>
                        onSetInvitationStatus(
                          invitation.concertId,
                          "interested",
                          false,
                        ),
                      )
                    }
                    className="adn-button-secondary col-span-2 disabled:cursor-default disabled:opacity-60"
                  >
                    {invitation.status === "interested"
                      ? "Interested"
                      : "I'm interested"}
                  </button>
                  <button
                    onClick={() =>
                      act(() =>
                        onSetInvitationStatus(
                          invitation.concertId,
                          "confirmed",
                          true,
                        ),
                      )
                    }
                    className="adn-button-success"
                  >
                    Going · ticket bought
                  </button>
                  <button
                    onClick={() =>
                      act(() =>
                        onSetInvitationStatus(
                          invitation.concertId,
                          "confirmed",
                          false,
                        ),
                      )
                    }
                    className="adn-button-warning"
                  >
                    Going · no ticket yet
                  </button>
                  <button
                    onClick={() =>
                      act(() =>
                        onSetInvitationStatus(
                          invitation.concertId,
                          "declined",
                          false,
                        ),
                      )
                    }
                    className="adn-button-danger col-span-2"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-user-plus"
          title={t("Find people")}
          description={t("Search by display name or username.")}
        />
        <form
          onSubmit={submitSearch}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div className="adn-search-field flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3">
            <i
              className="fa-solid fa-magnifying-glass h-5 w-5 shrink-0 text-center text-zinc-500"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("Name or username")}
              className="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </div>
          <button
            disabled={loading || search.trim().length < 2}
            className="adn-button-primary"
          >
            {loading ? t("Searching…") : t("Search")}
          </button>
        </form>
        {error && (
          <p className="mt-4 rounded-2xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {results.length > 0 && (
          <div className="mt-5 divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            {results.map((person) => (
              <div
                key={person.id}
                className="flex items-center gap-3 px-4 py-3.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-xs font-black text-zinc-400">
                  {person.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  {person.relationship === "accepted" ? <button type="button" onClick={() => onOpenProfile(person)} className="block max-w-full truncate text-left font-bold text-zinc-100 hover:text-blue-400">{person.displayName}</button> : <p className="truncate font-bold text-zinc-100">{person.displayName}</p>}
                  <p className="truncate text-xs text-zinc-600">
                    @{person.username}
                  </p>
                </div>
                {person.relationship === "accepted" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <i className="fa-solid fa-check" aria-hidden="true" />
                    {t("Friends")}
                  </span>
                ) : person.relationship === "pending" ? (
                  <span className="text-xs font-bold text-zinc-500">
                    {t("Pending")}
                  </span>
                ) : (
                  <button
                    onClick={() => act(() => onSendRequest(person.id))}
                    className="adn-button-secondary px-4"
                  >
                    {t("Add friend")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {requests.filter((request) => request.direction === "incoming").length >
        0 && (
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
          <PanelHeading
            icon="fa-user-clock"
            title={t("Friend requests")}
            description={t("Requests waiting for your response.")}
            count={
              requests.filter((request) => request.direction === "incoming")
                .length
            }
          />
          <div className="space-y-2">
            {requests
              .filter((request) => request.direction === "incoming")
              .map((request) => (
                <div
                  key={request.id}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{request.displayName}</p>
                    <p className="truncate text-xs text-zinc-600">
                      @{request.username}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        act(() => onRespondRequest(request.id, true))
                      }
                      className="adn-button-primary flex-1"
                    >
                      {t("Accept")}
                    </button>
                    <button
                      onClick={() =>
                        act(() => onRespondRequest(request.id, false))
                      }
                      className="adn-button-danger flex-1"
                    >
                      {t("Decline")}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}
      {requests.some((request) => request.direction === "outgoing") && (
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
          <PanelHeading
            icon="fa-paper-plane"
            title={t("Sent requests")}
            description={t("Waiting for the other person to respond.")}
          />
          <div className="flex flex-wrap gap-2">
            {requests
              .filter((request) => request.direction === "outgoing")
              .map((request) => (
                <span
                  key={request.id}
                  className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-400"
                >
                  {request.displayName} · Pending
                </span>
              ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
        <PanelHeading
          icon="fa-user-group"
          title={t("Your friends")}
          description={t("Friends can be invited when adding or editing a concert.")}
          count={friends.length}
        />
        {friends.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4"
              >
                <button type="button" onClick={() => onOpenProfile(friend)} className="shrink-0 rounded-full" aria-label={t("Open {name}'s profile", { name: friend.displayName })}><UserAvatar person={friend} /></button>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => onOpenProfile(friend)} className="block max-w-full truncate text-left font-bold text-zinc-100 hover:text-blue-400">{friend.displayName}</button>
                  <p className="truncate text-xs text-zinc-600">
                    @{friend.username}
                  </p>
                  <button type="button" onClick={() => toggleStats(friend)} className="mt-1 text-left text-[10px] font-bold text-blue-400 hover:text-blue-300">
                    {t(statsShares.find((share) => share.userId === friend.id)?.sharedByMe ? "Stop sharing my stats" : "Share my stats")}
                  </button>
                  {statsShares.find((share) => share.userId === friend.id)?.sharedWithMe && <span className="ml-2 text-[10px] font-bold text-emerald-400">{t("Shares stats with you")}</span>}
                </div>
                <button
                  onClick={() => onRequestRemoveFriend(friend)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-700 transition hover:bg-red-950/40 hover:text-red-300"
                  aria-label={t("Remove {name}", { name: friend.displayName })}
                >
                  <i
                    className="fa-solid fa-user-minus text-xs"
                    aria-hidden="true"
                  />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="fa-user-group"
            title={t("No friends yet")}
            description={t("Use the search above to find people you know.")}
          />
        )}
      </section>
    </div>
  );
}
