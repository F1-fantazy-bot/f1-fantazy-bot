const {
  handleLiveScoreCommand,
  calculateLiveScoreBreakdown,
  formatSessionBreakdown,
  resolveLiveScoreTeam,
} = require('./liveScoreHandler');
const {
  getLiveScoreData,
  getLockedTeamsData,
  listLockedMatchdays,
} = require('../azureStorageService');
const { resolveSelectedTeam, currentTeamCache } = require('../cache');
const { sendErrorMessage } = require('../utils');

jest.mock('../azureStorageService');
jest.mock('../cache', () => ({
  resolveSelectedTeam: jest.fn(),
  currentTeamCache: {},
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
    Object.keys(currentTeamCache).forEach((k) => delete currentTeamCache[k]);
    resolveSelectedTeam.mockResolvedValue(teamId);
    // Default cache fallback: a screenshot team (T1) under chat 123
    currentTeamCache[chatId] = {
      [teamId]: {
        drivers: ['VER', 'HAM', 'NOR', 'LEC', 'PIA'],
        constructors: ['FER', 'MER'],
        boost: 'HAM',
      },
    };
    getLiveScoreData.mockResolvedValue(liveScorePayload);
    sendErrorMessage.mockResolvedValue();
  });

  // -------------------------------------------------------------------
  // resolveLiveScoreTeam
  // -------------------------------------------------------------------
  describe('resolveLiveScoreTeam', () => {
    it('returns the cache team for screenshot teams (T1)', async () => {
      const team = await resolveLiveScoreTeam(chatId, 'T1');

      expect(team).toEqual({
        drivers: ['VER', 'HAM', 'NOR', 'LEC', 'PIA'],
        constructors: ['FER', 'MER'],
        boostDriver: 'HAM',
        extraBoostDriver: null,
        source: 'cache',
        matchdayId: null,
      });
      expect(listLockedMatchdays).not.toHaveBeenCalled();
    });

    it('returns null when neither locked nor cache has the team', async () => {
      delete currentTeamCache[chatId];

      const team = await resolveLiveScoreTeam(chatId, 'T1');

      expect(team).toBeNull();
    });

    it('prefers the locked snapshot for league teams', async () => {
      const leagueTeamId = 'ABC_Cooperon';
      currentTeamCache[chatId] = {
        [leagueTeamId]: {
          // Stale cache should be ignored when locked snapshot is present
          drivers: ['STALE'],
          constructors: ['STALE'],
          boost: 'STALE',
        },
      };
      listLockedMatchdays.mockResolvedValueOnce([3, 4]);
      getLockedTeamsData.mockResolvedValueOnce({
        leagueCode: 'ABC',
        matchdayId: 4,
        teams: [
          {
            teamName: 'Cooperon',
            userName: 'u',
            drivers: [
              { name: 'M. Verstappen', isCaptain: true, isMegaCaptain: false },
              { name: 'L. Hamilton', isCaptain: false, isMegaCaptain: false },
            ],
            constructors: [{ name: 'Ferrari' }],
            chipsUsed: [],
          },
        ],
      });

      const team = await resolveLiveScoreTeam(chatId, leagueTeamId);

      expect(listLockedMatchdays).toHaveBeenCalledWith('ABC');
      expect(getLockedTeamsData).toHaveBeenCalledWith('ABC', 4);
      expect(team.source).toBe('locked');
      expect(team.matchdayId).toBe(4);
      // Names map to codes via NAME_TO_CODE_MAPPING
      expect(team.drivers).toEqual(['VER', 'HAM']);
      expect(team.constructors).toEqual(['FER']);
      expect(team.boostDriver).toBe('VER');
      expect(team.extraBoostDriver).toBeNull();
    });

    it('captures isMegaCaptain as extraBoostDriver', async () => {
      const leagueTeamId = 'ABC_Cooperon';
      listLockedMatchdays.mockResolvedValueOnce([4]);
      getLockedTeamsData.mockResolvedValueOnce({
        leagueCode: 'ABC',
        matchdayId: 4,
        teams: [
          {
            teamName: 'Cooperon',
            drivers: [
              { name: 'M. Verstappen', isMegaCaptain: true },
              { name: 'L. Hamilton', isCaptain: true },
            ],
            constructors: [],
            chipsUsed: [],
          },
        ],
      });

      const team = await resolveLiveScoreTeam(chatId, leagueTeamId);

      expect(team.boostDriver).toBe('HAM');
      expect(team.extraBoostDriver).toBe('VER');
    });

    it('falls back to cache when locked snapshot has no matching team', async () => {
      const leagueTeamId = 'ABC_Cooperon';
      currentTeamCache[chatId] = {
        [leagueTeamId]: {
          drivers: ['VER'],
          constructors: ['FER'],
          boost: 'VER',
        },
      };
      listLockedMatchdays.mockResolvedValueOnce([4]);
      getLockedTeamsData.mockResolvedValueOnce({
        matchdayId: 4,
        teams: [{ teamName: 'OtherTeam', drivers: [], constructors: [] }],
      });

      const team = await resolveLiveScoreTeam(chatId, leagueTeamId);

      expect(team.source).toBe('cache');
      expect(team.drivers).toEqual(['VER']);
    });

    it('falls back to cache when locked-snapshot fetch throws', async () => {
      const leagueTeamId = 'ABC_X';
      currentTeamCache[chatId] = {
        [leagueTeamId]: {
          drivers: ['VER'], constructors: ['FER'], boost: 'VER',
        },
      };
      listLockedMatchdays.mockRejectedValueOnce(new Error('boom'));

      const team = await resolveLiveScoreTeam(chatId, leagueTeamId);

      expect(team.source).toBe('cache');
    });
  });

  // -------------------------------------------------------------------
  // handleLiveScoreCommand
  // -------------------------------------------------------------------
  it('sends live score breakdown for a screenshot team (cache source)', async () => {
    await handleLiveScoreCommand(mockBot, msg);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>🏎️ Live Score Summary (T1)</b>'),
      { parse_mode: 'HTML' },
    );
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<i>Source: current team</i>'),
      { parse_mode: 'HTML' },
    );
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>Total Live Points:</b> 116.00'),
      { parse_mode: 'HTML' },
    );
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>HAM (Boost x2) — 40 pts | Δ +0.2</b>'),
      { parse_mode: 'HTML' },
    );
  });

  it('uses the locked snapshot for league teams and labels the source', async () => {
    const leagueTeamId = 'ABC_Cooperon';
    resolveSelectedTeam.mockResolvedValue(leagueTeamId);
    listLockedMatchdays.mockResolvedValueOnce([4]);
    getLockedTeamsData.mockResolvedValueOnce({
      matchdayId: 4,
      teams: [
        {
          teamName: 'Cooperon',
          drivers: [
            { name: 'M. Verstappen', isMegaCaptain: true },
            { name: 'L. Hamilton', isCaptain: true },
            { name: 'L. Norris' },
            { name: 'C. Leclerc' },
            { name: 'O. Piastri' },
          ],
          constructors: [{ name: 'Ferrari' }, { name: 'Mercedes' }],
          chipsUsed: [{ name: 'Extra DRS Boost' }],
        },
      ],
    });

    await handleLiveScoreCommand(mockBot, msg);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<i>Source: locked snapshot · md 4</i>'),
      { parse_mode: 'HTML' },
    );
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>VER (Extra Boost x3) — 30 pts | Δ +0.1</b>'),
      { parse_mode: 'HTML' },
    );
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('<b>HAM (Boost x2) — 40 pts | Δ +0.2</b>'),
      { parse_mode: 'HTML' },
    );
  });

  it('messages "no locked roster" when neither locked nor cache has the team', async () => {
    delete currentTeamCache[chatId];

    await handleLiveScoreCommand(mockBot, msg);

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('No locked roster is available yet for T1'),
    );
    expect(getLiveScoreData).not.toHaveBeenCalled();
  });

  it('adds required spacing between members and sections', async () => {
    await handleLiveScoreCommand(mockBot, msg);

    const htmlPayload = mockBot.sendMessage.mock.calls.find(
      ([, , options]) => options && options.parse_mode === 'HTML',
    )[1];

    expect(htmlPayload).toContain(
      '<b>VER — 10 pts | Δ +0.1</b>\nSprint: POS 1\n\n<b>HAM (Boost x2) — 40 pts | Δ +0.2</b>',
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
        boostDriver: 'VER',
        extraBoostDriver: null,
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
