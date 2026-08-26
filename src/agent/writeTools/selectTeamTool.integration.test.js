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
  getFreshLanguagePreference: jest.fn(async () => ({ lang: 'en', fresh: true })),
}));
jest.mock('../../services/selectTeamService', () => ({
  resolveTeamSelection: jest.fn(() => ({
    status: 'ok',
    teamId: 'T2',
    teamName: 'Kilzid 2',
  })),
  getFreshSelectedTeamPreference: jest.fn(async () => ({
    fresh: true,
    selectedTeam: 'T1',
  })),
  selectTeamPreference: jest.fn(),
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
      intents.set('nonce-team', { ...intent, state: 'staged' });

      return 'nonce-team';
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
  selectTeamPreference,
} = require('../../services/selectTeamService');
const { executeConfirmedWrite } = require('../writeToolHelpers');
const { selectTeamTool } = require('./selectTeamTool');

test('select_team runs propose → approval → confirm', async () => {
  selectTeamPreference.mockResolvedValue({
    status: 'ok',
    summary: 'Active team switched.',
    teamId: 'T2',
    teamName: 'Kilzid 2',
  });

  const proposed = await selectTeamTool.execute({ teamName: 'Kilzid 2' });
  expect(proposed.status).toBe('confirmation_required');
  expect(proposed.args).toEqual({ teamId: 'T2' });
  expect(selectTeamPreference).not.toHaveBeenCalled();

  await approvePendingWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });
  const result = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });

  expect(selectTeamPreference).toHaveBeenCalledWith({
    chatId: 42,
    teamId: 'T2',
  });
  expect(result).toMatchObject({ status: 'ok', tool: 'select_team' });
});
