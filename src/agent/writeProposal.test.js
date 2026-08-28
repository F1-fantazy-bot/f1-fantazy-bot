jest.mock('./writeToolHelpers', () => ({
  proposeRegisteredWrite: jest.fn(),
}));

const {
  proposeRegisteredWrite,
} = require('./writeToolHelpers');
const {
  applyWriteProposal,
  validatePayload,
} = require('./writeProposal');

beforeEach(() => {
  jest.clearAllMocks();
});

test('accepts only allowlisted direct-proposal tools with object args', () => {
  expect(
    validatePayload({
      tool: 'select_team',
      args: { teamId: 'T2' },
    }),
  ).toEqual({
    tool: 'select_team',
    args: { teamId: 'T2' },
  });
  expect(
    validatePayload({
      tool: 'report_bug',
      args: { message: 'Missing league code: ABC123' },
    }),
  ).toEqual({
    tool: 'report_bug',
    args: { message: 'Missing league code: ABC123' },
  });
  expect(
    validatePayload({
      tool: 'set_language',
      args: { lang: 'he' },
    }),
  ).toBeNull();
  expect(validatePayload({ tool: 'select_team', args: [] })).toBeNull();
});

test('returns the durable confirmation envelope for the authenticated chat', async () => {
  proposeRegisteredWrite.mockResolvedValue({
    status: 'confirmation_required',
    tool: 'select_team',
    writeNonce: 'nonce-team',
    summary: 'Change active team.',
    args: { teamId: 'T2' },
    uiLang: 'en',
  });

  await expect(
    applyWriteProposal({
      chatId: 42,
      payload: {
        tool: 'select_team',
        args: { teamId: 'T2' },
      },
    }),
  ).resolves.toEqual({
    status: 200,
    body: {
      status: 'confirmation_required',
      tool: 'select_team',
      writeNonce: 'nonce-team',
      summary: 'Change active team.',
      args: { teamId: 'T2' },
      uiLang: 'en',
    },
  });
  expect(proposeRegisteredWrite).toHaveBeenCalledWith({
    chatId: 42,
    tool: 'select_team',
    args: { teamId: 'T2' },
  });
});

test('rejects unsupported tools without invoking a proposal', async () => {
  await expect(
    applyWriteProposal({
      chatId: 42,
      payload: {
        tool: 'set_language',
        args: { lang: 'he' },
      },
    }),
  ).resolves.toMatchObject({
    status: 400,
    body: { status: 'invalid_input' },
  });
  expect(proposeRegisteredWrite).not.toHaveBeenCalled();
});
