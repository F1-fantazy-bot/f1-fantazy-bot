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
  resolveFreshTeamSelection: jest.fn(async () => ({
    status: 'ok',
    teamId: 'T2',
    teamName: 'Kilzid 2',
  })),
}));
jest.mock('../../services/activateChipService', () => ({
  getChipOption: jest.fn(() => ({
    chip: 'EXTRA_BOOST',
    labelKey: 'Extra Boost',
  })),
  availableChips: jest.fn(() => []),
  getFreshChipPreference: jest.fn(async () => ({
    fresh: true,
    chip: 'WITHOUT_CHIP',
  })),
  activateChipPreference: jest.fn(),
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
      intents.set('nonce-chip', { ...intent, state: 'staged' });

      return 'nonce-chip';
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
  activateChipPreference,
} = require('../../services/activateChipService');
const { executeConfirmedWrite } = require('../writeToolHelpers');
const { activateChipTool } = require('./activateChipTool');

test('activate_chip runs propose → approval → confirm', async () => {
  activateChipPreference.mockResolvedValue({
    status: 'ok',
    summary: 'Chip activated.',
    teamId: 'T2',
    chip: 'EXTRA_BOOST',
    changed: true,
  });

  const proposed = await activateChipTool.execute({
    teamName: 'Kilzid 2',
    chip: 'EXTRA_BOOST',
  });
  expect(proposed).toMatchObject({
    status: 'confirmation_required',
    tool: 'activate_chip',
    args: { teamId: 'T2', chip: 'EXTRA_BOOST' },
  });
  expect(activateChipPreference).not.toHaveBeenCalled();

  await approvePendingWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });
  const result = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });

  expect(activateChipPreference).toHaveBeenCalledWith({
    chatId: 42,
    teamId: 'T2',
    chip: 'EXTRA_BOOST',
  });
  expect(result).toMatchObject({
    status: 'ok',
    tool: 'activate_chip',
  });
});
