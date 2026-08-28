jest.mock('../writeToolHelpers', () => ({
  defineWriteTool: jest.fn((spec) => spec),
  WRITE_RESULT_STATUSES: {
    INVALID_INPUT: 'invalid_input',
    NOT_FOUND: 'not_found',
  },
}));
jest.mock('../../services/unfollowLeagueService', () => ({
  inspectLeagueUnfollow: jest.fn(),
  unfollowLeague: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn().mockResolvedValue({ lang: 'en' }),
}));

const {
  inspectLeagueUnfollow,
  unfollowLeague,
} = require('../../services/unfollowLeagueService');
const { unfollowLeagueTool } = require('./unfollowLeagueTool');

test('canonicalizes a followed league before staging', async () => {
  inspectLeagueUnfollow.mockResolvedValue({
    status: 'ok',
    leagueCode: 'ABC123',
    leagueName: 'Friends',
  });

  await expect(
    unfollowLeagueTool.validate({
      chatId: 42,
      args: { leagueName: 'friends' },
    }),
  ).resolves.toEqual({
    args: { leagueCode: 'ABC123', leagueName: 'Friends' },
  });
  expect(
    unfollowLeagueTool.buildSummary({
      chatId: 42,
      args: { leagueCode: 'ABC123', leagueName: 'Friends' },
    }),
  ).toContain('Friends');
});

test('returns not_found without staging for an unfollowed league', async () => {
  inspectLeagueUnfollow.mockResolvedValue({
    status: 'not_found',
    summary: 'Not followed.',
  });

  await expect(
    unfollowLeagueTool.validate({
      chatId: 42,
      args: { leagueCode: 'OTHER' },
    }),
  ).resolves.toMatchObject({
    status: 'not_found',
    tool: 'unfollow_league',
  });
});

test('returns invalid_input with codes for duplicate league names', async () => {
  inspectLeagueUnfollow.mockResolvedValue({
    status: 'ambiguous',
    summary: 'Choose by code.',
    followedLeagues: [
      { leagueCode: 'ABC123' },
      { leagueCode: 'XYZ789' },
    ],
  });

  await expect(
    unfollowLeagueTool.validate({
      chatId: 42,
      args: { leagueName: 'Friends' },
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    followedLeagues: [
      { leagueCode: 'ABC123' },
      { leagueCode: 'XYZ789' },
    ],
  });
});

test('commits through the shared service', async () => {
  unfollowLeague.mockResolvedValue({ status: 'ok' });
  await unfollowLeagueTool.commit({
    chatId: 42,
    args: { leagueCode: 'ABC123', leagueName: 'Friends' },
  });
  expect(unfollowLeague).toHaveBeenCalledWith({
    chatId: 42,
    leagueCode: 'ABC123',
    leagueName: 'Friends',
  });
});
