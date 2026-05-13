// Azure Functions entry point for the CopilotKit agent.
//
// Bridges the Azure Functions v3 (context, req) programming model
// onto CopilotKit's Node HTTP handler, which expects a Web Request
// and returns a Web Response. Both Request and Response are globals
// in modern Node (>= 18) — Azure Functions Node 20 runtime supports
// them natively.
//
// Phase 1 simplifications:
//   - No `await bot.cacheReady` here. The only tool wired in Phase 1
//     is `get_next_races`, which fetches the Ergast/Jolpica API
//     directly and needs no in-memory caches. Phase 2 introduces
//     cache-dependent tools (best teams) and will add the cache
//     bootstrap at that point.
//   - Permissive CORS for development. Phase 6 locks this down to
//     the production Static Web App origin only.

const { getCopilotRuntimeHandler } = require('../src/agent/runtime');

const DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-copilotcloud-public-api-key',
  'Access-Control-Max-Age': '86400',
};

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

async function toAzureResponse(webResponse) {
  const body = await readResponseBody(webResponse);
  const headers = { ...DEFAULT_CORS_HEADERS };
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: webResponse.status,
    headers,
    body,
  };
}

module.exports = async function (context, req) {
  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: DEFAULT_CORS_HEADERS,
    };

    return;
  }

  try {
    const handler = getCopilotRuntimeHandler();
    const webRequest = buildWebRequest(req);
    const webResponse = await handler(webRequest);

    if (!webResponse) {
      context.res = {
        status: 500,
        headers: DEFAULT_CORS_HEADERS,
        body: 'Agent handler returned no response',
      };

      return;
    }

    context.res = await toAzureResponse(webResponse);
  } catch (err) {
    context.log('Agent webhook error:', err && err.stack ? err.stack : err);
    context.res = {
      status: 500,
      headers: DEFAULT_CORS_HEADERS,
      body: 'Internal Server Error',
    };
  }
};
