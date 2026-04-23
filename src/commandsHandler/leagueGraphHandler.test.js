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

jest.mock('../utils', () => ({
  sendErrorMessage: jest.fn().mockResolvedValue(),
}));

jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));

jest.mock('../azureStorageService', () => ({
  getLeagueData: jest.fn(),
}));

jest.mock('../raceScheduleService', () => ({
  fetchCurrentSeasonRaces: jest.fn(),
}));

jest.mock('../cache', () => ({
  getSelectedTeam: jest.fn(),
}));

// Mock quickchart-js so tests never touch the network.
// Names must be prefixed with `mock` to be accessible inside jest.mock factories.
const mockGetShortUrl = jest.fn();
const mockSetConfig = jest.fn();
const mockSetWidth = jest.fn();
const mockSetHeight = jest.fn();
const mockSetBg = jest.fn();
const mockSetVersion = jest.fn();

jest.mock('quickchart-js', () => {
  return jest.fn().mockImplementation(() => {
    const chainable = {};
    mockSetConfig.mockImplementation(() => chainable);
    mockSetWidth.mockImplementation(() => chainable);
    mockSetHeight.mockImplementation(() => chainable);
    mockSetBg.mockImplementation(() => chainable);
    mockSetVersion.mockImplementation(() => chainable);
    chainable.setConfig = mockSetConfig;
    chainable.setWidth = mockSetWidth;
    chainable.setHeight = mockSetHeight;
    chainable.setBackgroundColor = mockSetBg;
    chainable.setVersion = mockSetVersion;
    chainable.getShortUrl = mockGetShortUrl;

    return chainable;
  });
});

const { isAdminMessage } = require('../utils/utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { getSelectedTeam } = require('../cache');

const {
  handleLeagueGraphCommand,
  sendLeagueGraph,
  buildChartConfig,
  getSortedMatchdayKeys,
  buildRoundToRaceNameMap,
} = require('./leagueGraphHandler');

// Fixture mirroring the real league-standings.json shape shared by the user.
const FIXTURE = {
  fetchedAt: '2026-04-20T00:03:06.265Z',
  leagueName: 'Amba',
  leagueCode: 'C8EFGOXCB04',
  leagueId: 542404,
  memberCount: 3,
  teams: [
    {
      teamName: 'dorsegal1',
      userName: 'Dor Segal',
      position: 2,
      totalScore: 984,
      raceScores: {
        matchday_1: 251,
        matchday_2: 369,
        matchday_3: 364,
      },
      chipsUsed: [{ name: 'Limitless', gameDayId: 3 }],
    },
    {
      teamName: 'Cooperon',
      userName: 'Ron Cooper',
      position: 1,
      totalScore: 976,
      raceScores: {
        matchday_1: 259,
        matchday_2: 481,
        matchday_3: 236,
      },
      chipsUsed: [
        { name: 'Limitless', gameDayId: 2 },
        { name: 'Extra DRS Boost', gameDayId: 3 },
      ],
    },
    {
      teamName: 'Kilzid',
      userName: 'Doron Kilzi',
      position: 3,
      totalScore: 965,
      raceScores: {
        matchday_1: 251,
        matchday_2: 369,
        matchday_3: 345,
      },
      chipsUsed: [],
    },
  ],
};

describe('leagueGraphHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    getSelectedTeam.mockReturnValue(null);
    botMock = {
      sendMessage: jest.fn().mockResolvedValue(),
      sendPhoto: jest.fn().mockResolvedValue(),
    };
    mockGetShortUrl.mockResolvedValue('https://quickchart.io/chart/render/abc');
  });

  describe('getSortedMatchdayKeys', () => {
    it('sorts by trailing number, not lexically', () => {
      const teams = [
        {
          raceScores: {
            matchday_2: 1,
            matchday_10: 1,
            matchday_1: 1,
            matchday_3: 1,
          },
        },
      ];
      expect(getSortedMatchdayKeys(teams)).toEqual([
        'matchday_1',
        'matchday_2',
        'matchday_3',
        'matchday_10',
      ]);
    });

    it('unions keys across teams and is robust to malformed entries', () => {
      const teams = [
        { raceScores: { matchday_1: 1 } },
        { raceScores: { matchday_2: 1 } },
        null,
        {},
        { raceScores: null },
      ];
      expect(getSortedMatchdayKeys(teams)).toEqual([
        'matchday_1',
        'matchday_2',
      ]);
    });
  });

  describe('buildRoundToRaceNameMap', () => {
    it('maps round -> short race name (Grand Prix -> GP)', () => {
      const data = {
        MRData: {
          RaceTable: {
            Races: [
              { round: '1', raceName: 'Bahrain Grand Prix' },
              { round: '2', raceName: 'Chinese Grand Prix' },
              { round: '3', raceName: 'Emilia Romagna Grand Prix' },
            ],
          },
        },
      };
      expect(buildRoundToRaceNameMap(data)).toEqual({
        1: 'Bahrain GP',
        2: 'Chinese GP',
        3: 'Emilia Romagna GP',
      });
    });

    it('returns empty map for unexpected shapes', () => {
      expect(buildRoundToRaceNameMap(null)).toEqual({});
      expect(buildRoundToRaceNameMap({})).toEqual({});
      expect(buildRoundToRaceNameMap({ MRData: {} })).toEqual({});
    });

    it('skips entries without a valid round or raceName', () => {
      const data = {
        MRData: {
          RaceTable: {
            Races: [
              { round: 'abc', raceName: 'Bad Round GP' },
              { round: '4', raceName: '' },
              { round: '5' },
              { round: '6', raceName: 'Miami Grand Prix' },
            ],
          },
        },
      };
      expect(buildRoundToRaceNameMap(data)).toEqual({ 6: 'Miami GP' });
    });
  });

  describe('buildChartConfig', () => {
    it('sorts teams by position, plots gap-to-leader, and annotates chips', () => {
      const config = buildChartConfig(FIXTURE, {
        roundToRaceName: { 1: 'Bahrain GP', 2: 'Saudi GP', 3: 'Australia GP' },
      });

      expect(config.type).toBe('line');
      expect(config.data.labels).toEqual([
        'Bahrain GP',
        'Saudi GP',
        'Australia GP',
      ]);

      // Position-sorted: Cooperon(1), dorsegal1(2), Kilzid(3)
      expect(config.data.datasets.map((d) => d.label)).toEqual([
        'Cooperon',
        'dorsegal1',
        'Kilzid',
      ]);

      // Cumulative sums:
      //   Cooperon : 259, 740, 976
      //   dorsegal1: 251, 620, 984
      //   Kilzid   : 251, 620, 965
      // Leader per step (max cumulative): 259, 740, 984
      // Gap = cumulative - leader (<= 0):
      //   Cooperon : 0,    0,   -8
      //   dorsegal1: -8, -120,    0
      //   Kilzid   : -8, -120,  -19
      expect(config.data.datasets[0].data).toEqual([0, 0, -8]);
      expect(config.data.datasets[1].data).toEqual([-8, -120, 0]);
      expect(config.data.datasets[2].data).toEqual([-8, -120, -19]);

      // Chip labels for Cooperon: Limitless at R2, Extra DRS Boost at R3
      expect(config.data.datasets[0].chipLabels).toEqual([
        '',
        '🚀 Limitless',
        '⚡ Extra DRS Boost',
      ]);
      // Bigger point radius for chip races
      expect(config.data.datasets[0].pointRadius[0]).toBe(3);
      expect(config.data.datasets[0].pointRadius[1]).toBe(7);
      expect(config.data.datasets[0].pointRadius[2]).toBe(7);

      // Chip labels for dorsegal1: Limitless at R3
      expect(config.data.datasets[1].chipLabels).toEqual([
        '',
        '',
        '🚀 Limitless',
      ]);
      // No chips for Kilzid
      expect(config.data.datasets[2].chipLabels).toEqual(['', '', '']);
      expect(config.data.datasets[2].pointRadius).toEqual([3, 3, 3]);
    });

    it('falls back to "R{N}" when no race name is available', () => {
      const config = buildChartConfig(FIXTURE, { roundToRaceName: {} });
      expect(config.data.labels).toEqual(['R1', 'R2', 'R3']);
    });

    it('handles missing raceScores for some teams gracefully (treated as 0)', () => {
      const data = {
        teams: [
          {
            teamName: 'A',
            position: 1,
            raceScores: { matchday_1: 100, matchday_2: 50 },
          },
          {
            teamName: 'B',
            position: 2,
            raceScores: { matchday_1: 80 }, // missing matchday_2
          },
        ],
      };
      const config = buildChartConfig(data);
      // Cumulatives: A=100,150  B=80,80 → leaders=100,150 → gaps:
      //   A: 0, 0
      //   B: -20, -70
      expect(config.data.datasets[0].data).toEqual([0, 0]);
      expect(config.data.datasets[1].data).toEqual([-20, -70]);
    });

    it('ignores chips with a gameDayId that is not in the matchday series', () => {
      const data = {
        teams: [
          {
            teamName: 'A',
            position: 1,
            raceScores: { matchday_1: 10, matchday_2: 20 },
            chipsUsed: [{ name: 'Wildcard', gameDayId: 99 }],
          },
        ],
      };
      const config = buildChartConfig(data);
      expect(config.data.datasets[0].chipLabels).toEqual(['', '']);
      expect(config.data.datasets[0].pointRadius).toEqual([3, 3]);
    });

    it('falls back to the default chip emoji for unknown chip names', () => {
      const data = {
        teams: [
          {
            teamName: 'A',
            position: 1,
            raceScores: { matchday_1: 10 },
            chipsUsed: [{ name: 'Mystery Chip', gameDayId: 1 }],
          },
        ],
      };
      const config = buildChartConfig(data);
      expect(config.data.datasets[0].chipLabels[0]).toBe('🎖️ Mystery Chip');
    });

    it('highlights the selected team with a thicker line and larger points', () => {
      const selectedTeamId = 'C8EFGOXCB04_Cooperon';
      const config = buildChartConfig(FIXTURE, { selectedTeamId });

      expect(config.data.datasets[0].label).toBe('Cooperon');
      expect(config.data.datasets[0].borderWidth).toBe(5);
      expect(config.data.datasets[1].borderWidth).toBe(2);
      expect(config.data.datasets[0].pointRadius).toEqual([5, 9, 9]);
      expect(config.data.datasets[1].pointRadius).toEqual([3, 3, 7]);
    });
  });

  describe('handleLeagueGraphCommand', () => {
    it('rejects non-admins', async () => {
      isAdminMessage.mockReturnValue(false);

      await handleLeagueGraphCommand(botMock, { chat: { id: 9 } });

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        9,
        'Sorry, only admins can use this command.',
      );
      expect(listUserLeagues).not.toHaveBeenCalled();
    });

    it('asks the user to follow a league when they have none', async () => {
      isAdminMessage.mockReturnValue(true);
      listUserLeagues.mockResolvedValueOnce([]);

      await handleLeagueGraphCommand(botMock, { chat: { id: 1 } });

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'You are not following any league. Run /follow_league to follow one first.',
      );
    });

    it('auto-renders the graph when the user has exactly one league', async () => {
      isAdminMessage.mockReturnValue(true);
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
      ]);
      getLeagueData.mockResolvedValueOnce(FIXTURE);
      fetchCurrentSeasonRaces.mockResolvedValueOnce({
        MRData: { RaceTable: { Races: [] } },
      });

      await handleLeagueGraphCommand(botMock, { chat: { id: 1 } });

      expect(getLeagueData).toHaveBeenCalledWith('ABC');
      expect(mockSetConfig).toHaveBeenCalled();
      expect(botMock.sendPhoto).toHaveBeenCalledWith(
        1,
        'https://quickchart.io/chart/render/abc',
        expect.objectContaining({
          caption: expect.stringContaining('Amba'),
        }),
      );
    });

    it('shows an inline keyboard when the user has multiple leagues', async () => {
      isAdminMessage.mockReturnValue(true);
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
        { leagueCode: 'XYZ', leagueName: 'Other' },
      ]);

      await handleLeagueGraphCommand(botMock, {
        chat: { id: 1 },
        message_id: 5,
      });

      expect(getLeagueData).not.toHaveBeenCalled();
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'Which league graph do you want to see?',
        expect.objectContaining({
          reply_to_message_id: 5,
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Amba', callback_data: 'LEAGUE_GRAPH:ABC' }],
              [{ text: 'Other', callback_data: 'LEAGUE_GRAPH:XYZ' }],
            ],
          },
        }),
      );
    });
  });

  describe('sendLeagueGraph', () => {
    it('informs the user when no league data exists yet', async () => {
      getLeagueData.mockResolvedValueOnce(null);

      await sendLeagueGraph(botMock, 1, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'No leaderboard data is available yet for this league. Please try again later.',
      );
      expect(botMock.sendPhoto).not.toHaveBeenCalled();
    });

    it('informs the user when no races have been played yet', async () => {
      getLeagueData.mockResolvedValueOnce({
        leagueName: 'Amba',
        teams: [{ teamName: 'A', raceScores: {}, chipsUsed: [] }],
      });

      await sendLeagueGraph(botMock, 1, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'Not enough race data yet to render a graph for this league.',
      );
      expect(botMock.sendPhoto).not.toHaveBeenCalled();
    });

    it('proceeds with R{N} labels if the schedule fetch fails', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      getLeagueData.mockResolvedValueOnce(FIXTURE);
      fetchCurrentSeasonRaces.mockRejectedValueOnce(new Error('net'));

      await sendLeagueGraph(botMock, 1, 'ABC');

      expect(botMock.sendPhoto).toHaveBeenCalled();
      const configArg = mockSetConfig.mock.calls[0][0];
      // No race names — labels are just "R1", "R2", "R3"
      expect(configArg.data.labels).toEqual(['R1', 'R2', 'R3']);
      consoleSpy.mockRestore();
    });

    it('passes selectedTeamId into chart config so selected series is highlighted', async () => {
      getSelectedTeam.mockReturnValue('C8EFGOXCB04_Cooperon');
      getLeagueData.mockResolvedValueOnce(FIXTURE);
      fetchCurrentSeasonRaces.mockResolvedValueOnce({
        MRData: { RaceTable: { Races: [] } },
      });

      await sendLeagueGraph(botMock, 1, 'ABC');

      const configArg = mockSetConfig.mock.calls[0][0];
      expect(configArg.data.datasets[0].label).toBe('Cooperon');
      expect(configArg.data.datasets[0].borderWidth).toBe(5);
    });

    it('surfaces fetch errors to the user and error channel', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      getLeagueData.mockRejectedValueOnce(new Error('boom'));

      await sendLeagueGraph(botMock, 1, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        '❌ Failed to load league data: boom',
      );
      expect(botMock.sendPhoto).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('surfaces chart-URL generation errors', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      getLeagueData.mockResolvedValueOnce(FIXTURE);
      fetchCurrentSeasonRaces.mockResolvedValueOnce({
        MRData: { RaceTable: { Races: [] } },
      });
      mockGetShortUrl.mockRejectedValueOnce(new Error('quickchart down'));

      await sendLeagueGraph(botMock, 1, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        '❌ Failed to generate the league graph: quickchart down',
      );
      expect(botMock.sendPhoto).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
