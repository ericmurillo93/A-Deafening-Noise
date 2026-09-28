import { normalize } from './concerts.js';

export const FILTER_FIELDS = ['artist', 'venue', 'country', 'city', 'year', 'friends'];
export const filterScope = (page) => ['stats', 'year-review'].includes(page) ? 'stats' : null;
export const filterValue = (concert, field) => field === 'year' ? String(concert.date || '').match(/\d{4}/)?.[0] || '' : field === 'city' ? `${concert.country || ''}:${concert.city || ''}` : concert[field] || '';

export function matchesArchiveFilters(concert, filters = {}, except) {
  return FILTER_FIELDS.every((field) => {
    const selected = filters[field] || [];
    if (field === except || !selected.length) return true;
    if (field === 'friends') {
      const attended = (id) => concert.attendeeUsers?.some((person) => person.id === id && person.status === 'confirmed');
      return filters.friendMode === 'any' ? selected.some(attended) : selected.every(attended);
    }
    return selected.some((value) => normalize(value) === normalize(filterValue(concert, field)));
  });
}

export function readArchiveFilters(search) {
  const params = new URLSearchParams(search);
  const filters = Object.fromEntries(FILTER_FIELDS.map((field) => [field, [...new Set(params.getAll(`filter_${field}`))].filter(Boolean)]));
  return { ...filters, friendMode: params.get('with') === 'any' ? 'any' : 'all' };
}

export function withArchiveFilters(path, filters = {}) {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  for (const field of FILTER_FIELDS) {
    params.delete(`filter_${field}`);
    for (const value of filters[field] || []) params.append(`filter_${field}`, value);
  }
  params.delete('with');
  if (filters.friends?.length && filters.friendMode === 'any') params.set('with', 'any');
  return pathname + (params.size ? `?${params}` : '');
}
