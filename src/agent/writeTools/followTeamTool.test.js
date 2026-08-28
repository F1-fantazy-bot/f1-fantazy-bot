jest.mock('../writeToolHelpers', () => ({
  defineWriteTool: jest.fn((spec) => spec),
  WRITE_RESULT_STATUSES: {
    OK: 'ok',
    INVALID_INPUT: 'invalid_input',
    NOT_FOUND: 'not_found',
    LIMIT_EXCEEDED: 'limit_exceeded',
  },
}));
jest.mock('../../services/followTeamService', () => ({
  createFollowTeamService: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn().mockResolvedValue({ lang: 'en' }),
}));
jest.mock('../notifierBot', () => ({
  getNotifierBot: jest.fn(() => ({})),
}));

const {
  createFollowTeamService,
} = require('../../services/followTeamService');

const service = {
  inspect: jest.fn(),
  mutate: jest.fn(),
  buildSummary: jest.fn(() => 'Confirm team change.'),
};
createFollowTeamService.mockReturnValue(service);

const { followTeamTool } = require('./followTeamTool');

beforeEach(() => {
  jest.clearAllMocks();
  createFollowTeamService.mockReturnValue(service);
  service.buildSummary.mockReturnValue('Confirm team change.');
});

test.each(['', '   ', '\n\t'])(
  'rejects a blank leagueCode before service validation',
  (leagueCode) => {
    expect(() =>
      followTeamTool.parameters.parse({
        action: 'add',
        leagueCode,
        teamId: 'Owner_1',
      }),
    ).toThrow();
    expect(service.inspect).not.toHaveBeenCalled();
  },
);

test('allows canonical remove without a leagueCode', () => {
  expect(
    followTeamTool.parameters.parse({
      action: 'remove',
      teamId: 'Owner_1',
    }),
  ).toEqual({
    action: 'remove',
    teamId: 'Owner_1',
  });
});

test('requires leagueCode when adding', () => {
  expect(() =>
    followTeamTool.parameters.parse({
      action: 'add',
      teamId: 'Owner_1',
    }),
  ).toThrow('leagueCode is required when adding a team');
});

test('canonicalizes the team and preserves the source-wipe summary', async () => {
  service.inspect.mockResolvedValue({
    status: 'ok',
    changed: true,
    teamId: 'Owner_1',
    teamName: 'Fast Friends',
    leagueCode: 'ABC123',
    leagueName: 'Friends',
    screenshotTeamIds: ['T1', 'T2'],
  });
  service.buildSummary.mockReturnValue(
    'This will remove your screenshot teams T1/T2.',
  );

  await expect(
    followTeamTool.validate({
      chatId: 42,
      args: {
        action: 'add',
        leagueCode: 'abc123',
        teamName: 'fast friends',
      },
    }),
  ).resolves.toEqual({
    args: {
      action: 'add',
      leagueCode: 'ABC123',
      teamId: 'Owner_1',
    },
    intentArgs: {
      action: 'add',
      leagueCode: 'ABC123',
      teamId: 'Owner_1',
      expectedScreenshotTeamIds: ['T1', 'T2'],
    },
    summary: 'This will remove your screenshot teams T1/T2.',
  });
});

test.each([
  ['invalid_input', 'invalid_input'],
  ['not_found', 'not_found'],
  ['limit_exceeded', 'limit_exceeded'],
])('returns %s without staging', async (serviceStatus, expectedStatus) => {
  service.inspect.mockResolvedValue({
    status: serviceStatus,
    summary: 'Cannot change team.',
    changed: false,
  });

  await expect(
    followTeamTool.validate({
      chatId: 42,
      args: {
        action: 'add',
        leagueCode: 'ABC123',
        teamId: 'Owner_1',
      },
    }),
  ).resolves.toMatchObject({
    status: expectedStatus,
    tool: 'follow_team',
  });
});

test('commits through the shared service', async () => {
  service.mutate.mockResolvedValue({ status: 'ok' });

  await followTeamTool.commit({
    chatId: 42,
    args: {
      action: 'remove',
      teamId: 'Owner_1',
    },
  });

  expect(service.mutate).toHaveBeenCalledWith({
    chatId: 42,
    action: 'remove',
    teamId: 'Owner_1',
  });
});
