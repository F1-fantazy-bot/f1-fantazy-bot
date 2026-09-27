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

  test('keeps same-name same-teamNo accounts on distinct locked rosters', () => {
    const leagueData = {
      leagueName: 'Friends',
      teams: [
        team('NoNoItsSoNotRightMikeyNO', { matchday_1: 10, matchday_2: 198 }, {
          userName: 'Tom Kregenbild',
          teamNo: 1,
          accountId: 'accountaaa111',
        }),
        team('Agentic Racing Co.', { matchday_1: 10, matchday_2: 147 }, {
          userName: 'Tom Kregenbild',
          teamNo: 1,
          accountId: 'accountbbb222',
        }),
      ],
    };
    const locked = {
      matchdayId: 2,
      teams: [
        {
          teamName: 'NoNoItsSoNotRightMikeyNO',
          userName: 'Tom Kregenbild',
          teamNo: 1,
          accountId: 'accountaaa111',
          matchdayId: 2,
          drivers: [
            { name: 'Norris', isCaptain: true },
            { name: 'Leclerc' },
          ],
          constructors: [{ name: 'McLaren' }],
          transfersRemaining: 0,
          chipsUsed: [],
        },
        {
          teamName: 'Agentic Racing Co.',
          userName: 'Tom Kregenbild',
          teamNo: 1,
          accountId: 'accountbbb222',
          matchdayId: 2,
          drivers: [
            { name: 'Verstappen' },
            { name: 'Russell', isCaptain: true },
          ],
          constructors: [{ name: 'Mercedes' }],
          transfersRemaining: -2,
          chipsUsed: [],
        },
      ],
    };

    const data = buildRaceSummaryData(leagueData, locked);
    const first = data.teams.find(
      ({ teamName }) => teamName === 'NoNoItsSoNotRightMikeyNO',
    );
    const second = data.teams.find(
      ({ teamName }) => teamName === 'Agentic Racing Co.',
    );

    expect(first).toMatchObject({
      drivers: [
        { name: 'Norris', isCaptain: true },
        { name: 'Leclerc' },
      ],
      constructors: [{ name: 'McLaren' }],
      boostDriver: 'Norris',
      transferPenalty: 0,
    });
    expect(second).toMatchObject({
      drivers: [
        { name: 'Verstappen' },
        { name: 'Russell', isCaptain: true },
      ],
      constructors: [{ name: 'Mercedes' }],
      boostDriver: 'Russell',
      transferPenalty: 20,
    });
  });

  test('matches historical Tom rosters by exact team name without overwriting', () => {
    const make = (teamName, accountId) => team(teamName, { matchday_2: 50 }, {
      userName: 'Tom Kregenbild', teamNo: 1, accountId,
    });
    const teams = [make('NoNoItsSoNotRightMikeyNO', 'aaaaaaaaaaaa'),
      make('Agentic Racing Co.', 'bbbbbbbbbbbb')];
    const locked = teams.map((entry, index) => ({
      teamName: entry.teamName, userName: entry.userName, teamNo: 1,
      matchdayId: 2, drivers: [{ name: `Locked ${index}` }], constructors: [],
    }));
    const data = buildRaceSummaryData({ teams }, { matchdayId: 2, teams: locked });
    expect(data.teams.map((entry) => entry.drivers[0].name)).toEqual(['Locked 0', 'Locked 1']);
    expect(data.teams.map((entry) => entry.rosterMatchStatus)).toEqual([
      'legacy_team_name', 'legacy_team_name',
    ]);
  });

  test('reports genuinely ambiguous historical roster as unavailable', () => {
    const planning = team('Tom team', { matchday_2: 50 }, {
      userName: 'Tom Kregenbild', teamNo: 1, accountId: 'aaaaaaaaaaaa',
    });
    const locked = [1, 2].map(() => ({
      teamName: 'Tom team', userName: 'Tom Kregenbild', teamNo: 1,
      matchdayId: 2, drivers: [{ name: 'Wrong' }],
    }));
    const data = buildRaceSummaryData({ teams: [planning] }, { matchdayId: 2, teams: locked });
    expect(data.teams[0]).toMatchObject({
      drivers: [], rosterMatchStatus: 'ambiguous_legacy_identity', transferPenalty: null,
    });
  });

  test('includes boost and penalty differences even when roster members match', () => {
    const differences = buildKeyTeamDifferences([
      {
        teamName: 'Winner',
        latestRaceScore: 200,
        drivers: ['A', 'B'],
        constructors: ['X'],
        boostDriver: 'A',
        extraBoostDriver: null,
        transferPenalty: 0,
      },
      {
        teamName: 'Second',
        latestRaceScore: 149,
        drivers: ['A', 'B'],
        constructors: ['X'],
        boostDriver: 'B',
        extraBoostDriver: null,
        transferPenalty: 10,
      },
    ]);

    expect(differences[0]).toMatchObject({
      sameRosterMembers: true,
      sameBoostConfiguration: false,
      sameActiveChips: true,
      sameTransferPenalty: false,
      sameRaceConfiguration: false,
      penaltyGap: -10,
      subject: {
        uniqueDrivers: [],
        uniqueConstructors: [],
        boostDriver: 'A',
        transferPenalty: 0,
      },
      comparison: {
        uniqueDrivers: [],
        uniqueConstructors: [],
        boostDriver: 'B',
        transferPenalty: 10,
      },
      scoreGap: 51,
    });
  });

  test('compares only active chips and penalty waiver as race configuration', () => {
    const base = { drivers: ['A', 'B'], constructors: ['X'],
      boostDriver: 'A', extraBoostDriver: 'B', transferPenalty: 0 };
    const first = { ...base, teamName: 'A', latestRaceScore: 100,
      activeChips: ['No Negative', 'Wildcard'], transferPenaltyWaived: true };
    const second = { ...base, teamName: 'B', latestRaceScore: 90,
      activeChips: ['Wildcard', 'No Negative', 'Wildcard'], transferPenaltyWaived: true };
    const equal = buildKeyTeamDifferences([first, second])[0];
    expect(equal).toMatchObject({ sameRosterMembers: true,
      sameBoostConfiguration: true, sameActiveChips: true,
      sameTransferPenalty: true, sameRaceConfiguration: true });

    const differing = buildKeyTeamDifferences([first, {
      ...second, activeChips: ['No Negative'], transferPenaltyWaived: false,
    }])[0];
    expect(differing).toMatchObject({ sameRosterMembers: true,
      sameBoostConfiguration: true, sameActiveChips: false,
      sameTransferPenalty: false, sameRaceConfiguration: false });
  });

  test('excludes chips used in earlier matchdays', () => {
    const planning = ['A', 'B'].map((teamName, index) => team(teamName,
      { matchday_2: 100 - index }, { userName: teamName,
        teamNo: 1, accountId: `${index ? 'bbbb' : 'aaaa'}aaaaaaaa` }));
    const locked = planning.map((row, index) => ({
      ...row, matchdayId: 2,
      drivers: [{ name: 'D', isCaptain: true }], constructors: [{ name: 'C' }],
      transfersRemaining: 0,
      chipsUsed: index ? [{ name: 'No Negative', gameDayId: 1 }] : [],
    }));
    const summary = buildRaceSummaryData({ teams: planning }, { matchdayId: 2, teams: locked });
    expect(summary.keyTeamDifferences[0]).toMatchObject({
      sameActiveChips: true, sameTransferPenalty: true, sameRaceConfiguration: true,
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
