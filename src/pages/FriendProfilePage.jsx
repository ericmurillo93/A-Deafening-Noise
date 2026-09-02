import React, { useEffect, useState } from "react";
import { addBucketListArtist, getFriendProfile, getMyBucketList, removeBucketListArtist } from "../lib/supabase";
import { EmptyState, PanelHeading, UserAvatar } from "../components/SharedUi";
import { useI18n } from "../lib/i18n.jsx";
import { countryName } from "../lib/countries";

function ConcertSummary({ title, icon, concert, tone }) {
  const { locale, t } = useI18n();
  if (concert === undefined) return null;
  return <section className="min-w-0 py-6 first:pt-0 last:pb-0 md:px-7 md:py-0 md:first:pl-0 md:last:pr-0">
    <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-zinc-500">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}><i className={`fa-solid ${icon}`} aria-hidden="true" /></span>
      {t(title)}
    </div>
    {concert ? <div className="mt-6 min-w-0">
      <h3 className="text-balance text-2xl font-black uppercase leading-tight text-zinc-100 md:text-3xl">{concert.artist}</h3>
      <p className="mt-4 truncate text-sm font-bold uppercase text-zinc-300">{concert.venue || t("Venue to be confirmed")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-500">
        {(concert.city || concert.country) && <span><i className="fa-solid fa-location-dot mr-2 text-zinc-600" aria-hidden="true" />{[concert.city, countryName(concert.country, locale)].filter(Boolean).join(", ")}</span>}
        <time className="font-bold tabular-nums text-zinc-300"><i className="fa-regular fa-calendar mr-2 text-zinc-600" aria-hidden="true" />{concert.date}</time>
      </div>
    </div> : <div className="mt-6 flex min-h-20 items-center gap-3 text-sm text-zinc-500"><i className="fa-solid fa-minus text-zinc-700" aria-hidden="true" />{t("No concert to show yet.")}</div>}
  </section>;
}

export function BucketListPanel() {
  const { t } = useI18n();
  const [artists, setArtists] = useState([]);
  const [artist, setArtist] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { getMyBucketList().then(setArtists).catch((reason) => setError(reason.message)); }, []);
  async function add(event) {
    event.preventDefault();
    if (!artist.trim()) return;
    setSaving(true); setError("");
    try { setArtists(await addBucketListArtist(artist)); setArtist(""); }
    catch { setError(t("We couldn’t add this artist. Try again.")); }
    finally { setSaving(false); }
  }
  async function remove(id) {
    setSaving(true); setError("");
    try { setArtists(await removeBucketListArtist(id)); }
    catch { setError(t("We couldn’t remove this artist. Try again.")); }
    finally { setSaving(false); }
  }
  return <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 md:p-7">
    <PanelHeading icon="fa-list-check" title={t("Bucket list")} description={t("Artists you want to see live someday.")} count={artists.length} />
    <form onSubmit={add} className="flex gap-2">
      <label className="sr-only" htmlFor="bucket-list-artist">{t("Artist")}</label>
      <input id="bucket-list-artist" value={artist} onChange={(event) => setArtist(event.target.value.toUpperCase())} maxLength="120" placeholder={t("Add an artist")} className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm text-zinc-100 outline-none" />
      <button disabled={saving || !artist.trim()} className="adn-button-primary px-4">{t("Add")}</button>
    </form>
    {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
    {artists.length ? <ul className="mt-5 divide-y divide-zinc-800 border-y border-zinc-800">
      {artists.map((item) => <li key={item.id} className="flex min-h-14 items-center gap-3 py-2">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${item.seen ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-700 text-transparent"}`} aria-label={t(item.seen ? "Seen live" : "Not seen live yet")}><i className="fa-solid fa-check text-[10px]" aria-hidden="true" /></span>
        <span className={`min-w-0 flex-1 truncate text-sm font-bold ${item.seen ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{item.artist}</span>
        {item.seen && <span className="text-[10px] font-black uppercase tracking-wide text-emerald-400">{t("Seen live")}</span>}
        <button type="button" disabled={saving} onClick={() => remove(item.id)} className="adn-icon-button h-10 min-h-10 w-10" aria-label={t("Remove {artist} from bucket list", { artist: item.artist })}><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
      </li>)}
    </ul> : <div className="mt-5"><EmptyState icon="fa-microphone-lines" title={t("Your bucket list is empty")} description={t("Add an artist you would love to see live.")} /></div>}
  </section>;
}

export default function FriendProfilePage({ friend }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true; setData(null); setError("");
    if (!friend?.id) return undefined;
    getFriendProfile(friend.id).then((value) => { if (active) setData(value); }).catch(() => { if (active) setError(t("We couldn’t open this profile. Try again.")); });
    return () => { active = false; };
  }, [friend?.id]);
  if (!friend) return <EmptyState icon="fa-user-lock" title={t("This profile isn’t available.")} description={t("Only friends can view this profile.")} />;
  if (error) return <EmptyState icon="fa-user-lock" title={t("This profile isn’t available.")} description={t("We couldn’t open this profile. Try again.")} />;
  if (!data) return <div className="h-56 animate-pulse rounded-3xl bg-zinc-900" role="status" aria-label={t("Opening profile")} />;
  const profile = data.profile;
  const visibleSections = [data.stats, data.lastConcert, data.nextConcert, data.bucketList].filter((value) => value !== undefined).length;
  return <div>
    <article className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
      <header className="flex flex-col gap-6 px-5 py-6 sm:flex-row sm:items-center md:px-8 md:py-8">
        <div className="rounded-full border border-zinc-700 bg-zinc-950 p-1.5 shadow-lg shadow-black/30"><UserAvatar person={profile} size="h-24 w-24 md:h-28 md:w-28" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-balance text-3xl font-black leading-none text-zinc-100 md:text-5xl">{profile.displayName}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-500"><span className="font-semibold">@{profile.username}</span>{(profile.city || profile.country) && <span className="text-zinc-300"><i className="fa-solid fa-location-dot mr-2 text-blue-400" aria-hidden="true" />{[profile.city, countryName(profile.country, locale)].filter(Boolean).join(", ")}</span>}</div>
        </div>
      </header>
      {data.stats && <dl className="grid grid-cols-2 border-y border-zinc-800 bg-zinc-950/40 md:grid-cols-4">{[["Concerts",data.stats.concerts,"fa-ticket"],["Artists",data.stats.artists,"fa-microphone-lines"],["Venues",data.stats.venues,"fa-location-dot"],["Countries",data.stats.countries,"fa-earth-europe"]].map(([label,value,icon], index) => <div key={label} className={`flex items-center gap-3 px-5 py-4 md:px-6 ${index % 2 ? "border-l border-zinc-800" : ""} ${index > 1 ? "border-t border-zinc-800 md:border-t-0" : ""} ${index > 0 ? "md:border-l md:border-zinc-800" : ""}`}><i className={`fa-solid ${icon} w-4 text-center text-blue-400`} aria-hidden="true" /><div className="flex items-baseline gap-2"><dd className="text-xl font-black tabular-nums text-zinc-100 md:text-2xl">{value}</dd><dt className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{t(label)}</dt></div></div>)}</dl>}
      {(data.lastConcert !== undefined || data.nextConcert !== undefined) && <div className="grid divide-y divide-zinc-800 px-5 md:grid-cols-2 md:divide-x md:divide-y-0 md:px-8 md:py-8"><ConcertSummary title="Last concert" icon="fa-clock-rotate-left" tone="bg-blue-950 text-blue-300" concert={data.lastConcert} /><ConcertSummary title="Next concert" icon="fa-calendar-day" tone="bg-emerald-950 text-emerald-300" concert={data.nextConcert} /></div>}
      {data.bucketList && <section className="border-t border-zinc-800">
      <div className="px-5 pt-6 md:px-8 md:pt-8"><PanelHeading icon="fa-list-check" title={t("Bucket list")} description={t("Artists {name} would like to see.", { name: profile.displayName })} count={data.bucketList.length} /></div>
      {data.bucketList.length ? <ul className="grid border-t border-zinc-800 sm:grid-cols-2">
        {data.bucketList.map((item, index) => <li key={item.id} className={`flex min-h-16 items-center gap-3 px-5 py-3 md:px-8 ${index ? "border-t border-zinc-800 sm:[&:nth-child(2)]:border-t-0" : ""} ${index % 2 ? "sm:border-l sm:border-zinc-800" : ""}`}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.seen ? "bg-emerald-950 text-emerald-200" : "bg-zinc-950 text-zinc-500"}`}><i className={`fa-solid ${item.seen ? "fa-check" : "fa-microphone"}`} aria-hidden="true" /></span>
          <span className={`min-w-0 flex-1 truncate text-sm font-bold ${item.seen ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{item.artist}</span>
          {item.seen && <span className="text-[10px] font-black uppercase text-emerald-400">{t("Seen")}</span>}
        </li>)}
      </ul> : <p className="px-5 pb-6 text-sm text-zinc-500 md:px-7 md:pb-8">{t("No artists added yet.")}</p>}
      </section>}
      {!visibleSections && <div className="border-t border-zinc-800 p-5 md:p-8"><EmptyState icon="fa-eye-slash" title={t("Nothing shared yet")} description={t("{name} has chosen to keep their concert details private.", { name: profile.displayName })} /></div>}
    </article>
  </div>;
}
