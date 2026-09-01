jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: jest.fn((spec) => spec),
}));
jest.mock('../../cache', () => ({ getSelectedTeam: jest.fn() }));
jest.mock('../../cores/leagueGraphsCore', () => ({
  buildLeagueGraphSeries: jest.fn(),
  buildRoundToRaceNameMap: jest.fn(),
}));
jest.mock('../../azureStorageService', () => ({ getLeagueData: jest.fn() }));
jest.mock('../../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));
jest.mock('../../raceScheduleService', () => ({
  fetchCurrentSeasonRaces: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));
jest.mock('../../services/selectTeamService', () => ({
  getFreshSelectedTeamPreference: jest.fn(),
}));
jest.mock('../cacheBootstrap', () => ({ ensureCacheReady: jest.fn() }));
jest.mock('../identity', () => ({ getAgentChatId: jest.fn() }));
jest.mock('../wrapToolExecute', () => ({
  wrapToolExecute: jest.fn((name, execute) => {
    execute.wrappedToolName = name;

    return execute;
  }),
}));

const { getSelectedTeam } = require('../../cache');
const {
  buildLeagueGraphSeries,
  buildRoundToRaceNameMap,
} = require('../../cores/leagueGraphsCore');
const { getLeagueData } = require('../../azureStorageService');
const { listUserLeagues } = require('../../leagueRegistryService');
const { fetchCurrentSeasonRaces } = require('../../raceScheduleService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  getFreshSelectedTeamPreference,
} = require('../../services/selectTeamService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { getLeagueGraphTool } = require('./getLeagueGraphTool');

beforeEach(() => {
  jest.clearAllMocks();
  getAgentChatId.mockReturnValue(42);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'he' });
  listUserLeagues.mockResolvedValue([
    { leagueCode: 'ABC', leagueName: 'Alpha' },
    { leagueCode: 'XYZ', leagueName: '' },
  ]);
  getFreshSelectedTeamPreference.mockResolvedValue({});
  getSelectedTeam.mockReturnValue('owner_1');
  fetchCurrentSeasonRaces.mockResolvedValue({ schedule: true });
  buildRoundToRaceNameMap.mockReturnValue({ 1: 'Bahrain GP' });
});

test('is registered through wrapToolExecute', () => {
  expect(getLeagueGraphTool.execute.wrappedToolName).toBe('get_league_graph');
});

test('returns canonical league cards and preserves a requested type', async () => {
  await expect(
    getLeagueGraphTool.execute({ graphType: 'budget' }),
  ).resolves.toEqual({
    status: 'select_league',
    lang: 'he',
    graphType: 'budget',
    leagues: [
      { leagueCode: 'ABC', leagueName: 'Alpha' },
      { leagueCode: 'XYZ', leagueName: 'XYZ' },
    ],
  });
  expect(getLeagueData).not.toHaveBeenCalled();
});

test('returns an empty state when the user follows no leagues', async () => {
  listUserLeagues.mockResolvedValue([]);

  await expect(getLeagueGraphTool.execute({})).resolves.toEqual({
    status: 'no_followed_leagues',
    lang: 'he',
    leagues: [],
  });
});

test('rejects arbitrary league access before blob reads', async () => {
  await expect(
    getLeagueGraphTool.execute({ leagueCode: 'NOPE', graphType: 'gap' }),
  ).resolves.toEqual({
    status: 'not_followed',
    lang: 'he',
    leagueCode: 'NOPE',
    graphType: 'gap',
  });
  expect(getLeagueData).not.toHaveBeenCalled();
});

test('returns graph-type cards after a league is chosen', async () => {
  await expect(
    getLeagueGraphTool.execute({ leagueCode: 'ABC' }),
  ).resolves.toEqual({
    status: 'select_graph_type',
    lang: 'he',
    leagueCode: 'ABC',
    leagueName: 'Alpha',
    graphTypes: ['gap', 'standings', 'budget'],
  });
  expect(getLeagueData).not.toHaveBeenCalled();
});

test('returns not_found when the followed league has no standings blob', async () => {
  getLeagueData.mockResolvedValue(null);

  await expect(
    getLeagueGraphTool.execute({ leagueCode: 'ABC', graphType: 'gap' }),
  ).resolves.toEqual({
    status: 'not_found',
    lang: 'he',
    leagueCode: 'ABC',
    leagueName: 'Alpha',
    graphType: 'gap',
  });
});

test('builds structured graph data with the refreshed selected team', async () => {
  const leagueData = { leagueCode: 'ABC', teams: [] };
  const graph = {
    graphType: 'standings',
    leagueCode: 'ABC',
    leagueName: 'Blob name',
    matchdays: [{ matchdayId: 1, label: 'Bahrain GP' }],
    series: [{ teamId: 'owner_1', isSelected: true, points: [] }],
    maxRank: 1,
  };
  getLeagueData.mockResolvedValue(leagueData);
  buildLeagueGraphSeries.mockReturnValue(graph);

  const result = await getLeagueGraphTool.execute({
    leagueCode: 'ABC',
    graphType: 'standings',
  });

  expect(ensureCacheReady).toHaveBeenCalledTimes(1);
  expect(getFreshSelectedTeamPreference).toHaveBeenCalledWith(42);
  expect(buildLeagueGraphSeries).toHaveBeenCalledWith(leagueData, {
    graphType: 'standings',
    roundToRaceName: { 1: 'Bahrain GP' },
    selectedTeamId: 'owner_1',
  });
  expect(result).toEqual({
    status: 'ok',
    lang: 'he',
    selectedTeamId: 'owner_1',
    ...graph,
  });
});

test('falls back to round labels when the schedule lookup fails', async () => {
  getLeagueData.mockResolvedValue({ leagueCode: 'ABC', teams: [] });
  fetchCurrentSeasonRaces.mockRejectedValue(new Error('schedule down'));
  buildLeagueGraphSeries.mockReturnValue({
    graphType: 'budget',
    leagueCode: 'ABC',
    leagueName: 'Alpha',
    matchdays: [{ matchdayId: 1, label: 'R1' }],
    series: [{}],
  });

  await getLeagueGraphTool.execute({
    leagueCode: 'ABC',
    graphType: 'budget',
  });

  expect(buildLeagueGraphSeries).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ roundToRaceName: {} }),
  );
});

test('returns an explicit no-data state', async () => {
  getLeagueData.mockResolvedValue({ leagueCode: 'ABC', teams: [] });
  buildLeagueGraphSeries.mockReturnValue({
    graphType: 'gap',
    leagueCode: 'ABC',
    leagueName: 'Alpha',
    matchdays: [],
    series: [],
  });

  await expect(
    getLeagueGraphTool.execute({ leagueCode: 'ABC', graphType: 'gap' }),
  ).resolves.toEqual({
    status: 'no_data',
    lang: 'he',
    leagueCode: 'ABC',
    leagueName: 'Alpha',
    graphType: 'gap',
  });
});

test('lets wrapToolExecute own storage errors', async () => {
  getLeagueData.mockRejectedValue(new Error('secret storage path'));

  await expect(
    getLeagueGraphTool.execute({ leagueCode: 'ABC', graphType: 'gap' }),
  ).rejects.toThrow('secret storage path');
});
