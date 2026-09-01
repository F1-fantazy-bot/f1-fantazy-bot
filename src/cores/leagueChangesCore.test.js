const {
  compareLeagueChanges,
  compareTeamChanges,
  findChipsForCurrentMatchday,
} = require('./leagueChangesCore');

function team(overrides = {}) {
  return {
    teamName: 'Fast Team',
    userName: 'owner',
    teamNo: 1,
    position: 1,
    matchdayId: 7,
    drivers: [
      { name: 'Verstappen', isCaptain: true },
      { name: 'Norris' },
    ],
    constructors: [{ name: 'McLaren' }],
    chipsUsed: [],
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    leagueCode: 'ABC',
    leagueName: 'Test League',
    matchdayId: 7,
    teams: [],
    ...overrides,
  };
}

describe('leagueChangesCore', () => {
  test('returns explicit missing-data and mismatch states', () => {
    expect(compareLeagueChanges({ planning: snapshot() })).toEqual({
      status: 'missing_locked',
    });
    expect(compareLeagueChanges({ latest: snapshot() })).toEqual({
      status: 'missing_planning',
    });
    expect(
      compareLeagueChanges({
        latest: snapshot({ matchdayId: 6 }),
        planning: snapshot({ matchdayId: 7 }),
      }),
    ).toMatchObject({
      status: 'matchday_mismatch',
      lockedMatchdayId: 6,
      planningMatchdayId: 7,
    });
  });

  test('returns structured transfers, captain changes, and current chips', () => {
    const planningTeam = team();
    const lockedTeam = team({
      drivers: [
        { name: 'Leclerc' },
        { name: 'Norris', isCaptain: true, isMegaCaptain: true },
      ],
      constructors: [{ name: 'Ferrari' }],
      chipsUsed: [
        { name: 'Wildcard', gameDayId: 2 },
        { name: 'Limitless', gameDayId: 7 },
      ],
    });

    expect(compareTeamChanges(lockedTeam, planningTeam)).toEqual({
      isNew: false,
      hasChanges: true,
      drivers: { in: ['Leclerc'], out: ['Verstappen'] },
      constructors: { in: ['Ferrari'], out: ['McLaren'] },
      captain: { from: 'Verstappen', to: 'Norris' },
      megaCaptain: { from: null, to: 'Norris' },
      chipsActivated: ['Limitless'],
    });
  });

  test('joins by team identity, sorts by position, and separates unchanged teams', () => {
    const unchanged = team({ teamName: 'Renamed', position: 2 });
    const changed = team({
      teamName: 'Leader',
      userName: 'other',
      position: 1,
      drivers: [{ name: 'Leclerc', isCaptain: true }],
    });
    const result = compareLeagueChanges({
      latest: snapshot({ teams: [unchanged, changed] }),
      planning: snapshot({
        teams: [
          team({ teamName: 'Old Name', position: 99 }),
          team({ userName: 'other', drivers: [{ name: 'Hamilton', isCaptain: true }] }),
        ],
      }),
    });

    expect(result.status).toBe('ok');
    expect(result.teams.map((entry) => entry.teamName)).toEqual([
      'Leader',
      'Renamed',
    ]);
    expect(result.changedTeams).toHaveLength(1);
    expect(result.unchangedTeams).toEqual([
      expect.objectContaining({ teamName: 'Renamed', hasChanges: false }),
    ]);
  });

  test('compares multiple teams from one account by userName and teamNo', () => {
    const planningTeamOne = team({
      teamName: 'Owner Team 1',
      teamNo: 1,
      position: 5,
    });
    const planningTeamTwo = team({
      teamName: 'Owner Team 2',
      teamNo: 2,
      position: 6,
      drivers: [{ name: 'Hamilton', isCaptain: true }],
    });
    const lockedTeamOne = team({
      teamName: 'Owner Team 1',
      teamNo: 1,
      position: 1,
    });
    const lockedTeamTwo = team({
      teamName: 'Owner Team 2',
      teamNo: 2,
      position: 2,
      drivers: [{ name: 'Leclerc', isCaptain: true }],
    });

    const result = compareLeagueChanges({
      latest: snapshot({ teams: [lockedTeamTwo, lockedTeamOne] }),
      planning: snapshot({ teams: [planningTeamOne, planningTeamTwo] }),
    });

    expect(result.changedTeams).toEqual([
      expect.objectContaining({
        teamName: 'Owner Team 2',
        drivers: { in: ['Leclerc'], out: ['Hamilton'] },
      }),
    ]);
    expect(result.unchangedTeams).toEqual([
      expect.objectContaining({ teamName: 'Owner Team 1' }),
    ]);
  });

  test('marks locked-only teams as new without inventing transfer details', () => {
    const result = compareLeagueChanges({
      latest: snapshot({ teams: [team()] }),
      planning: snapshot(),
    });

    expect(result.changedTeams[0]).toMatchObject({
      teamName: 'Fast Team',
      isNew: true,
      hasChanges: true,
      drivers: { in: [], out: [] },
      constructors: { in: [], out: [] },
    });
  });

  test('filters historical chips and chips without a matchday', () => {
    expect(
      findChipsForCurrentMatchday(
        team({
          chipsUsed: [
            { name: 'Wildcard', gameDayId: 4 },
            { name: 'Limitless' },
            { name: 'Extra DRS Boost', gameDayId: 7 },
          ],
        }),
      ),
    ).toEqual(['Extra DRS Boost']);
  });
});
