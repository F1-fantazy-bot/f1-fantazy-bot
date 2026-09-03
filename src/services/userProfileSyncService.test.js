jest.mock('../userRegistryService', () => ({ getUserById: jest.fn() }));
jest.mock('./userResetEpochService', () => ({
  reconcileUserResetEpoch: jest.fn(),
}));

const { getUserById } = require('../userRegistryService');
const {
  reconcileUserResetEpoch,
} = require('./userResetEpochService');
const {
  getFreshUserProfile,
  resetUserProfileSyncForTests,
} = require('./userProfileSyncService');

beforeEach(() => {
  jest.clearAllMocks();
  resetUserProfileSyncForTests();
});

test('reconciles the durable reset epoch on each fresh profile read', async () => {
  const user = { chatId: '42', userResetEpoch: 3, selectedTeam: null };
  getUserById.mockResolvedValue(user);

  await expect(getFreshUserProfile(42)).resolves.toEqual(user);
  expect(reconcileUserResetEpoch).toHaveBeenCalledWith(42, user);
});

test('coalesces concurrent profile reads while reconciling the result once', async () => {
  let resolveUser;
  getUserById.mockImplementation(
    () => new Promise((resolve) => { resolveUser = resolve; }),
  );

  const first = getFreshUserProfile(42);
  const second = getFreshUserProfile(42);
  resolveUser({ chatId: '42', userResetEpoch: 4 });

  await expect(Promise.all([first, second])).resolves.toEqual([
    { chatId: '42', userResetEpoch: 4 },
    { chatId: '42', userResetEpoch: 4 },
  ]);
  expect(getUserById).toHaveBeenCalledTimes(1);
  expect(reconcileUserResetEpoch).toHaveBeenCalledTimes(1);
});
