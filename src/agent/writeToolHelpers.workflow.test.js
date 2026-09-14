jest.mock('@copilotkit/runtime/v2', () => ({ defineTool: (spec) => spec }));
jest.mock('./cacheBootstrap', () => ({ ensureCacheReady: jest.fn() }));
jest.mock('./workflows', () => ({ hasActiveWorkflow: jest.fn() }));
jest.mock('../services/activateChipService', () => ({ runChipMutation: jest.fn() }));
jest.mock('../services/setLanguageService', () => ({ getFreshLanguagePreference: jest.fn(async () => ({ lang: 'en' })) }));
jest.mock('../services/pendingWritesStore', () => ({
  consumeApprovedPendingWrite: jest.fn(async () => ({ status: 'consumed', intent: { tool: 'change', args: {} } })),
  CONSUME_STATUS: { CONSUMED: 'consumed', NOT_APPROVED: 'not_approved' },
}));
const { executeConfirmedWrite, registerWriteTool, resetWriteToolRegistryForTests } = require('./writeToolHelpers');
const { hasActiveWorkflow } = require('./workflows');
const { runChipMutation } = require('../services/activateChipService');
const { consumeApprovedPendingWrite } = require('../services/pendingWritesStore');
afterEach(() => {
  jest.clearAllMocks(); resetWriteToolRegistryForTests();
});
test('single-action confirmation checks workflow exclusion inside the shared boundary before consuming approval', async () => {
  let inside = false;
  runChipMutation.mockImplementation(async (_owner, operation) => { inside = true; try { return await operation(); } finally { inside = false; } });
  hasActiveWorkflow.mockImplementation(async () => { expect(inside).toBe(true);

 return true; });
  const commit = jest.fn(); registerWriteTool('change', { commit });
  const result = await executeConfirmedWrite({ chatId: 42, writeNonce: 'approved' });
  expect(result.status).toBe('forbidden'); expect(consumeApprovedPendingWrite).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
});
test('single-action confirmations still execute when no workflow holds the user lease', async () => {
  runChipMutation.mockImplementation((_owner, operation) => operation()); hasActiveWorkflow.mockResolvedValue(false);
  const commit = jest.fn(async () => ({ status: 'ok' })); registerWriteTool('change', { commit });
  expect((await executeConfirmedWrite({ chatId: 42, writeNonce: 'approved' })).status).toBe('ok');
  expect(commit).toHaveBeenCalledTimes(1);
});
