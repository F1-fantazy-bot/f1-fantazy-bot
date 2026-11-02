jest.mock('@copilotkit/runtime/v2', () => ({ defineTool: (tool) => tool }));
jest.mock('../../leagueRegistryService', () => ({ listUserLeagues: jest.fn().mockResolvedValue([{ leagueCode: 'A', leagueName: 'Friends' }]) }));
jest.mock('../../azureStorageService', () => ({ getLeagueData: jest.fn(), getLockedTeamsData: jest.fn(), listUserTeamData: jest.fn() }));
jest.mock('../../services/setLanguageService', () => ({ getFreshLanguagePreference: jest.fn().mockResolvedValue({ lang: 'he' }) }));
jest.mock('../identity', () => ({ getAgentChatId: () => 7 }));
jest.mock('../notifierBot', () => ({ getNotifierBot: () => ({ sendMessage: jest.fn() }) }));
jest.mock('../cacheBootstrap', () => ({ ensureCacheReady: jest.fn() }));
const storage = require('../../azureStorageService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAvailableChipsTool } = require('./getAvailableChipsTool');
beforeEach(() => jest.clearAllMocks());
test('scope labels use persisted Hebrew; tool accepts only public args and never bootstraps mutable caches', async () => {
  expect(await getAvailableChipsTool.execute({})).toMatchObject({ lang: 'he', choice: 'scope', options: [{ label: 'קבוצה אחת' }, { label: 'כל הקבוצות במעקב' }, { label: 'ליגה שלמה' }] });
  expect(ensureCacheReady).not.toHaveBeenCalled();
  expect(getAvailableChipsTool.parameters.safeParse({ chatId: 8 }).success).toBe(false);
});
test('reads fresh sources exactly once, returns null for newer unknown and never changes preferences', async () => {
  const team = { userName: 'Owner', teamName: 'Rocket', teamNo: 1, accountId: 'abc', chipsUsed: [], chipUsageStatus: 'known' };
  storage.getLeagueData.mockResolvedValue({ fetchedAt: new Date().toISOString(), teams: [team] });
  storage.getLockedTeamsData.mockResolvedValue(null);
  const result = await getAvailableChipsTool.execute({ leagueCode: 'A' });
  expect(result).toMatchObject({ status: 'ok', lang: 'he', teams: [{ teamName: 'Rocket', chipUsageStatus: 'known' }] });
  expect(storage.getLeagueData).toHaveBeenCalledTimes(1);
  expect(storage.getLockedTeamsData).toHaveBeenCalledTimes(1);
  expect(storage.getLockedTeamsData).toHaveBeenCalledWith('A', undefined, { latestByUpdate: true });
  expect(ensureCacheReady).not.toHaveBeenCalled();
});
test('follow registry errors use the shared safe error envelope', async () => {
  const { listUserLeagues } = require('../../leagueRegistryService');
  listUserLeagues.mockRejectedValueOnce(new Error('https://secret.invalid?sig=TOKEN'));
  const result = await getAvailableChipsTool.execute({ scope: 'league' });
  expect(result.status).toBe('tool_error');
  expect(JSON.stringify(result)).not.toMatch(/secret|TOKEN|sig=/);
});

test.each([
  { scope: null, teamId: null, teamName: null, leagueCode: null, leagueName: null },
  { teamId: 'undefined', teamName: 'undefined', leagueCode: 'undefined', leagueName: 'undefined' },
  { teamId: ' ', teamName: ' ', leagueCode: ' ', leagueName: ' ' },
])('missing provider targets reopen the localized scope picker without league/blob reads: %j', async (args) => {
  const { listUserLeagues } = require('../../leagueRegistryService');
  const result = await getAvailableChipsTool.execute(args);
  expect(result).toMatchObject({ status: 'selection_required', choice: 'scope', lang: 'he' });
  expect(result.options.map((option) => option.args.scope)).toEqual(['team', 'tracked', 'league']);
  expect(listUserLeagues).not.toHaveBeenCalled();
  expect(storage.getLeagueData).not.toHaveBeenCalled();
  expect(storage.getLockedTeamsData).not.toHaveBeenCalled();
});

test('nullable tool targets remain nullable in the schema sent to strict providers', async () => {
  const { zodSchema } = require('ai');
  const schema = await zodSchema(getAvailableChipsTool.parameters).jsonSchema;
  for (const field of ['scope', 'teamId', 'teamName', 'leagueCode', 'leagueName']) {
    expect(JSON.stringify(schema.properties[field])).toContain('"null"');
  }
});

test('a named team is resolved when unused provider fields contain placeholder strings', async () => {
  const team = { userName: 'Owner', teamName: 'Rocket', teamNo: 1, accountId: 'abc', chipsUsed: [], chipUsageStatus: 'known' };
  storage.getLeagueData.mockResolvedValue({ fetchedAt: new Date().toISOString(), teams: [team] });
  storage.getLockedTeamsData.mockResolvedValue(null);
  expect(await getAvailableChipsTool.execute({ scope: null, teamName: 'Rocket', teamId: 'undefined', leagueCode: 'undefined', leagueName: 'undefined' })).toMatchObject({ status: 'ok', scope: 'team', teams: [{ teamName: 'Rocket', chipUsageStatus: 'known' }] });
});
