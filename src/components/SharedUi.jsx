import React from "react";

export function PanelHeading({ icon, title, description }) {
  return <div className="mb-5 flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-500"><i className={`fa-solid ${icon}`} aria-hidden="true" /></div><div><h2 className="text-lg font-black uppercase tracking-tight text-zinc-100">{title}</h2>{description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}</div></div>;
}

export function EmptyState({ icon = "fa-music", title, description }) {
  return <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-5 py-8 text-center"><i className={`fa-solid ${icon} mb-3 text-xl text-zinc-700`} aria-hidden="true" /><p className="text-sm font-bold text-zinc-400">{title}</p>{description && <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-600">{description}</p>}</div>;
}

export function UserAvatar({ person, size = "h-10 w-10" }) {
  const name = person?.displayName || "User";
  return person?.avatarUrl
    ? <img src={person.avatarUrl} alt="" className={`${size} shrink-0 rounded-full border border-zinc-700 object-cover`} />
    : <div aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-sm font-black text-zinc-300`}>{name.slice(0, 1).toUpperCase()}</div>;
}
