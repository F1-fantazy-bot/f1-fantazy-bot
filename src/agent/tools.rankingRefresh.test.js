jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: (spec) => ({ ...spec }),
}));
jest.mock('./wrapToolExecute', () => ({
  wrapToolExecute: (_name, execute) => execute,
}));
jest.mock('./cacheBootstrap', () => ({
  ensureCacheReady: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./identity', () => ({
  getAgentChatId: jest.fn(() => 42),
}));
jest.mock('../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(async () => ({
    lang: 'en',
    fresh: true,
  })),
}));
jest.mock('../services/setBestTeamRankingService', () => ({
  refreshBestTeamRankingPreferencesSafely: jest.fn(),
  getPreset: jest.fn(),
  availablePresets: jest.fn(),
  getFreshBestTeamRankingPreference: jest.fn(),
  setBestTeamRankingPreference: jest.fn(),
}));
jest.mock('../services/activateChipService', () => ({
  refreshChipPreferencesSafely: jest.fn(),
}));
jest.mock('../services/selectTeamService', () => ({
  getFreshSelectedTeamPreference: jest.fn(),
  resolveTeamSelection: jest.fn(),
  resolveFreshTeamSelection: jest.fn(),
  selectTeamPreference: jest.fn(),
}));
jest.mock('../cores/bestTeamsCore', () => ({
  computeBestTeams: jest.fn(),
}));
jest.mock('../cores/currentTeamCore', () => ({
  getCurrentTeam: jest.fn(),
}));
jest.mock('../cores/userTeamsCore', () => ({
  listUserTeams: jest.fn(),
}));
jest.mock('../cores/bestTeamScenariosCore', () => ({
  computeBestTeamScenarios: jest.fn(),
}));
jest.mock('../cores/liveScoreCore', () => ({
  getLiveScoreForTeam: jest.fn(),
  getLiveScoreLeaderboard: jest.fn(),
  listLeagueTeams: jest.fn(),
}));

const {
  refreshBestTeamRankingPreferencesSafely,
} = require('../services/setBestTeamRankingService');
const {
  refreshChipPreferencesSafely,
} = require('../services/activateChipService');
const {
  getFreshSelectedTeamPreference,
} = require('../services/selectTeamService');
const { computeBestTeams } = require('../cores/bestTeamsCore');
const { getCurrentTeam } = require('../cores/currentTeamCore');
const { listUserTeams } = require('../cores/userTeamsCore');
const {
  computeBestTeamScenarios,
} = require('../cores/bestTeamScenariosCore');
const {
  getLiveScoreForTeam,
} = require('../cores/liveScoreCore');
const { tools } = require('./tools');

beforeEach(() => {
  jest.clearAllMocks();
  refreshBestTeamRankingPreferencesSafely.mockResolvedValue({
    fresh: true,
    preferences: { T1: 1.65 },
  });
  refreshChipPreferencesSafely.mockResolvedValue({
    fresh: true,
    chips: { T1: 'EXTRA_BOOST' },
  });
  getFreshSelectedTeamPreference.mockResolvedValue({
    fresh: true,
    selectedTeam: 'T1',
  });
});

test('live score refreshes selected team only when team args are omitted', async () => {
  getLiveScoreForTeam.mockResolvedValue({ status: 'ok' });
  const tool = tools.find(
    (candidate) => candidate.name === 'get_live_score_for_team',
  );

  await tool.execute({ leagueCode: 'ABC' });
  expect(getFreshSelectedTeamPreference).toHaveBeenCalledWith(42);
  expect(
    getFreshSelectedTeamPreference.mock.invocationCallOrder[0],
  ).toBeLessThan(getLiveScoreForTeam.mock.invocationCallOrder[0]);

  jest.clearAllMocks();
  getLiveScoreForTeam.mockResolvedValue({ status: 'ok' });
  await tool.execute({ leagueCode: 'ABC', teamId: 'T2' });
  expect(getFreshSelectedTeamPreference).not.toHaveBeenCalled();
});

test.each([
  {
    toolName: 'get_best_teams',
    core: computeBestTeams,
    coreResult: { status: 'no_teams' },
    refreshRanking: true,
  },
  {
    toolName: 'get_current_team',
    core: getCurrentTeam,
    coreResult: { status: 'ok', teamId: 'T1' },
    refreshRanking: true,
  },
  {
    toolName: 'list_user_teams',
    core: listUserTeams,
    coreResult: [],
    refreshRanking: false,
  },
  {
    toolName: 'get_best_team_scenarios',
    core: computeBestTeamScenarios,
    coreResult: { status: 'ok', scenarios: [] },
    refreshRanking: false,
  },
])('$toolName refreshes preferences before reading its core', async ({
  toolName,
  core,
  coreResult,
  refreshRanking,
}) => {
  core.mockResolvedValue(coreResult);
  const tool = tools.find((candidate) => candidate.name === toolName);

  await tool.execute({});

  if (refreshRanking) {
    expect(refreshBestTeamRankingPreferencesSafely).toHaveBeenCalledWith(42);
    expect(
      refreshBestTeamRankingPreferencesSafely.mock.invocationCallOrder[0],
    ).toBeLessThan(core.mock.invocationCallOrder[0]);
  } else {
    expect(refreshBestTeamRankingPreferencesSafely).not.toHaveBeenCalled();
  }
  expect(refreshChipPreferencesSafely).toHaveBeenCalledWith(42);
  expect(
    refreshChipPreferencesSafely.mock.invocationCallOrder[0],
  ).toBeLessThan(core.mock.invocationCallOrder[0]);
});
