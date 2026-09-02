const { buildWhatsNewResult } = require('./announcementsCore');

describe('announcementsCore', () => {
  test('returns a structured public announcement without changing its Markdown text', () => {
    const latest = {
      id: 'release-1',
      createdAt: '2026-04-29T07:58:42Z',
      version: 'wow',
      sinceRef: 'private-ref',
      headCommit: 'private-commit',
      text: '*New* /follow_league',
    };

    expect(buildWhatsNewResult(latest)).toEqual({
      status: 'ok',
      announcement: {
        id: 'release-1',
        createdAt: '2026-04-29T07:58:42Z',
        version: 'wow',
        text: '*New* /follow_league',
      },
    });
  });

  test.each([
    null,
    undefined,
    [],
    {},
    { text: '' },
    { text: 42 },
  ])('returns empty for an absent or malformed latest announcement: %p', (latest) => {
    expect(buildWhatsNewResult(latest)).toEqual({
      status: 'empty',
      announcement: null,
    });
  });

  test('uses stable safe defaults for optional metadata', () => {
    expect(buildWhatsNewResult({ text: 'Release notes', version: 'unknown' })).toEqual({
      status: 'ok',
      announcement: {
        id: null,
        createdAt: null,
        version: 'standard',
        text: 'Release notes',
      },
    });
  });
});
