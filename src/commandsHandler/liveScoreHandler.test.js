const {
  handleLiveScoreCommand,
  calculateLiveScoreBreakdown,
  formatSessionBreakdown,
} = require('./liveScoreHandler');
const { getLiveScoreData } = require('../azureStorageService');
const { getSelectedBestTeam, resolveSelectedTeam } = require('../cache');
const { sendErrorMessage } = require('../utils');

jest.mock('../azureStorageService');
jest.mock('../cache', () => ({
  getSelectedBestTeam: jest.fn(),
  resolveSelectedTeam: jest.fn(),
}));
jest.mock('../utils', () => ({
  formatDateTime: jest.fn().mockReturnValue({
    dateStr: 'Friday, 27 March 2026',
    timeStr: '13:07 GMT+2',
  }),
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
    resolveSelectedTeam.mockResolvedValue(teamId);
    getSelectedBestTeam.mockReturnValue({
      drivers: ['VER', 'HAM', 'NOR', 'LEC', 'PIA'],
      constructors: ['FER', 'MER'],
      drsDriver: 'HAM',
    });
    getLiveScoreData.mockResolvedValue(liveScorePayload);
    sendErrorMessage.mockResolvedValue();
  });

  it('sends live score breakdown', async () => {
    await handleLiveScoreCommand(mockBot, msg);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>🏎️ Live Score Summary (T1)</b>'),
      { parse_mode: 'HTML' },
    );

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>Total Live Points:</b> 116.00'),
      { parse_mode: 'HTML' },
    );

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>HAM (DRS x2) — 40 pts | Δ +0.2</b>'),
      { parse_mode: 'HTML' },
    );
  });

  it('requires a persisted selected best team', async () => {
    getSelectedBestTeam.mockReturnValue(null);

    await handleLiveScoreCommand(mockBot, msg);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      'No selected best team found for T1. Please run /best_teams and send a number first.',
    );
    expect(getLiveScoreData).not.toHaveBeenCalled();
  });

  it('adds required spacing between members and sections', async () => {
    await handleLiveScoreCommand(mockBot, msg);

    const htmlPayload = mockBot.sendMessage.mock.calls.find(
      ([, , options]) => options && options.parse_mode === 'HTML',
    )[1];

    expect(htmlPayload).toContain(
      '<b>VER — 10 pts | Δ +0.1</b>\nSprint: POS 1\n\n<b>HAM (DRS x2) — 40 pts | Δ +0.2</b>',
    );
    expect(htmlPayload).toContain(
      '<b>PIA — 3 pts | Δ -0.2</b>\n\n\n<b>🛠️ Live Constructors</b>',
    );
    expect(htmlPayload).toContain(
      '<b>FER — 25 pts | Δ +0.3</b>\nRace: FP 10\n\n<b>MER — 18 pts | Δ +0.2</b>',
    );
  });

  it('filters zero-value session metrics and omits empty sessions', async () => {
    getLiveScoreData.mockResolvedValue({
      extractedAt: '2026-03-27T11:07:54.562Z',
      drivers: {
        VER: {
          TotalPoints: 10,
          PriceChange: 0.1,
          Sprint: { POS: 0, PG: 0, OV: 0 },
          Qualifying: { POS: 4, PG: 0, TW: 0 },
          Race: { POS: 0, FP: 10 },
        },
        HAM: { TotalPoints: 20, PriceChange: 0.2 },
        NOR: { TotalPoints: 5, PriceChange: -0.1 },
        LEC: { TotalPoints: 15, PriceChange: 0.3 },
        PIA: { TotalPoints: 3, PriceChange: -0.2 },
      },
      constructors: {
        FER: { TotalPoints: 25, PriceChange: 0.3 },
        MER: { TotalPoints: 18, PriceChange: 0.2 },
      },
    });

    await handleLiveScoreCommand(mockBot, msg);

    const markdownPayload = mockBot.sendMessage.mock.calls.find(
      ([, , options]) => options && options.parse_mode === 'HTML',
    )[1];

    expect(markdownPayload).toContain('Qualifying: POS 4');
    expect(markdownPayload).toContain('Race: FP 10');
    expect(markdownPayload).not.toContain('Sprint:');
    expect(markdownPayload).not.toContain('PG 0');
    expect(markdownPayload).not.toContain('OV 0');
    expect(markdownPayload).not.toContain('→');
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
        drsDriver: 'VER',
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

  it('applies extra DRS as x3 total', async () => {
    getSelectedBestTeam.mockReturnValue({
      drivers: ['VER', 'HAM', 'NOR', 'LEC', 'PIA'],
      constructors: ['FER', 'MER'],
      drsDriver: 'HAM',
      extraDrsDriver: 'VER',
    });

    await handleLiveScoreCommand(mockBot, msg);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>Total Live Points:</b> 136.00'),
      { parse_mode: 'HTML' },
    );
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>VER (Extra DRS x3) — 30 pts | Δ +0.1</b>'),
      { parse_mode: 'HTML' },
    );
  });

  it('returns null for empty session after strict zero filtering', () => {
    expect(
      formatSessionBreakdown('Qualifying', {
        POS: 0,
        PG: 0,
        OV: 0,
        FL: 0,
        DD: 0,
        TW: 0,
        FP: 0,
      }),
    ).toBeNull();
  });
});
