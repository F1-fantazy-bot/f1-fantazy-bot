jest.mock('../writeToolHelpers', () => ({
  defineWriteTool: jest.fn((spec) => spec),
  WRITE_RESULT_STATUSES: {
    OK: 'ok',
    INVALID_INPUT: 'invalid_input',
  },
}));

jest.mock('../../services/selectTeamService', () => ({
  resolveTeamSelection: jest.fn(),
  getFreshSelectedTeamPreference: jest.fn(),
  selectTeamPreference: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));

const {
  resolveTeamSelection,
  getFreshSelectedTeamPreference,
  selectTeamPreference,
} = require('../../services/selectTeamService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { selectTeamTool } = require('./selectTeamTool');

beforeEach(() => {
  jest.clearAllMocks();
  resolveTeamSelection.mockReturnValue({
    status: 'ok',
    teamId: 'T2',
    teamName: 'Kilzid 2',
    availableTeams: [],
  });
  getFreshSelectedTeamPreference.mockResolvedValue({
    fresh: true,
    selectedTeam: 'T1',
  });
  getFreshLanguagePreference.mockResolvedValue({
    lang: 'en',
    fresh: true,
  });
});

test('returns invalid_input for unowned teams without staging', async () => {
  resolveTeamSelection.mockReturnValue({
    status: 'invalid_input',
    summary: 'not available',
    availableTeams: [{ teamId: 'T1', teamName: 'Kilzid' }],
  });

  await expect(
    selectTeamTool.validate({ chatId: 42, args: { teamId: 'foreign' } }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    tool: 'select_team',
    availableTeams: [{ teamId: 'T1' }],
  });
  expect(getFreshSelectedTeamPreference).not.toHaveBeenCalled();
});

test('description requires the tool on a team-name follow-up', () => {
  expect(selectTeamTool.description).toContain(
    'Call this immediately when the user names a team',
  );
  expect(selectTeamTool.description).toContain(
    'do not merely describe or claim a confirmation card',
  );
  expect(selectTeamTool.description).toContain(
    'pass an exact teamName directly without first listing teams',
  );
});

test('returns changed=false without confirmation for the active team', async () => {
  getFreshSelectedTeamPreference.mockResolvedValue({
    fresh: true,
    selectedTeam: 'T2',
  });

  await expect(
    selectTeamTool.validate({ chatId: 42, args: { teamId: 'T2' } }),
  ).resolves.toMatchObject({
    status: 'ok',
    changed: false,
    teamId: 'T2',
  });
});

test('builds confirmation summary and commits through the service', async () => {
  expect(
    selectTeamTool.buildSummary({ chatId: 42, args: { teamId: 'T2' } }),
  ).toContain('Kilzid 2 (T2)');
  selectTeamPreference.mockResolvedValue({ status: 'ok', teamId: 'T2' });

  await selectTeamTool.commit({ chatId: 42, args: { teamId: 'T2' } });
  expect(selectTeamPreference).toHaveBeenCalledWith({
    chatId: 42,
    teamId: 'T2',
  });
});

test('canonicalizes a name-based proposal to the owned team id', async () => {
  await expect(
    selectTeamTool.validate({
      chatId: 42,
      args: { teamName: 'kilzid 2' },
    }),
  ).resolves.toEqual({ args: { teamId: 'T2' } });
  expect(getFreshLanguagePreference).toHaveBeenCalledWith(42);
});
