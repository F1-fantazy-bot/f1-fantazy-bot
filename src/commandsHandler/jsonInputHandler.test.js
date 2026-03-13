const {
  KILZI_CHAT_ID,
  EXTRA_DRS_CHIP,
  LIMITLESS_CHIP,
} = require('../constants');

const azureStorageService = require('../azureStorageService');
jest.mock('../azureStorageService', () => ({
  deleteAllUserTeams: jest.fn().mockResolvedValue(undefined),
  saveUserTeam: jest.fn().mockResolvedValue(undefined),
}));

const { updateUserAttributes } = require('../userRegistryService');
jest.mock('../userRegistryService', () => ({
  updateUserAttributes: jest.fn().mockResolvedValue(undefined),
}));

const {
  sharedKey,
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
  userCache,
} = require('../cache');

const { handleJsonMessage } = require('./jsonInputHandler');

describe('handleJsonMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete currentTeamCache[KILZI_CHAT_ID];
    delete bestTeamsCache[KILZI_CHAT_ID];
    delete selectedChipCache[KILZI_CHAT_ID];
    delete userCache[String(KILZI_CHAT_ID)];
    delete driversCache[sharedKey];
    delete constructorsCache[sharedKey];
  });

  it('imports a full /print_cache snapshot and persists teams without metadata', async () => {
    bestTeamsCache[KILZI_CHAT_ID] = {
      T1: { stale: true },
    };

    const jsonData = {
      Drivers: [
        { DR: 'VER', price: 30.5, expectedPoints: 25 },
        { DR: 'HAM', price: 20.1, expectedPoints: 18 },
      ],
      Constructors: [
        { CN: 'RBR', price: 25.5, expectedPoints: 30 },
        { CN: 'MER', price: 18.2, expectedPoints: 21 },
      ],
      SelectedTeam: 'T2',
      Teams: {
        T1: {
          drivers: ['VER', 'HAM'],
          constructors: ['RBR', 'MER'],
          drsBoost: 'VER',
          freeTransfers: 2,
          costCapRemaining: 3.5,
          chip: EXTRA_DRS_CHIP,
          bestTeamPointsWeight: 0.8,
        },
        T2: {
          drivers: ['HAM', 'VER'],
          constructors: ['MER', 'RBR'],
          drsBoost: 'HAM',
          freeTransfers: 1,
          costCapRemaining: 1.1,
          bestTeamBudgetChangePointsPerMillion: 2,
        },
      },
    };

    await handleJsonMessage(botMock, KILZI_CHAT_ID, jsonData);

    expect(driversCache[KILZI_CHAT_ID]).toEqual({
      VER: { DR: 'VER', price: 30.5, expectedPoints: 25 },
      HAM: { DR: 'HAM', price: 20.1, expectedPoints: 18 },
    });
    expect(constructorsCache[KILZI_CHAT_ID]).toEqual({
      RBR: { CN: 'RBR', price: 25.5, expectedPoints: 30 },
      MER: { CN: 'MER', price: 18.2, expectedPoints: 21 },
    });
    expect(currentTeamCache[KILZI_CHAT_ID]).toEqual({
      T1: {
        drivers: ['VER', 'HAM'],
        constructors: ['RBR', 'MER'],
        drsBoost: 'VER',
        freeTransfers: 2,
        costCapRemaining: 3.5,
      },
      T2: {
        drivers: ['HAM', 'VER'],
        constructors: ['MER', 'RBR'],
        drsBoost: 'HAM',
        freeTransfers: 1,
        costCapRemaining: 1.1,
      },
    });
    expect(selectedChipCache[KILZI_CHAT_ID]).toEqual({
      T1: EXTRA_DRS_CHIP,
    });
    expect(bestTeamsCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(userCache[String(KILZI_CHAT_ID)]).toEqual({
      selectedTeam: 'T2',
      bestTeamBudgetChangePointsPerMillion: {
        T1: 1.65,
        T2: 2,
      },
    });

    expect(azureStorageService.deleteAllUserTeams).toHaveBeenCalledWith(
      botMock,
      KILZI_CHAT_ID,
    );
    expect(azureStorageService.saveUserTeam).toHaveBeenNthCalledWith(
      1,
      botMock,
      KILZI_CHAT_ID,
      'T1',
      currentTeamCache[KILZI_CHAT_ID].T1,
    );
    expect(azureStorageService.saveUserTeam).toHaveBeenNthCalledWith(
      2,
      botMock,
      KILZI_CHAT_ID,
      'T2',
      currentTeamCache[KILZI_CHAT_ID].T2,
    );
    expect(
      azureStorageService.deleteAllUserTeams.mock.invocationCallOrder[0],
    ).toBeLessThan(
      azureStorageService.saveUserTeam.mock.invocationCallOrder[0],
    );

    expect(updateUserAttributes).toHaveBeenCalledWith(KILZI_CHAT_ID, {
      selectedTeam: 'T2',
      bestTeamBudgetChangePointsPerMillion: JSON.stringify({
        T1: 1.65,
        T2: 2,
      }),
    });
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Cache data saved successfully',
    );
  });

  it('replaces existing user-scoped cache state instead of merging', async () => {
    driversCache[KILZI_CHAT_ID] = {
      OLD: { DR: 'OLD', price: 99 },
    };
    constructorsCache[KILZI_CHAT_ID] = {
      OLD: { CN: 'OLD', price: 88 },
    };
    currentTeamCache[KILZI_CHAT_ID] = {
      T1: {
        drivers: ['OLD'],
        constructors: ['OLD'],
        drsBoost: 'OLD',
        freeTransfers: 5,
        costCapRemaining: 20,
      },
      T9: {
        drivers: ['STALE'],
        constructors: ['STALE'],
        drsBoost: 'STALE',
        freeTransfers: 3,
        costCapRemaining: 9,
      },
    };
    selectedChipCache[KILZI_CHAT_ID] = {
      T1: EXTRA_DRS_CHIP,
      T9: LIMITLESS_CHIP,
    };
    bestTeamsCache[KILZI_CHAT_ID] = {
      T1: { stale: true },
    };
    userCache[String(KILZI_CHAT_ID)] = {
      lang: 'en',
      selectedTeam: 'T9',
      bestTeamBudgetChangePointsPerMillion: { T1: 1.3, T9: 2 },
    };

    const jsonData = {
      Drivers: [{ DR: 'NOR', price: 21 }],
      Constructors: [{ CN: 'MCL', price: 24 }],
      SelectedTeam: 'T1',
      Teams: {
        T1: {
          drivers: ['NOR'],
          constructors: ['MCL'],
          drsBoost: 'NOR',
          freeTransfers: 2,
          costCapRemaining: 4,
          bestTeamBudgetChangePointsPerMillion: 2,
        },
      },
    };

    await handleJsonMessage(botMock, KILZI_CHAT_ID, jsonData);

    expect(driversCache[KILZI_CHAT_ID]).toEqual({
      NOR: { DR: 'NOR', price: 21 },
    });
    expect(constructorsCache[KILZI_CHAT_ID]).toEqual({
      MCL: { CN: 'MCL', price: 24 },
    });
    expect(currentTeamCache[KILZI_CHAT_ID]).toEqual({
      T1: {
        drivers: ['NOR'],
        constructors: ['MCL'],
        drsBoost: 'NOR',
        freeTransfers: 2,
        costCapRemaining: 4,
      },
    });
    expect(selectedChipCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(bestTeamsCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(userCache[String(KILZI_CHAT_ID)]).toEqual({
      lang: 'en',
      selectedTeam: 'T1',
      bestTeamBudgetChangePointsPerMillion: { T1: 2 },
    });
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Cache data saved successfully',
    );
  });

  it('clears user-scoped cache entries for an empty snapshot while keeping shared fallback data', async () => {
    driversCache[sharedKey] = {
      VER: { DR: 'VER', price: 30 },
    };
    constructorsCache[sharedKey] = {
      RBR: { CN: 'RBR', price: 20 },
    };
    driversCache[KILZI_CHAT_ID] = {
      HAM: { DR: 'HAM', price: 22 },
    };
    constructorsCache[KILZI_CHAT_ID] = {
      MER: { CN: 'MER', price: 19 },
    };
    currentTeamCache[KILZI_CHAT_ID] = {
      T1: {
        drivers: ['HAM'],
        constructors: ['MER'],
        drsBoost: 'HAM',
        freeTransfers: 2,
        costCapRemaining: 4,
      },
    };
    selectedChipCache[KILZI_CHAT_ID] = {
      T1: EXTRA_DRS_CHIP,
    };
    userCache[String(KILZI_CHAT_ID)] = {
      lang: 'en',
      selectedTeam: 'T1',
      bestTeamBudgetChangePointsPerMillion: { T1: 1.65 },
    };

    await handleJsonMessage(botMock, KILZI_CHAT_ID, {
      Drivers: [],
      Constructors: [],
      SelectedTeam: null,
      Teams: {},
    });

    expect(driversCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(constructorsCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(currentTeamCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(selectedChipCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(driversCache[sharedKey]).toEqual({
      VER: { DR: 'VER', price: 30 },
    });
    expect(constructorsCache[sharedKey]).toEqual({
      RBR: { CN: 'RBR', price: 20 },
    });
    expect(userCache[String(KILZI_CHAT_ID)]).toEqual({
      lang: 'en',
      selectedTeam: null,
      bestTeamBudgetChangePointsPerMillion: {},
    });
    expect(azureStorageService.deleteAllUserTeams).toHaveBeenCalledWith(
      botMock,
      KILZI_CHAT_ID,
    );
    expect(azureStorageService.saveUserTeam).not.toHaveBeenCalled();
    expect(updateUserAttributes).toHaveBeenCalledWith(KILZI_CHAT_ID, {
      selectedTeam: null,
      bestTeamBudgetChangePointsPerMillion: JSON.stringify({}),
    });
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Cache data saved successfully',
    );
  });

  it.each([
    {
      name: 'legacy CurrentTeam payload',
      payload: {
        Drivers: [],
        Constructors: [],
        CurrentTeam: {},
      },
    },
    {
      name: 'non-object JSON',
      payload: 1.5,
    },
    {
      name: 'malformed Teams value',
      payload: {
        Drivers: [],
        Constructors: [],
        SelectedTeam: null,
        Teams: [],
      },
    },
    {
      name: 'SelectedTeam missing from Teams',
      payload: {
        Drivers: [],
        Constructors: [],
        SelectedTeam: 'T2',
        Teams: {
          T1: {
            drivers: ['VER'],
            constructors: ['RBR'],
            drsBoost: 'VER',
            freeTransfers: 2,
            costCapRemaining: 1,
            bestTeamBudgetChangePointsPerMillion: 1.65,
          },
        },
      },
    },
    {
      name: 'team entry missing metadata',
      payload: {
        Drivers: [],
        Constructors: [],
        SelectedTeam: null,
        Teams: {
          T1: {
            drivers: ['VER'],
            constructors: ['RBR'],
            drsBoost: 'VER',
            freeTransfers: 2,
            costCapRemaining: 1,
          },
        },
      },
    },
  ])('rejects invalid snapshot: $name without mutating cache state', async ({ payload }) => {
    driversCache[KILZI_CHAT_ID] = {
      VER: { DR: 'VER', price: 30 },
    };
    constructorsCache[KILZI_CHAT_ID] = {
      RBR: { CN: 'RBR', price: 20 },
    };
    currentTeamCache[KILZI_CHAT_ID] = {
      T1: {
        drivers: ['VER'],
        constructors: ['RBR'],
        drsBoost: 'VER',
        freeTransfers: 2,
        costCapRemaining: 4,
      },
    };
    selectedChipCache[KILZI_CHAT_ID] = {
      T1: EXTRA_DRS_CHIP,
    };
    bestTeamsCache[KILZI_CHAT_ID] = {
      T1: { stale: true },
    };
    userCache[String(KILZI_CHAT_ID)] = {
      selectedTeam: 'T1',
      bestTeamBudgetChangePointsPerMillion: { T1: 1.65 },
    };

    const beforeState = {
      drivers: JSON.parse(JSON.stringify(driversCache[KILZI_CHAT_ID])),
      constructors: JSON.parse(JSON.stringify(constructorsCache[KILZI_CHAT_ID])),
      teams: JSON.parse(JSON.stringify(currentTeamCache[KILZI_CHAT_ID])),
      chips: JSON.parse(JSON.stringify(selectedChipCache[KILZI_CHAT_ID])),
      bestTeams: JSON.parse(JSON.stringify(bestTeamsCache[KILZI_CHAT_ID])),
      user: JSON.parse(JSON.stringify(userCache[String(KILZI_CHAT_ID)])),
    };

    await handleJsonMessage(botMock, KILZI_CHAT_ID, payload);

    expect(driversCache[KILZI_CHAT_ID]).toEqual(beforeState.drivers);
    expect(constructorsCache[KILZI_CHAT_ID]).toEqual(beforeState.constructors);
    expect(currentTeamCache[KILZI_CHAT_ID]).toEqual(beforeState.teams);
    expect(selectedChipCache[KILZI_CHAT_ID]).toEqual(beforeState.chips);
    expect(bestTeamsCache[KILZI_CHAT_ID]).toEqual(beforeState.bestTeams);
    expect(userCache[String(KILZI_CHAT_ID)]).toEqual(beforeState.user);
    expect(azureStorageService.deleteAllUserTeams).not.toHaveBeenCalled();
    expect(azureStorageService.saveUserTeam).not.toHaveBeenCalled();
    expect(updateUserAttributes).not.toHaveBeenCalled();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Invalid cache snapshot. Paste the JSON output of /print_cache.',
    );
  });
});
