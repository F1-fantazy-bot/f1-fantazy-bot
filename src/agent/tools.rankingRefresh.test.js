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
jest.mock('../cores/bestTeamsCore', () => ({
  computeBestTeams: jest.fn(),
}));
jest.mock('../cores/currentTeamCore', () => ({
  getCurrentTeam: jest.fn(),
}));

const {
  refreshBestTeamRankingPreferencesSafely,
} = require('../services/setBestTeamRankingService');
const { computeBestTeams } = require('../cores/bestTeamsCore');
const { getCurrentTeam } = require('../cores/currentTeamCore');
const { tools } = require('./tools');

beforeEach(() => {
  jest.clearAllMocks();
  refreshBestTeamRankingPreferencesSafely.mockResolvedValue({
    fresh: true,
    preferences: { T1: 1.65 },
  });
});

test.each([
  {
    toolName: 'get_best_teams',
    core: computeBestTeams,
    coreResult: { status: 'no_teams' },
  },
  {
    toolName: 'get_current_team',
    core: getCurrentTeam,
    coreResult: { status: 'ok', teamId: 'T1' },
  },
])('$toolName refreshes ranking before reading its core', async ({
  toolName,
  core,
  coreResult,
}) => {
  core.mockResolvedValue(coreResult);
  const tool = tools.find((candidate) => candidate.name === toolName);

  await tool.execute({});

  expect(refreshBestTeamRankingPreferencesSafely).toHaveBeenCalledWith(42);
  expect(
    refreshBestTeamRankingPreferencesSafely.mock.invocationCallOrder[0],
  ).toBeLessThan(core.mock.invocationCallOrder[0]);
});
