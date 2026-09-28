import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FILTER_FIELDS, filterValue, matchesArchiveFilters } from '../lib/archive-filters';
import { normalize } from '../lib/concerts';
import { countryName } from '../lib/countries';
import { useI18n } from '../lib/i18n.jsx';
import { UserAvatar } from './SharedUi';

const labels = { artist: 'Artists', venue: 'Venues', country: 'Countries', city: 'Cities', year: 'Years', friends: 'Friends' };
const statsFields = ['country', 'city', 'friends'];

export default function ArchiveFilters({ concerts, friends, value, onChange, stats = false }) {
  const { t, locale } = useI18n();
  const ref = useRef(null);
  const [search, setSearch] = useState('');
  const fields = stats ? statsFields : FILTER_FIELDS;
  const selected = fields.flatMap((field) => (value[field] || []).map((id) => ({ field, id })));
  const label = (field, id) => field === 'country' ? countryName(id, locale) : field === 'city' ? id.slice(id.indexOf(':') + 1) : field === 'friends' ? friends.find((friend) => friend.id === id)?.displayName || t('Friend') : id;
  const options = useMemo(() => Object.fromEntries(fields.map((field) => {
    const eligible = concerts.filter((concert) => matchesArchiveFilters(concert, value, field));
    const ids = field === 'friends' ? friends.filter((friend) => eligible.some((concert) => concert.attendeeUsers?.some((person) => person.id === friend.id && person.status === 'confirmed'))).map((friend) => friend.id) : eligible.map((concert) => filterValue(concert, field)).filter((id) => id && (field !== 'city' || !id.endsWith(':')));
    return [field, [...new Set([...ids, ...(value[field] || [])])].sort((a, b) => field === 'year' ? Number(b) - Number(a) : label(field, a).localeCompare(label(field, b), locale))];
  })), [concerts, friends, value, stats, locale]);
  useEffect(() => {
    const close = (event) => {
      if (!ref.current?.open) return;
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && ref.current.contains(event.target)) return;
      ref.current.open = false;
      if (event.type === 'keydown') ref.current.querySelector('summary').focus();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, []);
  function toggle(field, id) {
    const ids = value[field] || [];
    const next = { ...value, [field]: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] };
    if (field === 'country' && next.country.length) next.city = (next.city || []).filter((city) => next.country.includes(city.split(':')[0]));
    onChange(next);
  }
  return <div className="order-2 min-w-0 flex-1 space-y-2">
    <details ref={ref} name="archive-filters" className="relative" onToggle={(event) => { if (!event.currentTarget.open) setSearch(''); }}>
      <summary className="ml-auto flex min-h-12 w-fit cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--adn-border-strong)] bg-[var(--adn-panel)] px-4 text-sm font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden"><i className="fa-solid fa-filter" aria-hidden="true" />{t('Filters')}{selected.length > 0 && <span className="rounded-md bg-blue-950 px-2 text-blue-300">{selected.length}</span>}<i className="fa-solid fa-chevron-down text-xs text-zinc-400" aria-hidden="true" /></summary>
      <div className="adn-popover absolute right-0 top-full z-30 mt-2 max-h-[65dvh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-xl border border-[var(--adn-border-strong)] bg-[var(--adn-card)] p-3 shadow-xl">
        <label className="mb-3 block"><span className="sr-only">{t('Search filters')}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search filters')} className="min-h-11 w-full rounded-md border border-zinc-700 bg-transparent px-3 text-base text-zinc-100" /></label>
        {value.friends?.length > 1 && <fieldset className="mb-3 border-b border-zinc-700 pb-3"><legend className="mb-2 text-sm font-bold text-zinc-100">{t('Attended with')}</legend><div className="flex gap-2">{['all', 'any'].map((mode) => <label key={mode} className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 text-sm text-zinc-300"><input type="radio" name="friend-filter-mode" checked={(value.friendMode || 'all') === mode} onChange={() => onChange({ ...value, friendMode: mode })} className="accent-blue-600" />{t(mode === 'all' ? 'With everyone' : 'With anyone')}</label>)}</div></fieldset>}
        {fields.map((field) => {
          const visible = options[field].filter((id) => normalize(label(field, id)).includes(normalize(search)));
          return visible.length > 0 && <fieldset key={field} className="mb-3 last:mb-0"><legend className="mb-1 text-xs font-bold uppercase text-zinc-400">{t(labels[field])}</legend><div className="max-h-44 overflow-y-auto">{visible.map((id) => <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-zinc-200 hover:bg-[var(--adn-card-hover)]"><input type="checkbox" checked={Boolean(value[field]?.includes(id))} onChange={() => toggle(field, id)} className="h-4 w-4 shrink-0 accent-blue-600" />{field === 'friends' && <UserAvatar person={friends.find((friend) => friend.id === id)} size="h-7 w-7" />}<span className="min-w-0 break-words">{label(field, id)}</span></label>)}</div></fieldset>;
        })}
        {!fields.some((field) => options[field].some((id) => normalize(label(field, id)).includes(normalize(search)))) && <p className="py-3 text-sm text-zinc-400">{t('No matching options.')}</p>}
      </div>
    </details>
    {selected.length > 0 && <div className="flex flex-wrap items-center justify-end gap-2" aria-label={t('Active filters')}>
      {value.friends?.length > 1 && <span className="text-xs text-zinc-400">{t(value.friendMode === 'any' ? 'With anyone' : 'With everyone')}</span>}
      {selected.map(({ field, id }) => <button key={`${field}:${id}`} type="button" onClick={() => toggle(field, id)} aria-label={t('Remove filter: {name}', { name: label(field, id) })} className="flex min-h-9 max-w-full items-center gap-2 rounded-md border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 hover:bg-[var(--adn-card-hover)]"><span className="truncate">{field === 'friends' ? t('With {name}', { name: label(field, id) }) : label(field, id)}</span><i className="fa-solid fa-xmark" aria-hidden="true" /></button>)}
      <button type="button" onClick={() => onChange({})} className="min-h-9 px-2 text-xs font-semibold text-zinc-300 underline underline-offset-4">{t('Clear filters')}</button>
    </div>}
    {selected.length > 0 && !concerts.some((concert) => matchesArchiveFilters(concert, value)) && <p role="status" className="text-right text-sm text-zinc-400">{t('No concerts match these filters.')}{value.friends?.length > 1 && value.friendMode !== 'any' && <button type="button" onClick={() => onChange({ ...value, friendMode: 'any' })} className="ml-2 min-h-11 text-blue-400 underline">{t('Try with anyone')}</button>}</p>}
  </div>;
}
