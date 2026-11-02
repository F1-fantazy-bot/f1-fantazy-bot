const { CHIP_CATALOG, chipRecord, remainingChips, getAvailableChips } = require('./availableChipsCore');
const { buildLeagueTeamId } = require('../utils/teamId');
const now = new Date('2026-11-02T12:00:00Z');
const row = (overrides = {}) => ({ userName: 'Same owner', teamName: 'Rocket', teamNo: 1, accountId: 'abc123', chipUsageStatus: 'known', chipsUsed: [], ...overrides });
const blob = (teams, fetchedAt = '2026-10-30T12:00:00Z') => ({ fetchedAt, teams });
function setup({ leagues = [{ leagueCode: 'A', leagueName: 'Friends' }], standings = { A: blob([row()]) }, locked = {}, tracked = {} } = {}) {
  const ports = {
    listUserLeagues: jest.fn().mockResolvedValue(leagues),
    getLeagueData: jest.fn(async (code) => { if (standings[code] instanceof Error) {throw standings[code];}

 return standings[code] || null; }),
    getLockedTeamsData: jest.fn(async (code) => { if (locked[code] instanceof Error) {throw locked[code];}

 return locked[code] || null; }),
    listTrackedTeams: jest.fn().mockResolvedValue(tracked),
  };

  return { ports, read: (args = {}) => getAvailableChips({ chatId: 7, now, ports, ...args }) };
}
test('no target opens exactly three scopes without reading any user data', async () => {
  const { read, ports } = setup();
  expect((await read()).options.map((option) => option.args.scope)).toEqual(['team', 'tracked', 'league']);
  expect(ports.listUserLeagues).not.toHaveBeenCalled();
});
test('manual team flow auto-selects the only league then shows its teams', async () => {
  const { read } = setup();
  expect(await read({ scope: 'team' })).toMatchObject({ status: 'selection_required', choice: 'team', options: [{ label: 'Rocket', args: { scope: 'team', leagueCode: 'A' } }] });
});
test('manual team and league flows require a choice with several leagues', async () => {
  const { read, ports } = setup({ leagues: [{ leagueCode: 'A' }, { leagueCode: 'B' }] });
  for (const scope of ['team', 'league']) {expect(await read({ scope })).toMatchObject({ choice: 'league', options: [{ args: { scope, leagueCode: 'A' } }, { args: { scope, leagueCode: 'B' } }] });}
  expect(ports.getLeagueData).not.toHaveBeenCalled();
});
test('explicit team names resolve untracked teams in followed leagues, exact case-insensitive first', async () => {
  const { read } = setup({ standings: { A: blob([row(), row({ accountId: 'def', teamName: 'Rocket 2' })]) } });
  expect(await read({ teamName: 'rOcKeT' })).toMatchObject({ status: 'ok', scope: 'team', teams: [{ teamName: 'Rocket', availableChips: CHIP_CATALOG }] });
});
test('never guesses among duplicate names/accounts; canonical ID selects exactly one account/team', async () => {
  const first = row(); const other = row({ accountId: 'def' }); const third = row({ teamNo: 2 });
  const { read } = setup({ standings: { A: blob([first, other, third]) } });
  expect((await read({ teamName: 'Rocket' })).options).toHaveLength(3);
  expect((await read({ teamId: buildLeagueTeamId(other.userName, 1, 'def') })).teams).toHaveLength(1);
});
test('league names prefer exact matches and ambiguous names produce choices without blob reads', async () => {
  const { read, ports } = setup({ leagues: [{ leagueCode: 'A', leagueName: 'Friends' }, { leagueCode: 'B', leagueName: 'Friends II' }] });
  expect((await read({ leagueName: 'friend' })).options).toHaveLength(2);
  expect(ports.getLeagueData).not.toHaveBeenCalled();
  expect((await read({ leagueName: 'FRIENDS' })).teams).toHaveLength(1);
});
test('unauthorized codes never reach blob storage', async () => {
  const { read, ports } = setup();
  expect(await read({ leagueCode: '../private' })).toEqual({ status: 'not_followed' });
  expect(ports.getLeagueData).not.toHaveBeenCalled();
  expect(ports.getLockedTeamsData).not.toHaveBeenCalled();
});
test('latest snapshot matches only canonical identity, even if names change', async () => {
  const { read } = setup({ locked: { A: blob([row({ teamName: 'Renamed', chipsUsed: [{ name: 'Auto Pilot', gameDayId: null }, { name: 'Extra Boost' }, { name: 'Extra DRS Boost' }] }), row({ accountId: 'someoneelse', chipsUsed: CHIP_CATALOG.map((name) => ({ name })) })], '2026-11-01T12:00:00Z') } });
  expect((await read({ leagueCode: 'A' })).teams[0]).toMatchObject({ teamName: 'Rocket', availableChips: ['Wildcard', 'Limitless', 'Final Fix', 'No Negative'], updatedAt: '2026-11-01T12:00:00.000Z' });
});
test('newest timestamp wins over source type or matchday ordering; newer unknown cannot fall back', async () => {
  const { read } = setup({ standings: { A: blob([row({ chipUsageStatus: 'unknown' })], '2026-11-02T10:00:00Z') }, locked: { A: blob([row()], '2026-11-01T10:00:00Z') } });
  expect((await read({ leagueCode: 'A' })).teams[0]).toMatchObject({ availableChips: null, updatedAt: '2026-11-02T10:00:00.000Z' });
});
test.each([
  { chipUsageStatus: undefined }, { chipsUsed: null }, { chipsUsed: {} }, { chipsUsed: [null] }, { chipsUsed: [{ name: 'New mystery chip' }] },
])('legacy/malformed lists remain unknown: %j', async (override) => {
  const { read } = setup({ standings: { A: blob([row(override)]) } });
  expect((await read({ leagueCode: 'A' })).teams[0].availableChips).toBeNull();
});
test.each(['2025-12-31T23:59:59Z', '2027-01-01T00:00:00Z', 'bad', null])('data outside current season or without timestamp is unknown: %s', (fetchedAt) => {
  expect(remainingChips([chipRecord(row(), { fetchedAt }, now)]).availableChips).toBeNull();
});
test('season boundary is UTC calendar year and complete usage produces []', () => {
  expect(remainingChips([chipRecord(row(), { fetchedAt: '2026-01-01T00:00:00Z' }, now)]).availableChips).toEqual(CHIP_CATALOG);
  expect(remainingChips([chipRecord(row({ chipsUsed: CHIP_CATALOG.map((name) => ({ name, gameDayId: null })) }), { fetchedAt: now.toISOString() }, now)]).availableChips).toEqual([]);
});
test('equally dated conflicting records produce unknown; duplicate aliases do not conflict', () => {
  const record = (chipsUsed) => chipRecord(row({ chipsUsed }), { fetchedAt: now.toISOString() }, now);
  expect(remainingChips([record([]), record([{ name: 'Wildcard' }])]).availableChips).toBeNull();
  expect(remainingChips([record([{ name: 'Auto Pilot' }, { name: 'Autopilot' }]), record([{ name: 'Autopilot' }])]).availableChips).not.toContain('Autopilot');
});
test('tracked scope deduplicates across leagues and retains unavailable and legacy tracked teams', async () => {
  const id = buildLeagueTeamId('Same owner', 1, 'abc123');
  const { read, ports } = setup({ leagues: [{ leagueCode: 'A' }, { leagueCode: 'B' }], standings: { A: blob([row()]), B: blob([row({ userName: 'New owner name', chipsUsed: [{ name: 'Wildcard' }] })], '2026-11-01T12:00:00Z') }, tracked: {
    [id]: { teamName: 'Rocket', source: 'league' },
    [buildLeagueTeamId('New owner name', 1, 'abc123')]: { source: 'league' },
    [buildLeagueTeamId('Gone', 1, 'gone')]: { teamName: 'Gone', source: 'league' },
    Legacy_1: { teamName: 'Legacy' }, T1: { source: 'screenshot' },
  } });
  const result = await read({ scope: 'tracked' });
  expect(result.teams).toHaveLength(3);
  expect(result.teams[0].availableChips).not.toContain('Wildcard');
  expect(result.teams.slice(1).map((team) => team.availableChips)).toEqual([null, null]);
  expect(ports.getLeagueData.mock.calls).toEqual([['A'], ['B']]);
  expect(ports.getLockedTeamsData.mock.calls).toEqual([['A'], ['B']]);
});
test('missing standings cannot establish membership from snapshots alone, or by names alone', async () => {
  const { read } = setup({ standings: {}, locked: { A: blob([row()]) } });
  expect(await read({ leagueCode: 'A' })).toMatchObject({ status: 'unavailable', teams: [] });
  const legacy = setup({ standings: { A: blob([row({ accountId: null })]) }, locked: { A: blob([row()], '2026-11-01T12:00:00Z') } });
  expect((await legacy.read({ leagueCode: 'A' })).teams[0].availableChips).toBeNull();
});
test('partial source failures preserve other teams and never expose provider messages', async () => {
  const { read } = setup({ leagues: [{ leagueCode: 'A' }, { leagueCode: 'B' }], standings: { A: blob([row()]), B: new Error('secret-url') }, locked: { A: new Error('secret-token') }, tracked: { Same_1_abc123: { source: 'league' }, Gone_1_gone: { source: 'league' } } });
  const result = await read({ scope: 'tracked' });
  expect(result).toMatchObject({ status: 'ok', partial: true, teams: [{ availableChips: CHIP_CATALOG }, { availableChips: null }] });
  expect(JSON.stringify(result)).not.toContain('secret');
});
