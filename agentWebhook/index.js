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
const {
  getAllowedUserByEmail,
} = require('../src/webUserAllowlistService');

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
