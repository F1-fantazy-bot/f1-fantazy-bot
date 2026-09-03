jest.mock('../writeToolHelpers', () => ({
  defineWriteTool: jest.fn((spec) => spec),
}));

jest.mock('../../i18n', () => ({
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

jest.mock('../../services/resetUserDataService', () => ({
  STATUS: { OK: 'ok', CHANGED: 'changed' },
  createResetUserDataService: jest.fn(),
}));

jest.mock('../notifierBot', () => ({
  getNotifierBot: jest.fn(),
}));

const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  createResetUserDataService,
} = require('../../services/resetUserDataService');
const {
  resetUserDataTool,
  resetSummary,
} = require('./resetUserDataTool');

const impact = {
  teamBlobs: 2,
  selectedTeam: true,
  rankingPreferences: 2,
  selectedBestTeams: 1,
  chipPreferences: 2,
  driverProjectionOverride: true,
  constructorProjectionOverride: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('stages a safe impact fingerprint only after refreshing saved language', async () => {
  const inspect = jest.fn().mockResolvedValue({
    hasResettableData: true,
    impact,
    fingerprint: 'authoritative-fingerprint',
  });
  createResetUserDataService.mockReturnValue({ inspect });
  getFreshLanguagePreference.mockResolvedValue({ lang: 'he', fresh: true });

  await expect(
    resetUserDataTool.validate({ chatId: 12, args: {} }),
  ).resolves.toEqual({
    args: {},
    summary: expect.stringContaining('2 saved team blob(s)'),
    intentArgs: { fingerprint: 'authoritative-fingerprint' },
  });
  expect(getFreshLanguagePreference).toHaveBeenCalledWith(12);
  expect(inspect).toHaveBeenCalledWith({ chatId: 12 });
});

test('does not stage a destructive confirmation when no resettable data exists', async () => {
  createResetUserDataService.mockReturnValue({
    inspect: jest.fn().mockResolvedValue({ hasResettableData: false }),
  });

  await expect(
    resetUserDataTool.validate({ chatId: 12, args: {} }),
  ).resolves.toMatchObject({
    status: 'not_found',
    summary: expect.stringContaining('No saved F1 Fantasy'),
  });
});

test('returns only a safe reset impact after confirmation', async () => {
  const reset = jest.fn().mockResolvedValue({ status: 'ok', impact, epoch: 9 });
  createResetUserDataService.mockReturnValue({ reset });

  await expect(
    resetUserDataTool.commit({
      chatId: 12,
      args: { fingerprint: 'authoritative-fingerprint' },
    }),
  ).resolves.toEqual({
    status: 'ok',
    impact,
    summary: expect.stringContaining('Your saved F1 Fantasy data was reset'),
  });
  expect(reset).toHaveBeenCalledWith({
    chatId: 12,
    expectedFingerprint: 'authoritative-fingerprint',
  });
});

test('requires a fresh confirmation when the state changed after proposal', async () => {
  createResetUserDataService.mockReturnValue({
    reset: jest.fn().mockResolvedValue({ status: 'changed', impact }),
  });

  await expect(
    resetUserDataTool.commit({ chatId: 12, args: { fingerprint: 'old' } }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    summary: expect.stringContaining('changed while this confirmation'),
  });
});

test('keeps infrastructure failures for the shared tool-error wrapper', async () => {
  createResetUserDataService.mockReturnValue({
    reset: jest.fn().mockRejectedValue(new Error('storage unavailable')),
  });

  await expect(
    resetUserDataTool.commit({ chatId: 12, args: { fingerprint: 'old' } }),
  ).rejects.toThrow('storage unavailable');
});

test('describes each destructive category in the confirmation summary', () => {
  expect(resetSummary(12, impact)).toContain('2 points-per-million preference(s)');
  expect(resetSummary(12, impact)).toContain('drivers: Yes');
  expect(resetSummary(12, impact)).toContain('constructors: No');
});
