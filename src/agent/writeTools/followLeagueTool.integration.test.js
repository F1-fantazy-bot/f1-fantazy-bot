jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: (spec) => ({ ...spec }),
}));
jest.mock('../../utils/utils', () => ({ sendErrorMessage: jest.fn() }));
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
  getFreshLanguagePreference: jest.fn(async () => ({
    lang: 'en',
    fresh: true,
  })),
}));
jest.mock('../../services/followLeagueService', () => ({
  inspectLeagueFollow: jest.fn(async () => ({
    status: 'ok',
    leagueCode: 'ABC123',
    leagueName: 'Friends',
    changed: true,
  })),
  followLeague: jest.fn(),
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
      intents.set('nonce-league', { ...intent, state: 'staged' });

      return 'nonce-league';
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
  followLeague,
} = require('../../services/followLeagueService');
const { executeConfirmedWrite } = require('../writeToolHelpers');
const { followLeagueTool } = require('./followLeagueTool');

test('follow_league runs propose → approval → confirm', async () => {
  followLeague.mockResolvedValue({
    status: 'ok',
    summary: 'Now following Friends.',
    leagueCode: 'ABC123',
    changed: true,
  });

  const proposed = await followLeagueTool.execute({
    leagueCode: ' abc123 ',
  });
  expect(proposed).toMatchObject({
    status: 'confirmation_required',
    tool: 'follow_league',
    args: { leagueCode: 'ABC123' },
  });

  await approvePendingWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });
  const result = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });

  expect(followLeague).toHaveBeenCalledWith({
    chatId: 42,
    leagueCode: 'ABC123',
  });
  expect(result).toMatchObject({ status: 'ok', tool: 'follow_league' });
});
