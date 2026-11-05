const {
  buildLegacyLeagueTeamId,
  buildLeagueTeamId,
  buildLeagueTeamCallbackKey,
  buildLeagueTeamIdentityKey,
  sameLeagueTeamIds,
} = require('./teamId');

describe('teamId', () => {
  test('includes accountId after user name and team number', () => {
    expect(buildLeagueTeamId('Tom Kregenbild', 1, 'a84f1234abcd')).toBe(
      'Tom-Kregenbild_1_a84f1234abcd',
    );
  });

  test('separates different accounts with the same user name and team number', () => {
    expect(buildLeagueTeamId('Tom Kregenbild', 1, 'aaaa11111111')).not.toBe(
      buildLeagueTeamId('Tom Kregenbild', 1, 'bbbb22222222'),
    );
  });

  test('keeps the same account across leagues and separates its team numbers', () => {
    const first = buildLeagueTeamId('Tom Kregenbild', 1, 'aaaa11111111');
    expect(buildLeagueTeamId('Tom Kregenbild', 1, 'aaaa11111111')).toBe(first);
    expect(buildLeagueTeamId('Tom Kregenbild', 2, 'aaaa11111111')).not.toBe(first);
    expect(buildLeagueTeamIdentityKey('aaaa11111111', 1)).toBe('aaaa11111111:1');
  });

  test('recognizes a username change by stable account and team number', () => {
    const previous = buildLeagueTeamId('Tom Kregenbild', 1, 'aaaa11111111');
    const renamed = buildLeagueTeamId('Tom NewName', 1, 'aaaa11111111');
    expect(previous).not.toBe(renamed);
    expect(sameLeagueTeamIds(previous, renamed)).toBe(true);
    expect(sameLeagueTeamIds(previous,
      buildLeagueTeamId('Tom Kregenbild', 1, 'bbbb22222222'))).toBe(false);
  });

  test('requires an account id for canonical ids', () => {
    expect(buildLeagueTeamId('Tom Kregenbild', 1)).toBeNull();
    expect(buildLegacyLeagueTeamId('Tom Kregenbild', 1)).toBe('Tom-Kregenbild_1');
  });

  test('uses a compact callback key when accountId exists', () => {
    expect(
      buildLeagueTeamCallbackKey('A very long display user name', 1, 'a84f1234abcd'),
    ).toBe('1_a84f1234abcd');
  });
});
