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

jest.mock('../utils/utils', () => ({
  isAdminMessage: jest.fn(),
}));

jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));

jest.mock('../azureStorageService', () => ({
  getLeagueData: jest.fn(),
}));

const { isAdminMessage } = require('../utils/utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');

describe('leaderboardHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = { sendMessage: jest.fn().mockResolvedValue() };
  });

  describe('formatLeaderboard', () => {
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
  });

  describe('handleLeaderboardCommand', () => {
    it('rejects non-admins', async () => {
      isAdminMessage.mockReturnValue(false);

      await handleLeaderboardCommand(botMock, { chat: { id: 9 } });

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        9,
        'Sorry, only admins can use this command.',
      );
      expect(listUserLeagues).not.toHaveBeenCalled();
    });

    it('asks the user to register when they have no leagues', async () => {
      isAdminMessage.mockReturnValue(true);
      listUserLeagues.mockResolvedValueOnce([]);

      await handleLeaderboardCommand(botMock, { chat: { id: 1 } });

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'You are not following any league. Run /follow_league to follow one first.',
      );
    });

    it('auto-renders the leaderboard when the user has one league', async () => {
      isAdminMessage.mockReturnValue(true);
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
      );
    });

    it('shows an inline keyboard when the user has multiple leagues', async () => {
      isAdminMessage.mockReturnValue(true);
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
  });
});
