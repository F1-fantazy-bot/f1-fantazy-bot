const {
  ACCOUNT_ID_SEGMENT_MAX_LENGTH,
  buildLegacyLeagueTeamId,
  buildLeagueTeamId,
} = require('./teamId');

describe('league team ids', () => {
  test('builds username_teamNo_accountId for account-aware data', () => {
    expect(
      buildLeagueTeamId('Tom Kregenbild', 1, '7f3a91c24b10e5d2'),
    ).toBe('Tom-Kregenbild_1_7f3a91c24b10e5d2');
  });

  test('different accounts with the same username and team number stay distinct', () => {
    expect(
      buildLeagueTeamId('Tom Kregenbild', 1, 'aaaaaaaaaaaaaaaa'),
    ).not.toBe(
      buildLeagueTeamId('Tom Kregenbild', 1, 'bbbbbbbbbbbbbbbb'),
    );
  });

  test('falls back to the legacy two-part id while old blobs lack accountId', () => {
    expect(buildLeagueTeamId('Tom Kregenbild', 1)).toBe(
      buildLegacyLeagueTeamId('Tom Kregenbild', 1),
    );
    expect(buildLeagueTeamId('Tom Kregenbild', 1)).toBe(
      'Tom-Kregenbild_1',
    );
  });

  test('bounds malformed account ids so Telegram callbacks remain bounded', () => {
    const id = buildLeagueTeamId('A'.repeat(100), 1, 'b'.repeat(100));
    const accountSegment = id.slice(id.lastIndexOf('_') + 1);

    expect(accountSegment).toHaveLength(ACCOUNT_ID_SEGMENT_MAX_LENGTH);
    expect(id.length).toBeLessThanOrEqual(59);
    expect(Buffer.byteLength(`TEAM:${id}`, 'utf8')).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(`BW:${id}:0`, 'utf8')).toBeLessThanOrEqual(64);
  });
});
