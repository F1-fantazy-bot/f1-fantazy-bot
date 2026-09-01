const { LEAGUE_GRAPH_TYPES } = require('../constants');
const { buildLeagueTeamId } = require('../utils/teamId');
const {
  buildBudgetSeries,
  buildGapToLeaderSeries,
  buildLeagueGraphSeries,
  buildRoundToRaceNameMap,
  buildStandingsSeries,
  computeRankPerMatchday,
  getSortedBudgetMatchdayKeys,
  getSortedMatchdayKeys,
} = require('./leagueGraphsCore');

function team(overrides = {}) {
  return {
    teamName: 'Alpha',
    userName: 'owner',
    teamNo: 1,
    position: 1,
    raceScores: { matchday_1: 100, matchday_2: 50 },
    raceBudgets: { matchday_1: 100, matchday_2: 101 },
    chipsUsed: [],
    ...overrides,
  };
}

function league(teams) {
  return {
    leagueCode: 'ABC',
    leagueName: 'Test League',
    teams,
  };
}

describe('leagueGraphsCore', () => {
  test('sorts score and budget matchdays numerically across teams', () => {
    const teams = [
      team({ raceScores: { matchday_10: 1 }, raceBudgets: { matchday_3: 1 } }),
      team({ raceScores: { matchday_2: 1 }, raceBudgets: { matchday_11: 1 } }),
    ];

    expect(getSortedMatchdayKeys(teams)).toEqual([
      'matchday_2',
      'matchday_10',
    ]);
    expect(getSortedBudgetMatchdayKeys(teams)).toEqual([
      'matchday_3',
      'matchday_11',
    ]);
  });

  test('maps race rounds to shortened names and ignores malformed rows', () => {
    expect(
      buildRoundToRaceNameMap({
        MRData: {
          RaceTable: {
            Races: [
              { round: '2', raceName: 'Chinese Grand Prix' },
              { round: 'bad', raceName: 'Ignored Grand Prix' },
            ],
          },
        },
      }),
    ).toEqual({ 2: 'Chinese GP' });
  });

  test('builds gap-to-leader points with selection, chips, and exclusions', () => {
    const selectedTeamId = buildLeagueTeamId('owner', 2);
    const result = buildGapToLeaderSeries(
      league([
        team(),
        team({
          teamName: 'Beta',
          teamNo: 2,
          position: 2,
          raceScores: { matchday_1: 90 },
          chipsUsed: [{ name: 'Wildcard', gameDayId: 2 }],
        }),
        team({ teamName: 'The Best Bot', userName: 'bot', teamNo: 1 }),
      ]),
      {
        selectedTeamId,
        roundToRaceName: { 1: 'Bahrain GP', 2: 'Saudi GP' },
      },
    );

    expect(result.matchdays.map((matchday) => matchday.label)).toEqual([
      'Bahrain GP',
      'Saudi GP',
    ]);
    expect(result.series).toHaveLength(2);
    expect(result.series[0].points.map((point) => point.value)).toEqual([0, 0]);
    expect(result.series[1]).toMatchObject({
      teamName: 'Beta',
      isSelected: true,
      points: [
        { value: -10, chip: null },
        { value: -60, chip: { name: 'Wildcard' } },
      ],
    });
  });

  test('uses competition ranking for tied cumulative standings', () => {
    const teams = [
      team({ raceScores: { matchday_1: 100 } }),
      team({ teamNo: 2, raceScores: { matchday_1: 80 } }),
      team({ teamNo: 3, raceScores: { matchday_1: 80 } }),
      team({ teamNo: 4, raceScores: { matchday_1: 60 } }),
    ];

    expect(computeRankPerMatchday(teams, ['matchday_1'])).toEqual([
      [1],
      [2],
      [2],
      [4],
    ]);
    const result = buildStandingsSeries(league(teams));
    expect(result.maxRank).toBe(4);
    expect(result.series.map((series) => series.points[0].value)).toEqual([
      1,
      2,
      2,
      4,
    ]);
  });

  test('preserves missing budget points and orders by latest available budget', () => {
    const result = buildBudgetSeries(
      league([
        team({ teamName: 'No latest', raceBudgets: { matchday_1: 105 } }),
        team({
          teamName: 'Leader',
          teamNo: 2,
          position: 2,
          raceBudgets: { matchday_1: 100, matchday_2: 110 },
        }),
      ]),
    );

    expect(result.series.map((series) => series.teamName)).toEqual([
      'Leader',
      'No latest',
    ]);
    expect(result.series[1].points.map((point) => point.value)).toEqual([
      105,
      null,
    ]);
  });

  test('dispatches the requested graph type', () => {
    expect(
      buildLeagueGraphSeries(league([team()]), {
        graphType: LEAGUE_GRAPH_TYPES.STANDINGS,
      }).graphType,
    ).toBe(LEAGUE_GRAPH_TYPES.STANDINGS);
    expect(
      buildLeagueGraphSeries(league([team()]), {
        graphType: LEAGUE_GRAPH_TYPES.BUDGET,
      }).graphType,
    ).toBe(LEAGUE_GRAPH_TYPES.BUDGET);
    expect(buildLeagueGraphSeries(league([team()])).graphType).toBe(
      LEAGUE_GRAPH_TYPES.GAP,
    );
  });
});
