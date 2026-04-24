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

jest.mock('../utils', () => ({
  sendErrorMessage: jest.fn().mockResolvedValue(),
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

const mockGetShortUrl = jest.fn();
const mockSetConfig = jest.fn();
const mockSetWidth = jest.fn();
const mockSetHeight = jest.fn();
const mockSetDevicePixelRatio = jest.fn();
const mockSetBg = jest.fn();
const mockSetVersion = jest.fn();

jest.mock('quickchart-js', () => {
  return jest.fn().mockImplementation(() => {
    const chainable = {};
    mockSetConfig.mockImplementation(() => chainable);
    mockSetWidth.mockImplementation(() => chainable);
    mockSetHeight.mockImplementation(() => chainable);
    mockSetDevicePixelRatio.mockImplementation(() => chainable);
    mockSetBg.mockImplementation(() => chainable);
    mockSetVersion.mockImplementation(() => chainable);
    chainable.setConfig = mockSetConfig;
    chainable.setWidth = mockSetWidth;
    chainable.setHeight = mockSetHeight;
    chainable.setDevicePixelRatio = mockSetDevicePixelRatio;
    chainable.setBackgroundColor = mockSetBg;
    chainable.setVersion = mockSetVersion;
    chainable.getShortUrl = mockGetShortUrl;

    return chainable;
  });
});

const { getLeagueData } = require('../azureStorageService');
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { getSelectedTeam } = require('../cache');

const {
  sendLeagueStandingsGraph,
  buildStandingsChartConfig,
  computeRankPerMatchday,
} = require('./leagueStandingsGraphHandler');

// Shape mirrors league-standings.json but stripped to what the standings
// graph actually consumes (raceScores, chipsUsed, position, names).
const FIXTURE = {
  fetchedAt: '2026-04-23T21:17:26.407Z',
  leagueName: 'Amba',
  leagueCode: 'C8EFGOXCB04',
  leagueId: 542404,
  memberCount: 3,
  teams: [
    {
      teamName: 'Cooperon',
      userName: 'Ron Cooper',
      position: 1,
      raceScores: {
        matchday_1: 50,
        matchday_2: 30,
        matchday_3: 40,
        matchday_4: 25,
      },
      chipsUsed: [{ name: 'Wildcard', gameDayId: 2 }],
    },
    {
      teamName: 'dorsegal1',
      userName: 'Dor Segal',
      position: 2,
      raceScores: {
        matchday_1: 40,
        matchday_2: 35,
        matchday_3: 30,
        matchday_4: 30,
      },
      chipsUsed: [],
    },
    {
      teamName: 'Kilzid',
      userName: 'Doron Kilzi',
      position: 3,
      raceScores: {
        matchday_1: 30,
        matchday_2: 30,
        matchday_3: 30,
        matchday_4: 30,
      },
      chipsUsed: [],
    },
  ],
};

describe('leagueStandingsGraphHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    getSelectedTeam.mockReturnValue(null);
    botMock = {
      sendMessage: jest.fn().mockResolvedValue(),
      sendPhoto: jest.fn().mockResolvedValue(),
    };
    mockGetShortUrl.mockResolvedValue('https://quickchart.io/chart/render/xyz');
  });

  describe('computeRankPerMatchday', () => {
    it('ranks teams by cumulative score per matchday (no ties)', () => {
      const teams = [
        { raceScores: { matchday_1: 10, matchday_2: 20 } }, // cum: 10, 30
        { raceScores: { matchday_1: 20, matchday_2: 5 } }, //  cum: 20, 25
        { raceScores: { matchday_1: 5, matchday_2: 15 } }, //  cum: 5, 20
      ];
      const keys = ['matchday_1', 'matchday_2'];
      expect(computeRankPerMatchday(teams, keys)).toEqual([
        [2, 1],
        [1, 2],
        [3, 3],
      ]);
    });

    it('uses competition-style ties (1, 2, 2, 4)', () => {
      // After md1 cumulative totals: A=10, B=10, C=10, D=5
      const teams = [
        { raceScores: { matchday_1: 10 } },
        { raceScores: { matchday_1: 10 } },
        { raceScores: { matchday_1: 10 } },
        { raceScores: { matchday_1: 5 } },
      ];
      const keys = ['matchday_1'];
      expect(computeRankPerMatchday(teams, keys)).toEqual([[1], [1], [1], [4]]);
    });

    it('treats missing raceScores as 0', () => {
      const teams = [
        { raceScores: { matchday_1: 10 } },
        { raceScores: {} },
      ];
      const keys = ['matchday_1', 'matchday_2'];
      // Team A: 10, 10 | Team B: 0, 0 → A ranks 1 always.
      expect(computeRankPerMatchday(teams, keys)).toEqual([
        [1, 1],
        [2, 2],
      ]);
    });

    it('returns empty per-team rank arrays when no matchdays', () => {
      expect(computeRankPerMatchday(FIXTURE.teams, [])).toEqual([[], [], []]);
    });
  });

  describe('buildStandingsChartConfig', () => {
    it('builds a line chart with one series per team, sorted by current-race rank', () => {
      // Cumulative after md4:
      //   Cooperon  = 50+30+40+25 = 145 → rank 1
      //   dorsegal1 = 40+35+30+30 = 135 → rank 2
      //   Kilzid    = 30+30+30+30 = 120 → rank 3
      const config = buildStandingsChartConfig(FIXTURE, {
        roundToRaceName: {
          1: 'Bahrain GP',
          2: 'Saudi GP',
          3: 'Australia GP',
          4: 'Japan GP',
        },
      });

      expect(config.type).toBe('line');
      expect(config.data.labels).toEqual([
        'Bahrain GP',
        'Saudi GP',
        'Australia GP',
        'Japan GP',
      ]);
      expect(config.data.datasets.map((d) => d.label)).toEqual([
        'Cooperon',
        'dorsegal1',
        'Kilzid',
      ]);
      // Cooperon ranks through races:
      //   md1 cum: [50, 40, 30] → rank 1
      //   md2 cum: [80, 75, 60] → rank 1
      //   md3 cum: [120, 105, 90] → rank 1
      //   md4 cum: [145, 135, 120] → rank 1
      expect(config.data.datasets[0].data).toEqual([1, 1, 1, 1]);
      // Kilzid always last → 3
      expect(config.data.datasets[2].data).toEqual([3, 3, 3, 3]);
    });

    it('inverts the y-axis and uses integer ticks with min=1, max=teamCount', () => {
      const config = buildStandingsChartConfig(FIXTURE);
      expect(config.options.scales.y.reverse).toBe(true);
      expect(config.options.scales.y.min).toBe(1);
      expect(config.options.scales.y.max).toBe(3);
      expect(config.options.scales.y.ticks.stepSize).toBe(1);
    });

    it('falls back to "R{N}" when no race-name map is provided', () => {
      const config = buildStandingsChartConfig(FIXTURE);
      expect(config.data.labels).toEqual(['R1', 'R2', 'R3', 'R4']);
    });

    it('attaches per-point chip labels at the matching gameDayId', () => {
      const config = buildStandingsChartConfig(FIXTURE);
      const cooperon = config.data.datasets[0];
      // Chip used at gameDayId=2 → index 1 in the matchday series.
      expect(cooperon.chipLabels[0]).toBe('');
      expect(cooperon.chipLabels[1]).toContain('Wildcard');
      expect(cooperon.pointRadius[1]).toBeGreaterThan(cooperon.pointRadius[0]);
    });

    it('highlights the selected team with a thicker line', () => {
      const selectedTeamId = 'C8EFGOXCB04_Cooperon';
      const config = buildStandingsChartConfig(FIXTURE, { selectedTeamId });
      expect(config.data.datasets[0].label).toBe('Cooperon');
      expect(config.data.datasets[0].borderWidth).toBe(6);
      expect(config.data.datasets[1].borderWidth).toBe(3);
    });

    it('orders legend by current-race rank, with no-data teams at the bottom', () => {
      const data = {
        leagueCode: 'X',
        teams: [
          {
            teamName: 'NoData',
            position: 1,
            raceScores: {},
          },
          {
            teamName: 'HasData',
            position: 2,
            raceScores: { matchday_1: 10 },
          },
        ],
      };
      const config = buildStandingsChartConfig(data);
      expect(config.data.datasets.map((d) => d.label)).toEqual([
        'HasData',
        'NoData',
      ]);
    });

    it('uses a "Standing" y-axis title', () => {
      const config = buildStandingsChartConfig(FIXTURE);
      expect(config.options.scales.y.title.text).toBe('Standing');
    });
  });

  describe('sendLeagueStandingsGraph', () => {
    it('informs the user when no league data exists yet', async () => {
      getLeagueData.mockResolvedValueOnce(null);

      await sendLeagueStandingsGraph(botMock, 1, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'No leaderboard data is available yet for this league. Please try again later.',
      );
      expect(botMock.sendPhoto).not.toHaveBeenCalled();
    });

    it('informs the user when no race data is available yet', async () => {
      getLeagueData.mockResolvedValueOnce({
        leagueName: 'Amba',
        teams: [{ teamName: 'A', raceScores: {} }],
      });

      await sendLeagueStandingsGraph(botMock, 1, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'Not enough race data yet to render a graph for this league.',
      );
      expect(botMock.sendPhoto).not.toHaveBeenCalled();
    });

    it('renders and sends the standings chart photo', async () => {
      getLeagueData.mockResolvedValueOnce(FIXTURE);
      fetchCurrentSeasonRaces.mockResolvedValueOnce({
        MRData: { RaceTable: { Races: [] } },
      });

      await sendLeagueStandingsGraph(botMock, 1, 'C8EFGOXCB04');

      expect(mockSetConfig).toHaveBeenCalled();
      expect(mockSetWidth).toHaveBeenCalledWith(1600);
      expect(mockSetHeight).toHaveBeenCalledWith(920);
      expect(botMock.sendPhoto).toHaveBeenCalledWith(
        1,
        'https://quickchart.io/chart/render/xyz',
        expect.objectContaining({
          caption: expect.stringContaining('Amba'),
        }),
      );
    });

    it('passes selectedTeamId into chart config so selected series is highlighted', async () => {
      getSelectedTeam.mockReturnValue('C8EFGOXCB04_Cooperon');
      getLeagueData.mockResolvedValueOnce(FIXTURE);
      fetchCurrentSeasonRaces.mockResolvedValueOnce({
        MRData: { RaceTable: { Races: [] } },
      });

      await sendLeagueStandingsGraph(botMock, 1, 'C8EFGOXCB04');

      const configArg = mockSetConfig.mock.calls[0][0];
      expect(configArg.data.datasets[0].label).toBe('Cooperon');
      expect(configArg.data.datasets[0].borderWidth).toBe(6);
    });

    it('proceeds with R{N} labels if the schedule fetch fails', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      getLeagueData.mockResolvedValueOnce(FIXTURE);
      fetchCurrentSeasonRaces.mockRejectedValueOnce(new Error('net'));

      await sendLeagueStandingsGraph(botMock, 1, 'C8EFGOXCB04');

      expect(botMock.sendPhoto).toHaveBeenCalled();
      const configArg = mockSetConfig.mock.calls[0][0];
      expect(configArg.data.labels).toEqual(['R1', 'R2', 'R3', 'R4']);
      consoleSpy.mockRestore();
    });

    it('surfaces fetch errors to the user and error channel', async () => {
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      getLeagueData.mockRejectedValueOnce(new Error('boom'));

      await sendLeagueStandingsGraph(botMock, 1, 'ABC');

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

      await sendLeagueStandingsGraph(botMock, 1, 'C8EFGOXCB04');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        '❌ Failed to generate the league graph: quickchart down',
      );
      expect(botMock.sendPhoto).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
