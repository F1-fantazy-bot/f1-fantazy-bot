// Integration-shaped test for agentWebhook/index.js. We mock the heavy
// dependencies (CopilotKit runtime + allowlist storage) so the test runs
// in milliseconds, but exercise the real auth → context wiring.

jest.mock('../src/agent/runtime', () => {
  const handler = jest.fn();

  return {
    getCopilotRuntimeHandler: () => handler,
    __handler: handler,
  };
});

jest.mock('../src/webUserAllowlistService', () => ({
  getAllowedUserByEmail: jest.fn(),
}));

jest.mock('../src/agent/auth', () => {
  const actual = jest.requireActual('../src/agent/auth');

  return {
    ...actual,
    authenticateRequest: jest.fn(),
  };
});

jest.mock('../src/agent/writeDecision', () => ({
  applyWriteDecision: jest.fn(),
}));

jest.mock('../src/agent/identity', () => ({
  getAgentChatId: jest.fn(() => 999),
}));

const { __handler: copilotHandler } = require('../src/agent/runtime');
const { authenticateRequest, STATUS } = require('../src/agent/auth');
const { applyWriteDecision } = require('../src/agent/writeDecision');
const { getAgentChatId } = require('../src/agent/identity');
const { getRequestContext } = require('../src/agent/requestContext');
const webhook = require('./index');

function makeWebResponse({ status = 200, body = 'ok', contentType = 'text/plain' } = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType },
  });
}

function makeReq({ method = 'POST', headers = {}, body, url = '/api/agent/copilotkit' } = {}) {
  return {
    method,
    url,
    headers: { host: 'localhost:7071', ...headers },
    rawBody: typeof body === 'string' ? body : body !== undefined ? JSON.stringify(body) : undefined,
    body,
  };
}

function makeWhoamiReq(overrides = {}) {
  return makeReq({
    method: 'GET',
    url: '/api/agent/whoami',
    ...overrides,
  });
}

function makeWriteDecisionReq(overrides = {}) {
  return makeReq({
    method: 'POST',
    url: '/api/agent/write-decision',
    body: { writeNonce: 'n1', decision: 'approve' },
    ...overrides,
  });
}

function makeCtx() {
  const logs = [];

  return {
    logs,
    res: undefined,
    log: (...args) => logs.push(args.join(' ')),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  copilotHandler.mockReset();
  authenticateRequest.mockReset();
  applyWriteDecision.mockReset();
  getAgentChatId.mockClear();
});

describe('agentWebhook', () => {
  test('OPTIONS returns 204 with CORS headers and does NOT call auth', async () => {
    const ctx = makeCtx();
    const req = makeReq({ method: 'OPTIONS' });

    await webhook(ctx, req);

    expect(ctx.res.status).toBe(204);
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(copilotHandler).not.toHaveBeenCalled();
  });

  test('OK auth result runs copilot handler inside a request context carrying chatId/email', async () => {
    authenticateRequest.mockResolvedValueOnce({
      status: STATUS.OK,
      chatId: 12345,
      email: 'foo@example.com',
      name: 'Foo',
      sub: 's1',
    });

    let observedContext = null;
    copilotHandler.mockImplementationOnce(async () => {
      observedContext = getRequestContext();

      return makeWebResponse({ status: 200, body: 'agent-ok' });
    });

    const ctx = makeCtx();
    await webhook(ctx, makeReq({ body: { hello: 'world' } }));

    expect(observedContext).toEqual({
      chatId: 12345,
      email: 'foo@example.com',
      name: 'Foo',
      sub: 's1',
    });
    expect(ctx.res.status).toBe(200);
    expect(ctx.res.body).toBe('agent-ok');
  });

  test('BYPASSED auth result runs copilot handler without a request context', async () => {
    authenticateRequest.mockResolvedValueOnce({ status: STATUS.BYPASSED });

    let observedContext = 'sentinel';
    copilotHandler.mockImplementationOnce(async () => {
      observedContext = getRequestContext();

      return makeWebResponse({ status: 200, body: 'bypassed-ok' });
    });

    const ctx = makeCtx();
    await webhook(ctx, makeReq({ body: { hello: 'world' } }));

    expect(observedContext).toBeUndefined();
    expect(ctx.res.status).toBe(200);
    expect(ctx.res.body).toBe('bypassed-ok');
  });

  test('UNAUTHORIZED produces 401 + JSON body and never calls the runtime', async () => {
    authenticateRequest.mockResolvedValueOnce({
      status: STATUS.UNAUTHORIZED,
      reason: 'invalid_token',
      detail: 'Token expired',
    });

    const ctx = makeCtx();
    await webhook(ctx, makeReq({ body: { hello: 'world' } }));

    expect(copilotHandler).not.toHaveBeenCalled();
    expect(ctx.res.status).toBe(401);
    expect(ctx.res.headers['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(ctx.res.body);
    expect(parsed).toEqual({ error: 'unauthorized', reason: 'invalid_token' });
    // We do NOT leak the verifier's `detail` to the wire.
    expect(ctx.res.body).not.toContain('Token expired');
  });

  test('FORBIDDEN produces 401 + email in the body so the UI can render "not allowlisted"', async () => {
    authenticateRequest.mockResolvedValueOnce({
      status: STATUS.FORBIDDEN,
      reason: 'email_not_allowlisted',
      email: 'foo@example.com',
    });

    const ctx = makeCtx();
    await webhook(ctx, makeReq({ body: { hello: 'world' } }));

    expect(copilotHandler).not.toHaveBeenCalled();
    expect(ctx.res.status).toBe(401);
    const parsed = JSON.parse(ctx.res.body);
    expect(parsed).toEqual({
      error: 'unauthorized',
      reason: 'email_not_allowlisted',
      email: 'foo@example.com',
    });
  });

  test('handler throw is caught and returned as a 500', async () => {
    authenticateRequest.mockResolvedValueOnce({ status: STATUS.BYPASSED });
    copilotHandler.mockImplementationOnce(async () => {
      throw new Error('boom');
    });

    const ctx = makeCtx();
    await webhook(ctx, makeReq({ body: { hello: 'world' } }));

    expect(ctx.res.status).toBe(500);
  });
});

describe('agentWebhook → /whoami', () => {
  test('GET whoami with OK auth result returns 200 + authenticated body and never invokes copilot', async () => {
    authenticateRequest.mockResolvedValueOnce({
      status: STATUS.OK,
      chatId: 12345,
      email: 'foo@example.com',
      name: 'Foo',
      sub: 's1',
    });

    const ctx = makeCtx();
    await webhook(ctx, makeWhoamiReq());

    expect(copilotHandler).not.toHaveBeenCalled();
    expect(ctx.res.status).toBe(200);
    expect(ctx.res.headers['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(ctx.res.body);
    expect(parsed).toEqual({
      status: 'ok',
      mode: 'authenticated',
      email: 'foo@example.com',
      name: 'Foo',
    });
  });

  test('GET whoami in BYPASSED mode returns 200 + bypassed body', async () => {
    authenticateRequest.mockResolvedValueOnce({ status: STATUS.BYPASSED });

    const ctx = makeCtx();
    await webhook(ctx, makeWhoamiReq());

    expect(copilotHandler).not.toHaveBeenCalled();
    expect(ctx.res.status).toBe(200);
    const parsed = JSON.parse(ctx.res.body);
    expect(parsed).toEqual({ status: 'ok', mode: 'bypassed' });
  });

  test('GET whoami with UNAUTHORIZED returns 401 + JSON body', async () => {
    authenticateRequest.mockResolvedValueOnce({
      status: STATUS.UNAUTHORIZED,
      reason: 'invalid_token',
      detail: 'Token expired',
    });

    const ctx = makeCtx();
    await webhook(ctx, makeWhoamiReq());

    expect(copilotHandler).not.toHaveBeenCalled();
    expect(ctx.res.status).toBe(401);
    const parsed = JSON.parse(ctx.res.body);
    expect(parsed).toEqual({ error: 'unauthorized', reason: 'invalid_token' });
  });

  test('GET whoami with FORBIDDEN returns 401 + email so the UI can render "not allowlisted"', async () => {
    authenticateRequest.mockResolvedValueOnce({
      status: STATUS.FORBIDDEN,
      reason: 'email_not_allowlisted',
      email: 'foo@example.com',
    });

    const ctx = makeCtx();
    await webhook(ctx, makeWhoamiReq());

    expect(copilotHandler).not.toHaveBeenCalled();
    expect(ctx.res.status).toBe(401);
    const parsed = JSON.parse(ctx.res.body);
    expect(parsed).toEqual({
      error: 'unauthorized',
      reason: 'email_not_allowlisted',
      email: 'foo@example.com',
    });
  });

  test('POST /whoami returns 405 with Allow header and never calls auth or runtime', async () => {
    const ctx = makeCtx();
    await webhook(ctx, makeWhoamiReq({ method: 'POST', body: {} }));

    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(copilotHandler).not.toHaveBeenCalled();
    expect(ctx.res.status).toBe(405);
    expect(ctx.res.headers.Allow).toBe('GET, OPTIONS');
  });

  test('OPTIONS /whoami still returns 204 with CORS headers (preflight)', async () => {
    const ctx = makeCtx();
    await webhook(ctx, makeWhoamiReq({ method: 'OPTIONS' }));

    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(copilotHandler).not.toHaveBeenCalled();
    expect(ctx.res.status).toBe(204);
  });

  test('"whoami" suffix on a different path does NOT route here (exact-match guard)', async () => {
    authenticateRequest.mockResolvedValueOnce({ status: STATUS.BYPASSED });
    copilotHandler.mockResolvedValueOnce(
      new Response('agent-ok', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const ctx = makeCtx();
    await webhook(
      ctx,
      makeReq({
        method: 'POST',
        url: '/api/agent/copilotkit/whoami',
        body: {},
      }),
    );

    // Must go through the copilot runtime, not the whoami short-circuit
    expect(copilotHandler).toHaveBeenCalledTimes(1);
    expect(ctx.res.status).toBe(200);
    expect(ctx.res.body).toBe('agent-ok');
  });
});

describe('agentWebhook → /write-decision', () => {
  test('authenticated approval uses the allowlisted chatId and never invokes CopilotKit', async () => {
    authenticateRequest.mockResolvedValueOnce({
      status: STATUS.OK,
      chatId: 12345,
      email: 'foo@example.com',
      name: 'Foo',
      sub: 's1',
    });
    applyWriteDecision.mockResolvedValueOnce({
      status: 200,
      body: { status: 'approved', writeNonce: 'n1' },
    });

    const ctx = makeCtx();
    await webhook(ctx, makeWriteDecisionReq());

    expect(applyWriteDecision).toHaveBeenCalledWith({
      chatId: 12345,
      payload: { writeNonce: 'n1', decision: 'approve' },
    });
    expect(copilotHandler).not.toHaveBeenCalled();
    expect(ctx.res.status).toBe(200);
    expect(JSON.parse(ctx.res.body)).toEqual({
      status: 'approved',
      writeNonce: 'n1',
    });
  });

  test('bypassed local-dev decision uses the configured fallback chatId', async () => {
    authenticateRequest.mockResolvedValueOnce({ status: STATUS.BYPASSED });
    getAgentChatId.mockReturnValueOnce(999);
    applyWriteDecision.mockResolvedValueOnce({
      status: 200,
      body: { status: 'cancelled', writeNonce: 'n1' },
    });

    const ctx = makeCtx();
    await webhook(
      ctx,
      makeWriteDecisionReq({
        body: { writeNonce: 'n1', decision: 'cancel' },
      }),
    );

    expect(applyWriteDecision).toHaveBeenCalledWith({
      chatId: 999,
      payload: { writeNonce: 'n1', decision: 'cancel' },
    });
    expect(ctx.res.status).toBe(200);
  });

  test('auth rejection happens before the decision handler', async () => {
    authenticateRequest.mockResolvedValueOnce({
      status: STATUS.UNAUTHORIZED,
      reason: 'invalid_token',
    });

    const ctx = makeCtx();
    await webhook(ctx, makeWriteDecisionReq());

    expect(ctx.res.status).toBe(401);
    expect(applyWriteDecision).not.toHaveBeenCalled();
  });

  test('GET returns 405 before auth and advertises POST', async () => {
    const ctx = makeCtx();
    await webhook(
      ctx,
      makeWriteDecisionReq({ method: 'GET', body: undefined }),
    );

    expect(ctx.res.status).toBe(405);
    expect(ctx.res.headers.Allow).toBe('POST, OPTIONS');
    expect(authenticateRequest).not.toHaveBeenCalled();
    expect(applyWriteDecision).not.toHaveBeenCalled();
  });
});
