// Local dev wrapper for the agent function.
//
// Lets you exercise agentWebhook/index.js end-to-end without installing
// Azure Functions Core Tools (`func`). Loads env from .env (Telegram +
// Azure OpenAI), defaults AGENT_HARDCODED_CHAT_ID to KILZI_CHAT_ID so
// the agent has a user identity, then spins up a Node HTTP server on
// port 7071 mimicking the Azure Functions request/response shape.
//
// Usage:
//   node scripts/dev-agent-server.js
//
// Then point the web frontend at http://localhost:7071/api/agent/copilotkit
// (this is the default in web/src/App.tsx).
//
// This script is dev-only — never deployed.

require('dotenv').config();

const http = require('node:http');
const { KILZI_CHAT_ID } = require('../src/constants');

if (!process.env.AGENT_HARDCODED_CHAT_ID) {
  process.env.AGENT_HARDCODED_CHAT_ID = String(KILZI_CHAT_ID);
}

const handler = require('../agentWebhook');

const PORT = Number(process.env.AGENT_DEV_PORT || 7071);

const PERMISSIVE_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, x-copilotcloud-public-api-key',
  'Access-Control-Max-Age': '86400',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const rawBody = await readBody(req);
    let parsedBody;
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = rawBody;
      }
    }

    const azureReq = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      rawBody: rawBody || undefined,
      body: parsedBody,
    };
    const ctx = {
      res: undefined,
      log: (...args) => {
        // Mirror Azure Functions context.log to stdout
        // eslint-disable-next-line no-console
        console.log('[agent]', ...args);
      },
    };

    await handler(ctx, azureReq);

    const out = ctx.res || { status: 500, body: 'No response from handler' };
    res.statusCode = out.status || 200;
    const headers = { ...PERMISSIVE_CORS, ...(out.headers || {}) };
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    if (out.body !== undefined && out.body !== null) {
      res.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body));
    } else {
      res.end();
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[agent] dev server error:', err);
    res.statusCode = 500;
    for (const [key, value] of Object.entries(PERMISSIVE_CORS)) {
      res.setHeader(key, value);
    }
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[agent] dev server listening on http://localhost:${PORT}/api/agent/copilotkit`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `[agent] AGENT_HARDCODED_CHAT_ID = ${process.env.AGENT_HARDCODED_CHAT_ID}`,
  );
});
