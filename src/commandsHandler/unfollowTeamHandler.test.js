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
  sendLogMessage: jest.fn().mockResolvedValue(),
}));

jest.mock('../azureStorageService', () => ({
  deleteUserTeam: jest.fn().mockResolvedValue(),
  deletePendingLeagueTeamAdd: jest.fn().mockResolvedValue(),
}));

jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn().mockResolvedValue([]),
}));

jest.mock('../userRegistryService', () => ({
  updateUserAttributes: jest.fn().mockResolvedValue(),
}));

const {
  handleUnfollowTeamCommand,
  removeFollowedTeam,
} = require('./unfollowTeamHandler');
const { isAdminMessage } = require('../utils/utils');
const azureStorageService = require('../azureStorageService');
const { listUserLeagues } = require('../leagueRegistryService');
const { updateUserAttributes } = require('../userRegistryService');
const cache = require('../cache');

describe('unfollowTeamHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = { sendMessage: jest.fn().mockResolvedValue() };
    for (const obj of [
      cache.currentTeamCache,
      cache.bestTeamsCache,
      cache.selectedChipCache,
      cache.userCache,
    ]) {
      Object.keys(obj).forEach((k) => delete obj[k]);
    }
  });

  describe('handleUnfollowTeamCommand', () => {
    it('rejects non-admins', async () => {
      isAdminMessage.mockReturnValue(false);

      await handleUnfollowTeamCommand(botMock, { chat: { id: 9 } });

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        9,
        'Sorry, only admins can use this command.',
      );
      expect(azureStorageService.deletePendingLeagueTeamAdd).not.toHaveBeenCalled();
    });

    it('clears stale pending-add and tells user when no league teams are followed', async () => {
      isAdminMessage.mockReturnValue(true);

      await handleUnfollowTeamCommand(botMock, { chat: { id: 1 } });

      expect(
        azureStorageService.deletePendingLeagueTeamAdd,
      ).toHaveBeenCalledWith(1);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        expect.stringContaining('not following any league teams'),
      );
    });

    it('ignores screenshot teams and shows picker only for league teams', async () => {
      isAdminMessage.mockReturnValue(true);
      cache.currentTeamCache[1] = {
        T1: { drivers: [] },
        ABC_My_Team: { teamName: 'My Team' },
        XYZ_Other: { teamName: 'Other' },
      };
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
        { leagueCode: 'XYZ', leagueName: 'Xander' },
      ]);

      await handleUnfollowTeamCommand(botMock, {
        chat: { id: 1 },
        message_id: 42,
      });

      const call = botMock.sendMessage.mock.calls.find(
        ([, text]) =>
          typeof text === 'string' && text.includes('stop following'),
      );
      expect(call).toBeDefined();
      const [, , options] = call;
      const rows = options.reply_markup.inline_keyboard;
      expect(rows).toHaveLength(2);
      const buttons = rows.map((r) => r[0]);
      expect(buttons.map((b) => b.callback_data).sort()).toEqual(
        ['UFT:ABC_My_Team', 'UFT:XYZ_Other'].sort(),
      );
      expect(buttons.find((b) => b.callback_data === 'UFT:ABC_My_Team').text)
        .toContain('My Team');
      expect(buttons.find((b) => b.callback_data === 'UFT:ABC_My_Team').text)
        .toContain('Amba');
    });
  });

  describe('removeFollowedTeam', () => {
    it('no-ops when teamId is not followed', async () => {
      cache.currentTeamCache[1] = { ABC_Other: {} };

      const result = await removeFollowedTeam(botMock, 1, 'XYZ_Missing');

      expect(result.removed).toBe(false);
      expect(azureStorageService.deleteUserTeam).not.toHaveBeenCalled();
    });

    it('removes the team, picks a fallback, and persists', async () => {
      cache.currentTeamCache[1] = {
        ABC_A: { teamName: 'A' },
        XYZ_B: { teamName: 'B' },
      };
      cache.bestTeamsCache[1] = { ABC_A: {} };
      cache.selectedChipCache[1] = { ABC_A: 'EXTRA_BOOST' };
      cache.userCache['1'] = { selectedTeam: 'ABC_A' };

      const result = await removeFollowedTeam(botMock, 1, 'ABC_A');

      expect(result.removed).toBe(true);
      expect(result.fallbackSelectedTeam).toBe('XYZ_B');
      expect(azureStorageService.deleteUserTeam).toHaveBeenCalledWith(
        botMock,
        1,
        'ABC_A',
      );
      expect(cache.currentTeamCache[1]).toEqual({ XYZ_B: { teamName: 'B' } });
      expect(cache.bestTeamsCache[1]).toBeUndefined();
      expect(cache.selectedChipCache[1]).toBeUndefined();
      expect(cache.userCache['1'].selectedTeam).toBe('XYZ_B');
      expect(updateUserAttributes).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ selectedTeam: 'XYZ_B' }),
      );
    });

    it('clears selectedTeam when the last followed team is removed', async () => {
      cache.currentTeamCache[1] = { ABC_A: {} };
      cache.userCache['1'] = { selectedTeam: 'ABC_A' };

      const result = await removeFollowedTeam(botMock, 1, 'ABC_A');

      expect(result.removed).toBe(true);
      expect(result.fallbackSelectedTeam).toBeNull();
      expect(cache.currentTeamCache[1]).toBeUndefined();
      expect(cache.userCache['1'].selectedTeam).toBeUndefined();
      expect(updateUserAttributes).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ selectedTeam: null }),
      );
    });

    it('keeps the existing selectedTeam when removing a non-active team', async () => {
      cache.currentTeamCache[1] = {
        ABC_A: {},
        XYZ_B: {},
      };
      cache.userCache['1'] = { selectedTeam: 'XYZ_B' };

      await removeFollowedTeam(botMock, 1, 'ABC_A');

      expect(cache.userCache['1'].selectedTeam).toBe('XYZ_B');
    });
  });
});
