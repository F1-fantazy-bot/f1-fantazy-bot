const {
  currentTeamCache,
  userCache,
} = require('../cache');
const {
  ACTION,
  createFollowTeamService,
} = require('./followTeamService');

const CHAT_ID = 42;

function leagueTeam(overrides = {}) {
  return {
    teamName: 'Fast Friends',
    userName: 'Owner',
    teamNo: 1,
    drivers: [],
    constructors: [],
    ...overrides,
  };
}

function createHarness({
  leagues = [{ leagueCode: 'ABC123', leagueName: 'Friends' }],
  teams = [leagueTeam()],
  storedTeams = {},
} = {}) {
  let durableTeams = { ...storedTeams };
  const storage = {
    listUserTeams: jest.fn(async () => ({ ...durableTeams })),
    saveUserTeam: jest.fn(async (_chatId, teamId, teamData) => {
      durableTeams[teamId] = teamData;
    }),
    deleteUserTeam: jest.fn(async (_chatId, teamId) => {
      delete durableTeams[teamId];
    }),
    deleteAllUserTeams: jest.fn(async () => {
      durableTeams = {};
    }),
  };
  const sourceSwitcher = jest.fn(async () => false);
  const restoreTeamState = jest.fn();
  const clearTeamDerivedPreferences = jest.fn(async () => ({}));
  const listUserLeagues = jest.fn(async () => leagues);
  const loadLeagueTeamsData = jest.fn(async (leagueCode) => ({
    leagueCode,
    teams,
  }));
  const service = createFollowTeamService({
    storage,
    logger: jest.fn(),
    sourceSwitcher,
    listUserLeagues,
    loadLeagueTeamsData,
    mapLeagueTeamToBotTeam: jest.fn((team) => ({
      teamName: team.teamName,
      drivers: [],
      constructors: [],
    })),
    runMutation: async (_chatId, operation) => await operation(),
    clearTeamDerivedPreferences,
    captureTeamState: jest.fn(() => ({ teams: {} })),
    restoreTeamState,
  });

  return {
    service,
    storage,
    sourceSwitcher,
    restoreTeamState,
    clearTeamDerivedPreferences,
    listUserLeagues,
    loadLeagueTeamsData,
  };
}

beforeEach(() => {
  delete currentTeamCache[CHAT_ID];
  delete userCache[String(CHAT_ID)];
});

afterEach(() => {
  delete currentTeamCache[CHAT_ID];
  delete userCache[String(CHAT_ID)];
});

test('resolves only exact canonical IDs or exact case-insensitive names', async () => {
  const { service } = createHarness();

  await expect(
    service.inspect({
      chatId: CHAT_ID,
      action: ACTION.ADD,
      leagueCode: 'abc123',
      teamId: 'Owner_1',
    }),
  ).resolves.toMatchObject({
    status: 'ok',
    teamId: 'Owner_1',
    teamName: 'Fast Friends',
  });
  await expect(
    service.inspect({
      chatId: CHAT_ID,
      action: ACTION.ADD,
      leagueCode: 'ABC123',
      teamName: 'fast friends',
    }),
  ).resolves.toMatchObject({ status: 'ok', teamId: 'Owner_1' });
  await expect(
    service.inspect({
      chatId: CHAT_ID,
      action: ACTION.ADD,
      leagueCode: 'ABC123',
      teamName: 'Fast',
    }),
  ).resolves.toMatchObject({ status: 'invalid_input' });
});

test('returns actionable invalid results for unfollowed leagues and ambiguous names', async () => {
  const unfollowed = createHarness();
  await expect(
    unfollowed.service.inspect({
      chatId: CHAT_ID,
      action: ACTION.ADD,
      leagueCode: 'OTHER',
      teamName: 'Fast Friends',
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    followedLeagues: [{ leagueCode: 'ABC123' }],
  });

  const ambiguous = createHarness({
    teams: [
      leagueTeam(),
      leagueTeam({ userName: 'Other', teamNo: 2 }),
    ],
  });
  const result = await ambiguous.service.inspect({
    chatId: CHAT_ID,
    action: ACTION.ADD,
    leagueCode: 'ABC123',
    teamName: 'fast friends',
  });
  expect(result).toMatchObject({
    status: 'invalid_input',
    availableTeams: [
      { teamId: 'Owner_1', leagueCode: 'ABC123' },
      { teamId: 'Other_2', leagueCode: 'ABC123' },
    ],
  });
  expect(result.summary).toContain('Owner_1');
  expect(result.summary).toContain('Other_2');
});

test('enforces the followed-team cap inside the service', async () => {
  const storedTeams = Object.fromEntries(
    Array.from({ length: 6 }, (_, index) => [
      `Owner_${index + 2}`,
      { teamName: `Existing ${index + 1}` },
    ]),
  );
  const { service, storage, sourceSwitcher } = createHarness({
    storedTeams,
  });

  const result = await service.mutate({
    chatId: CHAT_ID,
    action: ACTION.ADD,
    leagueCode: 'ABC123',
    teamId: 'Owner_1',
  });

  expect(result).toMatchObject({
    status: 'limit_exceeded',
    changed: false,
  });
  expect(storage.saveUserTeam).not.toHaveBeenCalled();
  expect(sourceSwitcher).not.toHaveBeenCalled();
});

test('requires an explicit nonempty followed league when adding', async () => {
  const {
    service,
    storage,
    loadLeagueTeamsData,
  } = createHarness();

  const result = await service.mutate({
    chatId: CHAT_ID,
    action: ACTION.ADD,
    leagueCode: '   ',
    teamId: 'Owner_1',
  });

  expect(result).toMatchObject({
    status: 'invalid_input',
    changed: false,
  });
  expect(loadLeagueTeamsData).not.toHaveBeenCalled();
  expect(storage.saveUserTeam).not.toHaveBeenCalled();
});

test('lists current league teams and marks already followed teams', async () => {
  currentTeamCache[CHAT_ID] = {
    Other_2: { teamName: 'Already Followed' },
  };
  userCache[String(CHAT_ID)] = { selectedTeam: 'Other_2' };
  const { service, loadLeagueTeamsData } = createHarness({
    storedTeams: currentTeamCache[CHAT_ID],
    teams: [
      leagueTeam({ position: 1 }),
      leagueTeam({
        teamName: 'Already Followed',
        userName: 'Other',
        teamNo: 2,
        position: 2,
      }),
    ],
  });

  const result = await service.listAvailableTeams({
    chatId: CHAT_ID,
    leagueCode: 'ABC123',
  });

  expect(loadLeagueTeamsData).toHaveBeenCalledWith('ABC123');
  expect(result).toMatchObject({
    status: 'ok',
    leagueCode: 'ABC123',
    teams: [
      expect.objectContaining({
        teamId: 'Owner_1',
        isFollowed: false,
        isSelected: false,
      }),
      expect.objectContaining({
        teamId: 'Other_2',
        isFollowed: true,
        isSelected: true,
      }),
    ],
  });
});

test('reports unavailable current roster data for the follow picker', async () => {
  const { service, loadLeagueTeamsData } = createHarness();
  loadLeagueTeamsData.mockResolvedValue(null);

  await expect(
    service.listAvailableTeams({
      chatId: CHAT_ID,
      leagueCode: 'ABC123',
    }),
  ).resolves.toMatchObject({
    status: 'not_found',
    leagueCode: 'ABC123',
    teams: [],
  });
});

test('warns about and wipes screenshot teams before adding a league team', async () => {
  userCache[String(CHAT_ID)] = { selectedTeam: 'T1' };
  const {
    service,
    storage,
    sourceSwitcher,
    clearTeamDerivedPreferences,
  } = createHarness({
    storedTeams: {
      T1: { drivers: ['VER'] },
      T2: { drivers: ['NOR'] },
    },
  });
  sourceSwitcher.mockResolvedValue(true);
  const inspected = await service.inspect({
    chatId: CHAT_ID,
    action: ACTION.ADD,
    leagueCode: 'ABC123',
    teamId: 'Owner_1',
  });
  const summary = service.buildSummary(CHAT_ID, {
    ...inspected,
    action: ACTION.ADD,
  });
  expect(summary).toContain('T1/T2');
  expect(summary).toContain('Fast Friends');

  const result = await service.mutate({
    chatId: CHAT_ID,
    action: ACTION.ADD,
    leagueCode: 'ABC123',
    teamId: 'Owner_1',
  });
  expect(sourceSwitcher).toHaveBeenCalledWith(CHAT_ID);
  expect(storage.saveUserTeam).toHaveBeenCalledWith(
    CHAT_ID,
    'Owner_1',
    expect.objectContaining({ teamName: 'Fast Friends' }),
  );
  expect(clearTeamDerivedPreferences).toHaveBeenCalledWith({
    chatId: CHAT_ID,
    teamId: 'Owner_1',
    attributes: { selectedTeam: 'Owner_1' },
  });
  expect(userCache[String(CHAT_ID)].selectedTeam).toBe('Owner_1');
  expect(result).toMatchObject({
    status: 'ok',
    clearedScreenshotTeamIds: ['T1', 'T2'],
    selectedTeamId: 'Owner_1',
  });
});

test('preserves the selected team when adding without a source switch', async () => {
  currentTeamCache[CHAT_ID] = {
    Existing_1: { teamName: 'Existing' },
  };
  userCache[String(CHAT_ID)] = { selectedTeam: 'Existing_1' };
  const {
    service,
    clearTeamDerivedPreferences,
  } = createHarness({
    storedTeams: currentTeamCache[CHAT_ID],
  });

  const result = await service.mutate({
    chatId: CHAT_ID,
    action: ACTION.ADD,
    leagueCode: 'ABC123',
    teamId: 'Owner_1',
  });

  expect(clearTeamDerivedPreferences).toHaveBeenCalledWith({
    chatId: CHAT_ID,
    teamId: 'Owner_1',
  });
  expect(userCache[String(CHAT_ID)].selectedTeam).toBe('Existing_1');
  expect(result.selectedTeamId).toBeUndefined();
});

test('refuses a newly destructive source switch after proposal', async () => {
  const { service, storage, sourceSwitcher } = createHarness({
    storedTeams: { T1: { drivers: ['VER'] } },
  });

  const result = await service.mutate({
    chatId: CHAT_ID,
    action: ACTION.ADD,
    leagueCode: 'ABC123',
    teamId: 'Owner_1',
    expectedScreenshotTeamIds: [],
  });

  expect(result).toMatchObject({
    status: 'invalid_input',
    changed: false,
    screenshotTeamIds: ['T1'],
  });
  expect(sourceSwitcher).not.toHaveBeenCalled();
  expect(storage.saveUserTeam).not.toHaveBeenCalled();
});

test('removes a followed team and updates selected-team fallback', async () => {
  currentTeamCache[CHAT_ID] = {
    Owner_1: { teamName: 'Fast Friends' },
    Other_2: { teamName: 'Other' },
  };
  userCache[String(CHAT_ID)] = { selectedTeam: 'Owner_1' };
  const { service, storage, clearTeamDerivedPreferences } = createHarness({
    storedTeams: currentTeamCache[CHAT_ID],
  });

  const result = await service.mutate({
    chatId: CHAT_ID,
    action: ACTION.REMOVE,
    leagueCode: 'ABC123',
    teamId: 'Owner_1',
  });

  expect(storage.deleteUserTeam).toHaveBeenCalledWith(
    CHAT_ID,
    'Owner_1',
  );
  expect(clearTeamDerivedPreferences).toHaveBeenCalledWith({
    chatId: CHAT_ID,
    teamId: 'Owner_1',
    attributes: { selectedTeam: 'Other_2' },
  });
  expect(result).toMatchObject({
    status: 'ok',
    removed: true,
    fallbackSelectedTeam: 'Other_2',
  });
});

test('authorizes exact-ID removal from stored teams without loading a stale roster', async () => {
  const {
    service,
    storage,
    loadLeagueTeamsData,
  } = createHarness({
    teams: [],
    storedTeams: {
      Owner_1: { teamName: 'Fast Friends' },
    },
  });

  const result = await service.mutate({
    chatId: CHAT_ID,
    action: ACTION.REMOVE,
    leagueCode: 'ABC123',
    teamId: 'Owner_1',
  });

  expect(result).toMatchObject({
    status: 'ok',
    removed: true,
    teamName: 'Fast Friends',
    leagueCode: 'ABC123',
  });
  expect(loadLeagueTeamsData).not.toHaveBeenCalled();
  expect(storage.deleteUserTeam).toHaveBeenCalledWith(
    CHAT_ID,
    'Owner_1',
  );
});

test('preserves Telegram exact-ID removal when no leagues remain followed', async () => {
  const {
    service,
    storage,
    loadLeagueTeamsData,
  } = createHarness({
    leagues: [],
    teams: [],
    storedTeams: {
      Owner_1: { teamName: 'Fast Friends' },
    },
  });

  const inspected = await service.inspect({
    chatId: CHAT_ID,
    action: ACTION.REMOVE,
    teamId: 'Owner_1',
  });
  expect(
    service.buildSummary(CHAT_ID, {
      ...inspected,
      action: ACTION.REMOVE,
    }),
  ).toBe('Stop following tracked team "Fast Friends" (Owner_1).');

  const result = await service.mutate({
    chatId: CHAT_ID,
    action: ACTION.REMOVE,
    teamId: 'Owner_1',
  });

  expect(result).toMatchObject({
    status: 'ok',
    removed: true,
    teamId: 'Owner_1',
  });
  expect(result.leagueCode).toBeUndefined();
  expect(loadLeagueTeamsData).not.toHaveBeenCalled();
  expect(storage.deleteUserTeam).toHaveBeenCalledWith(
    CHAT_ID,
    'Owner_1',
  );
});

test('validates a supplied removal league separately from stored-team ownership', async () => {
  const {
    service,
    storage,
    loadLeagueTeamsData,
  } = createHarness({
    storedTeams: {
      Owner_1: { teamName: 'Fast Friends' },
    },
  });

  const result = await service.mutate({
    chatId: CHAT_ID,
    action: ACTION.REMOVE,
    leagueCode: 'NOTMINE',
    teamId: 'Owner_1',
  });

  expect(result).toMatchObject({
    status: 'invalid_input',
    changed: false,
  });
  expect(loadLeagueTeamsData).not.toHaveBeenCalled();
  expect(storage.deleteUserTeam).not.toHaveBeenCalled();
});

test('does not authorize exact-ID removal from roster membership alone', async () => {
  const {
    service,
    storage,
    loadLeagueTeamsData,
  } = createHarness();

  const result = await service.mutate({
    chatId: CHAT_ID,
    action: ACTION.REMOVE,
    leagueCode: 'ABC123',
    teamId: 'Owner_1',
  });

  expect(result).toMatchObject({
    status: 'not_found',
    changed: false,
  });
  expect(loadLeagueTeamsData).not.toHaveBeenCalled();
  expect(storage.deleteUserTeam).not.toHaveBeenCalled();
});

test('restores the authoritative snapshot when persistence fails', async () => {
  const { service, storage, restoreTeamState } = createHarness();
  const error = new Error('blob unavailable');
  storage.saveUserTeam.mockRejectedValue(error);

  await expect(
    service.mutate({
      chatId: CHAT_ID,
      action: ACTION.ADD,
      leagueCode: 'ABC123',
      teamId: 'Owner_1',
    }),
  ).rejects.toThrow('blob unavailable');
  expect(restoreTeamState).toHaveBeenCalledWith(
    CHAT_ID,
    { teams: {} },
  );
});
