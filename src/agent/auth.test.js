// We mock google-auth-library so the test never reaches the real
// library — and so the suite still passes when the dependency isn't
// installed in CI yet.
jest.mock('google-auth-library', () => {
  const verifyIdToken = jest.fn();

  return {
    OAuth2Client: jest.fn(() => ({ verifyIdToken })),
    __verifyIdToken: verifyIdToken,
  };
});

const googleAuth = require('google-auth-library');
const {
  STATUS,
  extractBearerToken,
  verifyGoogleIdToken,
  authenticateRequest,
  isAdminChatId,
  resetOAuth2ClientForTests,
} = require('./auth');
const { KILZI_CHAT_ID, DORSE_CHAT_ID } = require('../constants');

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetOAuth2ClientForTests();
  googleAuth.__verifyIdToken.mockReset();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe('extractBearerToken', () => {
  test('returns the token from a well-formed header', () => {
    expect(
      extractBearerToken({ headers: { authorization: 'Bearer abc.def.ghi' } }),
    ).toBe('abc.def.ghi');
  });

  test('handles Authorization (capitalised) and extra whitespace', () => {
    expect(
      extractBearerToken({ headers: { Authorization: 'Bearer   foo' } }),
    ).toBe('foo');
  });

  test('returns null on missing header', () => {
    expect(extractBearerToken({ headers: {} })).toBeNull();
    expect(extractBearerToken({})).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });

  test('returns null on non-Bearer scheme', () => {
    expect(
      extractBearerToken({ headers: { authorization: 'Basic abc' } }),
    ).toBeNull();
  });

  test('returns null on empty token', () => {
    expect(
      extractBearerToken({ headers: { authorization: 'Bearer  ' } }),
    ).toBeNull();
  });

  test('returns null on non-string header value', () => {
    expect(
      extractBearerToken({ headers: { authorization: ['Bearer x'] } }),
    ).toBeNull();
  });
});

describe('verifyGoogleIdToken', () => {
  test('returns email + sub + name on success', async () => {
    googleAuth.__verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        email: 'foo@example.com',
        email_verified: true,
        sub: '109876',
        name: 'Foo Bar',
        picture: 'https://...',
        exp: 1234567890,
      }),
    });

    const result = await verifyGoogleIdToken('token', 'client-id');
    expect(result).toEqual({
      email: 'foo@example.com',
      sub: '109876',
      name: 'Foo Bar',
      picture: 'https://...',
      exp: 1234567890,
    });
    expect(googleAuth.__verifyIdToken).toHaveBeenCalledWith({
      idToken: 'token',
      audience: 'client-id',
    });
  });

  test('throws when audience is missing', async () => {
    await expect(verifyGoogleIdToken('token', '')).rejects.toThrow(
      /GOOGLE_CLIENT_ID/,
    );
  });

  test('throws on unexpected issuer', async () => {
    googleAuth.__verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        iss: 'https://evil.example.com',
        email: 'foo@example.com',
        email_verified: true,
        sub: '1',
      }),
    });

    await expect(verifyGoogleIdToken('t', 'c')).rejects.toThrow(/issuer/);
  });

  test('throws when email is missing', async () => {
    googleAuth.__verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        iss: 'accounts.google.com',
        email_verified: true,
        sub: '1',
      }),
    });

    await expect(verifyGoogleIdToken('t', 'c')).rejects.toThrow(/email/);
  });

  test('throws when email is not verified', async () => {
    googleAuth.__verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        iss: 'accounts.google.com',
        email: 'foo@example.com',
        email_verified: false,
        sub: '1',
      }),
    });

    await expect(verifyGoogleIdToken('t', 'c')).rejects.toThrow(/not verified/);
  });

  test('propagates library throw (expired token, etc.)', async () => {
    googleAuth.__verifyIdToken.mockRejectedValueOnce(new Error('Token expired'));
    await expect(verifyGoogleIdToken('t', 'c')).rejects.toThrow(/expired/);
  });
});

describe('authenticateRequest', () => {
  function reqWithToken(token) {
    return { headers: { authorization: `Bearer ${token}` } };
  }

  test('returns bypassed when GOOGLE_CLIENT_ID is unset', async () => {
    delete process.env.GOOGLE_CLIENT_ID;

    const result = await authenticateRequest(reqWithToken('x'), {
      lookupAllowedUser: jest.fn(),
    });

    expect(result).toEqual({ status: STATUS.BYPASSED });
  });

  test('returns unauthorized when bearer is missing', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';

    const result = await authenticateRequest(
      { headers: {} },
      { lookupAllowedUser: jest.fn() },
    );

    expect(result.status).toBe(STATUS.UNAUTHORIZED);
    expect(result.reason).toBe('missing_or_malformed_authorization_header');
  });

  test('returns unauthorized when token verification throws', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';

    const result = await authenticateRequest(reqWithToken('bad'), {
      lookupAllowedUser: jest.fn(),
      verifyToken: jest.fn().mockRejectedValueOnce(new Error('Token expired')),
    });

    expect(result.status).toBe(STATUS.UNAUTHORIZED);
    expect(result.reason).toBe('invalid_token');
    expect(result.detail).toBe('Token expired');
  });

  test('returns forbidden when email is not allowlisted', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';

    const result = await authenticateRequest(reqWithToken('good'), {
      verifyToken: jest
        .fn()
        .mockResolvedValueOnce({ email: 'foo@example.com', sub: '1' }),
      lookupAllowedUser: jest.fn().mockResolvedValueOnce(null),
    });

    expect(result.status).toBe(STATUS.FORBIDDEN);
    expect(result.reason).toBe('email_not_allowlisted');
    expect(result.email).toBe('foo@example.com');
  });

  test('returns forbidden when allowlist row has non-numeric chatId', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';

    const result = await authenticateRequest(reqWithToken('good'), {
      verifyToken: jest
        .fn()
        .mockResolvedValueOnce({ email: 'foo@example.com', sub: '1' }),
      lookupAllowedUser: jest
        .fn()
        .mockResolvedValueOnce({ email: 'foo@example.com' }),
    });

    expect(result.status).toBe(STATUS.FORBIDDEN);
    expect(result.reason).toBe('allowlist_entry_missing_chat_id');
  });

  test('returns ok with numeric chatId and propagates claims', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';

    const result = await authenticateRequest(reqWithToken('good'), {
      verifyToken: jest.fn().mockResolvedValueOnce({
        email: 'foo@example.com',
        sub: '109876',
        name: 'Foo Bar',
      }),
      lookupAllowedUser: jest.fn().mockResolvedValueOnce({
        email: 'foo@example.com',
        chatId: '454873194',
      }),
    });

    expect(result).toEqual({
      status: STATUS.OK,
      email: 'foo@example.com',
      chatId: 454873194,
      name: 'Foo Bar',
      sub: '109876',
    });
  });

  test('returns unauthorized when allowlist lookup throws (storage outage)', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';

    const result = await authenticateRequest(reqWithToken('good'), {
      verifyToken: jest
        .fn()
        .mockResolvedValueOnce({ email: 'foo@example.com', sub: '1' }),
      lookupAllowedUser: jest.fn().mockRejectedValueOnce(new Error('Azure unreachable')),
    });

    expect(result.status).toBe(STATUS.UNAUTHORIZED);
    expect(result.reason).toBe('allowlist_lookup_failed');
    expect(result.detail).toBe('Azure unreachable');
  });

  test('requires options.lookupAllowedUser', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';

    await expect(
      authenticateRequest(reqWithToken('good'), {
        verifyToken: jest
          .fn()
          .mockResolvedValueOnce({ email: 'foo@example.com', sub: '1' }),
      }),
    ).rejects.toThrow(/lookupAllowedUser/);
  });
});

describe('isAdminChatId', () => {
  test('returns true for KILZI_CHAT_ID', () => {
    expect(isAdminChatId(KILZI_CHAT_ID)).toBe(true);
  });

  test('returns true for DORSE_CHAT_ID', () => {
    expect(isAdminChatId(DORSE_CHAT_ID)).toBe(true);
  });

  test('returns false for any other chatId', () => {
    expect(isAdminChatId(123456)).toBe(false);
    expect(isAdminChatId(0)).toBe(false);
    expect(isAdminChatId(null)).toBe(false);
    expect(isAdminChatId(undefined)).toBe(false);
    // A non-admin chatId from src/constants.js — guards against
    // someone accidentally promoting everyone in the constants file.
    expect(isAdminChatId(740312192 /* YEHONATAN_CHAT_ID */)).toBe(false);
  });

  test('treats stringified admin chatId as non-admin (we only check numeric)', () => {
    // authenticateRequest parses the allowlist chatId to a Number
    // before calling this helper, so the helper itself only deals
    // with numbers. Strings should NOT match — this catches a future
    // refactor that forgets the parseInt step.
    expect(isAdminChatId(String(KILZI_CHAT_ID))).toBe(false);
  });
});

describe('authenticateRequest — allowlist access', () => {
  test.each([undefined, 'false', 'true'])(
    'allows non-admin members even with legacy AGENT_REQUIRE_ADMIN=%s',
    async (legacySetting) => {
      process.env.GOOGLE_CLIENT_ID = 'client-id';
      if (legacySetting === undefined) {
        delete process.env.AGENT_REQUIRE_ADMIN;
      } else {
        process.env.AGENT_REQUIRE_ADMIN = legacySetting;
      }

      const result = await authenticateRequest({
        headers: { authorization: 'Bearer good' },
      }, {
        verifyToken: jest.fn().mockResolvedValue({ email: 'tester@example.com', sub: '3' }),
        lookupAllowedUser: jest.fn().mockResolvedValue({ chatId: '740312192' }),
      });

      expect(result).toEqual({
        status: STATUS.OK,
        email: 'tester@example.com',
        chatId: 740312192,
        sub: '3',
        name: undefined,
      });
    },
  );
});
