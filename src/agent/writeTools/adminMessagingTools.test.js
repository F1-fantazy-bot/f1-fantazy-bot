jest.mock('../adminAuthorization', () => ({
  defineAdminWriteTool: jest.fn((spec) => spec),
}));
jest.mock('../../services/adminMessagingService', () => ({
  STATUS: {
    OK: 'ok',
    INVALID_INPUT: 'invalid_input',
    NOT_FOUND: 'not_found',
    CHANGED: 'changed',
    FAILED: 'failed',
  },
  inspectAgentMessage: jest.fn(),
  createAdminMessagingService: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));
jest.mock('../notifierBot', () => ({
  getNotifierBot: jest.fn(() => ({})),
}));
jest.mock('../requestContext', () => ({
  getRequestContext: jest.fn(),
}));
jest.mock('../../utils/utils', () => ({ sendLogMessage: jest.fn() }));
jest.mock('../writeToolHelpers', () => ({
  WRITE_RESULT_STATUSES: {
    INVALID_INPUT: 'invalid_input',
    NOT_FOUND: 'not_found',
  },
}));

const {
  inspectAgentMessage,
  createAdminMessagingService,
} = require('../../services/adminMessagingService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  sendUserMessageTool,
  broadcastMessageTool,
  auditMessage,
} = require('./adminMessagingTools');

const service = {
  inspectRecipient: jest.fn(),
  inspectAudience: jest.fn(),
  buildDirectSummary: jest.fn(),
  buildBroadcastSummary: jest.fn(),
  sendDirect: jest.fn(),
  broadcast: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  createAdminMessagingService.mockReturnValue(service);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'en' });
  inspectAgentMessage.mockReturnValue({
    status: 'ok',
    message: 'Hello racers',
  });
});

test('direct proposal stages only a fresh canonical recipient and normalized text', async () => {
  service.inspectRecipient.mockResolvedValue({
    status: 'ok',
    targetChatId: '7',
    recipient: { chatId: '7', chatName: 'Fast Driver' },
  });
  service.buildDirectSummary.mockReturnValue('Preview direct message.');

  await expect(
    sendUserMessageTool.validate({
      chatId: 42,
      args: { chatId: ' 7 ', message: ' Hello racers ' },
    }),
  ).resolves.toEqual({
    args: { chatId: '7', message: 'Hello racers' },
    summary: 'Preview direct message.',
  });
});

test('direct proposal rejects invalid text and never looks up a recipient', async () => {
  inspectAgentMessage.mockReturnValue({
    status: 'invalid_input',
    summary: 'Message too large.',
  });

  await expect(
    sendUserMessageTool.validate({
      chatId: 42,
      args: { chatId: '7', message: 'Hello racers' },
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    tool: 'send_user_message',
  });
  expect(service.inspectRecipient).not.toHaveBeenCalled();
});

test('broadcast proposal stages an audience fingerprint and a count-warning preview', async () => {
  service.inspectAudience.mockResolvedValue({
    status: 'ok',
    audience: { count: 23, fingerprint: 'fingerprint-23' },
  });
  service.buildBroadcastSummary.mockReturnValue('Broadcast to 23 users.');

  await expect(
    broadcastMessageTool.validate({
      chatId: 42,
      args: { message: ' Hello racers ' },
    }),
  ).resolves.toEqual({
    args: { message: 'Hello racers' },
    intentArgs: {
      message: 'Hello racers',
      expectedAudienceFingerprint: 'fingerprint-23',
    },
    summary: 'Broadcast to 23 users.',
  });
});

test('broadcast returns no-recipient results before confirmation', async () => {
  service.inspectAudience.mockResolvedValue({
    status: 'not_found',
    summary: 'No recipients.',
  });

  await expect(
    broadcastMessageTool.validate({
      chatId: 42,
      args: { message: 'Hello racers' },
    }),
  ).resolves.toMatchObject({
    status: 'not_found',
    tool: 'broadcast_message',
  });
});

test('commit strips internal delivery errors and maps stale audiences safely', async () => {
  service.sendDirect.mockResolvedValue({
    status: 'failed',
    summary: 'Unable to deliver.',
    errorMessage: 'provider token should never reach chat',
    recipient: {
      chatId: '7',
      chatName: 'Fast Driver',
      lang: 'he',
      lastSeen: 'private registry field',
    },
  });
  await expect(
    sendUserMessageTool.commit({
      chatId: 42,
      args: { chatId: '7', message: 'Hello racers' },
    }),
  ).resolves.toEqual({
    status: 'failed',
    tool: 'send_user_message',
    summary: 'Unable to deliver.',
    recipient: { chatId: '7', name: 'Fast Driver' },
  });

  service.broadcast.mockResolvedValue({
    status: 'changed',
    summary: 'Audience changed.',
    failureLabels: ['not exposed'],
    audience: { count: 4, fingerprint: 'not exposed' },
  });
  await expect(
    broadcastMessageTool.commit({
      chatId: 42,
      args: { message: 'Hello racers', expectedAudienceFingerprint: 'old' },
    }),
  ).resolves.toEqual({
    status: 'invalid_input',
    tool: 'broadcast_message',
    summary: 'Audience changed.',
    audience: { count: 4 },
  });
});

test('audit correlation includes actor, target/audience, and outcome without message content', () => {
  expect(
    auditMessage({
      action: 'broadcast_message',
      actorChatId: 42,
      audienceCount: 23,
      sent: 20,
      failed: 3,
      outcome: 'partial',
    }),
  ).toContain('actor=42 audience=23 outcome=partial sent=20 failed=3');
});
