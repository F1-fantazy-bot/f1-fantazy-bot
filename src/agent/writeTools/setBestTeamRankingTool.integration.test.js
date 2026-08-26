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
  getFreshLanguagePreference: jest.fn(async () => ({
    lang: 'en',
    fresh: true,
  })),
}));
jest.mock('../../services/selectTeamService', () => ({
  resolveTeamSelection: jest.fn(() => ({
    status: 'ok',
    teamId: 'T2',
    teamName: 'Kilzid 2',
  })),
}));
jest.mock('../../services/setBestTeamRankingService', () => ({
  getPreset: jest.fn(() => ({
    id: 'points_plus_budget',
    budgetChangePointsPerMillion: 1.65,
    labelKey: 'Points Plus Budget',
  })),
  availablePresets: jest.fn(() => []),
  getFreshBestTeamRankingPreference: jest.fn(async () => ({
    fresh: true,
    value: 0,
  })),
  setBestTeamRankingPreference: jest.fn(),
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
      intents.set('nonce-ranking', { ...intent, state: 'staged' });

      return 'nonce-ranking';
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
  setBestTeamRankingPreference,
} = require('../../services/setBestTeamRankingService');
const { executeConfirmedWrite } = require('../writeToolHelpers');
const {
  setBestTeamRankingTool,
} = require('./setBestTeamRankingTool');

test('set_best_team_ranking runs propose → approval → confirm', async () => {
  setBestTeamRankingPreference.mockResolvedValue({
    status: 'ok',
    summary: 'Best-team ranking updated.',
    teamId: 'T2',
    presetId: 'points_plus_budget',
    changed: true,
  });

  const proposed = await setBestTeamRankingTool.execute({
    teamName: 'Kilzid 2',
    presetId: 'points_plus_budget',
  });
  expect(proposed).toMatchObject({
    status: 'confirmation_required',
    tool: 'set_best_team_ranking',
    args: {
      teamId: 'T2',
      presetId: 'points_plus_budget',
    },
  });
  expect(setBestTeamRankingPreference).not.toHaveBeenCalled();

  await approvePendingWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });
  const result = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });

  expect(setBestTeamRankingPreference).toHaveBeenCalledWith({
    chatId: 42,
    teamId: 'T2',
    presetId: 'points_plus_budget',
  });
  expect(result).toMatchObject({
    status: 'ok',
    tool: 'set_best_team_ranking',
  });
});
