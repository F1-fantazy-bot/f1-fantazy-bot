jest.mock('../azureStorageService');
jest.mock('../leagueRegistryService');
jest.mock('../services/selectedBestTeamService', () => ({
  retainSelectedBestTeamPreferences: jest.fn(),
}));
jest.mock('../services/activateChipService', () => ({
  clearTeamDerivedPreferences: jest.fn().mockResolvedValue({}),
  runChipMutation: jest.fn(async (_chatId, operation) => operation()),
}));
jest.mock('../services/teamStateSnapshotService', () => ({
  captureTeamState: jest.fn(() => ({ snapshot: true })),
  restoreTeamState: jest.fn(),
}));
jest.mock('../utils/teamSourceSwitcher');
jest.mock('../utils/utils', () => ({
  sendLogMessage: jest.fn().mockResolvedValue(undefined),
  sendErrorMessage: jest.fn().mockResolvedValue(undefined),
  getDisplayName: (id) => String(id),
}));

const azureStorageService = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const {
  retainSelectedBestTeamPreferences,
} = require('../services/selectedBestTeamService');
const {
  ensureSourceIsLeague,
} = require('../utils/teamSourceSwitcher');
const {
  restoreTeamState,
} = require('../services/teamStateSnapshotService');
const cache = require('../cache');
const {
  handleTeamsTrackerCommand,
  handleTeamsTrackerCallback,
} = require('./teamsTrackerHandler');
const { COMMAND_FOLLOW_LEAGUE } = require('../constants');

function makeBot() {
  return {
    sendMessage: jest.fn().mockResolvedValue({ message_id: 42 }),
    editMessageText: jest.fn().mockResolvedValue(undefined),
    answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
  };
}

function seedLeagueRoster(leagueCode, teams) {
  azureStorageService.getLeagueTeamsData.mockImplementation((code) => {
    if (code === leagueCode) {
      return Promise.resolve({ leagueCode, teams });
    }

    return Promise.resolve(null);
  });
}

describe('handleTeamsTrackerCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(cache.currentTeamCache).forEach(
      (k) => delete cache.currentTeamCache[k],
    );
    Object.keys(cache.userCache).forEach((k) => delete cache.userCache[k]);
    Object.keys(cache.leagueTeamsDataCache).forEach(
      (k) => delete cache.leagueTeamsDataCache[k],
    );
    azureStorageService.saveTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(undefined);
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(null);
    azureStorageService.deleteTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(undefined);
    azureStorageService.getLeagueTeamsData = jest
      .fn()
      .mockResolvedValue(null);
    azureStorageService.saveUserTeam = jest.fn().mockResolvedValue(undefined);
    azureStorageService.deleteUserTeam = jest.fn().mockResolvedValue(undefined);
    azureStorageService.deleteAllUserTeams = jest
      .fn()
      .mockResolvedValue(undefined);
    azureStorageService.listUserTeamData = jest.fn(async (chatId) => ({
      ...(cache.currentTeamCache[chatId] || {}),
    }));
    retainSelectedBestTeamPreferences.mockResolvedValue({});
    ensureSourceIsLeague.mockResolvedValue(false);
  });

  it('prompts to follow a league when user has none', async () => {
    listUserLeagues.mockResolvedValue([]);
    const bot = makeBot();
    await handleTeamsTrackerCommand(bot, { chat: { id: 1 } });
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    expect(bot.sendMessage.mock.calls[0][1]).toContain(COMMAND_FOLLOW_LEAGUE);
    expect(azureStorageService.saveTeamsTrackerSession).not.toHaveBeenCalled();
  });

  it('opens team toggle view directly when user has exactly one league', async () => {
    listUserLeagues.mockResolvedValue([
      { leagueCode: 'L1', leagueName: 'League 1' },
    ]);
    seedLeagueRoster('L1', [
      { position: 1, teamName: 'Alpha' },
      { position: 2, teamName: 'Beta' },
    ]);
    const bot = makeBot();
    await handleTeamsTrackerCommand(bot, { chat: { id: 1 } });
    expect(azureStorageService.saveTeamsTrackerSession).toHaveBeenCalled();
    const savedSession =
      azureStorageService.saveTeamsTrackerSession.mock.calls[0][1];
    expect(savedSession.currentView).toBe('teams');
    expect(savedSession.currentLeagueCode).toBe('L1');
    expect(savedSession.messageId).toBe(42);
    expect(bot.editMessageText).toHaveBeenCalled();
  });

  it('shows league picker when user has >1 leagues', async () => {
    listUserLeagues.mockResolvedValue([
      { leagueCode: 'L1', leagueName: 'One' },
      { leagueCode: 'L2', leagueName: 'Two' },
    ]);
    const bot = makeBot();
    await handleTeamsTrackerCommand(bot, { chat: { id: 1 } });
    const savedSession =
      azureStorageService.saveTeamsTrackerSession.mock.calls[0][1];
    expect(savedSession.currentView).toBe('leagues');
  });

  it('expires the old message when reopening', async () => {
    listUserLeagues.mockResolvedValue([
      { leagueCode: 'L1', leagueName: 'One' },
    ]);
    seedLeagueRoster('L1', [{ position: 1, teamName: 'Alpha' }]);
    azureStorageService.getTeamsTrackerSession.mockResolvedValue({
      chatId: 1,
      messageId: 99,
      updatedAt: new Date().toISOString(),
    });
    const bot = makeBot();
    await handleTeamsTrackerCommand(bot, { chat: { id: 1 } });
    const editCalls = bot.editMessageText.mock.calls;
    expect(editCalls.some((call) => call[1].message_id === 99)).toBe(true);
  });

  it('seeds the same fantasy team in every followed league it appears in (visual sync)', async () => {
    // The user follows one team (Doron-Kilzi_1) that exists in two leagues.
    // Seeding produces one entry per league (no position field — looked up
    // fresh at render time).
    cache.currentTeamCache[1] = {
      'Doron-Kilzi_1': { drivers: [] },
    };
    listUserLeagues.mockResolvedValue([
      { leagueCode: 'L1', leagueName: 'One' },
      { leagueCode: 'L2', leagueName: 'Two' },
    ]);
    azureStorageService.getLeagueTeamsData.mockImplementation((code) =>
      Promise.resolve({
        leagueCode: code,
        teams: [
          {
            teamName: 'Kilzid',
            userName: 'Doron Kilzi',
            teamNo: 1,
            position: code === 'L1' ? 2 : 5,
          },
        ],
      }),
    );

    const bot = makeBot();
    await handleTeamsTrackerCommand(bot, { chat: { id: 1 } });

    const saved =
      azureStorageService.saveTeamsTrackerSession.mock.calls[0][1];
    expect(saved.selected).toHaveLength(2);
    expect(saved.selected).toEqual(
      expect.arrayContaining([
        { leagueCode: 'L1', teamId: 'Doron-Kilzi_1' },
        { leagueCode: 'L2', teamId: 'Doron-Kilzi_1' },
      ]),
    );
    // The fantasy id appears once in initiallyFollowed (dedup'd).
    expect(saved.initiallyFollowed).toEqual(['Doron-Kilzi_1']);
  });
});

describe('handleTeamsTrackerCallback', () => {
  const CHAT_ID = 1;
  const MESSAGE_ID = 50;

  function sessionFixture(overrides = {}) {
    return {
      chatId: CHAT_ID,
      messageId: MESSAGE_ID,
      currentView: 'teams',
      currentLeagueCode: 'L1',
      selected: [],
      initiallyFollowed: [],
      addOrder: [],
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function queryFixture(data, messageId = MESSAGE_ID) {
    return {
      id: 'cb1',
      data,
      message: { chat: { id: CHAT_ID }, message_id: messageId },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(cache.currentTeamCache).forEach(
      (k) => delete cache.currentTeamCache[k],
    );
    Object.keys(cache.userCache).forEach((k) => delete cache.userCache[k]);
    Object.keys(cache.leagueTeamsDataCache).forEach(
      (k) => delete cache.leagueTeamsDataCache[k],
    );
    azureStorageService.saveTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(undefined);
    azureStorageService.deleteTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(undefined);
    azureStorageService.getLeagueTeamsData = jest.fn();
    azureStorageService.saveUserTeam = jest.fn().mockResolvedValue(undefined);
    azureStorageService.deleteUserTeam = jest.fn().mockResolvedValue(undefined);
    azureStorageService.deleteAllUserTeams = jest
      .fn()
      .mockResolvedValue(undefined);
    azureStorageService.listUserTeamData = jest.fn(async (chatId) => ({
      ...(cache.currentTeamCache[chatId] || {}),
    }));
    listUserLeagues.mockResolvedValue([
      { leagueCode: 'L1', leagueName: 'One' },
    ]);
    retainSelectedBestTeamPreferences.mockResolvedValue({});
    ensureSourceIsLeague.mockResolvedValue(false);
  });

  it('rejects callbacks from a stale message', async () => {
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(sessionFixture());
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:S', 999));
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith(
      'cb1',
      expect.objectContaining({ show_alert: true }),
    );
    expect(
      azureStorageService.deleteTeamsTrackerSession,
    ).not.toHaveBeenCalled();
  });

  it('rejects expired sessions and deletes them', async () => {
    const oldTime = new Date(Date.now() - 61 * 60 * 1000).toISOString();
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(sessionFixture({ updatedAt: oldTime }));
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:S'));
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith(
      'cb1',
      expect.objectContaining({ show_alert: true }),
    );
    expect(azureStorageService.deleteTeamsTrackerSession).toHaveBeenCalledWith(
      CHAT_ID,
    );
  });

  it('blocks toggling ON a 7th team with a show_alert', async () => {
    // Seed session with 6 distinct fantasy teams already staged.
    const selected = Array.from({ length: 6 }, (_, i) => ({
      leagueCode: 'L1',
      teamId: `Owner-${i + 1}_1`,
    }));
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(
        sessionFixture({
          selected,
          initiallyFollowed: selected.map((s) => s.teamId),
        }),
      );
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: Array.from({ length: 10 }, (_, i) => ({
        position: i + 1,
        teamName: `T${i + 1}`,
        userName: `Owner ${i + 1}`,
        teamNo: 1,
      })),
    });
    const bot = makeBot();
    // Click team #7 (a new fantasy id) → would exceed cap → show_alert.
    await handleTeamsTrackerCallback(bot, queryFixture('TT:T:L1:Owner-7_1'));
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith(
      'cb1',
      expect.objectContaining({ show_alert: true }),
    );
    expect(azureStorageService.saveTeamsTrackerSession).not.toHaveBeenCalled();
  });

  it('toggles ON below the cap and persists session', async () => {
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(sessionFixture());
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: [
        { position: 3, teamName: 'Gamma', userName: 'Gamma Owner', teamNo: 1 },
      ],
    });
    const bot = makeBot();
    await handleTeamsTrackerCallback(
      bot,
      queryFixture('TT:T:L1:Gamma-Owner_1'),
    );
    const saved = azureStorageService.saveTeamsTrackerSession.mock.calls[0][1];
    expect(saved.selected).toHaveLength(1);
    expect(saved.selected[0]).toEqual({
      leagueCode: 'L1',
      teamId: 'Gamma-Owner_1',
    });
    expect(saved.addOrder).toContain('Gamma-Owner_1');
  });

  it('disambiguates tied positions by teamId (regression: PR #178)', async () => {
    // dorsegal2 and Kilzid2 both at position 5 in the same league.
    // Before the fix: clicking one marked both as selected.
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: [
        {
          position: 5,
          teamName: 'dorsegal2',
          userName: 'Dor Segal',
          teamNo: 2,
        },
        {
          position: 5,
          teamName: 'Kilzid2',
          userName: 'Doron Kilzi',
          teamNo: 2,
        },
      ],
    });

    // Step 1: toggle ON Kilzid2.
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValueOnce(sessionFixture());
    const bot1 = makeBot();
    await handleTeamsTrackerCallback(
      bot1,
      queryFixture('TT:T:L1:Doron-Kilzi_2'),
    );
    const saved1 =
      azureStorageService.saveTeamsTrackerSession.mock.calls[0][1];
    expect(saved1.selected).toEqual([
      { leagueCode: 'L1', teamId: 'Doron-Kilzi_2' },
    ]);

    // Step 2: now toggle ON dorsegal2 — both should end up selected.
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValueOnce(sessionFixture({ selected: saved1.selected }));
    azureStorageService.saveTeamsTrackerSession.mockClear();
    const bot2 = makeBot();
    await handleTeamsTrackerCallback(
      bot2,
      queryFixture('TT:T:L1:Dor-Segal_2'),
    );
    const saved2 =
      azureStorageService.saveTeamsTrackerSession.mock.calls[0][1];
    expect(saved2.selected).toEqual(
      expect.arrayContaining([
        { leagueCode: 'L1', teamId: 'Doron-Kilzi_2' },
        { leagueCode: 'L1', teamId: 'Dor-Segal_2' },
      ]),
    );
    expect(saved2.selected).toHaveLength(2);

    // Step 3: toggle OFF Kilzid2 — only dorsegal2 should remain.
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValueOnce(sessionFixture({ selected: saved2.selected }));
    azureStorageService.saveTeamsTrackerSession.mockClear();
    const bot3 = makeBot();
    await handleTeamsTrackerCallback(
      bot3,
      queryFixture('TT:T:L1:Doron-Kilzi_2'),
    );
    const saved3 =
      azureStorageService.saveTeamsTrackerSession.mock.calls[0][1];
    expect(saved3.selected).toEqual([
      { leagueCode: 'L1', teamId: 'Dor-Segal_2' },
    ]);
  });

  it('cancel deletes session and edits message', async () => {
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(sessionFixture());
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:C'));
    expect(azureStorageService.deleteTeamsTrackerSession).toHaveBeenCalledWith(
      CHAT_ID,
    );
    expect(bot.editMessageText).toHaveBeenCalled();
  });

  it('save keeps prevActive when still in the final selection', async () => {
    cache.userCache[String(CHAT_ID)] = { selectedTeam: 'Keep-Owner_1' };
    cache.currentTeamCache[CHAT_ID] = { 'Keep-Owner_1': { drivers: [] } };
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(
        sessionFixture({
          selected: [{ leagueCode: 'L1', teamId: 'Keep-Owner_1' }],
          initiallyFollowed: ['Keep-Owner_1'],
          addOrder: [],
        }),
      );
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: [
        {
          position: 5,
          teamName: 'Keep',
          userName: 'Keep Owner',
          teamNo: 1,
          budget: 100,
        },
      ],
    });
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:S'));
    expect(retainSelectedBestTeamPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: CHAT_ID,
        attributes: { selectedTeam: 'Keep-Owner_1' },
      }),
    );
  });

  it('preserves the tracker session and reports failure when final CAS fails', async () => {
    cache.userCache[String(CHAT_ID)] = { selectedTeam: 'Keep-Owner_1' };
    cache.currentTeamCache[CHAT_ID] = { 'Keep-Owner_1': { drivers: [] } };
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(
        sessionFixture({
          selected: [{ leagueCode: 'L1', teamId: 'Keep-Owner_1' }],
          initiallyFollowed: ['Keep-Owner_1'],
          addOrder: [],
        }),
      );
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: [
        {
          position: 5,
          teamName: 'Keep',
          userName: 'Keep Owner',
          teamNo: 1,
          budget: 100,
        },
      ],
    });
    retainSelectedBestTeamPreferences.mockRejectedValueOnce(
      new Error('CAS unavailable'),
    );
    const bot = makeBot();

    await handleTeamsTrackerCallback(bot, queryFixture('TT:S'));

    expect(
      azureStorageService.deleteTeamsTrackerSession,
    ).not.toHaveBeenCalled();
    expect(bot.editMessageText).not.toHaveBeenCalled();
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        show_alert: true,
        text: expect.stringContaining('CAS unavailable'),
      }),
    );
    expect(restoreTeamState).toHaveBeenCalledWith(
      bot,
      CHAT_ID,
      { snapshot: true },
    );
  });

  it('save falls back to first addOrder entry when prevActive was removed', async () => {
    cache.userCache[String(CHAT_ID)] = { selectedTeam: 'Old-Owner_1' };
    cache.currentTeamCache[CHAT_ID] = { 'Old-Owner_1': { drivers: [] } };
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(
        sessionFixture({
          selected: [{ leagueCode: 'L1', teamId: 'NewTeam-Owner_1' }],
          initiallyFollowed: ['Old-Owner_1'],
          addOrder: ['NewTeam-Owner_1'],
        }),
      );
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: [
        {
          position: 2,
          teamName: 'NewTeam',
          userName: 'NewTeam Owner',
          teamNo: 1,
          budget: 100,
        },
      ],
    });
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:S'));
    expect(retainSelectedBestTeamPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: CHAT_ID,
        attributes: { selectedTeam: 'NewTeam-Owner_1' },
      }),
    );
  });

  it('save clears selectedTeam when final selection is empty', async () => {
    cache.userCache[String(CHAT_ID)] = { selectedTeam: 'Old-Owner_1' };
    cache.currentTeamCache[CHAT_ID] = { 'Old-Owner_1': { drivers: [] } };
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(
        sessionFixture({
          selected: [],
          initiallyFollowed: ['Old-Owner_1'],
          addOrder: [],
        }),
      );
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: [
        {
          position: 1,
          teamName: 'Old',
          userName: 'Old Owner',
          teamNo: 1,
          budget: 100,
        },
      ],
    });
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:S'));
    expect(retainSelectedBestTeamPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: CHAT_ID,
        attributes: { selectedTeam: null },
      }),
    );
  });

  it('save wipes screenshot teams when adding league teams', async () => {
    cache.userCache[String(CHAT_ID)] = {};
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(
        sessionFixture({
          selected: [{ leagueCode: 'L1', teamId: 'Alpha-Owner_1' }],
          initiallyFollowed: [],
        }),
      );
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: [
        {
          position: 1,
          teamName: 'Alpha',
          userName: 'Alpha Owner',
          teamNo: 1,
          budget: 100,
        },
      ],
    });
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:S'));
    expect(ensureSourceIsLeague).toHaveBeenCalledWith(bot, CHAT_ID);
  });

  it('swallows stale callback (query too old) errors without logging', async () => {
    const oldTime = new Date(Date.now() - 61 * 60 * 1000).toISOString();
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(sessionFixture({ updatedAt: oldTime }));
    const staleErr = new Error(
      'ETELEGRAM: 400 Bad Request: query is too old and response timeout expired or query ID is invalid',
    );
    staleErr.response = {
      body: {
        description:
          'Bad Request: query is too old and response timeout expired or query ID is invalid',
      },
    };
    const bot = makeBot();
    bot.answerCallbackQuery = jest.fn().mockRejectedValue(staleErr);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      handleTeamsTrackerCallback(bot, queryFixture('TT:S')),
    ).resolves.toBeUndefined();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
