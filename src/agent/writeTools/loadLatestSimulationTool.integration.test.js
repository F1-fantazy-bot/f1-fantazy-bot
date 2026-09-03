jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: (spec) => ({ ...spec }),
}));

jest.mock('../../utils/utils', () => ({
  sendErrorMessage: jest.fn(),
}));

const mockNotifierBot = { sendMessage: jest.fn() };
jest.mock('../notifierBot', () => ({
  getNotifierBot: () => mockNotifierBot,
}));

jest.mock('../cacheBootstrap', () => ({
  ensureCacheReady: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../identity', () => ({
  getAgentChatId: jest.fn(() => 42),
}));

jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(async () => ({ lang: 'en', fresh: true })),
}));

jest.mock('../../services/simulationRefreshService', () => ({
  refreshSimulationData: jest.fn(),
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
      intents.set('nonce-refresh', { ...intent, state: 'staged' });

      return 'nonce-refresh';
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
  refreshSimulationData,
} = require('../../services/simulationRefreshService');
const {
  executeConfirmedWrite,
} = require('../writeToolHelpers');
const { loadLatestSimulationTool } = require('./loadLatestSimulationTool');

test('load_latest_simulation runs propose → approval → confirm without refreshing early', async () => {
  refreshSimulationData.mockResolvedValue({
    status: 'ok',
    source: { kind: 'durable_shared_source', label: 'F1 Fantasy simulation data' },
    fetchedAt: '2026-09-03T08:16:00.000Z',
    matchday: 14,
    counts: { drivers: 22, constructors: 11 },
    prices: { source: 'canonical_prices' },
  });

  const proposed = await loadLatestSimulationTool.execute({});
  expect(proposed).toMatchObject({
    status: 'confirmation_required',
    tool: 'load_latest_simulation',
    writeNonce: 'nonce-refresh',
    args: {},
  });
  expect(refreshSimulationData).not.toHaveBeenCalled();

  const premature = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });
  expect(premature.status).toBe('forbidden');
  expect(refreshSimulationData).not.toHaveBeenCalled();

  await approvePendingWrite({ chatId: 42, writeNonce: proposed.writeNonce });
  const confirmed = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });

  expect(refreshSimulationData).toHaveBeenCalledWith({ bot: mockNotifierBot });
  expect(confirmed).toMatchObject({
    status: 'ok',
    tool: 'load_latest_simulation',
    source: { kind: 'durable_shared_source' },
    matchday: 14,
    counts: { drivers: 22, constructors: 11 },
    uiLang: 'en',
  });
  expect(confirmed.fetchedAt).not.toContain('T08:16:00.000Z');
});
