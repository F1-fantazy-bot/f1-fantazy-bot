const { handleCallbackQuery } = require('./callbackQueryHandler');
const {
  CHIP_CALLBACK_TYPE,
  LANG_CALLBACK_TYPE,
  TEAM_CALLBACK_TYPE,
  TEAM_ASSIGN_CALLBACK_TYPE,
  BEST_TEAM_WEIGHTS_CALLBACK_TYPE,
  DEADLINE_CALLBACK_TYPE,
  EXTRA_BOOST_CHIP,
} = require('./constants');
const cache = require('./cache');
const azureStorageService = require('./azureStorageService');
const { updateUserAttributes } = require('./userRegistryService');
const { setLanguage } = require('./i18n');
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

jest.mock('./userRegistryService', () => ({
  updateUserAttributes: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./commandsHandler/selectChipHandlers', () => ({
  selectChip: jest.fn().mockResolvedValue('chip selected'),
}));

jest.mock('./commandsHandler/deadlineHandler', () => ({
  getDeadlinePayload: jest.fn().mockResolvedValue({
    text: 'updated deadline',
    options: {
      reply_markup: {
        inline_keyboard: [[{ text: 'Refresh', callback_data: 'DEADLINE:refresh' }]],
      },
    },
  }),
  getRefreshMarkup: jest.fn(() => ({
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
  normalizeBestTeamBudgetChangePointsPerMillion: jest.fn(() => ({})),
  clearSelectedBestTeam: jest.fn(() => ({})),
  serializeSelectedBestTeamByTeam: jest.fn(() => null),
}));

describe('handleCallbackQuery', () => {
  let bot;

  beforeEach(() => {
    jest.clearAllMocks();
    bot = {
      editMessageText: jest.fn().mockResolvedValue(undefined),
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };
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

    expect(setLanguage).toHaveBeenCalledWith('he', 123);
    expect(updateUserAttributes).toHaveBeenCalledWith(123, { lang: 'he' });
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q3');
  });

  it('should handle team callback', async () => {
    const query = {
      id: 'q4',
      data: `${TEAM_CALLBACK_TYPE}:T2`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(cache.userCache['123'].selectedTeam).toBe('T2');
    expect(updateUserAttributes).toHaveBeenCalledWith(123, { selectedTeam: 'T2' });
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q4');
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
    expect(updateUserAttributes).toHaveBeenCalledWith(123, {
      selectedTeam: 'T1',
      selectedBestTeamByTeam: null,
    });
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q5');
  });

  it('should handle best-team ranking callback', async () => {
    const query = {
      id: 'q6',
      data: `${BEST_TEAM_WEIGHTS_CALLBACK_TYPE}:T1:pure_points`,
      message: { chat: { id: 123 }, message_id: 456 },
    };

    await handleCallbackQuery(bot, query);

    expect(updateUserAttributes).toHaveBeenCalled();
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q6');
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
        reply_markup: {
          inline_keyboard: [[{ text: 'Refresh', callback_data: 'DEADLINE:refresh' }]],
        },
      },
    );
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('q9');
  });
});
