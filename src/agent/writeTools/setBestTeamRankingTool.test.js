jest.mock('../writeToolHelpers', () => ({
  defineWriteTool: jest.fn((spec) => spec),
  WRITE_RESULT_STATUSES: {
    OK: 'ok',
    INVALID_INPUT: 'invalid_input',
  },
}));
jest.mock('../../services/selectTeamService', () => ({
  resolveTeamSelection: jest.fn(),
  resolveFreshTeamSelection: jest.fn(),
}));
jest.mock('../../services/setBestTeamRankingService', () => ({
  getPreset: jest.fn(),
  availablePresets: jest.fn(),
  getFreshBestTeamRankingPreference: jest.fn(),
  setBestTeamRankingPreference: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));

const {
  resolveTeamSelection,
  resolveFreshTeamSelection,
} = require('../../services/selectTeamService');
const {
  getPreset,
  availablePresets,
  getFreshBestTeamRankingPreference,
  setBestTeamRankingPreference,
} = require('../../services/setBestTeamRankingService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  setBestTeamRankingTool,
} = require('./setBestTeamRankingTool');

const preset = {
  id: 'points_plus_budget',
  budgetChangePointsPerMillion: 1.65,
  labelKey: 'Points Plus Budget',
};

beforeEach(() => {
  jest.clearAllMocks();
  resolveTeamSelection.mockReturnValue({
    status: 'ok',
    teamId: 'T2',
    teamName: 'Kilzid 2',
    availableTeams: [],
  });
  resolveFreshTeamSelection.mockImplementation(async (args) =>
    resolveTeamSelection(args),
  );
  getPreset.mockReturnValue(preset);
  availablePresets.mockReturnValue([
    { id: 'pure_points', label: 'Pure Points', value: 0 },
  ]);
  getFreshBestTeamRankingPreference.mockResolvedValue({
    fresh: true,
    value: 0,
  });
  getFreshLanguagePreference.mockResolvedValue({
    lang: 'en',
    fresh: true,
  });
});

test('rejects unowned teams and unknown presets', async () => {
  resolveTeamSelection.mockReturnValueOnce({
    status: 'invalid_input',
    summary: 'not available',
    availableTeams: [{ teamId: 'T1', teamName: 'Kilzid' }],
  });

  await expect(
    setBestTeamRankingTool.validate({
      chatId: 42,
      args: { teamId: 'foreign', presetId: 'pure_points' },
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    availableTeams: [{ teamId: 'T1' }],
  });

  getPreset.mockReturnValueOnce(null);
  await expect(
    setBestTeamRankingTool.validate({
      chatId: 42,
      args: { teamId: 'T2', presetId: 'unknown' },
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    availablePresets: [{ id: 'pure_points' }],
  });
});

test('returns changed=false when durable state proves the preset is active', async () => {
  getFreshBestTeamRankingPreference.mockResolvedValue({
    fresh: true,
    value: 1.65,
  });

  await expect(
    setBestTeamRankingTool.validate({
      chatId: 42,
      args: { teamId: 'T2', presetId: 'points_plus_budget' },
    }),
  ).resolves.toMatchObject({
    status: 'ok',
    changed: false,
    teamId: 'T2',
    presetId: 'points_plus_budget',
  });
});

test('canonicalizes proposals and commits through the shared service', async () => {
  await expect(
    setBestTeamRankingTool.validate({
      chatId: 42,
      args: {
        teamName: 'kilzid 2',
        presetId: 'points_plus_budget',
      },
    }),
  ).resolves.toEqual({
    args: {
      teamId: 'T2',
      presetId: 'points_plus_budget',
    },
  });
  expect(
    setBestTeamRankingTool.buildSummary({
      chatId: 42,
      args: { teamId: 'T2', presetId: 'points_plus_budget' },
    }),
  ).toContain('Kilzid 2');

  setBestTeamRankingPreference.mockResolvedValue({
    status: 'ok',
    changed: true,
  });
  await setBestTeamRankingTool.commit({
    chatId: 42,
    args: { teamId: 'T2', presetId: 'points_plus_budget' },
  });
  expect(setBestTeamRankingPreference).toHaveBeenCalledWith({
    chatId: 42,
    teamId: 'T2',
    presetId: 'points_plus_budget',
  });
});
