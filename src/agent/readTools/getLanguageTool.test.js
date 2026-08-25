jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: (spec) => ({ ...spec }),
}));

jest.mock('../wrapToolExecute', () => ({
  wrapToolExecute: (_name, execute) => execute,
}));

jest.mock('../cacheBootstrap', () => ({
  ensureCacheReady: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../identity', () => ({
  getAgentChatId: jest.fn(() => 42),
}));

jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));

const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getLanguageTool } = require('./getLanguageTool');

test('get_language returns the saved preference without staging a write', async () => {
  getFreshLanguagePreference.mockResolvedValue({
    status: 'ok',
    lang: 'he',
    languageName: 'עברית',
    summary: 'השפה השמורה שלך היא עברית (he).',
  });

  await expect(getLanguageTool.execute({})).resolves.toMatchObject({
    status: 'ok',
    lang: 'he',
  });
  expect(ensureCacheReady).toHaveBeenCalledTimes(1);
  expect(getFreshLanguagePreference).toHaveBeenCalledWith(42);
});
