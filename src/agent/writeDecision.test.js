jest.mock('../services/pendingWritesStore', () => ({
  approvePendingWrite: jest.fn(),
  cancelPendingWrite: jest.fn(),
}));
jest.mock('./writeToolHelpers', () => ({
  executeConfirmedWrite: jest.fn(),
}));

const {
  approvePendingWrite,
  cancelPendingWrite,
} = require('../services/pendingWritesStore');
const {
  executeConfirmedWrite,
} = require('./writeToolHelpers');
const { applyWriteDecision, validatePayload } = require('./writeDecision');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('validatePayload', () => {
  test.each([
    null,
    {},
    { writeNonce: '', decision: 'approve' },
    { writeNonce: 'n1', decision: 'yes' },
  ])('rejects malformed payload %#', (payload) => {
    expect(validatePayload(payload)).toBeNull();
  });

  test('accepts supported decision values only', () => {
    expect(
      validatePayload({ writeNonce: 'n1', decision: 'approve' }),
    ).toEqual({ writeNonce: 'n1', decision: 'approve' });
    expect(
      validatePayload({ writeNonce: 'n1', decision: 'cancel' }),
    ).toEqual({ writeNonce: 'n1', decision: 'cancel' });
    expect(
      validatePayload({
        writeNonce: 'n1',
        decision: 'approve_and_confirm',
      }),
    ).toEqual({
      writeNonce: 'n1',
      decision: 'approve_and_confirm',
    });
    expect(
      validatePayload({ writeNonce: 'n1', decision: 'revoke' }),
    ).toEqual({ writeNonce: 'n1', decision: 'revoke' });
  });
});

describe('applyWriteDecision', () => {
  test('approves an intent for the authenticated chatId', async () => {
    approvePendingWrite.mockResolvedValue({ tool: 'set_language' });

    const result = await applyWriteDecision({
      chatId: 42,
      payload: { writeNonce: 'n1', decision: 'approve' },
    });

    expect(approvePendingWrite).toHaveBeenCalledWith({
      chatId: 42,
      writeNonce: 'n1',
      expectedTools: undefined,
    });
    expect(result).toEqual({
      status: 200,
      body: { status: 'approved', writeNonce: 'n1' },
    });
  });

  test('cancels and deletes an intent for the authenticated chatId', async () => {
    cancelPendingWrite.mockResolvedValue(true);

    const result = await applyWriteDecision({
      chatId: 42,
      payload: { writeNonce: 'n1', decision: 'cancel' },
    });

    expect(cancelPendingWrite).toHaveBeenCalledWith({
      chatId: 42,
      writeNonce: 'n1',
      requireExisting: false,
    });
    expect(result.body.status).toBe('cancelled');
  });

  test.each(['select_team', 'follow_team'])(
    'directly confirms an approved %s intent',
    async (tool) => {
      approvePendingWrite.mockResolvedValue({ tool });
    executeConfirmedWrite.mockResolvedValue({
      status: 'ok',
        tool,
        summary: 'Write completed.',
    });

    const result = await applyWriteDecision({
      chatId: 42,
      payload: {
        writeNonce: 'n1',
        decision: 'approve_and_confirm',
      },
    });

    expect(executeConfirmedWrite).toHaveBeenCalledWith({
      chatId: 42,
      writeNonce: 'n1',
    });
    expect(approvePendingWrite).toHaveBeenCalledWith({
      chatId: 42,
      writeNonce: 'n1',
        expectedTools: ['select_team', 'follow_team'],
    });
    expect(result).toEqual({
      status: 200,
      body: {
        status: 'ok',
          tool,
          summary: 'Write completed.',
      },
    });
    },
  );

  test('strict revocation reports uncertainty when the nonce was consumed', async () => {
    cancelPendingWrite.mockResolvedValue(false);

    const result = await applyWriteDecision({
      chatId: 42,
      payload: { writeNonce: 'n1', decision: 'revoke' },
    });

    expect(cancelPendingWrite).toHaveBeenCalledWith({
      chatId: 42,
      writeNonce: 'n1',
      requireExisting: true,
    });
    expect(result).toMatchObject({
      status: 409,
      body: { status: 'uncertain' },
    });
  });

  test('revokes direct confirmation for unsupported tools', async () => {
    approvePendingWrite.mockResolvedValue(null);

    const result = await applyWriteDecision({
      chatId: 42,
      payload: {
        writeNonce: 'n1',
        decision: 'approve_and_confirm',
      },
    });

    expect(approvePendingWrite).toHaveBeenCalledWith({
      chatId: 42,
      writeNonce: 'n1',
      expectedTools: ['select_team', 'follow_team'],
    });
    expect(cancelPendingWrite).not.toHaveBeenCalled();
    expect(executeConfirmedWrite).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 404,
      body: { status: 'not_found' },
    });
  });

  test('returns not_found when the nonce is expired, missing, or belongs to another chat', async () => {
    approvePendingWrite.mockResolvedValue(null);

    const result = await applyWriteDecision({
      chatId: 42,
      payload: { writeNonce: 'foreign', decision: 'approve' },
    });

    expect(result.status).toBe(404);
    expect(result.body.status).toBe('not_found');
  });

  test('rejects invalid input without touching storage', async () => {
    const result = await applyWriteDecision({
      chatId: 42,
      payload: { writeNonce: 'n1', decision: 'maybe' },
    });

    expect(result.status).toBe(400);
    expect(approvePendingWrite).not.toHaveBeenCalled();
    expect(cancelPendingWrite).not.toHaveBeenCalled();
  });
});
