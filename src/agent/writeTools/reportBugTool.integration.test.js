jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: (spec) => ({ ...spec }),
}));
jest.mock('../../utils/utils', () => ({
  getDisplayName: jest.fn(() => 'Kilzid'),
  sendErrorMessage: jest.fn(),
  sendMessageToAdmins: jest.fn(),
}));
jest.mock('../notifierBot', () => ({
  getNotifierBot: () => ({ sendMessage: jest.fn().mockResolvedValue() }),
}));
jest.mock('../cacheBootstrap', () => ({
  ensureCacheReady: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../identity', () => ({
  getAgentChatId: jest.fn(() => 42),
}));
jest.mock('../requestContext', () => ({
  getRequestContext: jest.fn(() => ({
    email: 'verified@example.com',
    name: 'Verified User',
  })),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(async () => ({
    lang: 'en',
    fresh: true,
  })),
}));
jest.mock('../../services/pendingWritesStore', () => {
  const intents = new Map();

  return {
    CONSUME_STATUS: {
      CONSUMED: 'consumed',
      NOT_FOUND: 'not_found',
      NOT_APPROVED: 'not_approved',
    },
    stagePendingWrite: jest.fn(async (intent) => {
      intents.set('nonce-report', { ...intent, state: 'staged' });

      return 'nonce-report';
    }),
    approvePendingWrite: jest.fn(async ({ chatId, writeNonce }) => {
      const intent = intents.get(writeNonce);
      if (!intent || intent.chatId !== chatId) {
        return null;
      }
      intent.state = 'approved';

      return intent;
    }),
    consumeApprovedPendingWrite: jest.fn(async ({ chatId, writeNonce }) => {
      const intent = intents.get(writeNonce);
      if (!intent || intent.chatId !== chatId) {
        return { status: 'not_found' };
      }
      if (intent.state !== 'approved') {
        return { status: 'not_approved' };
      }
      intents.delete(writeNonce);

      return { status: 'consumed', intent };
    }),
  };
});

const {
  approvePendingWrite,
} = require('../../services/pendingWritesStore');
const {
  resetReportBugRateLimitsForTests,
} = require('../../services/reportBugService');
const { executeConfirmedWrite } = require('../writeToolHelpers');
const { reportBugTool } = require('./reportBugTool');

beforeEach(() => {
  resetReportBugRateLimitsForTests();
});

test('report_bug runs propose → approval → confirm', async () => {
  const proposed = await reportBugTool.execute({
    message: '  Missing standings  ',
  });
  expect(proposed).toMatchObject({
    status: 'confirmation_required',
    tool: 'report_bug',
    args: { message: 'Missing standings' },
  });

  await approvePendingWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });
  const result = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });

  expect(result).toMatchObject({
    status: 'ok',
    tool: 'report_bug',
  });
});
