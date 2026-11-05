jest.mock('./chipExpiryScheduleService', () => ({ createChipExpiry: jest.fn() }));
const activeExpiry = {
  selectedAt: new Date(Date.now() - 86400000).toISOString(),
  expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
};

jest.mock('../userRegistryService', () => ({
  updateUserAttributesAtomically: jest.fn(),
  getUserById: jest.fn(),
}));
jest.mock('../azureStorageService', () => ({
  getUserTeam: jest.fn(),
}));

const {
  updateUserAttributesAtomically,
  getUserById,
} = require('../userRegistryService');
const { getUserTeam } = require('../azureStorageService');
const {
  bestTeamsCache,
  currentTeamCache,
  selectedChipCache,
  userCache,
} = require('../cache');
const {
  EXTRA_BOOST_CHIP,
  LIMITLESS_CHIP,
  WITHOUT_CHIP,
} = require('../constants');
const {
  activateChipPreference,
  getFreshChipPreference,
  setCachedChipPreferences,
  clearTeamDerivedPreferences,
  resetChipSyncForTests,
} = require('./activateChipService');
const {
  resetUserProfileSyncForTests,
} = require('./userProfileSyncService');

const CHAT_ID = 42;

beforeEach(() => {
  jest.clearAllMocks();
  require('./chipExpiryScheduleService').createChipExpiry.mockResolvedValue(activeExpiry);
  resetChipSyncForTests();
  resetUserProfileSyncForTests();
  currentTeamCache[CHAT_ID] = {
    T1: { teamName: 'Kilzid' },
    T2: { teamName: 'Kilzid 2' },
  };
  userCache[String(CHAT_ID)] = {
    selectedChipExpiryByTeam: { T1: activeExpiry, T2: activeExpiry },
    selectedChipByTeam: {},
    selectedBestTeamByTeam: {
      T1: {
        drivers: ['VER', 'NOR', 'PIA', 'LEC', 'HAM'],
        constructors: ['MCL', 'FER'],
        boostDriver: 'VER',
      },
    },
  };
  bestTeamsCache[CHAT_ID] = {
    T1: { bestTeams: ['cached'] },
    T2: { bestTeams: ['keep'] },
  };
  delete selectedChipCache[CHAT_ID];
  getUserById.mockResolvedValue(null);
  getUserTeam.mockResolvedValue({ drivers: ['VER'] });
  updateUserAttributesAtomically.mockImplementation(
    async (_chatId, transform) => {
      const current = {
        selectedChipExpiryByTeam: userCache[String(CHAT_ID)].selectedChipExpiryByTeam,
        selectedChipByTeam: JSON.stringify(
          userCache[String(CHAT_ID)].selectedChipByTeam,
        ),
        selectedBestTeamByTeam: JSON.stringify(
          userCache[String(CHAT_ID)].selectedBestTeamByTeam,
        ),
      };
      const attributes = await transform(current);

      return {
        updated: attributes !== null,
        user: attributes ? { ...current, ...attributes } : current,
      };
    },
  );
});

afterEach(() => {
  delete currentTeamCache[CHAT_ID];
  delete userCache[String(CHAT_ID)];
  delete bestTeamsCache[CHAT_ID];
  delete selectedChipCache[CHAT_ID];
});

test('atomically activates a chip and clears dependent team state', async () => {
  const result = await activateChipPreference({
    chatId: CHAT_ID,
    teamId: 'T1',
    chip: EXTRA_BOOST_CHIP,
  });

  expect(updateUserAttributesAtomically).toHaveBeenCalledWith(
    CHAT_ID,
    expect.any(Function),
  );
  expect(selectedChipCache[CHAT_ID]).toEqual({
    T1: EXTRA_BOOST_CHIP,
  });
  expect(userCache[String(CHAT_ID)].selectedBestTeamByTeam.T1).toBeUndefined();
  expect(bestTeamsCache[CHAT_ID].T1).toBeUndefined();
  expect(bestTeamsCache[CHAT_ID].T2).toEqual({ bestTeams: ['keep'] });
  expect(result).toMatchObject({
    status: 'ok',
    chip: EXTRA_BOOST_CHIP,
    changed: true,
    invalidatedBestTeams: true,
  });
});

test('reset removes the persisted chip entry', async () => {
  userCache[String(CHAT_ID)].selectedChipByTeam = {
    T1: LIMITLESS_CHIP,
  };
  selectedChipCache[CHAT_ID] = { T1: LIMITLESS_CHIP };

  const result = await activateChipPreference({
    chatId: CHAT_ID,
    teamId: 'T1',
    chip: WITHOUT_CHIP,
  });

  expect(selectedChipCache[CHAT_ID]).toBeUndefined();
  expect(result).toMatchObject({
    status: 'ok',
    changed: true,
    chip: WITHOUT_CHIP,
  });
});

test('durable no-op preserves selected best team and calculations', async () => {
  userCache[String(CHAT_ID)].selectedChipByTeam = {
    T1: EXTRA_BOOST_CHIP,
  };

  const result = await activateChipPreference({
    chatId: CHAT_ID,
    teamId: 'T1',
    chip: EXTRA_BOOST_CHIP,
  });

  expect(result).toMatchObject({ status: 'ok', changed: false });
  expect(userCache[String(CHAT_ID)].selectedBestTeamByTeam.T1).toBeDefined();
  expect(bestTeamsCache[CHAT_ID].T1).toBeDefined();
});

test('rejects unknown teams and chip values without persistence', async () => {
  await expect(
    activateChipPreference({
      chatId: CHAT_ID,
      teamId: 'foreign',
      chip: EXTRA_BOOST_CHIP,
    }),
  ).resolves.toMatchObject({ status: 'invalid_input' });
  await expect(
    activateChipPreference({
      chatId: CHAT_ID,
      teamId: 'T1',
      chip: 'UNKNOWN',
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    availableChips: expect.any(Array),
  });
  expect(updateUserAttributesAtomically).not.toHaveBeenCalled();
});

test('hydrates chip changes from another Function process', async () => {
  getUserById.mockResolvedValue({
    selectedChipByTeam: JSON.stringify({ T1: LIMITLESS_CHIP }),
    selectedChipExpiryByTeam: JSON.stringify({ T1: activeExpiry }),
  });

  await expect(
    getFreshChipPreference(CHAT_ID, 'T1'),
  ).resolves.toEqual({
    fresh: true,
    chip: LIMITLESS_CHIP,
  });
  expect(selectedChipCache[CHAT_ID]).toEqual({ T1: LIMITLESS_CHIP });
  expect(bestTeamsCache[CHAT_ID].T1).toBeUndefined();
});

test('stale profile cannot overwrite a newer local chip write', async () => {
  let resolveLookup;
  getUserById.mockReturnValue(
    new Promise((resolve) => {
      resolveLookup = resolve;
    }),
  );

  const stale = getFreshChipPreference(CHAT_ID, 'T1');
  setCachedChipPreferences(CHAT_ID, { T1: EXTRA_BOOST_CHIP }, 'T1');
  resolveLookup({
    selectedChipByTeam: JSON.stringify({ T1: LIMITLESS_CHIP }),
    selectedChipExpiryByTeam: JSON.stringify({ T1: activeExpiry }),
  });

  await expect(stale).resolves.toMatchObject({ fresh: false });
  expect(selectedChipCache[CHAT_ID]).toEqual({
    T1: EXTRA_BOOST_CHIP,
  });
});

test('rejects a locally cached team missing from authoritative storage', async () => {
  getUserTeam.mockResolvedValue(null);

  await expect(
    activateChipPreference({
      chatId: CHAT_ID,
      teamId: 'T1',
      chip: EXTRA_BOOST_CHIP,
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    teamId: 'T1',
  });
  expect(updateUserAttributesAtomically).not.toHaveBeenCalled();
});

test('removes a chip written while the authoritative team is deleted', async () => {
  getUserTeam
    .mockResolvedValueOnce({ drivers: ['VER'] })
    .mockResolvedValueOnce(null);

  await expect(
    activateChipPreference({
      chatId: CHAT_ID,
      teamId: 'T1',
      chip: EXTRA_BOOST_CHIP,
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    teamId: 'T1',
  });
  expect(updateUserAttributesAtomically).toHaveBeenCalledTimes(2);
  expect(selectedChipCache[CHAT_ID]).toBeUndefined();
});

test('serializes chip mutations for one user before publishing cache', async () => {
  let releaseFirst;
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => {
    markFirstStarted = resolve;
  });
  const originalImplementation =
    updateUserAttributesAtomically.getMockImplementation();
  updateUserAttributesAtomically
    .mockImplementationOnce(async (chatId, transform) => {
      markFirstStarted();
      await new Promise((resolve) => {
        releaseFirst = resolve;
      });

      return originalImplementation(chatId, transform);
    })
    .mockImplementation(originalImplementation);

  const first = activateChipPreference({
    chatId: CHAT_ID,
    teamId: 'T1',
    chip: EXTRA_BOOST_CHIP,
  });
  const second = activateChipPreference({
    chatId: CHAT_ID,
    teamId: 'T2',
    chip: LIMITLESS_CHIP,
  });
  await firstStarted;
  expect(updateUserAttributesAtomically).toHaveBeenCalledTimes(1);

  releaseFirst();
  await first;
  await second;
  expect(selectedChipCache[CHAT_ID]).toEqual({
    T1: EXTRA_BOOST_CHIP,
    T2: LIMITLESS_CHIP,
  });
});

test('clears chip and selected-best state together for a removed team', async () => {
  userCache[String(CHAT_ID)].selectedChipByTeam = {
    T1: EXTRA_BOOST_CHIP,
    T2: LIMITLESS_CHIP,
  };
  selectedChipCache[CHAT_ID] = {
    T1: EXTRA_BOOST_CHIP,
    T2: LIMITLESS_CHIP,
  };
  userCache[String(CHAT_ID)].selectedBestTeamByTeam.T2 =
    userCache[String(CHAT_ID)].selectedBestTeamByTeam.T1;

  await clearTeamDerivedPreferences({
    chatId: CHAT_ID,
    teamId: 'T1',
    attributes: { selectedTeam: 'T2' },
  });

  const transform = updateUserAttributesAtomically.mock.calls[0][1];
  expect(
    transform({
      selectedChipByTeam: JSON.stringify({
        T1: EXTRA_BOOST_CHIP,
        T2: LIMITLESS_CHIP,
      }),
      selectedBestTeamByTeam: JSON.stringify(
        userCache[String(CHAT_ID)].selectedBestTeamByTeam,
      ),
    }),
  ).toMatchObject({
    selectedTeam: 'T2',
    selectedChipByTeam: JSON.stringify({ T2: LIMITLESS_CHIP }),
  });
  expect(selectedChipCache[CHAT_ID]).toEqual({
    T2: LIMITLESS_CHIP,
  });
  expect(userCache[String(CHAT_ID)].selectedBestTeamByTeam.T1).toBeUndefined();
});

describe('expiry lifecycle', () => {
  afterEach(() => jest.restoreAllMocks());

  test('stores an expiry, keeps it on a no-op, and renews only after expiration', async () => {
    const { createChipExpiry } = require('./chipExpiryScheduleService');
    await activateChipPreference({ chatId: CHAT_ID, teamId: 'T1', chip: EXTRA_BOOST_CHIP });
    expect(userCache[CHAT_ID].selectedChipExpiryByTeam.T1).toEqual(activeExpiry);
    const later = {
      selectedAt: activeExpiry.expiresAt,
      expiresAt: new Date(Date.parse(activeExpiry.expiresAt) + 86400000).toISOString(),
    };
    createChipExpiry.mockResolvedValue(later);
    expect((await activateChipPreference({ chatId: CHAT_ID, teamId: 'T1', chip: EXTRA_BOOST_CHIP })).changed).toBe(false);
    expect(userCache[CHAT_ID].selectedChipExpiryByTeam.T1).toEqual(activeExpiry);
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse(activeExpiry.expiresAt));
    expect((await activateChipPreference({ chatId: CHAT_ID, teamId: 'T1', chip: EXTRA_BOOST_CHIP })).changed).toBe(true);
    expect(userCache[CHAT_ID].selectedChipExpiryByTeam.T1).toEqual(later);
  });

  test('storage failures cannot make an expired cached chip active', async () => {
    setCachedChipPreferences(CHAT_ID, { T1: EXTRA_BOOST_CHIP }, null, { T1: activeExpiry });
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse(activeExpiry.expiresAt));
    getUserById.mockRejectedValue(new Error('offline'));
    expect(await getFreshChipPreference(CHAT_ID, 'T1')).toEqual({ fresh: false, chip: WITHOUT_CHIP });
    expect(require('../cache').getActiveChip(CHAT_ID, 'T1')).toBeUndefined();
  });

  test('refresh cleans legacy state and its dependent recommendation', async () => {
    userCache[CHAT_ID].selectedChipByTeam = { T1: EXTRA_BOOST_CHIP };
    userCache[CHAT_ID].selectedChipExpiryByTeam = {};
    getUserById.mockResolvedValue({ ...userCache[CHAT_ID] });
    expect(await getFreshChipPreference(CHAT_ID, 'T1')).toEqual({ fresh: true, chip: WITHOUT_CHIP });
    expect(userCache[CHAT_ID].selectedChipByTeam).toEqual({});
    expect(userCache[CHAT_ID].selectedBestTeamByTeam.T1).toBeUndefined();
    expect(bestTeamsCache[CHAT_ID].T1).toBeUndefined();
  });

  test('cleanup rechecks authoritative state and preserves a concurrent new selection', async () => {
    const { cleanupExpiredChipPreferences } = require('./activateChipService');
    setCachedChipPreferences(CHAT_ID, { T1: EXTRA_BOOST_CHIP }, null, {});
    updateUserAttributesAtomically.mockImplementation(async (_, transform) => {
      const user = {
        selectedChipByTeam: JSON.stringify({ T1: LIMITLESS_CHIP }),
        selectedChipExpiryByTeam: JSON.stringify({ T1: activeExpiry }),
        selectedBestTeamByTeam: JSON.stringify(userCache[CHAT_ID].selectedBestTeamByTeam),
      };
      expect(transform(user)).toBeNull();

      return { updated: false, user };
    });
    await cleanupExpiredChipPreferences(CHAT_ID);
    expect(require('../cache').getActiveChip(CHAT_ID, 'T1')).toBe(LIMITLESS_CHIP);
    expect(userCache[CHAT_ID].selectedBestTeamByTeam.T1).toBeDefined();
  });

  test('cleanup removes only expired team preferences and manual reset removes metadata', async () => {
    const { cleanupExpiredChipPreferences } = require('./activateChipService');
    userCache[CHAT_ID].selectedChipByTeam = { T1: EXTRA_BOOST_CHIP, T2: LIMITLESS_CHIP };
    userCache[CHAT_ID].selectedChipExpiryByTeam = { T2: activeExpiry };
    await cleanupExpiredChipPreferences(CHAT_ID);
    expect(userCache[CHAT_ID].selectedChipByTeam).toEqual({ T2: LIMITLESS_CHIP });
    expect(userCache[CHAT_ID].selectedChipExpiryByTeam).toEqual({ T2: activeExpiry });
    await activateChipPreference({ chatId: CHAT_ID, teamId: 'T2', chip: WITHOUT_CHIP });
    expect(userCache[CHAT_ID].selectedChipExpiryByTeam).toEqual({});
  });
});
