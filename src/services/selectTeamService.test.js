jest.mock('../userRegistryService', () => ({
  updateUserAttributes: jest.fn(),
  getUserById: jest.fn(),
}));
jest.mock('../azureStorageService', () => ({
  getUserTeam: jest.fn(),
}));

const {
  updateUserAttributes,
  getUserById,
} = require('../userRegistryService');
const { getUserTeam } = require('../azureStorageService');
const {
  userCache,
  currentTeamCache,
  getSelectedTeam,
} = require('../cache');
const {
  resolveTeamSelection,
  getFreshSelectedTeamPreference,
  selectTeamPreference,
  setCachedSelectedTeam,
  resetSelectedTeamSyncForTests,
} = require('./selectTeamService');
const {
  getFreshUserProfile,
  resetUserProfileSyncForTests,
} = require('./userProfileSyncService');

const CHAT_ID = 42;

beforeEach(() => {
  jest.clearAllMocks();
  resetSelectedTeamSyncForTests();
  resetUserProfileSyncForTests();
  updateUserAttributes.mockResolvedValue(undefined);
  getUserById.mockResolvedValue(null);
  getUserTeam.mockResolvedValue({ drivers: ['VER'] });
  delete userCache[String(CHAT_ID)];
  currentTeamCache[CHAT_ID] = {
    T1: { teamName: 'Kilzid' },
    T2: { teamName: 'Kilzid 2' },
  };
});

afterEach(() => {
  delete userCache[String(CHAT_ID)];
  delete currentTeamCache[CHAT_ID];
});

describe('resolveTeamSelection', () => {
  test('resolves owned teams by canonical id or exact display name', () => {
    expect(
      resolveTeamSelection({ chatId: CHAT_ID, teamId: 'T2' }),
    ).toMatchObject({ status: 'ok', teamId: 'T2', teamName: 'Kilzid 2' });
    expect(
      resolveTeamSelection({ chatId: CHAT_ID, teamName: 'kilzid' }),
    ).toMatchObject({ status: 'ok', teamId: 'T1', teamName: 'Kilzid' });
  });

  test('rejects unknown teams and lists valid choices', () => {
    const result = resolveTeamSelection({
      chatId: CHAT_ID,
      teamName: 'Other',
    });

    expect(result.status).toBe('invalid_input');
    expect(result.availableTeams).toHaveLength(2);
    expect(result.summary).toContain('Kilzid 2 (T2)');
  });

  test('defaults to the selected team only when requested by the caller', () => {
    userCache[String(CHAT_ID)] = { selectedTeam: 'T2' };

    expect(
      resolveTeamSelection({
        chatId: CHAT_ID,
        defaultToSelected: true,
      }),
    ).toMatchObject({
      status: 'ok',
      teamId: 'T2',
      teamName: 'Kilzid 2',
    });
    expect(resolveTeamSelection({ chatId: CHAT_ID })).toMatchObject({
      status: 'invalid_input',
    });
  });
});

describe('selectTeamPreference', () => {
  test('persists before mutating the local selected team', async () => {
    let selectedDuringWrite;
    updateUserAttributes.mockImplementation(async () => {
      selectedDuringWrite = getSelectedTeam(CHAT_ID);
    });

    const result = await selectTeamPreference({
      chatId: CHAT_ID,
      teamId: 'T2',
    });

    expect(selectedDuringWrite).toBeNull();
    expect(updateUserAttributes).toHaveBeenCalledWith(CHAT_ID, {
      selectedTeam: 'T2',
    });
    expect(getSelectedTeam(CHAT_ID)).toBe('T2');
    expect(result).toMatchObject({
      status: 'ok',
      teamId: 'T2',
      teamName: 'Kilzid 2',
      changed: true,
    });
  });

  test('does not mutate cache when Azure persistence fails', async () => {
    userCache[String(CHAT_ID)] = { selectedTeam: 'T1' };
    updateUserAttributes.mockRejectedValue(new Error('table unavailable'));

    await expect(
      selectTeamPreference({ chatId: CHAT_ID, teamId: 'T2' }),
    ).rejects.toThrow('table unavailable');
    expect(getSelectedTeam(CHAT_ID)).toBe('T1');
  });
});

describe('getFreshSelectedTeamPreference', () => {
  test('hydrates a selection written by another Function process', async () => {
    userCache[String(CHAT_ID)] = { selectedTeam: 'T1' };
    getUserById.mockResolvedValue({ selectedTeam: 'T2' });

    await expect(getFreshSelectedTeamPreference(CHAT_ID)).resolves.toEqual({
      fresh: true,
      selectedTeam: 'T2',
    });
    expect(getSelectedTeam(CHAT_ID)).toBe('T2');
  });

  test('ignores persisted team ids the user no longer owns', async () => {
    userCache[String(CHAT_ID)] = { selectedTeam: 'T1' };
    getUserById.mockResolvedValue({ selectedTeam: 'deleted-team' });

    await expect(getFreshSelectedTeamPreference(CHAT_ID)).resolves.toEqual({
      fresh: true,
      selectedTeam: null,
    });
    expect(getSelectedTeam(CHAT_ID)).toBeNull();
  });

  test('does not let an older refresh overwrite a newer local write', async () => {
    let resolveLookup;
    getUserById.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    const stale = getFreshSelectedTeamPreference(CHAT_ID);
    await selectTeamPreference({ chatId: CHAT_ID, teamId: 'T2' });
    resolveLookup({ selectedTeam: 'T1' });

    await expect(stale).resolves.toMatchObject({ fresh: false });
    expect(getSelectedTeam(CHAT_ID)).toBe('T2');
  });

  test('does not let an older refresh overwrite another local selection flow', async () => {
    let resolveLookup;
    getUserById.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    const stale = getFreshSelectedTeamPreference(CHAT_ID);
    setCachedSelectedTeam(CHAT_ID, 'T2');
    resolveLookup({ selectedTeam: 'T1' });

    await expect(stale).resolves.toMatchObject({ fresh: false });
    expect(getSelectedTeam(CHAT_ID)).toBe('T2');
  });

  test('post-write refresh does not reuse a profile read started before the write', async () => {
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
    setCachedSelectedTeam(CHAT_ID, 'T2');
    const refreshed = getFreshSelectedTeamPreference(CHAT_ID);

    expect(getUserById).toHaveBeenCalledTimes(2);
    resolveNewLookup({ selectedTeam: 'T2' });
    await expect(refreshed).resolves.toEqual({
      fresh: true,
      selectedTeam: 'T2',
    });

    resolveOldLookup({ selectedTeam: 'T1' });
    await oldProfile;
    expect(getSelectedTeam(CHAT_ID)).toBe('T2');
  });
});
