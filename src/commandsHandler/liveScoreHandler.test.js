const {
  handleLiveScoreCommand,
  handleLiveScoreCallback,
  calculateLiveScoreBreakdown,
  formatSessionBreakdown,
  formatLiveScoreSummary,
  formatAllTeamsLeaderboard,
  mapLockedTeamForScoring,
} = require('./liveScoreHandler');

jest.mock('../azureStorageService', () => ({
  getLiveScoreData: jest.fn(),
  getLockedTeamsData: jest.fn(),
}));

jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));

jest.mock('../cache', () => ({
  getSelectedTeam: jest.fn(),
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

const {
  getLiveScoreData,
  getLockedTeamsData,
} = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { getSelectedTeam } = require('../cache');
const { sendErrorMessage } = require('../utils');

describe('liveScoreHandler', () => {
  const chatId = 123;
  const mockBot = {
    sendMessage: jest.fn().mockResolvedValue({}),
    answerCallbackQuery: jest.fn().mockResolvedValue({}),
  };
  const msg = { chat: { id: chatId }, message_id: 99 };

  // Locked snapshot fixture: 3 teams in a 1-league world
  const liveScorePayload = {
    extractedAt: '2026-03-27T11:07:54.562Z',
    drivers: {
      VER: { TotalPoints: 10, PriceChange: 0.1 },
      HAM: { TotalPoints: 20, PriceChange: 0.2 },
      NOR: { TotalPoints: 5, PriceChange: -0.1 },
      LEC: { TotalPoints: 15, PriceChange: 0.3 },
      PIA: { TotalPoints: 3, PriceChange: -0.2 },
    },
    constructors: {
      FER: { TotalPoints: 25, PriceChange: 0.3 },
      MER: { TotalPoints: 18, PriceChange: 0.2 },
    },
  };

  const lockedSnapshot = {
    leagueCode: 'ABC',
    leagueName: 'Amba',
    matchdayId: 4,
    teams: [
      {
        teamName: 'Cooperon',
        userName: 'Ron Cooper',
        position: 1,
        matchdayId: 4,
        drivers: [
          { name: 'M. Verstappen', isCaptain: false, isMegaCaptain: false },
          { name: 'L. Hamilton', isCaptain: true, isMegaCaptain: false },
          { name: 'L. Norris', isCaptain: false, isMegaCaptain: false },
          { name: 'C. Leclerc', isCaptain: false, isMegaCaptain: false },
          { name: 'O. Piastri', isCaptain: false, isMegaCaptain: false },
        ],
        constructors: [{ name: 'Ferrari' }, { name: 'Mercedes' }],
      },
      {
        teamName: 'Ravivmar',
        userName: 'Raviv',
        position: 2,
        matchdayId: 4,
        drivers: [
          { name: 'M. Verstappen', isMegaCaptain: true },
          { name: 'L. Hamilton', isCaptain: false },
          { name: 'L. Norris', isCaptain: true, isMegaCaptain: false },
          { name: 'C. Leclerc', isCaptain: false },
          { name: 'O. Piastri', isCaptain: false },
        ],
        constructors: [{ name: 'Ferrari' }, { name: 'Mercedes' }],
      },
      {
        teamName: 'Empty',
        userName: 'no-points-user',
        position: 3,
        matchdayId: 4,
        drivers: [
          { name: 'L. Hamilton', isCaptain: true },
        ],
        constructors: [],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getSelectedTeam.mockReturnValue(null);
  });

  // -------------------------------------------------------------------
  // mapLockedTeamForScoring
  // -------------------------------------------------------------------
  describe('mapLockedTeamForScoring', () => {
    it('maps names to codes via NAME_TO_CODE_MAPPING', () => {
      const out = mapLockedTeamForScoring(lockedSnapshot.teams[0]);

      expect(out.drivers).toEqual(['VER', 'HAM', 'NOR', 'LEC', 'PIA']);
      expect(out.constructors).toEqual(['FER', 'MER']);
    });

    it('extracts boostDriver from isCaptain', () => {
      const out = mapLockedTeamForScoring(lockedSnapshot.teams[0]);

      expect(out.boostDriver).toBe('HAM');
      expect(out.extraBoostDriver).toBeNull();
    });

    it('extracts extraBoostDriver from isMegaCaptain', () => {
      const out = mapLockedTeamForScoring(lockedSnapshot.teams[1]);

      expect(out.boostDriver).toBe('NOR');
      expect(out.extraBoostDriver).toBe('VER');
    });

    it('handles missing/empty drivers and constructors gracefully', () => {
      const out = mapLockedTeamForScoring({ drivers: null, constructors: undefined });

      expect(out.drivers).toEqual([]);
      expect(out.constructors).toEqual([]);
      expect(out.boostDriver).toBeNull();
      expect(out.extraBoostDriver).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // calculateLiveScoreBreakdown (math unchanged)
  // -------------------------------------------------------------------
  describe('calculateLiveScoreBreakdown', () => {
    it('calculates totals and tracks missing members', () => {
      const result = calculateLiveScoreBreakdown(
        {
          drivers: ['VER', 'MIS'],
          constructors: ['FER'],
          boostDriver: 'VER',
          extraBoostDriver: null,
        },
        {
          drivers: { VER: { TotalPoints: 10, PriceChange: 0.1 } },
          constructors: { FER: { TotalPoints: 30, PriceChange: 0.5 } },
        },
      );

      expect(result.totalPoints).toBe(50);
      expect(result.totalPriceChange).toBeCloseTo(0.6);
      expect(result.missingMembers).toEqual(['MIS']);
    });

    it('applies extra boost as x3 when extraBoostDriver matches', () => {
      const result = calculateLiveScoreBreakdown(
        {
          drivers: ['VER'],
          constructors: [],
          boostDriver: null,
          extraBoostDriver: 'VER',
        },
        { drivers: { VER: { TotalPoints: 10 } }, constructors: {} },
      );

      expect(result.totalPoints).toBe(30);
    });
  });

  describe('formatSessionBreakdown', () => {
    it('returns null when every metric is zero', () => {
      expect(
        formatSessionBreakdown('Qualifying', {
          POS: 0, PG: 0, OV: 0, FL: 0, DD: 0, TW: 0, FP: 0,
        }),
      ).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // handleLiveScoreCommand — entry point
  // -------------------------------------------------------------------
  describe('handleLiveScoreCommand', () => {
    it('prompts to follow when the user follows no league', async () => {
      listUserLeagues.mockResolvedValueOnce([]);

      await handleLiveScoreCommand(mockBot, msg);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('not following any league'),
      );
    });

    it('skips the league picker when user follows exactly one league', async () => {
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
      ]);
      getLockedTeamsData.mockResolvedValueOnce(lockedSnapshot);

      await handleLiveScoreCommand(mockBot, msg);

      expect(getLockedTeamsData).toHaveBeenCalledWith('ABC');
      // Team picker rendered (no league picker first)
      const [, body] = mockBot.sendMessage.mock.calls[0];
      expect(body).toContain("Which team's live score do you want to see?");
    });

    it('shows the league picker for multiple leagues', async () => {
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
        { leagueCode: 'XYZ', leagueName: 'Xyz' },
      ]);

      await handleLiveScoreCommand(mockBot, msg);

      const [, body, opts] = mockBot.sendMessage.mock.calls[0];
      expect(body).toContain('Which league live score do you want to see?');
      expect(opts.reply_markup.inline_keyboard).toEqual([
        [{ text: 'Amba', callback_data: 'LS:L:ABC' }],
        [{ text: 'Xyz', callback_data: 'LS:L:XYZ' }],
      ]);
      expect(opts.reply_to_message_id).toBe(99);
      expect(getLockedTeamsData).not.toHaveBeenCalled();
    });

    it('reports list-leagues errors gracefully', async () => {
      listUserLeagues.mockRejectedValueOnce(new Error('list-fail'));

      await handleLiveScoreCommand(mockBot, msg);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('list-fail'),
      );
    });

    it('messages "no locked roster yet" when the locked snapshot is missing', async () => {
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
      ]);
      getLockedTeamsData.mockResolvedValueOnce(null);

      await handleLiveScoreCommand(mockBot, msg);

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('No locked roster is available yet'),
      );
    });
  });

  // -------------------------------------------------------------------
  // handleLiveScoreCallback — picker callbacks
  // -------------------------------------------------------------------
  describe('handleLiveScoreCallback', () => {
    const baseQuery = (data) => ({
      id: 'cb-1',
      data,
      message: { chat: { id: chatId }, message_id: 99 },
    });

    it('LEAGUE action → renders the team picker keyboard', async () => {
      getLockedTeamsData.mockResolvedValueOnce(lockedSnapshot);

      await handleLiveScoreCallback(mockBot, baseQuery('LS:L:ABC'));

      const [, body, opts] = mockBot.sendMessage.mock.calls[0];
      expect(body).toContain("Which team's live score do you want to see?");
      const keyboard = opts.reply_markup.inline_keyboard;
      // First row is "All teams" button
      expect(keyboard[0]).toEqual([
        { text: '🏁 All teams', callback_data: 'LS:A:ABC' },
      ]);
      // Subsequent rows are team buttons sorted by position
      expect(keyboard[1][0].text).toBe('1. Cooperon');
      expect(keyboard[2][0].text).toBe('2. Ravivmar');
      expect(keyboard[3][0].text).toBe('3. Empty');
      expect(keyboard[1][0].callback_data).toBe('LS:T:ABC:Cooperon');
      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith('cb-1');
    });

    it('TEAM action → fetches live score, renders per-driver/constructor breakdown', async () => {
      getLockedTeamsData.mockResolvedValueOnce(lockedSnapshot);
      getLiveScoreData.mockResolvedValueOnce(liveScorePayload);

      await handleLiveScoreCallback(mockBot, baseQuery('LS:T:ABC:Cooperon'));

      const [, body, opts] = mockBot.sendMessage.mock.calls[0];
      expect(opts).toEqual({ parse_mode: 'HTML' });
      expect(body).toContain('🏎️ Live Score — Amba — md 4 — Cooperon');
      // HAM (Boost x2): 20 * 2 = 40
      expect(body).toContain('<b>HAM (Boost x2) — 40 pts | Δ +0.2</b>');
      // VER plain: 10
      expect(body).toContain('<b>VER — 10 pts | Δ +0.1</b>');
      // Total: 10 + 40 + 5 + 15 + 3 + 25 + 18 = 116
      expect(body).toContain('<b>Total Live Points:</b> 116.00');
    });

    it('TEAM action → friendly message when team not in snapshot', async () => {
      getLockedTeamsData.mockResolvedValueOnce(lockedSnapshot);
      getLiveScoreData.mockResolvedValueOnce(liveScorePayload);

      await handleLiveScoreCallback(mockBot, baseQuery('LS:T:ABC:UnknownTeam'));

      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('Team UnknownTeam not found'),
      );
    });

    it('ALL action → renders sorted leaderboard (highest score first)', async () => {
      getLockedTeamsData.mockResolvedValueOnce(lockedSnapshot);
      getLiveScoreData.mockResolvedValueOnce(liveScorePayload);

      await handleLiveScoreCallback(mockBot, baseQuery('LS:A:ABC'));

      const [, body, opts] = mockBot.sendMessage.mock.calls[0];
      expect(opts).toEqual({ parse_mode: 'HTML' });
      expect(body).toContain('🏎️ Live Score — Amba — md 4 — All teams');
      // Cooperon: HAM*2 + others = 116. Ravivmar: VER*3 + HAM + NOR*2 + LEC + PIA + FER + MER
      //   = 30 + 20 + 10 + 15 + 3 + 25 + 18 = 121.
      // Empty: HAM*2 = 40.
      // Sorted DESC: Ravivmar (121) → Cooperon (116) → Empty (40).
      const ravivIdx = body.indexOf('Ravivmar');
      const cooperIdx = body.indexOf('Cooperon');
      const emptyIdx = body.indexOf('Empty');
      expect(ravivIdx).toBeGreaterThan(-1);
      expect(ravivIdx).toBeLessThan(cooperIdx);
      expect(cooperIdx).toBeLessThan(emptyIdx);
      expect(body).toContain(' 1. Ravivmar — 121.00 pts');
      expect(body).toContain(' 2. Cooperon — 116.00 pts');
      expect(body).toContain(' 3. Empty — 40.00 pts');
    });

    it('ALL action → bolds the user\'s selectedTeam row when it lives in this league', async () => {
      // user's selectedTeam is the team-id form for Cooperon
      getSelectedTeam.mockReturnValue('ABC_Cooperon');
      getLockedTeamsData.mockResolvedValueOnce(lockedSnapshot);
      getLiveScoreData.mockResolvedValueOnce(liveScorePayload);

      await handleLiveScoreCallback(mockBot, baseQuery('LS:A:ABC'));

      const body = mockBot.sendMessage.mock.calls[0][1];
      expect(body).toMatch(/<b>\s*\d+\. Cooperon — 116\.00 pts/);
      // Other rows are not bolded
      expect(body).toContain(' 1. Ravivmar — 121.00 pts');
      expect(body).not.toMatch(/<b>\s*\d+\. Ravivmar/);
    });

    it('ALL action → handles empty team list', async () => {
      getLockedTeamsData.mockResolvedValueOnce({
        leagueCode: 'ABC', leagueName: 'Amba', matchdayId: 4, teams: [],
      });
      getLiveScoreData.mockResolvedValueOnce(liveScorePayload);

      await handleLiveScoreCallback(mockBot, baseQuery('LS:A:ABC'));

      const body = mockBot.sendMessage.mock.calls[0][1];
      expect(body).toContain('No teams in this league yet.');
    });

    it('TEAM action → reports live-score fetch errors gracefully', async () => {
      getLockedTeamsData.mockResolvedValueOnce(lockedSnapshot);
      getLiveScoreData.mockRejectedValueOnce(new Error('blob missing'));

      await handleLiveScoreCallback(mockBot, baseQuery('LS:T:ABC:Cooperon'));

      expect(sendErrorMessage).toHaveBeenCalledWith(
        mockBot,
        expect.stringContaining('blob missing'),
      );
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('blob missing'),
      );
    });

    it('always answers the callback query', async () => {
      getLockedTeamsData.mockResolvedValueOnce(lockedSnapshot);

      await handleLiveScoreCallback(mockBot, baseQuery('LS:L:ABC'));

      expect(mockBot.answerCallbackQuery).toHaveBeenCalledWith('cb-1');
    });
  });

  // -------------------------------------------------------------------
  // formatLiveScoreSummary — header semantics
  // -------------------------------------------------------------------
  describe('formatLiveScoreSummary', () => {
    it('puts league + matchday + team in the header and escapes HTML', () => {
      const out = formatLiveScoreSummary({
        leagueName: 'Am<bad>',
        matchdayId: 4,
        teamName: 'Coo<per>on',
        liveScoreData: liveScorePayload,
        breakdown: {
          totalPoints: 100, totalPriceChange: 0,
          driverBreakdown: [], constructorBreakdown: [], missingMembers: [],
        },
        chatId,
      });

      expect(out).toContain('Am&lt;bad&gt;');
      expect(out).toContain('Coo&lt;per&gt;on');
      expect(out).toContain('md 4');
      expect(out).not.toContain('<bad>');
    });
  });

  // -------------------------------------------------------------------
  // formatAllTeamsLeaderboard — sorting & rank format
  // -------------------------------------------------------------------
  describe('formatAllTeamsLeaderboard', () => {
    it('shows position-padded rank and joins in order', () => {
      const rows = [
        { teamName: 'A', totalPoints: 20.5, totalPriceChange: 0 },
        { teamName: 'B', totalPoints: 10.0, totalPriceChange: 0 },
      ];
      const out = formatAllTeamsLeaderboard({
        leagueName: 'L',
        leagueCode: 'C',
        matchdayId: 4,
        rows,
        liveScoreData: liveScorePayload,
        chatId,
        selectedTeamId: null,
      });

      expect(out).toContain(' 1. A — 20.50 pts');
      expect(out).toContain(' 2. B — 10.00 pts');
    });
  });
});
