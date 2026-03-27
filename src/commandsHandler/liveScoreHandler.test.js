const {
  handleLiveScoreCommand,
  calculateLiveScoreBreakdown,
  formatMemberBlock,
  formatSignedDelta,
} = require('./liveScoreHandler');
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
      VER: { TotalPoints: 10, PriceChange: 0.1, Sprint: { POS: 1 } },
      HAM: { TotalPoints: 20, PriceChange: 0.2, Race: { POS: 10 } },
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

  it('sends live score breakdown in Telegram HTML format', async () => {
    await handleLiveScoreCommand(mockBot, msg);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>🏎️ LIVE SCORE SUMMARY (T1)</b>'),
      { parse_mode: 'HTML' },
    );

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('Total Live Points: 116.00'),
      { parse_mode: 'HTML' },
    );

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>HAM (DRS x2) — 40 pts (20 base + 20 DRS) | Δ +0.20</b>'),
      { parse_mode: 'HTML' },
    );
  });

  it('formats member blocks with zero-value filtering and flattened sessions', () => {
    const block = formatMemberBlock({
      code: 'VER',
      points: 11,
      priceChange: 0.3,
      isDrsBoost: false,
      details: {
        Sprint: { POS: 4, PG: 0, OV: 10 },
        Qualifying: { POS: 0, PG: 0, OV: 0, FL: 0, DD: 0, TW: 0, FP: 0 },
        Race: { PG: -3, TW: 0, FP: 5 },
      },
    });

    expect(block).toContain('Sprint: POS 4, OV 10');
    expect(block).toContain('Race: PG -3, FP 5');
    expect(block).not.toContain('Qualifying:');
    expect(block).not.toContain('PG 0');
    expect(block).not.toContain('→');
  });

  it('formats delta with explicit sign', () => {
    expect(formatSignedDelta(3.3)).toBe('+3.30');
    expect(formatSignedDelta(-1.5)).toBe('-1.50');
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
