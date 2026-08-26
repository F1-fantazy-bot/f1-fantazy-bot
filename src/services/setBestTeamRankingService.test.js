jest.mock('../userRegistryService', () => ({
  updateUserAttributesAtomically: jest.fn(),
  getUserById: jest.fn(),
}));

const {
  updateUserAttributesAtomically,
  getUserById,
} = require('../userRegistryService');
const {
  bestTeamsCache,
  currentTeamCache,
  userCache,
  getBestTeamBudgetChangePointsPerMillion,
} = require('../cache');
const {
  getFreshUserProfile,
  resetUserProfileSyncForTests,
} = require('./userProfileSyncService');
const {
  setSelectedBestTeamPreference,
} = require('./selectedBestTeamService');
const {
  getPreset,
  getFreshBestTeamRankingPreference,
  refreshBestTeamRankingPreferencesSafely,
  setBestTeamRankingPreference,
  setCachedRankingPreferences,
  resetBestTeamRankingSyncForTests,
} = require('./setBestTeamRankingService');

const CHAT_ID = 42;

beforeEach(() => {
  jest.clearAllMocks();
  resetBestTeamRankingSyncForTests();
  resetUserProfileSyncForTests();
  updateUserAttributesAtomically.mockImplementation(
    async (_chatId, transform) => {
      const current = {
        bestTeamBudgetChangePointsPerMillion: JSON.stringify(
          userCache[String(CHAT_ID)]
            .bestTeamBudgetChangePointsPerMillion,
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
  getUserById.mockResolvedValue(null);
  currentTeamCache[CHAT_ID] = {
    T1: { teamName: 'Kilzid' },
    T2: { teamName: 'Kilzid 2' },
  };
  userCache[String(CHAT_ID)] = {
    bestTeamBudgetChangePointsPerMillion: { T1: 0 },
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
});

afterEach(() => {
  delete currentTeamCache[CHAT_ID];
  delete userCache[String(CHAT_ID)];
  delete bestTeamsCache[CHAT_ID];
});

test('resolves the fixed ranking presets', () => {
  expect(getPreset('points_plus_budget')).toMatchObject({
    budgetChangePointsPerMillion: 1.65,
    labelKey: 'Points Plus Budget',
  });
  expect(getPreset('unknown')).toBeNull();
});

test('persists before mutating preference and dependent caches', async () => {
  let cachedValueDuringWrite;
  let bestTeamsDuringWrite;
  updateUserAttributesAtomically.mockImplementation(async (_chatId, transform) => {
    cachedValueDuringWrite =
      getBestTeamBudgetChangePointsPerMillion(CHAT_ID, 'T1');
    bestTeamsDuringWrite = bestTeamsCache[CHAT_ID].T1;
    const attributes = await transform({
      bestTeamBudgetChangePointsPerMillion: JSON.stringify({ T1: 0 }),
      selectedBestTeamByTeam: JSON.stringify(
        userCache[String(CHAT_ID)].selectedBestTeamByTeam,
      ),
    });

    return { updated: true, user: attributes };
  });

  const result = await setBestTeamRankingPreference({
    chatId: CHAT_ID,
    teamId: 'T1',
    presetId: 'points_plus_budget',
  });

  expect(cachedValueDuringWrite).toBe(0);
  expect(bestTeamsDuringWrite).toEqual({ bestTeams: ['cached'] });
  expect(updateUserAttributesAtomically).toHaveBeenCalledWith(
    CHAT_ID,
    expect.any(Function),
  );
  expect(getBestTeamBudgetChangePointsPerMillion(CHAT_ID, 'T1')).toBe(1.65);
  expect(bestTeamsCache[CHAT_ID].T1).toBeUndefined();
  expect(bestTeamsCache[CHAT_ID].T2).toEqual({ bestTeams: ['keep'] });
  expect(result).toMatchObject({
    status: 'ok',
    teamId: 'T1',
    presetId: 'points_plus_budget',
    changed: true,
  });
});

test('does not mutate cache when persistence fails', async () => {
  updateUserAttributesAtomically.mockRejectedValue(
    new Error('table unavailable'),
  );

  await expect(
    setBestTeamRankingPreference({
      chatId: CHAT_ID,
      teamId: 'T1',
      presetId: 'points_lean',
    }),
  ).rejects.toThrow('table unavailable');
  expect(getBestTeamBudgetChangePointsPerMillion(CHAT_ID, 'T1')).toBe(0);
  expect(bestTeamsCache[CHAT_ID].T1).toBeDefined();
  expect(userCache[String(CHAT_ID)].selectedBestTeamByTeam.T1).toBeDefined();
});

test('durable no-op hydrates stale local state and invalidates its cache', async () => {
  updateUserAttributesAtomically.mockImplementation(
    async (_chatId, transform) => {
      const current = {
        bestTeamBudgetChangePointsPerMillion: JSON.stringify({ T1: 1.65 }),
        selectedBestTeamByTeam: '{}',
      };
      const attributes = await transform(current);

      return {
        updated: attributes !== null,
        user: attributes ? { ...current, ...attributes } : current,
      };
    },
  );

  const result = await setBestTeamRankingPreference({
    chatId: CHAT_ID,
    teamId: 'T1',
    presetId: 'points_plus_budget',
  });

  expect(result).toMatchObject({ status: 'ok', changed: false });
  expect(getBestTeamBudgetChangePointsPerMillion(CHAT_ID, 'T1')).toBe(1.65);
  expect(bestTeamsCache[CHAT_ID].T1).toBeUndefined();
});

test('missing durable entry is a pure-points no-op that preserves calculations', async () => {
  updateUserAttributesAtomically.mockImplementation(
    async (_chatId, transform) => {
      const current = {
        bestTeamBudgetChangePointsPerMillion: '{}',
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

  const result = await setBestTeamRankingPreference({
    chatId: CHAT_ID,
    teamId: 'T1',
    presetId: 'pure_points',
  });

  expect(result).toMatchObject({ status: 'ok', changed: false });
  expect(bestTeamsCache[CHAT_ID].T1).toEqual({ bestTeams: ['cached'] });
  expect(userCache[String(CHAT_ID)].selectedBestTeamByTeam.T1).toBeDefined();
});

test('returns invalid_input for unknown teams and presets', async () => {
  await expect(
    setBestTeamRankingPreference({
      chatId: CHAT_ID,
      teamId: 'foreign',
      presetId: 'pure_points',
    }),
  ).resolves.toMatchObject({ status: 'invalid_input' });
  await expect(
    setBestTeamRankingPreference({
      chatId: CHAT_ID,
      teamId: 'T1',
      presetId: 'unknown',
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    availablePresets: expect.arrayContaining([
      expect.objectContaining({ id: 'pure_points' }),
    ]),
  });
  expect(updateUserAttributesAtomically).not.toHaveBeenCalled();
});

test('hydrates a ranking written by another Function process', async () => {
  getUserById.mockResolvedValue({
    bestTeamBudgetChangePointsPerMillion: JSON.stringify({ T1: 2 }),
    selectedBestTeamByTeam: '{}',
  });

  await expect(
    getFreshBestTeamRankingPreference(CHAT_ID, 'T1'),
  ).resolves.toEqual({ fresh: true, value: 2 });
  expect(getBestTeamBudgetChangePointsPerMillion(CHAT_ID, 'T1')).toBe(2);
  expect(bestTeamsCache[CHAT_ID].T1).toBeUndefined();
});

test('safe refresh falls back to initialized cache on registry failure', async () => {
  getUserById.mockRejectedValue(new Error('storage unavailable'));
  jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(
    refreshBestTeamRankingPreferencesSafely(CHAT_ID),
  ).resolves.toEqual({
    fresh: false,
    preferences: { T1: 0 },
  });
  expect(console.error).toHaveBeenCalledWith(
    'Error refreshing best-team ranking preferences:',
    expect.any(Error),
  );
});

test('does not let a stale profile overwrite a newer local write', async () => {
  let resolveLookup;
  getUserById.mockReturnValue(
    new Promise((resolve) => {
      resolveLookup = resolve;
    }),
  );

  const stale = getFreshBestTeamRankingPreference(CHAT_ID, 'T1');
  setCachedRankingPreferences(CHAT_ID, { T1: 2 }, {}, 'T1');
  resolveLookup({
    bestTeamBudgetChangePointsPerMillion: JSON.stringify({ T1: 1.3 }),
  });

  await expect(stale).resolves.toMatchObject({ fresh: false });
  expect(getBestTeamBudgetChangePointsPerMillion(CHAT_ID, 'T1')).toBe(2);
});

test('selected-best writes invalidate older ranking profile refreshes', async () => {
  let resolveLookup;
  getUserById.mockReturnValue(
    new Promise((resolve) => {
      resolveLookup = resolve;
    }),
  );

  const stale = getFreshBestTeamRankingPreference(CHAT_ID, 'T1');
  await setSelectedBestTeamPreference({
    chatId: CHAT_ID,
    teamId: 'T2',
    selectedBestTeam: {
      drivers: ['VER', 'NOR', 'PIA', 'LEC', 'HAM'],
      constructors: ['MCL', 'FER'],
      boostDriver: 'VER',
    },
  });
  resolveLookup({
    bestTeamBudgetChangePointsPerMillion: JSON.stringify({ T1: 0 }),
    selectedBestTeamByTeam: '{}',
  });

  await expect(stale).resolves.toMatchObject({ fresh: false });
  expect(userCache[String(CHAT_ID)].selectedBestTeamByTeam.T2).toBeDefined();
});

test('post-write refresh does not reuse a profile read started before write', async () => {
  let resolveOldLookup;
  let resolveNewLookup;
  getUserById
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOldLookup = resolve;
      }),
    )
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNewLookup = resolve;
      }),
    );

  const oldProfile = getFreshUserProfile(CHAT_ID);
  setCachedRankingPreferences(CHAT_ID, { T1: 2 }, {}, 'T1');
  const refreshed = getFreshBestTeamRankingPreference(CHAT_ID, 'T1');

  expect(getUserById).toHaveBeenCalledTimes(2);
  resolveNewLookup({
    bestTeamBudgetChangePointsPerMillion: JSON.stringify({ T1: 2 }),
  });
  await expect(refreshed).resolves.toEqual({ fresh: true, value: 2 });

  resolveOldLookup({
    bestTeamBudgetChangePointsPerMillion: JSON.stringify({ T1: 1.3 }),
  });
  await oldProfile;
  expect(getBestTeamBudgetChangePointsPerMillion(CHAT_ID, 'T1')).toBe(2);
});
