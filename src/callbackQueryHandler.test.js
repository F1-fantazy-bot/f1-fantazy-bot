const { handleCallbackQuery } = require('./callbackQueryHandler');
const {
  CHIP_CALLBACK_TYPE,
  LANG_CALLBACK_TYPE,
  TEAM_CALLBACK_TYPE,
  TEAM_ASSIGN_CALLBACK_TYPE,
  BEST_TEAM_WEIGHTS_CALLBACK_TYPE,
  DEADLINE_CALLBACK_TYPE,
  LEAGUE_CALLBACK_TYPE,
  LEAGUE_UNFOLLOW_CALLBACK_TYPE,
  EXTRA_BOOST_CHIP,
} = require('./constants');
const cache = require('./cache');
const azureStorageService = require('./azureStorageService');
const {
  setLanguagePreference,
} = require('./services/setLanguageService');
const {
  refreshTelegramUserPreferences,
} = require('./services/telegramUserPreferencesService');
const {
  selectTeamPreference,
  setCachedSelectedTeam,
} = require('./services/selectTeamService');
const {
  setBestTeamRankingPreference,
} = require('./services/setBestTeamRankingService');
const {
  clearSelectedBestTeamPreference,
} = require('./services/selectedBestTeamService');
const { selectChip } = require('./commandsHandler/selectChipHandlers');
const {
  getDeadlinePayload,
  getRefreshMarkup,
} = require('./commandsHandler/deadlineHandler');

jest.mock('./utils', () => ({
  sendLogMessage: jest.fn().mockResolvedValue(undefined),
  sendMessageToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./azureStorageService', () => ({
  saveUserTeam: jest.fn().mockResolvedValue(undefined),
  getPendingTeamAssignment: jest.fn().mockResolvedValue(null),
  deletePendingTeamAssignment: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./commandsHandler/leaderboardHandler', () => ({
  sendLeaderboard: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./leagueRegistryService', () => ({
  removeUserLeague: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./commandsHandler/selectChipHandlers', () => ({
  selectChip: jest.fn().mockResolvedValue('chip selected'),
}));

jest.mock('./services/setLanguageService', () => ({
  setLanguagePreference: jest.fn(),
}));

jest.mock('./services/telegramUserPreferencesService', () => ({
  refreshTelegramUserPreferences: jest.fn(),
}));

jest.mock('./services/selectTeamService', () => ({
  selectTeamPreference: jest.fn(),
  setCachedSelectedTeam: jest.fn(),
}));
jest.mock('./services/setBestTeamRankingService', () => ({
  setBestTeamRankingPreference: jest.fn(),
}));
jest.mock('./services/selectedBestTeamService', () => ({
  clearSelectedBestTeamPreference: jest.fn(),
}));

jest.mock('./commandsHandler/deadlineHandler', () => ({
  getDeadlinePayload: jest.fn().mockResolvedValue({
    text: 'updated deadline',
    options: {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: 'Refresh', callback_data: 'DEADLINE:refresh' }]],
      },
    },
  }),
  getRefreshMarkup: jest.fn(() => ({
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: 'Refresh', callback_data: 'DEADLINE:refresh' }]],
    },
  })),
}));

jest.mock('./i18n', () => ({
  t: jest.fn((key) => key),
  setLanguage: jest.fn(),
  getLanguageName: jest.fn(() => 'English'),
}));

jest.mock('./cache', () => ({
  currentTeamCache: {},
  bestTeamsCache: {},
  userCache: {},
  selectedChipCache: {},
  getPrintableCache: jest.fn(() => 'printable cache'),
  getTeamDisplayName: jest.fn((_chatId, teamId) => teamId),
  normalizeBestTeamBudgetChangePointsPerMillion: jest.fn(() => ({})),
  clearSelectedBestTeam: jest.fn(() => ({})),
  clearAllSelectedBestTeams: jest.fn(() => ({})),
  serializeSelectedBestTeamByTeam: jest.fn(() => null),
  getUserLeagueTeamIds: jest.fn(() => []),
  getUserScreenshotTeamIds: jest.fn(() => []),
  getUserTeamIds: jest.fn(() => []),
  getSelectedTeam: jest.fn(() => null),
  isLeagueTeamId: jest.fn((id) => typeof id === 'string' && id.includes('_')),
}));

describe('handleCallbackQuery', () => {
  let bot;

  beforeEach(() => {
    jest.clearAllMocks();
    setLanguagePreference.mockResolvedValue({
      status: 'ok',
      lang: 'he',
      languageName: 'English',
    });
    refreshTelegramUserPreferences.mockResolvedValue(undefined);
    selectTeamPreference.mockResolvedValue({
      status: 'ok',
      teamId: 'T2',
      teamName: 'T2',
      changed: true,
    });
    setBestTeamRankingPreference.mockResolvedValue({
      status: 'ok',
      summary:
        'Best-team ranking set: Pure Points (0 pts per 1M per remaining race).',
      teamId: 'T1',
      presetId: 'pure_points',
      changed: true,
    });
    clearSelectedBestTeamPreference.mockResolvedValue({});
    bot = {
      editMessageText: jest.fn().mockResolvedValue(undefined),
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should treat PHOTO callback as unknown callback type', async () => {
    const query = {
      id: 'q1',
      data: 'PHOTO:DRIVERS:file123',
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(require('./utils').sendLogMessage).toHaveBeenCalledWith(
      bot,
      'Unknown callback type: PHOTO',
    );
  });

  it('should handle chip callback', async () => {
    const query = {
      id: 'q2',
      data: `${CHIP_CALLBACK_TYPE}:${EXTRA_BOOST_CHIP}`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(selectChip).toHaveBeenCalledWith(bot, 123, EXTRA_BOOST_CHIP);
    expect(bot.editMessageText).toHaveBeenCalledWith('chip selected', {
      chat_id: 123,
      message_id: 456,
    });
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q2');
  });

  it('should handle language callback', async () => {
    const query = {
      id: 'q3',
      data: `${LANG_CALLBACK_TYPE}:he`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(setLanguagePreference).toHaveBeenCalledWith({
      chatId: 123,
      lang: 'he',
    });
    expect(refreshTelegramUserPreferences).toHaveBeenCalledWith(123);
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q3');
  });

  it('continues callback handling when the language refresh times out', async () => {
    const error = new Error('aborted');
    refreshTelegramUserPreferences.mockRejectedValue(error);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const query = {
      id: 'q2-timeout',
      data: `${CHIP_CALLBACK_TYPE}:${EXTRA_BOOST_CHIP}`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(console.error).toHaveBeenCalledWith(
      'Error refreshing user preferences from registry:',
      error,
    );
    expect(selectChip).toHaveBeenCalledWith(bot, 123, EXTRA_BOOST_CHIP);
  });

  it('should handle team callback', async () => {
    const query = {
      id: 'q4',
      data: `${TEAM_CALLBACK_TYPE}:T2`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(selectTeamPreference).toHaveBeenCalledWith({
      chatId: 123,
      teamId: 'T2',
    });
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q4');
  });

  it('shows a bounded alert when a team callback is no longer valid', async () => {
    selectTeamPreference.mockResolvedValue({
      status: 'invalid_input',
      summary: 'A deliberately long list of teams that must not be shown.',
    });
    const query = {
      id: 'q-invalid-team',
      data: `${TEAM_CALLBACK_TYPE}:deleted-team`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(bot.editMessageText).not.toHaveBeenCalled();
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q-invalid-team', {
      text: 'That team is no longer available. Reopen /select_team and choose again.',
      show_alert: true,
    });
  });

  it('should handle team assignment callback', async () => {
    cache.userCache['123'] = {
      selectedBestTeamByTeam: {
        T1: {
          drivers: ['VER', 'HAM', 'NOR', 'LEC', 'PIA'],
          constructors: ['RBR', 'FER'],
          boostDriver: 'VER',
        },
      },
    };
    azureStorageService.getPendingTeamAssignment.mockResolvedValueOnce({
      drivers: ['HAM'],
      constructors: ['MER'],
      boost: 'HAM',
      freeTransfers: 2,
      costCapRemaining: 10,
    });

    const query = {
      id: 'q5',
      data: `${TEAM_ASSIGN_CALLBACK_TYPE}:pending-key:T1`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(cache.currentTeamCache[123].T1).toBeDefined();
    expect(azureStorageService.saveUserTeam).toHaveBeenCalled();
    expect(clearSelectedBestTeamPreference).toHaveBeenCalledWith({
      chatId: 123,
      teamId: 'T1',
      attributes: { selectedTeam: 'T1' },
    });
    expect(setCachedSelectedTeam).toHaveBeenCalledWith(123, 'T1');
    expect(
      clearSelectedBestTeamPreference.mock.invocationCallOrder[0],
    ).toBeLessThan(setCachedSelectedTeam.mock.invocationCallOrder[0]);
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q5');
  });

  it('should handle best-team ranking callback', async () => {
    const query = {
      id: 'q6',
      data: `${BEST_TEAM_WEIGHTS_CALLBACK_TYPE}:T1:pure_points`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(setBestTeamRankingPreference).toHaveBeenCalledWith({
      chatId: 123,
      teamId: 'T1',
      presetId: 'pure_points',
    });
    expect(bot.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Best-team ranking set: Pure Points'),
      { chat_id: 123, message_id: 456 },
    );
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q6');
  });

  it('shows an alert for a stale best-team ranking callback', async () => {
    setBestTeamRankingPreference.mockResolvedValue({
      status: 'invalid_input',
    });

    const query = {
      id: 'q-stale-ranking',
      data: `${BEST_TEAM_WEIGHTS_CALLBACK_TYPE}:T1:removed-preset`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(bot.editMessageText).not.toHaveBeenCalled();
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith(
      'q-stale-ranking',
      {
        text: 'That ranking option is no longer available. Reopen /set_best_team_ranking and choose again.',
        show_alert: true,
      },
    );
  });

  it('does not claim recalculation is needed for a ranking no-op', async () => {
    setBestTeamRankingPreference.mockResolvedValue({
      status: 'ok',
      summary:
        'Best-team ranking for T1 is already Pure Points (0 pts per 1M per remaining race).',
      changed: false,
    });
    const query = {
      id: 'q-ranking-no-op',
      data: `${BEST_TEAM_WEIGHTS_CALLBACK_TYPE}:T1:pure_points`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(bot.editMessageText).toHaveBeenCalledWith(
      expect.not.stringContaining('calculation was deleted'),
      { chat_id: 123, message_id: 456 },
    );
  });

  it('should handle deadline refresh callback', async () => {
    const query = {
      id: 'q7',
      data: `${DEADLINE_CALLBACK_TYPE}:refresh`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(getDeadlinePayload).toHaveBeenCalledWith(123);
    expect(bot.editMessageText).toHaveBeenCalledWith('updated deadline', {
      chat_id: 123,
      message_id: 456,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: 'Refresh', callback_data: 'DEADLINE:refresh' }]],
      },
    });
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q7');
  });

  it('should swallow Telegram message is not modified errors', async () => {
    const query = {
      id: 'q8',
      data: `${DEADLINE_CALLBACK_TYPE}:refresh`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    bot.editMessageText.mockRejectedValue({
      response: { body: { description: 'Bad Request: message is not modified' } },
    });

    await expect(handleCallbackQuery(bot, query)).resolves.toBeUndefined();
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q8');
  });

  it('should keep refresh button on fallback error message', async () => {
    const query = {
      id: 'q9',
      data: `${DEADLINE_CALLBACK_TYPE}:refresh`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    getDeadlinePayload.mockRejectedValueOnce(new Error('boom'));

    await handleCallbackQuery(bot, query);

    expect(getRefreshMarkup).toHaveBeenCalledWith(123);
    expect(bot.editMessageText).toHaveBeenCalledWith(
      'Failed to fetch deadline data. Please try again later.',
      {
        chat_id: 123,
        message_id: 456,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: 'Refresh', callback_data: 'DEADLINE:refresh' }]],
        },
      },
    );
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q9');
  });

  it('should handle LEAGUE callback by sending the leaderboard', async () => {
    const {
      sendLeaderboard,
    } = require('./commandsHandler/leaderboardHandler');

    const query = {
      id: 'q-league',
      data: `${LEAGUE_CALLBACK_TYPE}:ABC`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(sendLeaderboard).toHaveBeenCalledWith(bot, 123, 'ABC');
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q-league');
  });

  it('should handle LEAGUE_UNFOLLOW callback by removing the league', async () => {
    const { removeUserLeague } = require('./leagueRegistryService');

    const query = {
      id: 'q-unreg',
      data: `${LEAGUE_UNFOLLOW_CALLBACK_TYPE}:ABC`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(removeUserLeague).toHaveBeenCalledWith(123, 'ABC');
    expect(bot.editMessageText).toHaveBeenCalledWith(
      'Unfollowed league {CODE}.',
      { chat_id: 123, message_id: 456 },
    );
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q-unreg');
  });
});
