jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: jest.fn((spec) => spec),
}));
jest.mock('../../announcementsService', () => ({
  getLatestAnnouncement: jest.fn(),
}));
jest.mock('../../cores/announcementsCore', () => ({
  buildWhatsNewResult: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));
jest.mock('../identity', () => ({ getAgentChatId: jest.fn() }));
jest.mock('../wrapToolExecute', () => ({
  wrapToolExecute: jest.fn((name, execute) => {
    execute.wrappedToolName = name;

    return execute;
  }),
}));

const { getLatestAnnouncement } = require('../../announcementsService');
const { buildWhatsNewResult } = require('../../cores/announcementsCore');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { getAgentChatId } = require('../identity');
const { getWhatsNewTool } = require('./getWhatsNewTool');

beforeEach(() => {
  jest.clearAllMocks();
  getAgentChatId.mockReturnValue(42);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'he' });
  getLatestAnnouncement.mockReturnValue({ id: 'release-1', text: 'חדשות' });
  buildWhatsNewResult.mockReturnValue({
    status: 'ok',
    announcement: {
      id: 'release-1',
      createdAt: '2026-04-29T07:58:42Z',
      version: 'wow',
      text: 'חדשות',
    },
  });
});

test('is registered through wrapToolExecute', () => {
  expect(getWhatsNewTool.execute.wrappedToolName).toBe('get_whats_new');
});

test('shares the latest announcement result and saved language', async () => {
  await expect(getWhatsNewTool.execute({})).resolves.toEqual({
    status: 'ok',
    lang: 'he',
    announcement: {
      id: 'release-1',
      createdAt: '2026-04-29T07:58:42Z',
      version: 'wow',
      text: 'חדשות',
    },
  });

  expect(getFreshLanguagePreference).toHaveBeenCalledWith(42);
  expect(buildWhatsNewResult).toHaveBeenCalledWith({
    id: 'release-1',
    text: 'חדשות',
  });
});

test('returns the shared empty result without trying any unrelated storage', async () => {
  getLatestAnnouncement.mockReturnValue(null);
  buildWhatsNewResult.mockReturnValue({ status: 'empty', announcement: null });

  await expect(getWhatsNewTool.execute({})).resolves.toEqual({
    status: 'empty',
    announcement: null,
    lang: 'he',
  });
});

test('lets wrapToolExecute own unexpected source failures', async () => {
  getLatestAnnouncement.mockImplementation(() => {
    throw new Error('https://storage.example.test/private?sig=secret');
  });

  await expect(getWhatsNewTool.execute({})).rejects.toThrow('sig=secret');
});
