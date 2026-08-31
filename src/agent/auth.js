// Google ID token verification + allowlist-aware request authentication
// for the web-chat agent.
//
// Pipeline:
//   1. Frontend signs in via Google Identity Services → receives an ID
//      token (JWT). The token's `aud` claim matches GOOGLE_CLIENT_ID,
//      `iss` is `https://accounts.google.com` (or `accounts.google.com`),
//      `email` is the signed-in user, and `email_verified` is `true`.
//   2. Frontend attaches `Authorization: Bearer <id_token>` to every
//      CopilotKit POST.
//   3. `agentWebhook/index.js` calls `authenticateRequest(req)`. We
//      verify the token via google-auth-library, look the email up in
//      the web allowlist, and return a status-tagged result. The
//      webhook maps statuses to HTTP codes.
//
// We deliberately NEVER throw out of `authenticateRequest`. Throws
// would either crash the function or leak a stack trace to the user;
// instead every failure mode resolves to a status-tagged object that
// the webhook turns into a clean 401 + JSON body.
//
// Bypass mode: when `GOOGLE_CLIENT_ID` is unset/empty, auth is
// disabled. This is the local-dev path only — every Azure-deployed
// slot (production AND test) sets GOOGLE_CLIENT_ID and runs the gate.
//
// Admin-only mode: when `AGENT_REQUIRE_ADMIN === 'true'`, an additional
// post-allowlist check enforces that the resolved chatId is one of the
// admin chatIds (KILZI / DORSE — same source `isAdminMessage` uses).
// Non-admins resolve to `FORBIDDEN` with reason `not_admin`. This is
// the gate that locks the PR-preview / test-slot agent down to the two
// repo owners while keeping production open to the wider
// WebUserAllowlist. The env var is intentionally not a CHAT_ID list:
// the source of truth for "admin" stays in `src/constants.js` so the
// Telegram bot and the agent stay aligned.

const { isAdminChatId } = require('../adminIdentity');

const STATUS = {
  OK: 'ok',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  BYPASSED: 'bypassed',
};

const VALID_ISSUERS = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
]);

let cachedOAuth2Client = null;

function getOAuth2Client() {
  if (cachedOAuth2Client) {
    return cachedOAuth2Client;
  }

  // Lazy require so tests + local dev paths can run without the package
  // installed (this module is also imported transitively from the
  // Telegram bot's test suite via the admin commands).
  // eslint-disable-next-line global-require
  const { OAuth2Client } = require('google-auth-library');
  cachedOAuth2Client = new OAuth2Client();

  return cachedOAuth2Client;
}

function resetOAuth2ClientForTests() {
  cachedOAuth2Client = null;
}

function extractBearerToken(req) {
  const headers = (req && req.headers) || {};
  const raw =
    headers.authorization ||
    headers.Authorization ||
    headers.AUTHORIZATION ||
    null;

  if (typeof raw !== 'string') {
    return null;
  }

  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1].trim();

  return token.length > 0 ? token : null;
}

/**
 * Verify a Google ID token and return the relevant payload fields.
 * Throws on any verification failure (caller catches).
 *
 * @param {string} token
 * @param {string} audience - The OAuth client id (GOOGLE_CLIENT_ID).
 * @returns {Promise<{email: string, sub: string, name?: string, picture?: string, exp?: number}>}
 */
async function verifyGoogleIdToken(token, audience) {
  if (!audience) {
    throw new Error('audience (GOOGLE_CLIENT_ID) is required');
  }

  const client = getOAuth2Client();
  const ticket = await client.verifyIdToken({ idToken: token, audience });
  const payload = ticket && ticket.getPayload ? ticket.getPayload() : null;

  if (!payload) {
    throw new Error('Token verification returned no payload');
  }

  if (!payload.iss || !VALID_ISSUERS.has(payload.iss)) {
    throw new Error(`Unexpected token issuer: ${payload.iss}`);
  }

  if (!payload.email || typeof payload.email !== 'string') {
    throw new Error('Token payload missing email claim');
  }

  if (payload.email_verified === false) {
    throw new Error('Token email is not verified');
  }

  return {
    email: payload.email,
    sub: payload.sub,
    name: payload.name,
    picture: payload.picture,
    exp: payload.exp,
  };
}

/**
 * Authenticate an incoming agent request.
 *
 * Returns one of:
 *   { status: 'bypassed' } — auth disabled because GOOGLE_CLIENT_ID is
 *     unset; webhook should fall through to the legacy hardcoded chatId
 *     path. Used by local dev only (no Azure-deployed slot is bypassed
 *     anymore — both production and test set GOOGLE_CLIENT_ID).
 *   { status: 'ok', email, chatId, name?, sub? } — token verified,
 *     email is in the allowlist, AND (if `AGENT_REQUIRE_ADMIN === 'true'`)
 *     the resolved chatId is one of the admin chatIds. Webhook should
 *     run with this chatId bound to the request context.
 *   { status: 'unauthorized', reason } — missing/malformed/invalid
 *     bearer token. Map to 401.
 *   { status: 'forbidden', reason, email? } — token is valid but the
 *     email is not in the allowlist, the allowlist row has no chatId,
 *     OR (admin-only mode) the chatId is not an admin. Map to 401 too —
 *     we deliberately do NOT distinguish "you signed in OK but you're
 *     not authorized" from "your token is bad" on the wire to avoid
 *     leaking allowlist membership; only the user-facing `reason`
 *     differs.
 *
 * @param {Object} req - Azure Functions request-like { headers, ... }.
 * @param {Object} options
 * @param {() => Promise<{email: string, chatId?: string}|null>} options.lookupAllowedUser - Async lookup by email.
 * @param {string|undefined} [options.clientId] - Override env GOOGLE_CLIENT_ID (used by tests).
 * @param {boolean|undefined} [options.requireAdmin] - Override env AGENT_REQUIRE_ADMIN (used by tests). When true, non-admin chatIds resolve to FORBIDDEN with reason `not_admin`.
 * @param {(token: string, audience: string) => Promise<{email: string, sub?: string, name?: string}>} [options.verifyToken] - Inject the verifier for tests.
 * @returns {Promise<Object>}
 */
async function authenticateRequest(req, options) {
  const clientId =
    options && options.clientId !== undefined
      ? options.clientId
      : process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return { status: STATUS.BYPASSED };
  }

  const requireAdmin =
    options && options.requireAdmin !== undefined
      ? Boolean(options.requireAdmin)
      : process.env.AGENT_REQUIRE_ADMIN === 'true';

  const token = extractBearerToken(req);
  if (!token) {
    return {
      status: STATUS.UNAUTHORIZED,
      reason: 'missing_or_malformed_authorization_header',
    };
  }

  const verifier =
    (options && options.verifyToken) || verifyGoogleIdToken;

  let claims;
  try {
    claims = await verifier(token, clientId);
  } catch (err) {
    return {
      status: STATUS.UNAUTHORIZED,
      reason: 'invalid_token',
      detail: err && err.message ? err.message : String(err),
    };
  }

  const lookup = options && options.lookupAllowedUser;
  if (typeof lookup !== 'function') {
    throw new Error('authenticateRequest requires options.lookupAllowedUser');
  }

  let row;
  try {
    row = await lookup(claims.email);
  } catch (err) {
    // Storage outage — bubble the error up via "unauthorized" so the
    // webhook returns 401 and the frontend prompts a retry, but log
    // the underlying detail so on-call can correlate.
    return {
      status: STATUS.UNAUTHORIZED,
      reason: 'allowlist_lookup_failed',
      detail: err && err.message ? err.message : String(err),
    };
  }

  if (!row) {
    return {
      status: STATUS.FORBIDDEN,
      reason: 'email_not_allowlisted',
      email: claims.email,
    };
  }

  const chatIdRaw = row.chatId;
  const chatIdNum = Number.parseInt(chatIdRaw, 10);
  if (!Number.isFinite(chatIdNum)) {
    return {
      status: STATUS.FORBIDDEN,
      reason: 'allowlist_entry_missing_chat_id',
      email: claims.email,
    };
  }

  // Admin-only gate (test slot / PR previews). Runs LAST so the
  // checks above (allowlist membership, valid chat-id mapping) still
  // run against every signed-in caller — admins included. That keeps
  // the failure mode of "I'm an admin but my allowlist row is bad"
  // visible and debuggable.
  if (requireAdmin && !isAdminChatId(chatIdNum)) {
    return {
      status: STATUS.FORBIDDEN,
      reason: 'not_admin',
      email: claims.email,
    };
  }

  return {
    status: STATUS.OK,
    email: claims.email,
    chatId: chatIdNum,
    name: claims.name,
    sub: claims.sub,
  };
}

module.exports = {
  STATUS,
  extractBearerToken,
  verifyGoogleIdToken,
  authenticateRequest,
  isAdminChatId,
  resetOAuth2ClientForTests,
};
