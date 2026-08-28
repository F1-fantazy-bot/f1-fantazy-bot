jest.mock('./azureStorageService', () => ({
  saveUserTeam: jest.fn(),
  deleteUserTeam: jest.fn(),
  deleteAllUserTeams: jest.fn(),
  listUserTeamData: jest.fn(),
}));

const azureStorageService = require('./azureStorageService');
const userTeamRegistryService = require('./userTeamRegistryService');

beforeEach(() => {
  jest.clearAllMocks();
});

test('persists teams silently without a Telegram bot dependency', async () => {
  await userTeamRegistryService.saveUserTeam(42, 'Owner_1', {
    drivers: ['VER'],
  });
  await userTeamRegistryService.deleteUserTeam(42, 'Owner_1');
  await userTeamRegistryService.deleteAllUserTeams(42);

  expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
    null,
    42,
    'Owner_1',
    { drivers: ['VER'] },
    { silent: true },
  );
  expect(azureStorageService.deleteUserTeam).toHaveBeenCalledWith(
    null,
    42,
    'Owner_1',
    { silent: true },
  );
  expect(azureStorageService.deleteAllUserTeams).toHaveBeenCalledWith(
    null,
    42,
    { silent: true },
  );
});

test('lists the authoritative user team blobs', async () => {
  azureStorageService.listUserTeamData.mockResolvedValue({
    Owner_1: { drivers: ['VER'] },
  });

  await expect(
    userTeamRegistryService.listUserTeams(42),
  ).resolves.toEqual({
    Owner_1: { drivers: ['VER'] },
  });
});
