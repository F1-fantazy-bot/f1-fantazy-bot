jest.mock('../adminAuthorization', () => ({
  defineAdminWriteTool: jest.fn((spec) => spec),
}));
jest.mock('../../manualTriggerService', () => ({
  triggerManualJob: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));
jest.mock('../notifierBot', () => ({ getNotifierBot: jest.fn(() => ({})) }));
jest.mock('../requestContext', () => ({ getRequestContext: jest.fn() }));
jest.mock('../../utils/utils', () => ({ sendLogMessage: jest.fn() }));
jest.mock('../writeToolHelpers', () => ({
  WRITE_RESULT_STATUSES: {
    OK: 'ok',
    FAILED: 'failed',
    LIMIT_EXCEEDED: 'limit_exceeded',
  },
}));

const { triggerManualJob } = require('../../manualTriggerService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { sendLogMessage } = require('../../utils/utils');
const { setLanguage } = require('../../i18n');
const {
  MANUAL_TRIGGER_TOOLS,
  auditMessage,
  triggerSummary,
  triggerScrapingTool,
  triggerApiDataTool,
  triggerApiDataLockedTool,
  triggerNextRaceInfoTool,
  triggerLiveScoreSchedulerTool,
} = require('./adminManualTriggerTools');

beforeEach(() => {
  jest.clearAllMocks();
  getFreshLanguagePreference.mockResolvedValue({ lang: 'en' });
  triggerManualJob.mockResolvedValue({
    success: true,
    runReference: 'api_data-1234abcd',
  });
  sendLogMessage.mockResolvedValue();
});

test('defines five separately confirmed manual trigger tools with impact-specific previews', () => {
  expect(MANUAL_TRIGGER_TOOLS.map((info) => info.name)).toEqual([
    'trigger_scraping',
    'trigger_api_data',
    'trigger_api_data_locked',
    'trigger_next_race_info',
    'trigger_live_score_scheduler',
  ]);
  expect(triggerScrapingTool.buildSummary({ chatId: 42, args: {} })).toContain(
    'scraper',
  );
  expect(triggerApiDataTool.buildSummary({ chatId: 42, args: {} })).toContain(
    'API data processing',
  );
  expect(triggerApiDataLockedTool.buildSummary({ chatId: 42, args: {} })).toContain(
    'locked',
  );
  expect(triggerNextRaceInfoTool.buildSummary({ chatId: 42, args: {} })).toContain(
    'next-race',
  );
  expect(
    triggerLiveScoreSchedulerTool.buildSummary({ chatId: 42, args: {} }),
  ).toContain('live-score');
});

test('refreshes saved language before staging a no-argument trigger', async () => {
  await expect(triggerApiDataTool.validate({ chatId: 42, args: {} })).resolves.toBeNull();
  expect(getFreshLanguagePreference).toHaveBeenCalledWith(42);
});

test('returns a safe successful run reference and audits the actor', async () => {
  await expect(triggerApiDataTool.commit({ chatId: 42, args: {} })).resolves.toEqual({
    status: 'ok',
    tool: 'trigger_api_data',
    triggerId: 'api_data',
    runReference: 'api_data-1234abcd',
    summary: 'Started API Data. Run reference: api_data-1234abcd.',
  });
  expect(triggerManualJob).toHaveBeenCalledWith('api_data');
  expect(sendLogMessage).toHaveBeenCalledWith(
    expect.anything(),
    expect.stringContaining('actor=42 outcome=started run=api_data-1234abcd'),
  );
});

test('maps an active durable lease to a safe no-retry result', async () => {
  triggerManualJob.mockResolvedValue({
    success: false,
    deduplicated: true,
    runReference: 'scraper-existing',
  });

  await expect(triggerScrapingTool.commit({ chatId: 42, args: {} })).resolves.toEqual({
    status: 'limit_exceeded',
    tool: 'trigger_scraping',
    triggerId: 'scraper',
    runReference: 'scraper-existing',
    summary:
      'F1 Fantasy Scraper already has an active or recent run. Reference: scraper-existing. Wait before retrying.',
  });
});

test('never returns raw trigger or provider failures to the agent', async () => {
  triggerManualJob.mockResolvedValue({
    success: false,
    uncertain: true,
    runReference: 'api_data-uncertain',
    error: 'Azure token=secret, HTTP 500, storage details',
  });

  const result = await triggerApiDataTool.commit({ chatId: 42, args: {} });

  expect(result).toMatchObject({ status: 'failed', runReference: 'api_data-uncertain' });
  expect(result.summary).not.toContain('Azure token');
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(triggerSummary(42, MANUAL_TRIGGER_TOOLS[1], { success: false })).toBe(
    'Unable to start API Data. Please try again.',
  );
});

test('audit messages contain actor, action, outcome, and reference but no error text', () => {
  expect(
    auditMessage({
      chatId: 42,
      info: MANUAL_TRIGGER_TOOLS[0],
      outcome: 'uncertain',
      runReference: 'scraper-1234abcd',
    }),
  ).toBe(
    'Agent manual trigger scraper actor=42 outcome=uncertain run=scraper-1234abcd',
  );
});

test('uses the saved Hebrew language for visible trigger results', () => {
  setLanguage('he', 4242);

  expect(
    triggerSummary(4242, MANUAL_TRIGGER_TOOLS[0], {
      success: true,
      runReference: 'scraper-1234abcd',
    }),
  ).toContain('מזהה הרצה: scraper-1234abcd');
});
