jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: jest.fn((spec) => spec),
}));
jest.mock('../../cores/raceSummaryCore', () => ({
  buildRaceSummaryData: jest.fn(),
  findRaceName: jest.fn(),
}));
jest.mock('../../azureStorageService', () => ({
  getLeagueData: jest.fn(),
  getLockedTeamsData: jest.fn(),
}));
jest.mock('../../leagueRegistryService', () => ({ listUserLeagues: jest.fn() }));
jest.mock('../../raceScheduleService', () => ({ fetchCurrentSeasonRaces: jest.fn() }));
jest.mock('../../services/raceSummaryService', () => ({
  generateRaceSummary: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));
jest.mock('../../utils/utils', () => ({
  sendErrorMessage: jest.fn().mockResolvedValue(),
  sendLogMessage: jest.fn().mockResolvedValue(),
}));
jest.mock('../cacheBootstrap', () => ({ ensureCacheReady: jest.fn() }));
jest.mock('../identity', () => ({ getAgentChatId: jest.fn() }));
jest.mock('../notifierBot', () => ({ getNotifierBot: jest.fn(() => ({ bot: true })) }));
jest.mock('../wrapToolExecute', () => ({
  wrapToolExecute: jest.fn((name, execute) => {
    execute.wrappedToolName = name;

    return execute;
  }),
}));

const { buildRaceSummaryData, findRaceName } = require('../../cores/raceSummaryCore');
const { getLeagueData, getLockedTeamsData } = require('../../azureStorageService');
const { listUserLeagues } = require('../../leagueRegistryService');
const { fetchCurrentSeasonRaces } = require('../../raceScheduleService');
const { generateRaceSummary } = require('../../services/raceSummaryService');
const { getFreshLanguagePreference } = require('../../services/setLanguageService');
const { sendErrorMessage, sendLogMessage } = require('../../utils/utils');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { getRaceSummaryTool } = require('./getRaceSummaryTool');

const leagueData = { leagueName: 'Alpha', teams: [{}] };
const lockedData = { matchdayId: 2, teams: [] };
const summaryData = {
  leagueName: 'Alpha',
  latestMatchday: 'matchday_2',
  raceNumber: 2,
  raceName: null,
  teams: [{}],
};

beforeEach(() => {
  jest.clearAllMocks();
  getAgentChatId.mockReturnValue(42);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'he' });
  listUserLeagues.mockResolvedValue([
    { leagueCode: 'ABC', leagueName: 'Alpha', registeredAt: 'private' },
    { leagueCode: 'XYZ', leagueName: '' },
  ]);
  getLeagueData.mockResolvedValue(leagueData);
  getLockedTeamsData.mockResolvedValue(lockedData);
  buildRaceSummaryData.mockReturnValue({ ...summaryData });
  fetchCurrentSeasonRaces.mockResolvedValue({ races: true });
  findRaceName.mockReturnValue('Chinese Grand Prix');
  generateRaceSummary.mockResolvedValue({
    text: '🏁 recap',
    truncated: false,
  });
});

test('is registered through wrapToolExecute', () => {
  expect(getRaceSummaryTool.execute.wrappedToolName).toBe('get_race_summary');
});

test.each([[['ABC']], [['ABC', 'XYZ']]])(
  'returns canonical clickable leagues when no code is supplied',
  async (codes) => {
    listUserLeagues.mockResolvedValue(
      codes.map((leagueCode) => ({ leagueCode, leagueName: `League ${leagueCode}` })),
    );

    await expect(getRaceSummaryTool.execute({})).resolves.toEqual({
      status: 'select_league',
      lang: 'he',
      leagues: codes.map((leagueCode) => ({
        leagueCode,
        leagueName: `League ${leagueCode}`,
      })),
    });
    expect(getLeagueData).not.toHaveBeenCalled();
  },
);

test('returns no-followed-leagues without storage reads', async () => {
  listUserLeagues.mockResolvedValue([]);

  await expect(getRaceSummaryTool.execute({})).resolves.toEqual({
    status: 'no_followed_leagues',
    lang: 'he',
    leagues: [],
  });
  expect(getLeagueData).not.toHaveBeenCalled();
});

test('authorizes the canonical code before reading league storage', async () => {
  await expect(
    getRaceSummaryTool.execute({ leagueCode: 'NOPE' }),
  ).resolves.toEqual({
    status: 'not_followed',
    lang: 'he',
    leagueCode: 'NOPE',
  });
  expect(getLeagueData).not.toHaveBeenCalled();
  expect(getLockedTeamsData).not.toHaveBeenCalled();
});

test.each([
  [null, { ...summaryData }],
  [leagueData, { ...summaryData, latestMatchday: null }],
  [leagueData, { ...summaryData, teams: [] }],
])('returns missing_data when source facts are incomplete', async (blob, built) => {
  getLeagueData.mockResolvedValue(blob);
  buildRaceSummaryData.mockReturnValue(built);

  await expect(
    getRaceSummaryTool.execute({ leagueCode: 'ABC' }),
  ).resolves.toMatchObject({ status: 'missing_data', lang: 'he' });
  expect(generateRaceSummary).not.toHaveBeenCalled();
});

test('generates with saved language, optional race name, and telemetry', async () => {
  const result = await getRaceSummaryTool.execute({ leagueCode: 'ABC' });

  expect(ensureCacheReady).toHaveBeenCalledTimes(1);
  expect(getLeagueData).toHaveBeenCalledWith('ABC');
  expect(getLockedTeamsData).toHaveBeenCalledWith('ABC');
  expect(findRaceName).toHaveBeenCalledWith({ races: true }, 2);
  expect(generateRaceSummary).toHaveBeenCalledWith(
    expect.objectContaining({
      summaryData: expect.objectContaining({ raceName: 'Chinese Grand Prix' }),
      language: 'he',
      onUsage: expect.any(Function),
      onError: expect.any(Function),
    }),
  );
  await generateRaceSummary.mock.calls[0][0].onUsage({ message: 'usage line' });
  expect(sendLogMessage).toHaveBeenCalledWith({ bot: true }, 'usage line');
  expect(result).toEqual({
    status: 'ok',
    lang: 'he',
    leagueCode: 'ABC',
    leagueName: 'Alpha',
    raceName: 'Chinese Grand Prix',
    raceNumber: 2,
    latestMatchday: 'matchday_2',
    truncated: false,
    summary: '🏁 recap',
  });
});

test('schedule failure does not prevent a valid recap', async () => {
  fetchCurrentSeasonRaces.mockRejectedValue(new Error('schedule private detail'));

  await expect(
    getRaceSummaryTool.execute({ leagueCode: 'ABC' }),
  ).resolves.toMatchObject({ status: 'ok', raceName: null });
  expect(generateRaceSummary).toHaveBeenCalled();
});

test('returns localized-safe empty and generation states without raw errors', async () => {
  generateRaceSummary.mockResolvedValueOnce({ text: '', truncated: false });
  const empty = await getRaceSummaryTool.execute({ leagueCode: 'ABC' });
  expect(empty).toEqual({
    status: 'empty',
    lang: 'he',
    leagueCode: 'ABC',
    leagueName: 'Alpha',
  });
  expect(sendErrorMessage).toHaveBeenCalled();

  generateRaceSummary.mockRejectedValueOnce(
    new Error('https://secret.blob.core.windows.net/?sig=private'),
  );
  const failed = await getRaceSummaryTool.execute({ leagueCode: 'ABC' });
  expect(failed).toEqual({
    status: 'generation_error',
    lang: 'he',
    leagueCode: 'ABC',
    leagueName: 'Alpha',
  });
  expect(JSON.stringify(failed)).not.toContain('secret');
  expect(JSON.stringify(failed)).not.toContain('sig=');
});

test('lets wrapToolExecute own storage errors', async () => {
  getLeagueData.mockRejectedValue(new Error('secret storage path'));

  await expect(
    getRaceSummaryTool.execute({ leagueCode: 'ABC' }),
  ).rejects.toThrow('secret storage path');
});
