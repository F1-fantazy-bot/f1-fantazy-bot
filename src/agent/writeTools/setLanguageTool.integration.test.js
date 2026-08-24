jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: (spec) => ({ ...spec }),
}));

jest.mock('../../utils/utils', () => ({
  sendErrorMessage: jest.fn(),
}));

jest.mock('../notifierBot', () => ({
  getNotifierBot: () => ({ sendMessage: jest.fn() }),
}));

jest.mock('../cacheBootstrap', () => ({
  ensureCacheReady: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../identity', () => ({
  getAgentChatId: jest.fn(() => 42),
}));

jest.mock('../../services/setLanguageService', () => ({
  setLanguagePreference: jest.fn(),
  isSupportedLanguage: jest.fn((lang) => lang === 'en' || lang === 'he'),
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
      intents.set('nonce-language', { ...intent, state: 'staged' });

      return 'nonce-language';
    }),
    approvePendingWrite: jest.fn(async ({ chatId, writeNonce }) => {
      const intent = intents.get(writeNonce);
      if (!intent || intent.chatId !== chatId) {return null;}
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
  setLanguagePreference,
} = require('../../services/setLanguageService');
const {
  approvePendingWrite,
} = require('../../services/pendingWritesStore');
const {
  executeConfirmedWrite,
} = require('../writeToolHelpers');
const { setLanguageTool } = require('./setLanguageTool');

test('set_language runs the complete propose → human approval → confirm flow', async () => {
  setLanguagePreference.mockResolvedValue({
    status: 'ok',
    summary: 'Language changed to Hebrew.',
    lang: 'he',
    languageName: 'Hebrew',
  });

  const proposed = await setLanguageTool.execute({ lang: 'he' });
  expect(proposed).toMatchObject({
    status: 'confirmation_required',
    tool: 'set_language',
    writeNonce: 'nonce-language',
    args: { lang: 'he' },
  });
  expect(setLanguagePreference).not.toHaveBeenCalled();

  const premature = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });
  expect(premature.status).toBe('forbidden');
  expect(setLanguagePreference).not.toHaveBeenCalled();

  await approvePendingWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });
  const confirmed = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });

  expect(setLanguagePreference).toHaveBeenCalledWith({
    chatId: 42,
    lang: 'he',
  });
  expect(confirmed).toMatchObject({
    status: 'ok',
    tool: 'set_language',
    lang: 'he',
  });
});
