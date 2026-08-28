jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
  removeUserLeague: jest.fn(),
}));
jest.mock('./activateChipService', () => ({
  runChipMutation: jest.fn(async (_chatId, operation) => operation()),
}));

const {
  listUserLeagues,
  removeUserLeague,
} = require('../leagueRegistryService');
const {
  runChipMutation,
} = require('./activateChipService');
const {
  inspectLeagueUnfollow,
  unfollowLeague,
} = require('./unfollowLeagueService');

beforeEach(() => {
  jest.clearAllMocks();
  listUserLeagues.mockResolvedValue([
    { leagueCode: 'ABC123', leagueName: 'Friends' },
  ]);
  removeUserLeague.mockResolvedValue(undefined);
});

test('resolves followed leagues by code or exact name', async () => {
  await expect(
    inspectLeagueUnfollow({ chatId: 42, leagueCode: 'abc123' }),
  ).resolves.toMatchObject({ status: 'ok', leagueCode: 'ABC123' });
  await expect(
    inspectLeagueUnfollow({ chatId: 42, leagueName: 'friends' }),
  ).resolves.toMatchObject({ status: 'ok', leagueCode: 'ABC123' });
});

test('returns not_found without deletion for an unfollowed league', async () => {
  await expect(
    unfollowLeague({ chatId: 42, leagueCode: 'OTHER' }),
  ).resolves.toMatchObject({ status: 'not_found', changed: false });
  expect(removeUserLeague).not.toHaveBeenCalled();
  expect(runChipMutation).toHaveBeenCalledWith(
    42,
    expect.any(Function),
  );
});

test('returns canonical choices for duplicate exact league names', async () => {
  listUserLeagues.mockResolvedValue([
    { leagueCode: 'ABC123', leagueName: 'Friends' },
    { leagueCode: 'XYZ789', leagueName: 'Friends' },
  ]);

  const result = await inspectLeagueUnfollow({
    chatId: 42,
    leagueName: 'friends',
  });

  expect(result).toMatchObject({
    status: 'ambiguous',
    changed: false,
    followedLeagues: [
      { leagueCode: 'ABC123' },
      { leagueCode: 'XYZ789' },
    ],
  });
  expect(result.summary).toContain('ABC123, XYZ789');
  expect(removeUserLeague).not.toHaveBeenCalled();
});

test('removes a followed league', async () => {
  await expect(
    unfollowLeague({ chatId: 42, leagueName: 'Friends' }),
  ).resolves.toMatchObject({ status: 'ok', changed: true });
  expect(removeUserLeague).toHaveBeenCalledWith(42, 'ABC123');
  expect(runChipMutation).toHaveBeenCalledWith(
    42,
    expect.any(Function),
  );
});
