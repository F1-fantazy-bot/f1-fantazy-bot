// Azure Functions entry point for the CopilotKit agent.
//
// Bridges the Azure Functions v3 (context, req) programming model
// onto CopilotKit's Node HTTP handler, which expects a Web Request
// and returns a Web Response. Both Request and Response are globals
// in modern Node (>= 18) — Azure Functions Node 20 runtime supports
// them natively.
//
// CORS is handled here (not by Azure's siteConfig.cors layer) because
// SWA preview environments need regex-based origin matching, which
// siteConfig.cors.allowedOrigins doesn't support. See src/agent/corsAllowList.js
// and the AGENT_CORS_* env vars wired up in infra/agent-func/azuredeploy.json.
//
// Auth: every POST is gated by `authenticateRequest` (src/agent/auth.js).
// When `GOOGLE_CLIENT_ID` is unset the gate falls through to the legacy
// hardcoded-chatId path (used by local dev + the test slot). When it is
// set, the gate verifies the caller's Google ID token, looks the email
// up in the web allowlist, and runs the downstream handler inside an
// AsyncLocalStorage scope that carries the resolved chatId — every
// agent tool reads it via `getAgentChatId()`.

const { getCopilotRuntimeHandler } = require('../src/agent/runtime');
const { buildCorsHeadersFromEnv } = require('../src/agent/corsAllowList');
const { authenticateRequest, STATUS } = require('../src/agent/auth');
const { runWithRequestContext } = require('../src/agent/requestContext');
const { getAgentChatId } = require('../src/agent/identity');
const { applyWriteDecision } = require('../src/agent/writeDecision');
const { applyWriteProposal } = require('../src/agent/writeProposal');
const {
  getAllowedUserByEmail,
} = require('../src/webUserAllowlistService');
const {
  getFreshLanguagePreference,
} = require('../src/services/setLanguageService');

function getOriginHeader(req) {
  const headers = req.headers || {};

  return headers.origin || headers.Origin || undefined;
}

function buildResponseCorsHeaders(req) {
  return buildCorsHeadersFromEnv(getOriginHeader(req));
}

function buildRequestUrl(req) {
  const protocol = req.headers?.['x-forwarded-proto'] || 'https';
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost';
  const requestUrl = req.url || '/api/agent/copilotkit';

  return new URL(requestUrl, `${protocol}://${host}`);
}

function buildWebRequest(req) {
  const url = buildRequestUrl(req);
  const method = (req.method || 'POST').toUpperCase();
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (typeof value === 'string') {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(','));
    }
  }

  let body;
  if (method !== 'GET' && method !== 'HEAD') {
    if (req.rawBody !== undefined && req.rawBody !== null) {
      body = typeof req.rawBody === 'string' ? req.rawBody : Buffer.from(req.rawBody);
    } else if (req.body !== undefined && req.body !== null) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
  }

  return new Request(url.toString(), { method, headers, body });
}

async function readResponseBody(webResponse) {
  if (!webResponse.body) {
    return '';
  }
  const reader = webResponse.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  // Some streams (especially CopilotKit's GraphQL response) emit
  // string chunks rather than Uint8Array — `webResponse.text()` chokes
  // on those with `Received non-Uint8Array chunk`. Read manually so we
  // accept both.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value instanceof Uint8Array) {
      result += decoder.decode(value, { stream: true });
    } else if (typeof value === 'string') {
      result += value;
    } else if (value !== undefined && value !== null) {
      result += String(value);
    }
  }
  result += decoder.decode();

  return result;
}

async function toAzureResponse(webResponse, req) {
  const body = await readResponseBody(webResponse);
  const headers = buildResponseCorsHeaders(req);
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: webResponse.status,
    headers,
    body,
  };
}

function buildUnauthorizedResponse(req, authResult) {
  const headers = {
    ...buildResponseCorsHeaders(req),
    'Content-Type': 'application/json',
  };
  // Surface a stable machine-readable reason for the frontend (which
  // distinguishes "session expired → re-prompt sign-in" from "this
  // account is not allowed → show a permanent error"). We deliberately
  // do NOT echo back the verifier's free-form `detail` string because
  // it can contain Google library error text that doesn't add value
  // to the user.
  const body = {
    error: 'unauthorized',
    reason: authResult.reason || 'unauthorized',
  };
  if (authResult.status === STATUS.FORBIDDEN && authResult.email) {
    body.email = authResult.email;
  }

  return {
    status: 401,
    headers,
    body: JSON.stringify(body),
  };
}

// Cheap "you're in" probe. Same auth pipeline as the chat endpoint
// but never invokes CopilotKit — used by the frontend AccessVerifier
// to pre-check authorization before mounting the chat tree. Returns:
//   200 { status: 'ok', email, name, mode: 'authenticated' }
//   200 { status: 'ok', mode: 'bypassed' }   (when GOOGLE_CLIENT_ID is unset)
//   401 { error, reason, email? }            (auth failure)
//   405 (non-GET / non-OPTIONS — OPTIONS short-circuits before this)
async function buildWhoamiOkResponse(req, authResult) {
  const headers = {
    ...buildResponseCorsHeaders(req),
    'Content-Type': 'application/json',
  };
  let lang = 'en';
  try {
    const chatId =
      authResult.status === STATUS.OK
        ? authResult.chatId
        : getAgentChatId();
    lang = (await getFreshLanguagePreference(chatId)).lang;
  } catch {
    // Language is presentation metadata; auth already succeeded. Fall back
    // to English rather than turning a transient profile read into login
    // failure.
  }
  const body =
    authResult.status === STATUS.BYPASSED
      ? { status: 'ok', mode: 'bypassed', lang }
      : {
          status: 'ok',
          mode: 'authenticated',
          email: authResult.email,
          name: authResult.name,
          lang,
        };

  return {
    status: 200,
    headers,
    body: JSON.stringify(body),
  };
}

function isWhoamiPath(req) {
  // Exact-match guard (no .endsWith) so we don't accidentally route
  // e.g. /api/agent/copilotkit/whoami here.
  try {
    return buildRequestUrl(req).pathname === '/api/agent/whoami';
  } catch {
    return false;
  }
}

function isWriteDecisionPath(req) {
  try {
    return buildRequestUrl(req).pathname === '/api/agent/write-decision';
  } catch {
    return false;
  }
}

function isWriteProposalPath(req) {
  try {
    return buildRequestUrl(req).pathname === '/api/agent/write-proposal';
  } catch {
    return false;
  }
}

function parseRequestBody(req) {
  if (
    req.body &&
    typeof req.body === 'object' &&
    !Buffer.isBuffer(req.body)
  ) {
    return req.body;
  }

  const raw = req.rawBody ?? req.body;
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw);
  } catch {
    return null;
  }
}

async function buildWriteDecisionResponse(req, chatId) {
  const result = await applyWriteDecision({
    chatId,
    payload: parseRequestBody(req),
  });

  return {
    status: result.status,
    headers: {
      ...buildResponseCorsHeaders(req),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(result.body),
  };
}

async function buildWriteProposalResponse(req, chatId) {
  const result = await applyWriteProposal({
    chatId,
    payload: parseRequestBody(req),
  });

  return {
    status: result.status,
    headers: {
      ...buildResponseCorsHeaders(req),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(result.body),
  };
}

async function runCopilotHandler(req) {
  const handler = getCopilotRuntimeHandler();
  const webRequest = buildWebRequest(req);
  const webResponse = await handler(webRequest);

  if (!webResponse) {
    return {
      status: 500,
      headers: buildResponseCorsHeaders(req),
      body: 'Agent handler returned no response',
    };
  }

  return await toAzureResponse(webResponse, req);
}

module.exports = async function (context, req) {
  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: buildResponseCorsHeaders(req),
    };

    return;
  }

  const whoami = isWhoamiPath(req);
  const writeDecision = isWriteDecisionPath(req);
  const writeProposal = isWriteProposalPath(req);
  if (whoami && (req.method || '').toUpperCase() !== 'GET') {
    context.res = {
      status: 405,
      headers: {
        ...buildResponseCorsHeaders(req),
        Allow: 'GET, OPTIONS',
      },
      body: 'Method Not Allowed',
    };

    return;
  }
  if (writeDecision && (req.method || '').toUpperCase() !== 'POST') {
    context.res = {
      status: 405,
      headers: {
        ...buildResponseCorsHeaders(req),
        Allow: 'POST, OPTIONS',
      },
      body: 'Method Not Allowed',
    };

    return;
  }
  if (writeProposal && (req.method || '').toUpperCase() !== 'POST') {
    context.res = {
      status: 405,
      headers: {
        ...buildResponseCorsHeaders(req),
        Allow: 'POST, OPTIONS',
      },
      body: 'Method Not Allowed',
    };

    return;
  }

  try {
    const authResult = await authenticateRequest(req, {
      lookupAllowedUser: getAllowedUserByEmail,
    });

    if (
      authResult.status === STATUS.UNAUTHORIZED ||
      authResult.status === STATUS.FORBIDDEN
    ) {
      context.log(
        `Agent auth rejected: status=${authResult.status} reason=${authResult.reason}` +
          (authResult.email ? ` email=${authResult.email}` : '') +
          (authResult.detail ? ` detail=${authResult.detail}` : ''),
      );
      context.res = buildUnauthorizedResponse(req, authResult);

      return;
    }

    if (whoami) {
      // Cheap path — never invokes CopilotKit, never establishes the
      // request context. Both `ok` and `bypassed` map to a 200 here.
      context.res = await buildWhoamiOkResponse(req, authResult);

      return;
    }

    if (writeDecision || writeProposal) {
      const buildWriteResponse = writeDecision
        ? buildWriteDecisionResponse
        : buildWriteProposalResponse;
      if (authResult.status === STATUS.OK) {
        context.res = await runWithRequestContext(
          {
            chatId: authResult.chatId,
            email: authResult.email,
            name: authResult.name,
            sub: authResult.sub,
          },
          () => buildWriteResponse(req, authResult.chatId),
        );
      } else {
        // BYPASSED is the local-dev-only path. Resolve the configured
        // hardcoded chat id exactly as the regular tool runtime does.
        context.res = await buildWriteResponse(
          req,
          getAgentChatId(),
        );
      }

      return;
    }

    if (authResult.status === STATUS.OK) {
      context.res = await runWithRequestContext(
        {
          chatId: authResult.chatId,
          email: authResult.email,
          name: authResult.name,
          sub: authResult.sub,
        },
        () => runCopilotHandler(req),
      );

      return;
    }

    // status: BYPASSED — fall through to the legacy hardcoded-chatId path.
    context.res = await runCopilotHandler(req);
  } catch (err) {
    context.log('Agent webhook error:', err && err.stack ? err.stack : err);
    context.res = {
      status: 500,
      headers: buildResponseCorsHeaders(req),
      body: 'Internal Server Error',
    };
  }
};
