const {
  buildLegacyLeagueTeamId,
  buildLeagueTeamId,
  buildLeagueTeamCallbackKey,
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

  test('keeps legacy ids readable while old blobs are draining', () => {
    expect(buildLeagueTeamId('Tom Kregenbild', 1)).toBe(
      buildLegacyLeagueTeamId('Tom Kregenbild', 1),
    );
  });

  test('uses a compact callback key when accountId exists', () => {
    expect(
      buildLeagueTeamCallbackKey('A very long display user name', 1, 'a84f1234abcd'),
    ).toBe('1_a84f1234abcd');
  });
});
