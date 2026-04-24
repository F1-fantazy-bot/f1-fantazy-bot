jest.mock('../azureStorageService');
jest.mock('../leagueRegistryService');
jest.mock('../userRegistryService');
jest.mock('../utils/teamSourceSwitcher');
jest.mock('../utils/utils', () => ({
  sendLogMessage: jest.fn().mockResolvedValue(undefined),
  sendErrorMessage: jest.fn().mockResolvedValue(undefined),
  getDisplayName: (id) => String(id),
}));

const azureStorageService = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { updateUserAttributes } = require('../userRegistryService');
const {
  ensureSourceIsLeague,
} = require('../utils/teamSourceSwitcher');
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
    updateUserAttributes.mockResolvedValue(undefined);
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
    listUserLeagues.mockResolvedValue([
      { leagueCode: 'L1', leagueName: 'One' },
    ]);
    updateUserAttributes.mockResolvedValue(undefined);
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
    const selected = Array.from({ length: 6 }, (_, i) => ({
      leagueCode: 'L1',
      position: i + 1,
    }));
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(sessionFixture({ selected }));
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: Array.from({ length: 10 }, (_, i) => ({
        position: i + 1,
        teamName: `T${i + 1}`,
      })),
    });
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:T:L1:7'));
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
      teams: [{ position: 3, teamName: 'Gamma' }],
    });
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:T:L1:3'));
    const saved = azureStorageService.saveTeamsTrackerSession.mock.calls[0][1];
    expect(saved.selected).toHaveLength(1);
    expect(saved.selected[0]).toEqual({ leagueCode: 'L1', position: 3 });
    expect(saved.addOrder).toContain('L1_Gamma');
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
    cache.userCache[String(CHAT_ID)] = { selectedTeam: 'L1_Keep' };
    cache.currentTeamCache[CHAT_ID] = { L1_Keep: { drivers: [] } };
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(
        sessionFixture({
          selected: [{ leagueCode: 'L1', position: 5 }],
          initiallyFollowed: ['L1_Keep'],
          addOrder: [],
        }),
      );
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: [{ position: 5, teamName: 'Keep', budget: 100 }],
    });
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:S'));
    expect(updateUserAttributes).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({ selectedTeam: 'L1_Keep' }),
    );
  });

  it('save falls back to first addOrder entry when prevActive was removed', async () => {
    cache.userCache[String(CHAT_ID)] = { selectedTeam: 'L1_Old' };
    cache.currentTeamCache[CHAT_ID] = { L1_Old: { drivers: [] } };
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(
        sessionFixture({
          selected: [{ leagueCode: 'L1', position: 2 }],
          initiallyFollowed: ['L1_Old'],
          addOrder: ['L1_NewTeam'],
        }),
      );
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: [{ position: 2, teamName: 'NewTeam', budget: 100 }],
    });
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:S'));
    expect(updateUserAttributes).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({ selectedTeam: 'L1_NewTeam' }),
    );
  });

  it('save clears selectedTeam when final selection is empty', async () => {
    cache.userCache[String(CHAT_ID)] = { selectedTeam: 'L1_Old' };
    cache.currentTeamCache[CHAT_ID] = { L1_Old: { drivers: [] } };
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(
        sessionFixture({
          selected: [],
          initiallyFollowed: ['L1_Old'],
          addOrder: [],
        }),
      );
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: [{ position: 1, teamName: 'Old', budget: 100 }],
    });
    const bot = makeBot();
    await handleTeamsTrackerCallback(bot, queryFixture('TT:S'));
    expect(updateUserAttributes).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({ selectedTeam: null }),
    );
  });

  it('save wipes screenshot teams when adding league teams', async () => {
    cache.userCache[String(CHAT_ID)] = {};
    azureStorageService.getTeamsTrackerSession = jest
      .fn()
      .mockResolvedValue(
        sessionFixture({
          selected: [{ leagueCode: 'L1', position: 1 }],
          initiallyFollowed: [],
        }),
      );
    azureStorageService.getLeagueTeamsData.mockResolvedValue({
      leagueCode: 'L1',
      teams: [{ position: 1, teamName: 'Alpha', budget: 100 }],
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
