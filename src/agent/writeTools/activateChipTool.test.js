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
jest.mock('../../services/activateChipService', () => ({
  getChipOption: jest.fn(),
  availableChips: jest.fn(),
  getFreshChipPreference: jest.fn(),
  activateChipPreference: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));

const {
  resolveTeamSelection,
  resolveFreshTeamSelection,
} = require('../../services/selectTeamService');
const {
  getChipOption,
  availableChips,
  getFreshChipPreference,
  activateChipPreference,
} = require('../../services/activateChipService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { activateChipTool } = require('./activateChipTool');

const chipOption = {
  chip: 'EXTRA_BOOST',
  labelKey: 'Extra Boost',
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
  getChipOption.mockReturnValue(chipOption);
  availableChips.mockReturnValue([
    { chip: 'EXTRA_BOOST', label: 'Extra Boost' },
  ]);
  getFreshChipPreference.mockResolvedValue({
    fresh: true,
    chip: 'WITHOUT_CHIP',
  });
  getFreshLanguagePreference.mockResolvedValue({
    lang: 'en',
    fresh: true,
  });
});

test('rejects unowned teams and invalid chips', async () => {
  resolveTeamSelection.mockReturnValueOnce({
    status: 'invalid_input',
    summary: 'not available',
    availableTeams: [{ teamId: 'T1', teamName: 'Kilzid' }],
  });
  await expect(
    activateChipTool.validate({
      chatId: 42,
      args: { teamId: 'foreign', chip: 'EXTRA_BOOST' },
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    availableTeams: [{ teamId: 'T1' }],
  });

  getChipOption.mockReturnValueOnce(null);
  await expect(
    activateChipTool.validate({
      chatId: 42,
      args: { teamId: 'T2', chip: 'UNKNOWN' },
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    availableChips: [{ chip: 'EXTRA_BOOST' }],
  });
});

test('returns changed=false when durable state proves the chip is active', async () => {
  getFreshChipPreference.mockResolvedValue({
    fresh: true,
    chip: 'EXTRA_BOOST',
  });

  await expect(
    activateChipTool.validate({
      chatId: 42,
      args: { teamId: 'T2', chip: 'EXTRA_BOOST' },
    }),
  ).resolves.toMatchObject({
    status: 'ok',
    changed: false,
    teamId: 'T2',
    chip: 'EXTRA_BOOST',
  });
});

test('defaults an omitted team to the fresh selected team', async () => {
  expect(
    activateChipTool.parameters.parse({ chip: 'EXTRA_BOOST' }),
  ).toEqual({ chip: 'EXTRA_BOOST' });

  await activateChipTool.validate({
    chatId: 42,
    args: { chip: 'EXTRA_BOOST' },
  });
  expect(resolveFreshTeamSelection).toHaveBeenCalledWith({
    chatId: 42,
    chip: 'EXTRA_BOOST',
    defaultToSelected: true,
  });
});

test('canonicalizes proposals and commits through the service', async () => {
  await expect(
    activateChipTool.validate({
      chatId: 42,
      args: { teamName: 'kilzid 2', chip: 'EXTRA_BOOST' },
    }),
  ).resolves.toEqual({
    args: { teamId: 'T2', chip: 'EXTRA_BOOST' },
  });
  expect(
    activateChipTool.buildSummary({
      chatId: 42,
      args: { teamId: 'T2', chip: 'EXTRA_BOOST' },
    }),
  ).toContain('Kilzid 2');

  activateChipPreference.mockResolvedValue({
    status: 'ok',
    changed: true,
  });
  await activateChipTool.commit({
    chatId: 42,
    args: { teamId: 'T2', chip: 'EXTRA_BOOST' },
  });
  expect(activateChipPreference).toHaveBeenCalledWith({
    chatId: 42,
    teamId: 'T2',
    chip: 'EXTRA_BOOST',
  });
});
