jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: (spec) => ({ ...spec }),
}));

jest.mock('../../utils/utils', () => ({ sendErrorMessage: jest.fn() }));
jest.mock('../cacheBootstrap', () => ({
  ensureCacheReady: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../identity', () => ({ getAgentChatId: jest.fn(() => 42) }));
jest.mock('../../i18n', () => ({
  getLanguage: jest.fn(() => 'en'),
  t: jest.fn((message, _chatId, params = {}) =>
    Object.entries(params).reduce(
      (text, [key, value]) => text.replaceAll(`{${key}}`, value),
      message,
    ),
  ),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(async () => ({ lang: 'en', fresh: true })),
}));

const mockInspect = jest.fn();
const mockReset = jest.fn();
jest.mock('../../services/resetUserDataService', () => ({
  STATUS: { OK: 'ok', CHANGED: 'changed' },
  createResetUserDataService: jest.fn(() => ({
    inspect: mockInspect,
    reset: mockReset,
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
      intents.set('nonce-reset', { ...intent, state: 'staged' });

      return 'nonce-reset';
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

const { approvePendingWrite } = require('../../services/pendingWritesStore');
const { executeConfirmedWrite } = require('../writeToolHelpers');
const { resetUserDataTool } = require('./resetUserDataTool');

beforeEach(() => {
  jest.clearAllMocks();
  mockInspect.mockResolvedValue({
    hasResettableData: true,
    fingerprint: 'fresh-fingerprint',
    impact: {
      teamBlobs: 1,
      selectedTeam: true,
      rankingPreferences: 1,
      selectedBestTeams: 1,
      chipPreferences: 1,
      driverProjectionOverride: true,
      constructorProjectionOverride: true,
    },
  });
  mockReset.mockResolvedValue({
    status: 'ok',
    impact: {
      teamBlobs: 1,
      selectedTeam: true,
      rankingPreferences: 1,
      selectedBestTeams: 1,
      chipPreferences: 1,
      driverProjectionOverride: true,
      constructorProjectionOverride: true,
    },
  });
});

test('reset_user_data runs propose → approval → single-use confirmation', async () => {
  const proposed = await resetUserDataTool.execute({});
  expect(proposed).toMatchObject({
    status: 'confirmation_required',
    tool: 'reset_user_data',
    writeNonce: 'nonce-reset',
    args: {},
  });
  expect(mockReset).not.toHaveBeenCalled();

  const premature = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });
  expect(premature.status).toBe('forbidden');
  expect(mockReset).not.toHaveBeenCalled();

  await approvePendingWrite({ chatId: 42, writeNonce: proposed.writeNonce });
  const confirmed = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });

  expect(mockReset).toHaveBeenCalledWith({
    chatId: 42,
    expectedFingerprint: 'fresh-fingerprint',
  });
  expect(confirmed).toMatchObject({
    status: 'ok',
    tool: 'reset_user_data',
    impact: { teamBlobs: 1, driverProjectionOverride: true },
    uiLang: 'en',
  });
  expect(confirmed).not.toHaveProperty('epoch');
});
