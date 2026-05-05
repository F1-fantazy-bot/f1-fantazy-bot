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
  sendLeagueBudgetGraph,
  buildBudgetChartConfig,
  getSortedBudgetMatchdayKeys,
} = require('./leagueBudgetGraphHandler');

// Shape mirrors the real league-standings.json with raceBudgets populated.
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
      raceBudgets: {
        matchday_1: 100,
        matchday_2: 103.3,
        matchday_3: 105.4,
        matchday_4: 108.7,
      },
    },
    {
      teamName: 'dorsegal1',
      userName: 'Dor Segal',
      position: 2,
      raceBudgets: {
        matchday_1: 100,
        matchday_2: 102.5,
        matchday_3: 105.8,
        matchday_4: 108.7,
      },
    },
    {
      teamName: 'Kilzid',
      userName: 'Doron Kilzi',
      position: 3,
      raceBudgets: {
        matchday_1: 100,
        matchday_2: 102.5,
        matchday_3: 105.8,
        matchday_4: 108.7,
      },
    },
  ],
};

describe('leagueBudgetGraphHandler', () => {
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

  describe('getSortedBudgetMatchdayKeys', () => {
    it('sorts numerically across teams', () => {
      const teams = [
        { raceBudgets: { matchday_10: 110, matchday_1: 100 } },
        { raceBudgets: { matchday_2: 101 } },
      ];
      expect(getSortedBudgetMatchdayKeys(teams)).toEqual([
        'matchday_1',
        'matchday_2',
        'matchday_10',
      ]);
    });

    it('is robust to missing/malformed entries', () => {
      expect(
        getSortedBudgetMatchdayKeys([null, {}, { raceBudgets: null }]),
      ).toEqual([]);
    });
  });

  describe('buildBudgetChartConfig', () => {
    it('plots one series per team (order follows latest-budget sort, then position tie-break)', () => {
      const config = buildBudgetChartConfig(FIXTURE, {
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
      expect(config.data.datasets[0].data).toEqual([100, 103.3, 105.4, 108.7]);
      expect(config.data.datasets[1].data).toEqual([100, 102.5, 105.8, 108.7]);
      // No chip annotation by design.
      expect(config.data.datasets[0].datalabels).toEqual({ display: false });
      expect(config.options.plugins.datalabels).toEqual({ display: false });
    });

    it('falls back to "R{N}" when no race names are available', () => {
      const config = buildBudgetChartConfig(FIXTURE);
      expect(config.data.labels).toEqual(['R1', 'R2', 'R3', 'R4']);
    });

    it('inserts null for missing matchdays so the line spans the gap', () => {
      const data = {
        teams: [
          {
            teamName: 'A',
            position: 1,
            raceBudgets: { matchday_1: 100, matchday_3: 104 },
          },
          {
            teamName: 'B',
            position: 2,
            raceBudgets: { matchday_1: 100, matchday_2: 101, matchday_3: 103 },
          },
        ],
      };
      const config = buildBudgetChartConfig(data);
      expect(config.data.labels).toEqual(['R1', 'R2', 'R3']);
      expect(config.data.datasets[0].data).toEqual([100, null, 104]);
      expect(config.data.datasets[0].spanGaps).toBe(true);
      expect(config.data.datasets[1].data).toEqual([100, 101, 103]);
    });

    it('sorts legend by most recent budget (desc) rather than position', () => {
      const data = {
        leagueName: 'Mixed',
        teams: [
          {
            teamName: 'Leader',
            position: 1,
            raceBudgets: { matchday_1: 100, matchday_2: 101 },
          },
          {
            teamName: 'Second',
            position: 2,
            raceBudgets: { matchday_1: 100, matchday_2: 104 },
          },
          {
            teamName: 'Third',
            position: 3,
            raceBudgets: { matchday_1: 100, matchday_2: 102 },
          },
        ],
      };
      const config = buildBudgetChartConfig(data);
      expect(config.data.datasets.map((d) => d.label)).toEqual([
        'Second',
        'Third',
        'Leader',
      ]);
    });

    it('falls back to the last non-null budget when the latest matchday is missing for a team', () => {
      const data = {
        teams: [
          {
            teamName: 'A',
            position: 1,
            raceBudgets: { matchday_1: 100, matchday_2: 105 }, // missing md3
          },
          {
            teamName: 'B',
            position: 2,
            raceBudgets: { matchday_1: 100, matchday_2: 101, matchday_3: 103 },
          },
        ],
      };
      const config = buildBudgetChartConfig(data);
      // A's latest (matchday_2 = 105) > B's latest (matchday_3 = 103)
      expect(config.data.datasets.map((d) => d.label)).toEqual(['A', 'B']);
    });

    it('ties break by leaderboard position when budgets are equal', () => {
      const data = {
        teams: [
          {
            teamName: 'A',
            position: 2,
            raceBudgets: { matchday_1: 100, matchday_2: 105 },
          },
          {
            teamName: 'B',
            position: 1,
            raceBudgets: { matchday_1: 100, matchday_2: 105 },
          },
        ],
      };
      const config = buildBudgetChartConfig(data);
      expect(config.data.datasets.map((d) => d.label)).toEqual(['B', 'A']);
    });

    it('pushes teams with no budget data to the bottom', () => {
      const data = {
        teams: [
          { teamName: 'NoData', position: 1, raceBudgets: {} },
          {
            teamName: 'HasData',
            position: 2,
            raceBudgets: { matchday_1: 100 },
          },
        ],
      };
      const config = buildBudgetChartConfig(data);
      expect(config.data.datasets.map((d) => d.label)).toEqual([
        'HasData',
        'NoData',
      ]);
    });

    it('highlights the selected team with a thicker line and larger points', () => {
      const selectedTeamId = 'C8EFGOXCB04_Cooperon';
      const config = buildBudgetChartConfig(FIXTURE, { selectedTeamId });
      expect(config.data.datasets[0].label).toBe('Cooperon');
      expect(config.data.datasets[0].borderWidth).toBe(6);
      expect(config.data.datasets[0].pointRadius).toBe(7);
      expect(config.data.datasets[1].borderWidth).toBe(3);
      expect(config.data.datasets[1].pointRadius).toBe(4);
    });

    it('uses a Budget ($M) y-axis title', () => {
      const config = buildBudgetChartConfig(FIXTURE);
      expect(config.options.scales.y.title.text).toBe('Budget ($M)');
    });

    it('excludes teams flagged by the graph filter (e.g. "The Best Bot")', () => {
      const data = {
        ...FIXTURE,
        teams: [
          ...FIXTURE.teams,
          {
            teamName: 'The Best Bot',
            userName: 'doronkilzi',
            position: 4,
            raceBudgets: {
              matchday_1: 100,
              matchday_2: 200,
              matchday_3: 300,
              matchday_4: 400,
            },
          },
        ],
      };
      const config = buildBudgetChartConfig(data);
      const labels = config.data.datasets.map((d) => d.label);
      expect(labels).not.toContain('The Best Bot');
      expect(labels).toContain('Cooperon');
      expect(labels).toContain('dorsegal1');
      expect(labels).toContain('Kilzid');
    });
  });

  describe('sendLeagueBudgetGraph', () => {
    it('informs the user when no league data exists yet', async () => {
      getLeagueData.mockResolvedValueOnce(null);

      await sendLeagueBudgetGraph(botMock, 1, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'No leaderboard data is available yet for this league. Please try again later.',
      );
      expect(botMock.sendPhoto).not.toHaveBeenCalled();
    });

    it('informs the user when no budget data is available', async () => {
      getLeagueData.mockResolvedValueOnce({
        leagueName: 'Amba',
        teams: [{ teamName: 'A', raceBudgets: {} }],
      });

      await sendLeagueBudgetGraph(botMock, 1, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        'No budget data is available yet for this league. Please try again later.',
      );
      expect(botMock.sendPhoto).not.toHaveBeenCalled();
    });

    it('renders and sends the budget chart photo', async () => {
      getLeagueData.mockResolvedValueOnce(FIXTURE);
      fetchCurrentSeasonRaces.mockResolvedValueOnce({
        MRData: { RaceTable: { Races: [] } },
      });

      await sendLeagueBudgetGraph(botMock, 1, 'C8EFGOXCB04');

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

      await sendLeagueBudgetGraph(botMock, 1, 'C8EFGOXCB04');

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

      await sendLeagueBudgetGraph(botMock, 1, 'C8EFGOXCB04');

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

      await sendLeagueBudgetGraph(botMock, 1, 'ABC');

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

      await sendLeagueBudgetGraph(botMock, 1, 'C8EFGOXCB04');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        1,
        '❌ Failed to generate the league graph: quickchart down',
      );
      expect(botMock.sendPhoto).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
