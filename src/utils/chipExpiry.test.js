const { resolveActiveChips, normalizeChipExpiryByTeam } = require('./chipExpiry');
const selectedAt = '2026-09-18T00:00:00.000Z';
const expiresAt = '2026-09-21T01:00:00.000Z';
const cutoff = Date.parse(expiresAt);

test.each([[cutoff - 1, true], [cutoff, false], [cutoff + 1, false]])(
  'resolves the expiry boundary at %s', (now, active) => {
    expect(resolveActiveChips({ T1: 'LIMITLESS' }, { T1: { selectedAt, expiresAt } }, now))
      .toEqual(active ? { T1: 'LIMITLESS' } : {});
  },
);

test.each([undefined, '{}', 'invalid JSON', { T1: {} }, { T1: { selectedAt, expiresAt: 'bad' } },
  { T1: { selectedAt: expiresAt, expiresAt: selectedAt } }])('legacy or invalid expiry is inactive: %j', (metadata) => {
  expect(resolveActiveChips({ T1: 'EXTRA_BOOST' }, metadata, cutoff - 1)).toEqual({});
});

test('resolves teams independently and round-trips durable timestamps', () => {
  const metadata = JSON.stringify({ T1: { selectedAt, expiresAt }, T2: {
    selectedAt, expiresAt: '2026-09-22T01:00:00.000Z', raceId: '2026:18',
  } });
  expect(resolveActiveChips({ T1: 'LIMITLESS', T2: 'WILDCARD' }, metadata, cutoff)).toEqual({ T2: 'WILDCARD' });
  expect(normalizeChipExpiryByTeam(metadata).T2.raceId).toBe('2026:18');
});

test('long-lived cache reads expire chips and hide dependent selections without mutation', () => {
  const cache = require('../cache');
  cache.userCache[95] = {
    selectedChipByTeam: { T1: 'LIMITLESS' },
    selectedChipExpiryByTeam: { T1: { selectedAt, expiresAt } },
    selectedBestTeamByTeam: { T1: { drivers: ['VER'], constructors: ['MCL'], boostDriver: 'VER' } },
  };
  const before = JSON.stringify(cache.userCache[95]);
  expect(cache.getActiveChip(95, 'T1', cutoff - 1)).toBe('LIMITLESS');
  const clock = jest.spyOn(Date, 'now').mockReturnValue(cutoff);
  try {
    expect(cache.getActiveChip(95, 'T1')).toBeUndefined();
    expect(cache.getSelectedBestTeam(95, 'T1')).toBeNull();
    expect(JSON.stringify(cache.userCache[95])).toBe(before);
  } finally {
    clock.mockRestore();
    delete cache.userCache[95];
  }
});
