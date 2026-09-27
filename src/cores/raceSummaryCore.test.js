const {
  buildKeyTeamDifferences,
  buildRaceSummaryData,
  findRaceName,
} = require('./raceSummaryCore');

function team(teamName, scores, extra = {}) {
  return {
    teamName,
    position: 1,
    totalScore: Object.values(scores).reduce((sum, score) => sum + score, 0),
    raceScores: scores,
    drivers: [{ name: `${teamName} planning driver` }],
    constructors: [{ name: `${teamName} planning constructor` }],
    chipsUsed: [{ name: 'Planning chip' }],
    ...extra,
  };
}

describe('raceSummaryCore', () => {
  test('maps a fantasy matchday to the scheduled race name', () => {
    expect(
      findRaceName(
        { MRData: { RaceTable: { Races: [{ round: '3', raceName: 'Japan' }] } } },
        3,
      ),
    ).toBe('Japan');
    expect(findRaceName({}, 3)).toBeNull();
  });

  test('detects the latest race, rank movement, ordering, and exclusions', () => {
    const data = buildRaceSummaryData({
      leagueName: 'Friends',
      teams: [
        team('The Best Bot', { matchday_1: 999, matchday_4: 999 }),
        team('Winner', { matchday_1: 20, matchday_2: 30, matchday_4: 100 }),
        team('Second', { matchday_1: 80, matchday_2: 40, matchday_4: 50 }),
        team('Third', { matchday_1: 60, matchday_2: 30, matchday_4: 40 }),
        team('Bottom', { matchday_1: 30, matchday_2: 20, matchday_4: 10 }),
      ],
    });

    expect(data.latestMatchday).toBe('matchday_4');
    expect(data.raceNumber).toBe(4);
    expect(data.teams.map(({ teamName }) => teamName)).toEqual([
      'Winner',
      'Second',
      'Third',
      'Bottom',
    ]);
    expect(data.teams.find(({ teamName }) => teamName === 'Winner')).toMatchObject({
      latestRaceScore: 100,
      seasonRankChange: 1,
    });
    expect(data.keyTeamDifferences.map(({ label }) => label)).toEqual([
      'winner_vs_2nd',
      'winner_vs_3rd',
      'top_vs_bottom',
    ]);
  });

  test('uses a matching locked roster with member and chip data', () => {
    const planning = team('Rocket', { matchday_1: 10, matchday_2: 20 }, {
      userName: 'owner',
      teamNo: 2,
    });
    const data = buildRaceSummaryData(
      { leagueName: 'Friends', teams: [planning] },
      {
        matchdayId: 2,
        teams: [
          {
            teamName: 'Rocket',
            userName: 'owner',
            teamNo: 2,
            drivers: [{ name: 'Locked Driver' }],
            constructors: [{ name: 'Locked Constructor' }],
            chipsUsed: [{ name: 'Wildcard', gameDayId: 2 }],
          },
        ],
      },
    );

    expect(data.teams[0]).toMatchObject({
      drivers: [{ name: 'Locked Driver' }],
      constructors: [{ name: 'Locked Constructor' }],
      chipsUsed: [{ name: 'Wildcard', gameDayId: 2 }],
    });
  });

  test.each([null, 1, 3])(
    'falls back to planning roster when locked matchday is %s',
    (matchdayId) => {
      const planning = team('Rocket', { matchday_1: 10, matchday_2: 20 });
      const data = buildRaceSummaryData(
        { leagueCode: 'ABC', teams: [planning] },
        {
          matchdayId,
          teams: [{ teamName: 'Rocket', drivers: [{ name: 'Locked' }] }],
        },
      );

      expect(data.leagueName).toBe('ABC');
      expect(data.teams[0].drivers).toEqual(planning.drivers);
      expect(data.teams[0].constructors).toEqual(planning.constructors);
      expect(data.teams[0].chipsUsed).toEqual(planning.chipsUsed);
    },
  );

  test('keeps separate locked rosters for different accounts with the same username and team number', () => {
    const standings = [
      team('NoNoItsSoNotRightMikeyNO', { matchday_1: 120 }, {
        userName: 'Tom Kregenbild',
        accountId: 'aaaaaaaaaaaa',
        teamNo: 1,
      }),
      team('Agentic Racing Co.', { matchday_1: 90 }, {
        userName: 'Tom Kregenbild',
        accountId: 'bbbbbbbbbbbb',
        teamNo: 1,
      }),
    ];
    const data = buildRaceSummaryData(
      { leagueName: 'Friends', teams: standings },
      {
        matchdayId: 1,
        teams: [
          {
            teamName: 'NoNoItsSoNotRightMikeyNO',
            userName: 'Tom Kregenbild',
            accountId: 'aaaaaaaaaaaa',
            teamNo: 1,
            drivers: [{ name: 'First Account Driver' }],
            constructors: [{ name: 'First Constructor' }],
          },
          {
            teamName: 'Agentic Racing Co.',
            userName: 'Tom Kregenbild',
            accountId: 'bbbbbbbbbbbb',
            teamNo: 1,
            drivers: [{ name: 'Second Account Driver' }],
            constructors: [{ name: 'Second Constructor' }],
          },
        ],
      },
    );

    expect(
      data.teams.find((entry) => entry.teamName === 'NoNoItsSoNotRightMikeyNO')
        .drivers,
    ).toEqual([{ name: 'First Account Driver' }]);
    expect(
      data.teams.find((entry) => entry.teamName === 'Agentic Racing Co.')
        .drivers,
    ).toEqual([{ name: 'Second Account Driver' }]);
  });

  test('legacy snapshots also disambiguate same-name accounts by fantasy team name', () => {
    const standings = [
      team('Tom Team A', { matchday_1: 120 }, {
        userName: 'Tom',
        teamNo: 1,
      }),
      team('Tom Team B', { matchday_1: 90 }, {
        userName: 'Tom',
        teamNo: 1,
      }),
    ];
    const data = buildRaceSummaryData(
      { teams: standings },
      {
        matchdayId: 1,
        teams: [
          {
            teamName: 'Tom Team A',
            userName: 'Tom',
            teamNo: 1,
            drivers: [{ name: 'A Driver' }],
          },
          {
            teamName: 'Tom Team B',
            userName: 'Tom',
            teamNo: 1,
            drivers: [{ name: 'B Driver' }],
          },
        ],
      },
    );

    expect(data.teams[0].drivers).toEqual([{ name: 'A Driver' }]);
    expect(data.teams[1].drivers).toEqual([{ name: 'B Driver' }]);
  });

  test('comparison facts include Boost assignments and transfer penalties', () => {
    const data = buildRaceSummaryData(
      {
        teams: [
          team('Winner', { matchday_1: 120 }, {
            userName: 'A',
            accountId: 'aaaaaaaaaaaa',
            teamNo: 1,
          }),
          team('Second', { matchday_1: 110 }, {
            userName: 'B',
            accountId: 'bbbbbbbbbbbb',
            teamNo: 1,
          }),
        ],
      },
      {
        matchdayId: 1,
        teams: [
          {
            teamName: 'Winner',
            userName: 'A',
            accountId: 'aaaaaaaaaaaa',
            teamNo: 1,
            matchdayId: 1,
            transfersRemaining: -2,
            drivers: [
              { name: 'Driver A', isCaptain: true },
              { name: 'Driver B' },
            ],
            constructors: [{ name: 'Constructor X' }],
            chipsUsed: [],
          },
          {
            teamName: 'Second',
            userName: 'B',
            accountId: 'bbbbbbbbbbbb',
            teamNo: 1,
            matchdayId: 1,
            transfersRemaining: 0,
            drivers: [
              { name: 'Driver A' },
              { name: 'Driver B', isCaptain: true },
            ],
            constructors: [{ name: 'Constructor X' }],
            chipsUsed: [],
          },
        ],
      },
    );

    const comparison = data.keyTeamDifferences[0];
    expect(comparison).toMatchObject({
      sameMembers: true,
      sameScoringSetup: false,
      subject: {
        boostDriver: 'Driver A',
        transferPenalty: 20,
      },
      comparison: {
        boostDriver: 'Driver B',
        transferPenalty: 0,
      },
    });
  });

  test('handles no completed race data', () => {
    expect(buildRaceSummaryData({ teams: [team('Empty', {})] })).toMatchObject({
      latestMatchday: null,
      raceNumber: null,
      teams: [{ latestRaceScore: null, seasonRankChange: 0 }],
      keyTeamDifferences: [],
    });
  });

  test('compares winner rosters with second, third, and bottom', () => {
    const differences = buildKeyTeamDifferences([
      { teamName: 'Winner', latestRaceScore: 50, drivers: ['A', 'Shared'], constructors: ['X'] },
      { teamName: 'Second', latestRaceScore: 40, drivers: ['B', 'Shared'], constructors: ['X'] },
      { teamName: 'Third', latestRaceScore: 30, drivers: ['C'], constructors: ['Y'] },
      { teamName: 'Bottom', latestRaceScore: 10, drivers: ['D'], constructors: ['Z'] },
    ]);

    expect(differences[0]).toMatchObject({
      label: 'winner_vs_2nd',
      scoreGap: 10,
      subject: { racePlace: 1, uniqueDrivers: ['A'] },
      comparison: { racePlace: 2, uniqueDrivers: ['B'] },
    });
    expect(differences.at(-1)).toMatchObject({
      label: 'top_vs_bottom',
      scoreGap: 40,
    });
  });
});
