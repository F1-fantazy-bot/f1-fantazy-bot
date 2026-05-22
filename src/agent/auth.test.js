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

describe('authenticateRequest — admin-only gate (AGENT_REQUIRE_ADMIN)', () => {
  function reqWithToken(token) {
    return { headers: { authorization: `Bearer ${token}` } };
  }

  // Each test sets clientId via options to keep the env minimal and
  // explicit. We toggle the admin flag via options too so we don't
  // rely on shared process.env state across tests.

  test('admin chatId passes when requireAdmin=true', async () => {
    const result = await authenticateRequest(reqWithToken('good'), {
      clientId: 'client-id',
      requireAdmin: true,
      verifyToken: jest.fn().mockResolvedValueOnce({
        email: 'kilzi@example.com',
        sub: '1',
        name: 'Kilzi',
      }),
      lookupAllowedUser: jest.fn().mockResolvedValueOnce({
        email: 'kilzi@example.com',
        chatId: String(KILZI_CHAT_ID),
      }),
    });

    expect(result).toEqual({
      status: STATUS.OK,
      email: 'kilzi@example.com',
      chatId: KILZI_CHAT_ID,
      name: 'Kilzi',
      sub: '1',
    });
  });

  test('DORSE chatId passes when requireAdmin=true (second admin entry)', async () => {
    const result = await authenticateRequest(reqWithToken('good'), {
      clientId: 'client-id',
      requireAdmin: true,
      verifyToken: jest
        .fn()
        .mockResolvedValueOnce({ email: 'dorse@example.com', sub: '2' }),
      lookupAllowedUser: jest.fn().mockResolvedValueOnce({
        email: 'dorse@example.com',
        chatId: String(DORSE_CHAT_ID),
      }),
    });

    expect(result.status).toBe(STATUS.OK);
    expect(result.chatId).toBe(DORSE_CHAT_ID);
  });

  test('non-admin allowlisted chatId is FORBIDDEN with reason=not_admin', async () => {
    const result = await authenticateRequest(reqWithToken('good'), {
      clientId: 'client-id',
      requireAdmin: true,
      verifyToken: jest
        .fn()
        .mockResolvedValueOnce({ email: 'tester@example.com', sub: '3' }),
      lookupAllowedUser: jest.fn().mockResolvedValueOnce({
        email: 'tester@example.com',
        // A real, on-allowlist, non-admin chatId.
        chatId: '740312192',
      }),
    });

    expect(result).toEqual({
      status: STATUS.FORBIDDEN,
      reason: 'not_admin',
      email: 'tester@example.com',
    });
  });

  test('non-admin allowlisted chatId is OK when requireAdmin=false (prod parity)', async () => {
    const result = await authenticateRequest(reqWithToken('good'), {
      clientId: 'client-id',
      requireAdmin: false,
      verifyToken: jest
        .fn()
        .mockResolvedValueOnce({ email: 'tester@example.com', sub: '3' }),
      lookupAllowedUser: jest.fn().mockResolvedValueOnce({
        email: 'tester@example.com',
        chatId: '740312192',
      }),
    });

    expect(result.status).toBe(STATUS.OK);
    expect(result.chatId).toBe(740312192);
  });

  test('reads AGENT_REQUIRE_ADMIN=true from env when option is not provided', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.AGENT_REQUIRE_ADMIN = 'true';

    const result = await authenticateRequest(reqWithToken('good'), {
      verifyToken: jest
        .fn()
        .mockResolvedValueOnce({ email: 'tester@example.com', sub: '3' }),
      lookupAllowedUser: jest.fn().mockResolvedValueOnce({
        email: 'tester@example.com',
        chatId: '740312192',
      }),
    });

    expect(result.status).toBe(STATUS.FORBIDDEN);
    expect(result.reason).toBe('not_admin');
  });

  test('AGENT_REQUIRE_ADMIN unset is treated as false (prod default)', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    delete process.env.AGENT_REQUIRE_ADMIN;

    const result = await authenticateRequest(reqWithToken('good'), {
      verifyToken: jest
        .fn()
        .mockResolvedValueOnce({ email: 'tester@example.com', sub: '3' }),
      lookupAllowedUser: jest.fn().mockResolvedValueOnce({
        email: 'tester@example.com',
        chatId: '740312192',
      }),
    });

    expect(result.status).toBe(STATUS.OK);
  });

  test('AGENT_REQUIRE_ADMIN="false" string is treated as false (only "true" enables)', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.AGENT_REQUIRE_ADMIN = 'false';

    const result = await authenticateRequest(reqWithToken('good'), {
      verifyToken: jest
        .fn()
        .mockResolvedValueOnce({ email: 'tester@example.com', sub: '3' }),
      lookupAllowedUser: jest.fn().mockResolvedValueOnce({
        email: 'tester@example.com',
        chatId: '740312192',
      }),
    });

    expect(result.status).toBe(STATUS.OK);
  });

  test('options.requireAdmin overrides env (true beats AGENT_REQUIRE_ADMIN=false)', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.AGENT_REQUIRE_ADMIN = 'false';

    const result = await authenticateRequest(reqWithToken('good'), {
      requireAdmin: true,
      verifyToken: jest
        .fn()
        .mockResolvedValueOnce({ email: 'tester@example.com', sub: '3' }),
      lookupAllowedUser: jest.fn().mockResolvedValueOnce({
        email: 'tester@example.com',
        chatId: '740312192',
      }),
    });

    expect(result.status).toBe(STATUS.FORBIDDEN);
    expect(result.reason).toBe('not_admin');
  });

  test('admin gate runs AFTER allowlist check — non-allowlisted admin still gets email_not_allowlisted', async () => {
    // Guards the gate ordering: a chatId can't bypass the allowlist
    // membership check just by happening to equal an admin chatId
    // upstream of the lookup. (In practice this can't happen because
    // the lookup is keyed on email, not chatId, but the ordering
    // guarantee is worth pinning.)
    const result = await authenticateRequest(reqWithToken('good'), {
      clientId: 'client-id',
      requireAdmin: true,
      verifyToken: jest
        .fn()
        .mockResolvedValueOnce({ email: 'random@example.com', sub: '9' }),
      lookupAllowedUser: jest.fn().mockResolvedValueOnce(null),
    });

    expect(result.status).toBe(STATUS.FORBIDDEN);
    expect(result.reason).toBe('email_not_allowlisted');
  });

  test('admin gate does NOT run when status is BYPASSED (local dev parity)', async () => {
    // If GOOGLE_CLIENT_ID is unset, we short-circuit to BYPASSED
    // BEFORE the admin gate evaluates. This preserves the local-dev
    // path even if a developer accidentally sets AGENT_REQUIRE_ADMIN
    // locally.
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.AGENT_REQUIRE_ADMIN = 'true';

    const result = await authenticateRequest(reqWithToken('any'), {
      lookupAllowedUser: jest.fn(),
    });

    expect(result).toEqual({ status: STATUS.BYPASSED });
  });
});
