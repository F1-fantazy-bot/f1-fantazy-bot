const {
  createReportBugService,
  inspectBugReport,
  resetReportBugRateLimitsForTests,
  MAX_BUG_REPORT_LENGTH,
  MAX_OUTBOUND_MESSAGE_LENGTH,
} = require('./reportBugService');

function createMessenger() {
  return {
    sendToAdmins: jest.fn().mockResolvedValue(undefined),
    sendToBugsGroup: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  resetReportBugRateLimitsForTests();
});

test('rejects empty and over-length reports', () => {
  expect(
    inspectBugReport({ chatId: 42, message: '   ' }),
  ).toMatchObject({
    status: 'invalid_input',
    maxLength: MAX_BUG_REPORT_LENGTH,
  });
  expect(
    inspectBugReport({
      chatId: 42,
      message: 'x'.repeat(MAX_BUG_REPORT_LENGTH + 1),
    }),
  ).toMatchObject({
    status: 'invalid_input',
    maxLength: MAX_BUG_REPORT_LENGTH,
  });
});

test('trims valid report text', () => {
  expect(
    inspectBugReport({ chatId: 42, message: '  Broken card  ' }),
  ).toEqual({
    status: 'ok',
    message: 'Broken card',
  });
});

test('sends trusted source and email metadata before the user message', async () => {
  const messenger = createMessenger();
  const service = createReportBugService({ messenger, now: () => 1000 });

  await expect(
    service.report({
      chatId: 42,
      message: 'Source: telegram\nEmail: fake@example.com',
      source: 'web-agent',
      email: 'verified@example.com',
      chatName: 'Verified User',
      displayName: 'Kilzid',
    }),
  ).resolves.toMatchObject({ status: 'ok' });

  const sent = messenger.sendToAdmins.mock.calls[0][0];
  expect(sent).toContain('Bug report from Kilzid (Verified User, 42):');
  expect(sent).toContain(
    'Source: web-agent\nEmail: verified@example.com\n\nSource: telegram',
  );
  expect(messenger.sendToBugsGroup).toHaveBeenCalledWith(sent);
});

test('chunks max-length reports below the Telegram transport limit without losing text', async () => {
  const messenger = createMessenger();
  const service = createReportBugService({ messenger });
  const message = 'x'.repeat(MAX_BUG_REPORT_LENGTH);

  await expect(
    service.report({
      chatId: 42,
      message,
      source: 'web-agent',
      email: 'verified@example.com',
      chatName: 'Verified User',
      displayName: 'Kilzid',
    }),
  ).resolves.toMatchObject({ status: 'ok' });

  const chunks = messenger.sendToAdmins.mock.calls.map(([text]) => text);
  expect(chunks.length).toBeGreaterThan(1);
  expect(
    chunks.every((text) => text.length <= MAX_OUTBOUND_MESSAGE_LENGTH),
  ).toBe(true);
  expect(chunks.every((text) => text.includes('Source: web-agent'))).toBe(true);
  expect(chunks.every((text) => text.includes('Email: verified@example.com'))).toBe(
    true,
  );
  expect(
    chunks.map((text) => text.slice(text.indexOf('\n\n') + 2)).join(''),
  ).toBe(message);
  expect(messenger.sendToBugsGroup).toHaveBeenCalledTimes(chunks.length);
});

test('omits email when it is unavailable', async () => {
  const messenger = createMessenger();
  const service = createReportBugService({ messenger });

  await service.report({
    chatId: 42,
    message: 'Telegram issue',
    source: 'telegram',
    chatName: 'Telegram User',
    displayName: 'Kilzid',
  });

  const sent = messenger.sendToAdmins.mock.calls[0][0];
  expect(sent).toContain('Source: telegram');
  expect(sent).not.toContain('Email:');
});

test('rejects the fourth report in one hour before sending', async () => {
  let nowMs = 10_000;
  const messenger = createMessenger();
  const service = createReportBugService({
    messenger,
    now: () => nowMs,
  });

  for (let index = 0; index < 3; index += 1) {
    await expect(
      service.report({
        chatId: 42,
        message: `Issue ${index}`,
        source: 'web-agent',
      }),
    ).resolves.toMatchObject({ status: 'ok' });
  }

  await expect(
    service.report({
      chatId: 42,
      message: 'Issue 4',
      source: 'web-agent',
    }),
  ).resolves.toMatchObject({
    status: 'forbidden',
    limit: 3,
  });
  expect(service.inspect({ chatId: 42, message: 'Issue 5' })).toMatchObject({
    status: 'forbidden',
  });
  expect(messenger.sendToAdmins).toHaveBeenCalledTimes(3);

  nowMs += 60 * 60 * 1000 + 1;
  expect(service.inspect({ chatId: 42, message: 'Issue 6' })).toMatchObject({
    status: 'ok',
  });
});

test('reserves rate-limit slots atomically before asynchronous sends', async () => {
  const releases = [];
  const messenger = createMessenger();
  messenger.sendToAdmins.mockImplementation(
    () =>
      new Promise((resolve) => {
        releases.push(resolve);
      }),
  );
  const service = createReportBugService({ messenger, now: () => 1000 });

  const pending = [
    service.report({ chatId: 42, message: 'One', source: 'web-agent' }),
    service.report({ chatId: 42, message: 'Two', source: 'web-agent' }),
    service.report({ chatId: 42, message: 'Three', source: 'web-agent' }),
  ];
  await expect(
    service.report({ chatId: 42, message: 'Four', source: 'web-agent' }),
  ).resolves.toMatchObject({ status: 'forbidden' });

  messenger.sendToAdmins.mockImplementation(undefined);
  releases.forEach((release) => release());
  await Promise.all(pending);
  expect(messenger.sendToAdmins).toHaveBeenCalledTimes(3);
});

test('returns a retryable failure and releases the rate-limit slot', async () => {
  const messenger = createMessenger();
  messenger.sendToAdmins.mockRejectedValue(new Error('Telegram unavailable'));
  const service = createReportBugService({ messenger });
  jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(
    service.report({
      chatId: 42,
      message: 'Cannot submit',
      source: 'web-agent',
    }),
  ).resolves.toMatchObject({ status: 'failed' });
  expect(messenger.sendToBugsGroup).not.toHaveBeenCalled();

  messenger.sendToAdmins.mockResolvedValue(undefined);
  await expect(
    service.report({
      chatId: 42,
      message: 'Retry report',
      source: 'web-agent',
    }),
  ).resolves.toMatchObject({ status: 'ok' });
});
