jest.mock('../writeToolHelpers', () => ({
  defineWriteTool: jest.fn((spec) => spec),
  WRITE_RESULT_STATUSES: {
    INVALID_INPUT: 'invalid_input',
    FORBIDDEN: 'forbidden',
  },
}));
jest.mock('../../services/reportBugService', () => ({
  createReportBugService: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));
jest.mock('../requestContext', () => ({
  getRequestContext: jest.fn(),
}));
const mockNotifierBot = { sendMessage: jest.fn() };
jest.mock('../notifierBot', () => ({
  getNotifierBot: jest.fn(() => mockNotifierBot),
}));
jest.mock('../../utils/utils', () => ({
  getDisplayName: jest.fn(() => 'Kilzid'),
  sendErrorMessage: jest.fn(),
  sendMessageToAdmins: jest.fn(),
}));

const {
  createReportBugService,
} = require('../../services/reportBugService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { getRequestContext } = require('../requestContext');
const { sendErrorMessage } = require('../../utils/utils');
const {
  createAgentReportBugService,
  reportBugTool,
} = require('./reportBugTool');

const inspect = jest.fn();
const report = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  createReportBugService.mockReturnValue({ inspect, report });
  getFreshLanguagePreference.mockResolvedValue({
    lang: 'en',
    fresh: true,
  });
  getRequestContext.mockReturnValue({
    email: 'verified@example.com',
    name: 'Verified User',
  });
  inspect.mockReturnValue({
    status: 'ok',
    message: 'Broken card',
  });
  mockNotifierBot.sendMessage.mockResolvedValue(undefined);
});

test('canonicalizes report text before staging', async () => {
  await expect(
    reportBugTool.validate({
      chatId: 42,
      args: { message: '  Broken card  ' },
    }),
  ).resolves.toEqual({
    args: { message: 'Broken card' },
  });
});

test.each(['invalid_input', 'forbidden'])(
  'returns %s without staging',
  async (status) => {
    inspect.mockReturnValue({
      status,
      summary: 'Cannot send report.',
    });

    await expect(
      reportBugTool.validate({
        chatId: 42,
        args: { message: 'Broken card' },
      }),
    ).resolves.toMatchObject({
      status,
      tool: 'report_bug',
    });
  },
);

test('builds a confirmation summary without interpolating report text', () => {
  expect(
    reportBugTool.buildSummary({
      chatId: 42,
      args: { message: '$& {MESSAGE}' },
    }),
  ).toBe('Send this bug report to the administrators:\n\n$& {MESSAGE}');
});

test('commits with request-scoped identity that is not part of tool args', async () => {
  report.mockResolvedValue({
    status: 'ok',
    summary: 'Report sent.',
  });

  await reportBugTool.commit({
    chatId: 42,
    args: { message: 'Broken card' },
  });

  expect(report).toHaveBeenCalledWith({
    chatId: 42,
    message: 'Broken card',
    source: 'web-agent',
    email: 'verified@example.com',
    chatName: 'Verified User',
    displayName: 'Kilzid',
  });
});

test('routes bugs-group delivery failures through the error notifier', async () => {
  mockNotifierBot.sendMessage.mockRejectedValue(new Error('group unavailable'));

  createAgentReportBugService();
  const { messenger } = createReportBugService.mock.calls[0][0];
  await messenger.sendToBugsGroup('Report text');

  expect(sendErrorMessage).toHaveBeenCalledWith(
    mockNotifierBot,
    'Agent bug report delivery to bugs group failed: group unavailable',
  );
});
