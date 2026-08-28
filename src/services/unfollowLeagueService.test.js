jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
  removeUserLeague: jest.fn(),
}));

const {
  listUserLeagues,
  removeUserLeague,
} = require('../leagueRegistryService');
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
});

test('removes a followed league', async () => {
  await expect(
    unfollowLeague({ chatId: 42, leagueName: 'Friends' }),
  ).resolves.toMatchObject({ status: 'ok', changed: true });
  expect(removeUserLeague).toHaveBeenCalledWith(42, 'ABC123');
});
