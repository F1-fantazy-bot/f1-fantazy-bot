jest.mock('../writeToolHelpers', () => ({
  defineWriteTool: jest.fn((spec) => spec),
}));

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
  getFreshLanguagePreference: jest.fn(),
}));

jest.mock('../../services/simulationRefreshService', () => ({
  refreshSimulationData: jest.fn(),
}));

jest.mock('../notifierBot', () => ({
  getNotifierBot: jest.fn(),
}));

const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  refreshSimulationData,
} = require('../../services/simulationRefreshService');
const { getNotifierBot } = require('../notifierBot');
const {
  loadLatestSimulationTool,
  refreshSummary,
} = require('./loadLatestSimulationTool');

describe('loadLatestSimulationTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses saved language during proposal and explains process-local refresh scope', async () => {
    getFreshLanguagePreference.mockResolvedValue({ lang: 'he', fresh: true });

    await expect(
      loadLatestSimulationTool.validate({ chatId: 12, args: {} }),
    ).resolves.toBeNull();
    expect(getFreshLanguagePreference).toHaveBeenCalledWith(12);
    expect(loadLatestSimulationTool.buildSummary({ chatId: 12, args: {} })).toContain(
      'other running bot and agent processes refresh their own in-memory cache separately',
    );
  });

  test('returns only safe, localised refresh metadata after confirmation', async () => {
    const notifierBot = { sendMessage: jest.fn() };
    getNotifierBot.mockReturnValue(notifierBot);
    refreshSimulationData.mockResolvedValue({
      status: 'ok',
      source: { kind: 'durable_shared_source', label: 'F1 Fantasy simulation data' },
      fetchedAt: '2026-09-03T08:16:00.000Z',
      matchday: 14,
      counts: { drivers: 22, constructors: 11 },
      prices: { source: 'canonical_prices' },
    });

    const result = await loadLatestSimulationTool.commit({ chatId: 12, args: {} });

    expect(refreshSimulationData).toHaveBeenCalledWith({ bot: notifierBot });
    expect(result).toMatchObject({
      status: 'ok',
      source: { kind: 'durable_shared_source' },
      matchday: 14,
      counts: { drivers: 22, constructors: 11 },
    });
    expect(result.fetchedAt).not.toContain('T08:16:00.000Z');
    expect(result.summary).toBe(
      'Latest simulation refreshed from the shared durable source: 22 drivers and 11 constructors Matchday 14.',
    );
  });

  test('leaves unexpected refresh failures for the shared tool-error wrapper', async () => {
    refreshSimulationData.mockRejectedValue(new Error('storage is unavailable'));

    await expect(
      loadLatestSimulationTool.commit({ chatId: 12, args: {} }),
    ).rejects.toThrow('storage is unavailable');
  });

  test('creates the no-matchday summary without an extra trailing detail', () => {
    expect(
      refreshSummary(12, {
        counts: { drivers: 22, constructors: 11 },
        matchday: null,
      }),
    ).toBe(
      'Latest simulation refreshed from the shared durable source: 22 drivers and 11 constructors.',
    );
  });
});
