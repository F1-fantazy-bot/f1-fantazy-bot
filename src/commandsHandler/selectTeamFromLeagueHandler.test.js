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
  sendMessageToUser: jest.fn().mockResolvedValue(),
}));

jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));

jest.mock('../azureStorageService', () => ({
  getLeagueTeamsData: jest.fn(),
  saveUserTeam: jest.fn().mockResolvedValue(),
  deleteAllUserTeams: jest.fn().mockResolvedValue(),
}));

jest.mock('../userRegistryService', () => ({
  updateUserAttributes: jest.fn().mockResolvedValue(),
}));

const {
  handleSelectTeamFromLeagueCommand,
  promptTeamPick,
  applyLeagueTeamSelection,
  mapLeagueTeamToBotTeam,
  buildTeamId,
  sanitizeTeamName,
} = require('./selectTeamFromLeagueHandler');

const { isAdminMessage } = require('../utils/utils');
const { listUserLeagues } = require('../leagueRegistryService');
const azureStorageService = require('../azureStorageService');
const { updateUserAttributes } = require('../userRegistryService');
const cache = require('../cache');

describe('selectTeamFromLeagueHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = { sendMessage: jest.fn().mockResolvedValue() };

    // Reset caches
    Object.keys(cache.currentTeamCache).forEach(
      (k) => delete cache.currentTeamCache[k],
    );
    Object.keys(cache.bestTeamsCache).forEach(
      (k) => delete cache.bestTeamsCache[k],
    );
    Object.keys(cache.selectedChipCache).forEach(
      (k) => delete cache.selectedChipCache[k],
    );
    Object.keys(cache.userCache).forEach(
      (k) => delete cache.userCache[k],
    );
    Object.keys(cache.leagueTeamsDataCache).forEach(
      (k) => delete cache.leagueTeamsDataCache[k],
    );
  });

  describe('sanitizeTeamName', () => {
    it('replaces unsafe characters with dashes', () => {
      expect(sanitizeTeamName('Fast & Furious / Team')).toBe(
        'Fast-Furious-Team',
      );
    });

    it('falls back to "team" for empty input', () => {
      expect(sanitizeTeamName('')).toBe('team');
      expect(sanitizeTeamName(null)).toBe('team');
    });

    it('truncates overly long names', () => {
      const name = 'a'.repeat(200);
      expect(sanitizeTeamName(name).length).toBe(40);
    });
  });

  describe('buildTeamId', () => {
    it('combines leagueCode and sanitized teamName', () => {
      expect(buildTeamId('ABC', 'My Team!')).toBe('ABC_My-Team');
    });
  });

  describe('mapLeagueTeamToBotTeam', () => {
    const leagueTeam = {
      teamName: 'Racers',
      userName: 'Alice',
      position: 1,
      budget: 110.5,
      transfersRemaining: 3,
      drivers: [
        { id: 1, name: 'VER', price: 30, isCaptain: true },
        { id: 2, name: 'NOR', price: 28 },
        { id: 3, name: 'HAM', price: 25 },
        { id: 4, name: 'PIA', price: 15 },
        { id: 5, name: 'RUS', price: 8 },
      ],
      constructors: [
        { id: 10, name: 'Red Bull', price: 2 },
        { id: 11, name: 'Ferrari', price: 1 },
      ],
    };

    it('maps drivers/constructors to name arrays', () => {
      const team = mapLeagueTeamToBotTeam(leagueTeam);
      expect(team.drivers).toEqual(['VER', 'NOR', 'HAM', 'PIA', 'RUS']);
      expect(team.constructors).toEqual(['Red Bull', 'FER']);
    });

    it('uses isCaptain for boost', () => {
      expect(mapLeagueTeamToBotTeam(leagueTeam).boost).toBe('VER');
    });

    it('falls back to isMegaCaptain when no isCaptain', () => {
      const team = mapLeagueTeamToBotTeam({
        ...leagueTeam,
        drivers: [
          { name: 'A', price: 10 },
          { name: 'B', price: 10, isMegaCaptain: true },
        ],
        constructors: [],
        budget: 100,
      });
      expect(team.boost).toBe('B');
    });

    it('falls back to the first driver when no captain flags', () => {
      const team = mapLeagueTeamToBotTeam({
        ...leagueTeam,
        drivers: [
          { name: 'A', price: 10 },
          { name: 'B', price: 10 },
        ],
        constructors: [],
        budget: 100,
      });
      expect(team.boost).toBe('A');
    });

    it('computes costCapRemaining as budget minus sum of prices', () => {
      // sum = 30+28+25+15+8 + 2+1 = 109.  109.5 budget => 1.5 remaining.
      const team = mapLeagueTeamToBotTeam({ ...leagueTeam, budget: 110.5 });
      expect(team.costCapRemaining).toBeCloseTo(1.5, 2);
    });

    it('maps transfersRemaining to freeTransfers (clamped to >= 0)', () => {
      expect(mapLeagueTeamToBotTeam(leagueTeam).freeTransfers).toBe(3);
      expect(
        mapLeagueTeamToBotTeam({ ...leagueTeam, transfersRemaining: -2 })
          .freeTransfers,
      ).toBe(0);
    });

    it('maps league display names (e.g. "O. Bearman", "Racing Bulls") to codes', () => {
      const team = mapLeagueTeamToBotTeam({
        teamName: 'Roster',
        budget: 100,
        transfersRemaining: 1,
        drivers: [
          { name: 'O. Bearman', price: 10, isCaptain: true },
          { name: 'M. Verstappen', price: 30 },
          { name: 'Unknown Driver', price: 5 },
        ],
        constructors: [
          { name: 'Racing Bulls', price: 3 },
          { name: 'Red Bull Racing', price: 20 },
        ],
      });
      expect(team.drivers).toEqual(['BEA', 'VER', 'Unknown Driver']);
      expect(team.constructors).toEqual(['VRB', 'RED']);
      expect(team.boost).toBe('BEA');
    });
  });

  describe('handleSelectTeamFromLeagueCommand', () => {
    it('rejects non-admins', async () => {
      isAdminMessage.mockReturnValue(false);

      await handleSelectTeamFromLeagueCommand(botMock, { chat: { id: 9 } });

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        9,
        'Sorry, only admins can use this command.',
      );
      expect(listUserLeagues).not.toHaveBeenCalled();
    });

    it('tells the user to follow a league if they have none', async () => {
      isAdminMessage.mockReturnValue(true);
      listUserLeagues.mockResolvedValueOnce([]);

      await handleSelectTeamFromLeagueCommand(botMock, { chat: { id: 1 } });

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'You are not following any league. Run /follow_league to follow one first.',
      );
    });

    it('prompts team pick when user has exactly one league', async () => {
      isAdminMessage.mockReturnValue(true);
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
      ]);
      azureStorageService.getLeagueTeamsData.mockResolvedValueOnce({
        teams: [
          { teamName: 'A', userName: 'Alice', position: 1 },
          { teamName: 'B', userName: 'Bob', position: 2 },
        ],
      });

      await handleSelectTeamFromLeagueCommand(botMock, {
        chat: { id: 1 },
        message_id: 7,
      });

      expect(azureStorageService.getLeagueTeamsData).toHaveBeenCalledWith(
        'ABC',
      );
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'Which team do you want to load?',
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [
              [{ text: '1. A', callback_data: 'LEAGUE_TEAM_PICK:ABC:1' }],
              [{ text: '2. B', callback_data: 'LEAGUE_TEAM_PICK:ABC:2' }],
            ],
          },
          reply_to_message_id: 7,
        }),
      );
    });

    it('shows league picker when user has multiple leagues', async () => {
      isAdminMessage.mockReturnValue(true);
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
        { leagueCode: 'XYZ', leagueName: 'Other' },
      ]);

      await handleSelectTeamFromLeagueCommand(botMock, {
        chat: { id: 1 },
        message_id: 3,
      });

      expect(azureStorageService.getLeagueTeamsData).not.toHaveBeenCalled();
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'Which league do you want to select a team from?',
        expect.objectContaining({
          reply_to_message_id: 3,
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Amba', callback_data: 'LEAGUE_TEAM_SELECT:ABC' }],
              [{ text: 'Other', callback_data: 'LEAGUE_TEAM_SELECT:XYZ' }],
            ],
          },
        }),
      );
    });

    it('reports when teams-data blob is missing', async () => {
      isAdminMessage.mockReturnValue(true);
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
      ]);
      azureStorageService.getLeagueTeamsData.mockResolvedValueOnce(null);

      await handleSelectTeamFromLeagueCommand(botMock, {
        chat: { id: 1 },
        message_id: 1,
      });

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'No team roster is available yet for this league. Please try again later.',
      );
    });
  });

  describe('promptTeamPick — caching', () => {
    it('caches teams-data per league and does not refetch on second call', async () => {
      const data = {
        leagueName: 'Amba',
        teams: [{ teamName: 'A', position: 1 }],
      };
      azureStorageService.getLeagueTeamsData.mockResolvedValueOnce(data);

      await promptTeamPick(botMock, 1, 'ABC');
      await promptTeamPick(botMock, 1, 'ABC');

      expect(azureStorageService.getLeagueTeamsData).toHaveBeenCalledTimes(1);
    });
  });

  describe('applyLeagueTeamSelection', () => {
    const leagueData = {
      leagueName: 'Amba',
      leagueCode: 'ABC',
      teams: [
        {
          teamName: 'My Team',
          userName: 'Alice',
          position: 1,
          budget: 110,
          transfersRemaining: 2,
          drivers: [
            { name: 'VER', price: 30, isCaptain: true },
            { name: 'NOR', price: 28 },
            { name: 'HAM', price: 25 },
            { name: 'PIA', price: 15 },
            { name: 'RUS', price: 8 },
          ],
          constructors: [
            { name: 'RB', price: 2 },
            { name: 'FER', price: 1 },
          ],
        },
      ],
    };

    beforeEach(() => {
      azureStorageService.getLeagueTeamsData.mockResolvedValue(leagueData);
      // Preload existing cached team + selection to prove it's wiped
      cache.currentTeamCache[1] = { T1: { drivers: ['OLD'] } };
      cache.bestTeamsCache[1] = { T1: { bestTeams: [] } };
      cache.selectedChipCache[1] = { T1: 'EXTRA_BOOST' };
      cache.userCache['1'] = { selectedTeam: 'T1' };
    });

    it('deletes existing teams, loads the picked team, and updates selectedTeam', async () => {
      await applyLeagueTeamSelection(botMock, 1, 'ABC', 1);

      expect(azureStorageService.deleteAllUserTeams).toHaveBeenCalledWith(
        botMock,
        1,
      );

      expect(cache.currentTeamCache[1]).toEqual({
        'ABC_My-Team': expect.objectContaining({
          drivers: ['VER', 'NOR', 'HAM', 'PIA', 'RUS'],
          constructors: ['RB', 'FER'],
          boost: 'VER',
          freeTransfers: 2,
        }),
      });
      expect(cache.bestTeamsCache[1]).toBeUndefined();
      expect(cache.selectedChipCache[1]).toBeUndefined();
      expect(cache.userCache['1'].selectedTeam).toBe('ABC_My-Team');

      expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
        botMock,
        1,
        'ABC_My-Team',
        expect.objectContaining({ boost: 'VER' }),
      );
      expect(updateUserAttributes).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ selectedTeam: 'ABC_My-Team' }),
      );
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        expect.stringContaining('Loaded team My Team from league Amba'),
      );
    });

    it('errors gracefully when position does not exist in league', async () => {
      await applyLeagueTeamSelection(botMock, 1, 'ABC', 99);

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        '❌ Could not find that team in the league anymore.',
      );
      expect(azureStorageService.saveUserTeam).not.toHaveBeenCalled();
      // Existing cached team is untouched on the no-op path
      expect(cache.currentTeamCache[1]).toEqual({ T1: { drivers: ['OLD'] } });
    });
  });
});
