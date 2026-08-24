jest.mock('../services/pendingWritesStore', () => ({
  approvePendingWrite: jest.fn(),
  cancelPendingWrite: jest.fn(),
}));

const {
  approvePendingWrite,
  cancelPendingWrite,
} = require('../services/pendingWritesStore');
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

  test('accepts approve and cancel only', () => {
    expect(
      validatePayload({ writeNonce: 'n1', decision: 'approve' }),
    ).toEqual({ writeNonce: 'n1', decision: 'approve' });
    expect(
      validatePayload({ writeNonce: 'n1', decision: 'cancel' }),
    ).toEqual({ writeNonce: 'n1', decision: 'cancel' });
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
    });
    expect(result.body.status).toBe('cancelled');
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
