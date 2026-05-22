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

const { __handler: copilotHandler } = require('../src/agent/runtime');
const { authenticateRequest, STATUS } = require('../src/agent/auth');
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
