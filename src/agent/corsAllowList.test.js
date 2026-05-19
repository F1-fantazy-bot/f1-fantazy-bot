const {
  parseAllowList,
  compilePattern,
  resolveAllowedOrigin,
  buildCorsHeadersFromEnv,
} = require('./corsAllowList');

describe('parseAllowList', () => {
  test('returns [] for undefined / null / empty string', () => {
    expect(parseAllowList(undefined)).toEqual([]);
    expect(parseAllowList(null)).toEqual([]);
    expect(parseAllowList('')).toEqual([]);
  });

  test('splits comma-separated values and trims whitespace', () => {
    expect(parseAllowList('https://a.example, https://b.example ,https://c.example')).toEqual([
      'https://a.example',
      'https://b.example',
      'https://c.example',
    ]);
  });

  test('drops empty segments produced by trailing/double commas', () => {
    expect(parseAllowList(',https://a.example,,https://b.example,')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  test('preserves the literal wildcard entry', () => {
    expect(parseAllowList('*')).toEqual(['*']);
  });
});

describe('compilePattern', () => {
  test('returns null for empty input', () => {
    expect(compilePattern(undefined)).toBeNull();
    expect(compilePattern(null)).toBeNull();
    expect(compilePattern('')).toBeNull();
  });

  test('returns a RegExp for a valid pattern', () => {
    const re = compilePattern('^https://[a-z]+\\.example$');
    expect(re).toBeInstanceOf(RegExp);
    expect(re.test('https://foo.example')).toBe(true);
    expect(re.test('https://FOO.example')).toBe(false);
  });

  test('returns null and logs for an invalid regex (does not throw)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(compilePattern('(unclosed')).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('resolveAllowedOrigin', () => {
  test('local-dev fallback: empty config returns "*" regardless of Origin', () => {
    expect(resolveAllowedOrigin('https://anywhere.example', {})).toBe('*');
    expect(resolveAllowedOrigin(undefined, {})).toBe('*');
    expect(resolveAllowedOrigin('https://anywhere.example', { allowList: [], previewPattern: null })).toBe('*');
  });

  test('configured but no Origin header → returns null (no ACAO sent)', () => {
    expect(resolveAllowedOrigin(undefined, { allowList: ['https://prod.example'] })).toBeNull();
    expect(resolveAllowedOrigin('', { allowList: ['https://prod.example'] })).toBeNull();
    expect(resolveAllowedOrigin(null, { previewPattern: /./ })).toBeNull();
  });

  test('literal "*" in the allow list short-circuits to "*"', () => {
    expect(resolveAllowedOrigin('https://evil.example', { allowList: ['*'] })).toBe('*');
  });

  test('exact origin match returns the echoed origin', () => {
    const allowList = ['https://prod.example', 'https://staging.example'];
    expect(resolveAllowedOrigin('https://prod.example', { allowList })).toBe('https://prod.example');
    expect(resolveAllowedOrigin('https://staging.example', { allowList })).toBe('https://staging.example');
    expect(resolveAllowedOrigin('https://evil.example', { allowList })).toBeNull();
  });

  test('preview regex matches return the echoed origin', () => {
    const previewPattern = /^https:\/\/preview-\d+\.example$/;
    expect(resolveAllowedOrigin('https://preview-42.example', { previewPattern })).toBe('https://preview-42.example');
    expect(resolveAllowedOrigin('https://prod.example', { previewPattern })).toBeNull();
  });

  test('exact match wins over preview regex (no double-evaluation)', () => {
    const allowList = ['https://prod.example'];
    const previewPattern = /^https:\/\/prod\.example$/; // both would match
    expect(resolveAllowedOrigin('https://prod.example', { allowList, previewPattern })).toBe('https://prod.example');
  });

  test('SWA-shaped preview pattern matches realistic SWA hostnames', () => {
    const previewPattern = /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.[0-9]+\.azurestaticapps\.net$/;
    expect(resolveAllowedOrigin('https://lemon-bush-0a1b2c3d4-1.westeurope.5.azurestaticapps.net', { previewPattern })).toBe(
      'https://lemon-bush-0a1b2c3d4-1.westeurope.5.azurestaticapps.net'
    );
    expect(resolveAllowedOrigin('https://lemon-bush-0a1b2c3d4-1.eastus.5.azurestaticapps.net', { previewPattern })).toBe(
      'https://lemon-bush-0a1b2c3d4-1.eastus.5.azurestaticapps.net'
    );
    expect(resolveAllowedOrigin('https://evil.azurestaticapps.net.attacker.com', { previewPattern })).toBeNull();
  });
});

describe('buildCorsHeadersFromEnv', () => {
  const STATIC_HEADERS_ASSERT = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-copilotcloud-public-api-key',
    'Access-Control-Max-Age': '86400',
  };

  test('local-dev: empty env → "*" for any origin, no Vary', () => {
    const headers = buildCorsHeadersFromEnv('https://localhost:5173', {});
    expect(headers).toEqual({
      ...STATIC_HEADERS_ASSERT,
      'Access-Control-Allow-Origin': '*',
    });
    expect(headers.Vary).toBeUndefined();
  });

  test('allowed exact origin: echoes Origin and adds Vary', () => {
    const headers = buildCorsHeadersFromEnv('https://f1-fantazy-agent-web.azurestaticapps.net', {
      AGENT_CORS_ALLOWED_ORIGINS: 'https://f1-fantazy-agent-web.azurestaticapps.net',
    });
    expect(headers).toEqual({
      ...STATIC_HEADERS_ASSERT,
      'Access-Control-Allow-Origin': 'https://f1-fantazy-agent-web.azurestaticapps.net',
      Vary: 'Origin',
    });
  });

  test('disallowed origin in configured mode: ACAO omitted entirely', () => {
    const headers = buildCorsHeadersFromEnv('https://evil.example', {
      AGENT_CORS_ALLOWED_ORIGINS: 'https://prod.example',
    });
    expect(headers).toEqual(STATIC_HEADERS_ASSERT);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  test('preview pattern match: echoes Origin and adds Vary', () => {
    const headers = buildCorsHeadersFromEnv(
      'https://lemon-bush-0a1b2c3d4-1.westeurope.5.azurestaticapps.net',
      {
        AGENT_CORS_ALLOWED_ORIGINS: 'https://prod.example',
        AGENT_CORS_PREVIEW_ORIGIN_PATTERN:
          '^https://[a-z0-9-]+\\.[a-z0-9-]+\\.[0-9]+\\.azurestaticapps\\.net$',
      }
    );
    expect(headers['Access-Control-Allow-Origin']).toBe(
      'https://lemon-bush-0a1b2c3d4-1.westeurope.5.azurestaticapps.net'
    );
    expect(headers.Vary).toBe('Origin');
  });

  test('invalid preview regex: silently ignored, exact-match path still works', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const headers = buildCorsHeadersFromEnv('https://prod.example', {
      AGENT_CORS_ALLOWED_ORIGINS: 'https://prod.example',
      AGENT_CORS_PREVIEW_ORIGIN_PATTERN: '(unclosed',
    });
    expect(headers['Access-Control-Allow-Origin']).toBe('https://prod.example');
    spy.mockRestore();
  });

  test('no Origin header in configured mode: ACAO omitted (curl test → no CORS leak)', () => {
    const headers = buildCorsHeadersFromEnv(undefined, {
      AGENT_CORS_ALLOWED_ORIGINS: 'https://prod.example',
    });
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
