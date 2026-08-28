jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: (spec) => ({ ...spec }),
}));
jest.mock('../../utils/utils', () => ({
  sendErrorMessage: jest.fn(),
  sendLogMessage: jest.fn(),
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
jest.mock('../../services/followTeamService', () => ({
  createFollowTeamService: jest.fn(),
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
  createFollowTeamService,
} = require('../../services/followTeamService');
const service = {
  inspect: jest.fn(async () => ({
    status: 'ok',
    changed: true,
    teamId: 'Owner_1',
    teamName: 'Fast Friends',
    leagueCode: 'ABC123',
    leagueName: 'Friends',
    screenshotTeamIds: ['T1', 'T2'],
  })),
  buildSummary: jest.fn(
    () =>
      'This will remove your screenshot teams T1/T2 and follow Fast Friends.',
  ),
  mutate: jest.fn(),
};
createFollowTeamService.mockReturnValue(service);

const {
  approvePendingWrite,
} = require('../../services/pendingWritesStore');
const { executeConfirmedWrite } = require('../writeToolHelpers');
const { followTeamTool } = require('./followTeamTool');

test('follow_team runs propose → approval → confirm', async () => {
  service.mutate.mockResolvedValue({
    status: 'ok',
    summary: 'Now following Fast Friends.',
    teamId: 'Owner_1',
    changed: true,
  });

  const proposed = await followTeamTool.execute({
    action: 'add',
    leagueCode: 'ABC123',
    teamName: 'Fast Friends',
  });
  expect(proposed).toMatchObject({
    status: 'confirmation_required',
    tool: 'follow_team',
    args: {
      action: 'add',
      leagueCode: 'ABC123',
      teamId: 'Owner_1',
    },
    summary: expect.stringContaining('T1/T2'),
  });
  expect(service.mutate).not.toHaveBeenCalled();

  await approvePendingWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });
  const result = await executeConfirmedWrite({
    chatId: 42,
    writeNonce: proposed.writeNonce,
  });

  expect(service.mutate).toHaveBeenCalledWith({
    chatId: 42,
    action: 'add',
    leagueCode: 'ABC123',
    teamId: 'Owner_1',
    expectedScreenshotTeamIds: ['T1', 'T2'],
  });
  expect(result).toMatchObject({
    status: 'ok',
    tool: 'follow_team',
  });
});
