jest.mock('../writeToolHelpers', () => ({
  defineWriteTool: jest.fn((spec) => spec),
  WRITE_RESULT_STATUSES: {
    OK: 'ok',
    INVALID_INPUT: 'invalid_input',
    NOT_FOUND: 'not_found',
  },
}));
jest.mock('../../services/followLeagueService', () => ({
  inspectLeagueFollow: jest.fn(),
  followLeague: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));

const {
  inspectLeagueFollow,
  followLeague,
} = require('../../services/followLeagueService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { followLeagueTool } = require('./followLeagueTool');

beforeEach(() => {
  jest.clearAllMocks();
  getFreshLanguagePreference.mockResolvedValue({
    lang: 'en',
    fresh: true,
  });
  inspectLeagueFollow.mockResolvedValue({
    status: 'ok',
    leagueCode: 'ABC123',
    leagueName: 'Friends',
    changed: true,
  });
});

test('canonicalizes a verified league code before staging', async () => {
  await expect(
    followLeagueTool.validate({
      chatId: 42,
      args: { leagueCode: ' abc123 ' },
    }),
  ).resolves.toEqual({
    args: { leagueCode: 'ABC123' },
  });
  expect(inspectLeagueFollow).toHaveBeenCalledWith({
    chatId: 42,
    leagueCode: ' abc123 ',
    surface: 'agent',
  });
});

test.each(['invalid_input', 'not_found'])(
  'returns %s without staging',
  async (status) => {
    inspectLeagueFollow.mockResolvedValue({
      status,
      leagueCode: 'BAD',
      summary: 'not available',
    });

    await expect(
      followLeagueTool.validate({
        chatId: 42,
        args: { leagueCode: 'bad' },
      }),
    ).resolves.toMatchObject({
      status,
      tool: 'follow_league',
    });
  },
);

test('skips confirmation for a durable existing follow', async () => {
  inspectLeagueFollow.mockResolvedValue({
    status: 'ok',
    leagueCode: 'ABC123',
    leagueName: 'Friends',
    changed: false,
    summary: 'Already followed.',
  });

  await expect(
    followLeagueTool.validate({
      chatId: 42,
      args: { leagueCode: 'ABC123' },
    }),
  ).resolves.toMatchObject({
    status: 'ok',
    changed: false,
  });
});

test('commits through the shared service', async () => {
  followLeague.mockResolvedValue({ status: 'ok', changed: true });

  await followLeagueTool.commit({
    chatId: 42,
    args: { leagueCode: 'ABC123' },
  });
  expect(followLeague).toHaveBeenCalledWith({
    chatId: 42,
    leagueCode: 'ABC123',
    surface: 'agent',
  });
});
