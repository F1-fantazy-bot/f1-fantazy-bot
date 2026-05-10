const {
  handleLeaderboardCommand,
  formatLeaderboard,
  sendLeaderboard,
} = require('./leaderboardHandler');

jest.mock('../i18n', () => ({
  t: jest.fn((key, _chatId, vars) =>
    vars
      ? Object.entries(vars).reduce(
          (acc, [k, v]) => acc.replace(`{${k}}`, v),
          key,
        )
      : key,
  ),
}));

jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));

jest.mock('../azureStorageService', () => ({
  getLeagueData: jest.fn(),
}));

jest.mock('../cache', () => ({
  getSelectedTeam: jest.fn(),
}));

jest.mock('../utils/activeTeamIdentity', () => {
  const actual = jest.requireActual('../utils/activeTeamIdentity');

  return {
    ...actual,
    resolveActiveTeamFantasyId: jest.fn(),
  };
});

const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');
const { getSelectedTeam } = require('../cache');
const {
  resolveActiveTeamFantasyId,
} = require('../utils/activeTeamIdentity');

describe('leaderboardHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveActiveTeamFantasyId.mockResolvedValue(null);
    botMock = { sendMessage: jest.fn().mockResolvedValue() };
  });

  describe('formatLeaderboard', () => {
    beforeEach(() => {
      getSelectedTeam.mockReturnValue(null);
    });

    it('produces header + position-sorted rows', () => {
      const data = {
        leagueName: 'Amba',
        leagueCode: 'ABC',
        memberCount: 3,
        fetchedAt: '2026-04-16T19:14:40.583Z',
        teams: [
          { teamName: 'B', totalScore: 800, position: 2 },
          { teamName: 'A', totalScore: 900, position: 1 },
          { teamName: 'C', totalScore: 700, position: 3 },
        ],
      };

      const output = formatLeaderboard(data, 1);

      expect(output).toContain('🏆 Amba');
      expect(output).toContain('👥 3 teams · updated 2026-04-16T19:14:40.583Z');
      expect(output.indexOf(' 1. A — 900')).toBeGreaterThan(-1);
      expect(output.indexOf(' 1. A — 900')).toBeLessThan(
        output.indexOf(' 2. B — 800'),
      );
      expect(output.indexOf(' 2. B — 800')).toBeLessThan(
        output.indexOf(' 3. C — 700'),
      );
    });

    it('handles empty teams', () => {
      const output = formatLeaderboard(
        { leagueName: 'Empty', memberCount: 0, teams: [] },
        1,
      );

      expect(output).toContain('No teams in this league yet.');
    });

    it('bolds the selected team row (same-league fallback via getSelectedTeam)', () => {
      getSelectedTeam.mockReturnValue('ABC_A');

      const output = formatLeaderboard(
        {
          leagueName: 'Amba',
          leagueCode: 'ABC',
          teams: [
            { teamName: 'A', totalScore: 900, position: 1 },
            { teamName: 'B', totalScore: 800, position: 2 },
          ],
        },
        1,
      );

      expect(output).toContain('<b> 1. A — 900</b>');
      expect(output).toContain(' 2. B — 800');
    });

    it('bolds the row matching an explicit same-league highlight teamId', () => {
      const output = formatLeaderboard(
        {
          leagueName: 'Amba',
          leagueCode: 'ABC',
          teams: [
            { teamName: 'A', totalScore: 900, position: 1, userName: 'u1', teamNo: 1 },
            { teamName: 'B', totalScore: 800, position: 2, userName: 'u2', teamNo: 1 },
          ],
        },
        1,
        { teamId: 'ABC_A', fantasyId: null },
      );

      expect(output).toContain('<b> 1. A — 900</b>');
      expect(output).toContain(' 2. B — 800');
    });

    it('bolds the row matching cross-league via fantasyId (userName_teamNo)', () => {
      // Active team is `OTHER_SomeOtherName` in another league, but the
      // same F1 Fantasy account (`u2_2`) also has a team in this league.
      const output = formatLeaderboard(
        {
          leagueName: 'Amba',
          leagueCode: 'ABC',
          teams: [
            { teamName: 'A', totalScore: 900, position: 1, userName: 'u1', teamNo: 1 },
            { teamName: 'B', totalScore: 800, position: 2, userName: 'u2', teamNo: 2 },
          ],
        },
        1,
        { teamId: 'OTHER_SomeOtherName', fantasyId: 'u2_2' },
      );

      expect(output).toContain(' 1. A — 900');
      expect(output).not.toContain('<b> 1. A — 900</b>');
      expect(output).toContain('<b> 2. B — 800 (-100)</b>');
    });

    it('does not bold any row when no team matches (old blob without teamNo)', () => {
      const output = formatLeaderboard(
        {
          leagueName: 'Amba',
          leagueCode: 'ABC',
          teams: [
            { teamName: 'A', totalScore: 900, position: 1, userName: 'u1' },
            { teamName: 'B', totalScore: 800, position: 2, userName: 'u2' },
          ],
        },
        1,
        { teamId: 'OTHER_SomeOtherName', fantasyId: 'u2_2' },
      );

      expect(output).not.toContain('<b>');
    });
  });

  describe('handleLeaderboardCommand', () => {
    it('asks the user to register when they have no leagues', async () => {
      listUserLeagues.mockResolvedValueOnce([]);

      await handleLeaderboardCommand(botMock, { chat: { id: 1 } });

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'You are not following any league. Run /follow_league to follow one first.',
      );
    });

    it('auto-renders the leaderboard when the user has one league', async () => {
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
      ]);
      getLeagueData.mockResolvedValueOnce({
        leagueName: 'Amba',
        memberCount: 1,
        fetchedAt: 't',
        teams: [{ teamName: 'A', totalScore: 1, position: 1 }],
      });

      await handleLeaderboardCommand(botMock, { chat: { id: 1 } });

      expect(getLeagueData).toHaveBeenCalledWith('ABC');
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        expect.stringContaining('🏆 Amba'),
        { parse_mode: 'HTML' },
      );
    });

    it('shows an inline keyboard when the user has multiple leagues', async () => {
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
        { leagueCode: 'XYZ', leagueName: 'Other' },
      ]);

      await handleLeaderboardCommand(botMock, {
        chat: { id: 1 },
        message_id: 5,
      });

      expect(getLeagueData).not.toHaveBeenCalled();
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'Which league leaderboard do you want to see?',
        expect.objectContaining({
          reply_to_message_id: 5,
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Amba', callback_data: 'LEAGUE:ABC' }],
              [{ text: 'Other', callback_data: 'LEAGUE:XYZ' }],
            ],
          },
        }),
      );
    });
  });

  describe('sendLeaderboard', () => {
    it('tells the user when the blob is missing', async () => {
      getLeagueData.mockResolvedValueOnce(null);

      await sendLeaderboard(botMock, 1, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'No leaderboard data is available yet for this league. Please try again later.',
      );
    });

    it('reports fetch errors gracefully', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      getLeagueData.mockRejectedValueOnce(new Error('boom'));

      await sendLeaderboard(botMock, 1, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        '❌ Failed to load league data: boom',
      );
      consoleSpy.mockRestore();
    });

    it('bolds the cross-league counterpart via resolved fantasyId', async () => {
      resolveActiveTeamFantasyId.mockResolvedValueOnce({
        teamId: 'OTHER_DifferentName',
        fantasyId: 'u2_2',
      });
      getLeagueData.mockResolvedValueOnce({
        leagueName: 'Amba',
        leagueCode: 'ABC',
        memberCount: 2,
        fetchedAt: 't',
        teams: [
          { teamName: 'A', totalScore: 900, position: 1, userName: 'u1', teamNo: 1 },
          { teamName: 'B', totalScore: 800, position: 2, userName: 'u2', teamNo: 2 },
        ],
      });

      await sendLeaderboard(botMock, 1, 'ABC');

      const [, body, opts] = botMock.sendMessage.mock.calls[0];
      expect(opts).toEqual({ parse_mode: 'HTML' });
      expect(body).toContain('<b> 2. B — 800 (-100)</b>');
      expect(body).not.toContain('<b> 1. A');
    });
  });
});
