jest.mock('../azureStorageService', () => ({ getLeagueData: jest.fn(), getLockedTeamsData: jest.fn() }));
jest.mock('../leagueRegistryService', () => ({ listUserLeagues: jest.fn() }));
const storage = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { resolveScenarioAvailability } = require('./scenarioAvailability');
const { LIMITLESS_CHIP, EXTRA_BOOST_CHIP, WILDCARD_CHIP } = require('../constants');

const teamId = 'Owner_1_abc123';
const row = (overrides = {}) => ({ accountId: 'abc123', teamNo: 1, userName: 'Owner', teamName: 'Same name',
  chipUsageStatus: 'known', chipsUsed: [], ...overrides });
const blob = (teams, fetchedAt = new Date().toISOString()) => ({ teams, fetchedAt });
const read = (id = teamId) => resolveScenarioAvailability({ chatId: 42, teamId: id });
beforeEach(() => {
  jest.resetAllMocks();
  listUserLeagues.mockResolvedValue([{ leagueCode: 'A' }]);
  storage.getLeagueData.mockResolvedValue(blob([row()]));
  storage.getLockedTeamsData.mockResolvedValue(null);
});
function expectUnknown(result) {
  expect(result.chipAvailability.status).toBe('unknown');
  expect(result.chipScenarios).toEqual([{ chipKey: null, chipLabel: 'Without Chip' }]);
}
test('reuses fresh authorized lookup and maps the supported catalog in scenario order', async () => {
  const result = await read();
  expect(result.chipAvailability.status).toBe('known');
  expect(result.chipScenarios.map((scenario) => scenario.chipKey)).toEqual([null, LIMITLESS_CHIP, EXTRA_BOOST_CHIP, WILDCARD_CHIP]);
  expect(storage.getLockedTeamsData).toHaveBeenCalledWith('A', undefined, { latestByUpdate: true });
  expect(listUserLeagues).toHaveBeenCalledWith(42);
});
test.each([undefined, 'T1', 'Owner_1'])('missing, imported, screenshot or legacy identity %s cannot match a name', async (id) => {
  expectUnknown(await resolveScenarioAvailability({ chatId: 42, teamId: id, teamName: 'Same name' }));
  expect(listUserLeagues).not.toHaveBeenCalled();
});
test.each([
  { chipUsageStatus: undefined }, { chipUsageStatus: 'unknown' }, { chipsUsed: null },
  { chipsUsed: [{ name: 'Mystery' }] }, { accountId: null }, { accountId: 'other' },
])('unknown, legacy, malformed or different-account data stays unknown: %j', async (overrides) => {
  storage.getLeagueData.mockResolvedValue(blob([row(overrides)]));
  expectUnknown(await read());
});
test.each(['missing', 'old', 'newer unknown', 'conflict', 'invalid timestamp'])('%s records never recover stale known usage', async (kind) => {
  const current = new Date();
  const earlier = new Date(current.getTime() - 60000).toISOString();
  if (kind === 'missing') {storage.getLeagueData.mockResolvedValue(null);}
  if (kind === 'old') {storage.getLeagueData.mockResolvedValue(blob([row()], `${current.getUTCFullYear() - 1}-06-01T00:00:00Z`));}
  if (kind === 'invalid timestamp') {storage.getLeagueData.mockResolvedValue(blob([row()], 'bad'));}
  if (kind === 'newer unknown') {
    storage.getLeagueData.mockResolvedValue(blob([row({ chipUsageStatus: 'unknown' })], current.toISOString()));
    storage.getLockedTeamsData.mockResolvedValue(blob([row()], earlier));
  }
  if (kind === 'conflict') {
    storage.getLeagueData.mockResolvedValue(blob([row()], current.toISOString()));
    storage.getLockedTeamsData.mockResolvedValue(blob([row({ chipsUsed: [{ name: 'Wildcard' }] })], current.toISOString()));
  }
  expectUnknown(await read());
});
test.each(['standings', 'locked', 'league list', 'other league'])('failed %s read yields unknown even with another known source', async (source) => {
  if (source === 'league list') {listUserLeagues.mockRejectedValue(new Error('private details'));}
  if (source === 'standings') {storage.getLeagueData.mockRejectedValue(new Error('private details'));}
  if (source === 'locked') {storage.getLockedTeamsData.mockRejectedValue(new Error('private details'));}
  if (source === 'other league') {
    listUserLeagues.mockResolvedValue([{ leagueCode: 'A' }, { leagueCode: 'B' }]);
    storage.getLeagueData.mockImplementation(async (code) => { if (code === 'B') {throw new Error('private details');}

      return blob([row()]); });
  }
  const result = await read();
  expectUnknown(result);
  expect(JSON.stringify(result)).not.toContain('private');
});
test('a team outside followed leagues cannot use cached identity to bypass authorization', async () => {
  listUserLeagues.mockResolvedValue([]);
  expectUnknown(await read());
  expect(storage.getLeagueData).not.toHaveBeenCalled();
});
test('canonical account and number join across leagues and renamed owners; newest wins', async () => {
  listUserLeagues.mockResolvedValue([{ leagueCode: 'A' }, { leagueCode: 'B' }]);
  const now = new Date();
  storage.getLeagueData.mockImplementation(async (code) => blob([
    row({ userName: code === 'B' ? 'Renamed' : 'Owner', chipsUsed: code === 'B' ? [{ name: 'Extra DRS Boost' }, { name: 'Wildcard' }] : [] }),
    row({ accountId: 'other', chipsUsed: [{ name: 'Limitless' }] }),
    row({ teamNo: 2, chipsUsed: [{ name: 'Limitless' }] }),
  ], new Date(now.getTime() - (code === 'A' ? 60000 : 0)).toISOString()));
  expect((await read()).chipScenarios.map((scenario) => scenario.chipKey)).toEqual([null, LIMITLESS_CHIP]);
});
