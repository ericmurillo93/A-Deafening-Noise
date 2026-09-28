import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesArchiveFilters, readArchiveFilters, withArchiveFilters } from '../src/lib/archive-filters.js';

test('archive facets combine categories, separate same-named cities and require confirmed companions', () => {
  const concert = { artist: 'ARTIST', venue: 'VENUE', country: 'ES', city: 'Barcelona', date: '12/02/2024', attendeeUsers: [{ id: 'papa', status: 'confirmed' }, { id: 'saray', status: 'pending' }] };
  assert.ok(matchesArchiveFilters(concert, { artist: ['OTHER', 'ARTIST'], country: ['ES'], year: ['2024'] }));
  assert.equal(matchesArchiveFilters(concert, { artist: ['ARTIST'], country: ['CH'] }), false);
  assert.equal(matchesArchiveFilters(concert, { city: ['CH:Barcelona'] }), false);
  assert.equal(matchesArchiveFilters(concert, { friends: ['papa', 'saray'] }), false);
  assert.ok(matchesArchiveFilters(concert, { friends: ['papa', 'saray'], friendMode: 'any' }));
  assert.equal(matchesArchiveFilters(concert, { friends: ['saray'], friendMode: 'any' }), false);
  assert.ok(matchesArchiveFilters(concert, { country: ['CH'] }, 'country'));
  const filters = readArchiveFilters('?filter_country=ES&filter_country=ES&filter_city=ES%3ABarcelona&filter_friends=papa&with=any');
  assert.deepEqual(readArchiveFilters(withArchiveFilters('/stats', filters).split('?')[1]), filters);
  assert.equal(withArchiveFilters('/stats?filter_country=ES', {}), '/stats');
});
