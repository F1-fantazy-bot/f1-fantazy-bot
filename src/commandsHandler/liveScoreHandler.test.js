const { handleLiveScoreCommand, calculateLiveScoreBreakdown } = require('./liveScoreHandler');
const { getLiveScoreData } = require('../azureStorageService');
const { currentTeamCache, resolveSelectedTeam } = require('../cache');
const { isAdminMessage, sendErrorMessage } = require('../utils');

jest.mock('../azureStorageService');
jest.mock('../cache', () => ({
  currentTeamCache: {},
  resolveSelectedTeam: jest.fn(),
}));
jest.mock('../utils', () => ({
  formatDateTime: jest.fn().mockReturnValue({
    dateStr: 'Friday, 27 March 2026',
    timeStr: '13:07 GMT+2',
  }),
  isAdminMessage: jest.fn(),
  sendErrorMessage: jest.fn(),
}));
jest.mock('../i18n', () => ({
  t: jest.fn((message, _chatId, params = {}) =>
    Object.entries(params).reduce(
      (acc, [key, value]) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
      message,
    ),
  ),
}));

describe('liveScoreHandler', () => {
  const chatId = 123;
  const teamId = 'T1';
  const mockBot = {
    sendMessage: jest.fn().mockResolvedValue({}),
  };

  const msg = {
    chat: { id: chatId },
  };

  const liveScorePayload = {
    extractedAt: '2026-03-27T11:07:54.562Z',
    drivers: {
      VER: { TotalPoints: 10, PriceChange: 0.1, Sprint: { POS: 1, OV: 0 } },
      HAM: { TotalPoints: 20, PriceChange: 0.2, Race: { POS: 10, PG: -3, OV: 0 } },
      NOR: { TotalPoints: 5, PriceChange: -0.1 },
      LEC: { TotalPoints: 15, PriceChange: 0.3 },
      PIA: { TotalPoints: 3, PriceChange: -0.2 },
    },
    constructors: {
      FER: { TotalPoints: 25, PriceChange: 0.3, Race: { FP: 10 } },
      MER: { TotalPoints: 18, PriceChange: 0.2, Qualifying: { TW: 10 } },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    currentTeamCache[chatId] = {
      [teamId]: {
        drivers: ['VER', 'HAM', 'NOR', 'LEC', 'PIA'],
        constructors: ['FER', 'MER'],
        drsBoost: 'HAM',
      },
    };
    isAdminMessage.mockReturnValue(true);
    resolveSelectedTeam.mockResolvedValue(teamId);
    getLiveScoreData.mockResolvedValue(liveScorePayload);
    sendErrorMessage.mockResolvedValue();
  });

  it('denies non-admin users', async () => {
    isAdminMessage.mockReturnValue(false);

    await handleLiveScoreCommand(mockBot, msg);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      'Sorry, only admins can use this command.',
    );
    expect(getLiveScoreData).not.toHaveBeenCalled();
  });

  it('sends live score breakdown', async () => {
    await handleLiveScoreCommand(mockBot, msg);
    const sentMessage = mockBot.sendMessage.mock.calls[0][1];

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('📊 **סה״כ נקודות:** 116'),
      { parse_mode: 'Markdown' },
    );

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('📈 **שינוי שווי הקבוצה:** +0.8M'),
      { parse_mode: 'Markdown' },
    );

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('המילטון (HAM) 👑 קפטן (DRS)'),
      { parse_mode: 'Markdown' },
    );

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('*הופחתו:* שיפור מיקום (-3)'),
      { parse_mode: 'Markdown' },
    );
    expect(sentMessage).not.toContain('עקיפות (0)');
  });

  it('handles errors', async () => {
    getLiveScoreData.mockRejectedValue(new Error('blob missing'));

    await handleLiveScoreCommand(mockBot, msg);

    expect(sendErrorMessage).toHaveBeenCalledWith(
      mockBot,
      'Error fetching live score: blob missing',
    );
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      '❌ Error fetching live score: blob missing',
    );
  });

  it('calculates totals and tracks missing members', () => {
    const result = calculateLiveScoreBreakdown(
      {
        drivers: ['VER', 'MIS'],
        constructors: ['FER'],
        drsBoost: 'VER',
      },
      {
        drivers: {
          VER: { TotalPoints: 10, PriceChange: 0.1 },
        },
        constructors: {
          FER: { TotalPoints: 30, PriceChange: 0.5 },
        },
      },
    );

    expect(result.totalPoints).toBe(50);
    expect(result.totalPriceChange).toBeCloseTo(0.6);
    expect(result.missingMembers).toEqual(['MIS']);
  });
});
