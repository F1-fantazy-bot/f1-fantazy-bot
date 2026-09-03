const {
  buildBotUserDirectory,
  buildWebUserDirectory,
  buildVersionInfo,
  buildBillingView,
  buildBotfatherSetup,
} = require('./adminReadCore');

test('builds a sorted and bounded bot-user directory without table entities', () => {
  const directory = buildBotUserDirectory([
    {
      chatId: 'old',
      chatName: 'Old user',
      lastSeen: '2026-01-01T00:00:00.000Z',
      firstSeen: '2025-01-01T00:00:00.000Z',
      etag: 'not exposed',
    },
    {
      chatId: 'new',
      chatName: 'New user',
      nickname: 'Fastest',
      lang: 'he',
      lastSeen: '2026-02-01T00:00:00.000Z',
      firstSeen: '2025-02-01T00:00:00.000Z',
    },
    { chatId: 'unknown-time', chatName: 'No date' },
  ], { limit: 2 });

  expect(directory).toMatchObject({
    totalCount: 3,
    displayedCount: 2,
    truncated: true,
    users: [
      {
        chatId: 'new',
        chatName: 'New user',
        nickname: 'Fastest',
        lang: 'he',
      },
      { chatId: 'old', chatName: 'Old user', lang: 'en' },
    ],
  });
  expect(directory.users[0]).not.toHaveProperty('etag');
});

test('never lets a caller expand the safe directory, billing, or command caps', () => {
  const users = Array.from({ length: 101 }, (_, index) => ({
    chatId: String(index),
  }));
  const commands = Array.from({ length: 51 }, (_, index) => ({
    constant: `/command_${index}`,
    description: 'Safe command',
  }));
  const services = Array.from({ length: 26 }, (_, index) => ({
    serviceName: `Service ${index}`,
    cost: index,
  }));

  expect(buildBotUserDirectory(users, { limit: 9999 })).toMatchObject({
    displayedCount: 100,
    truncated: true,
  });
  expect(buildBillingView({
    currentMonth: { hasData: true, serviceBreakdown: services },
    previousMonth: { hasData: false },
  }, { serviceLimit: 9999 }).currentMonth).toMatchObject({
    services: expect.arrayContaining([
      expect.objectContaining({ serviceName: 'Service 0' }),
    ]),
    totalServices: 26,
    truncated: true,
  });
  expect(buildBillingView({
    currentMonth: { hasData: true, serviceBreakdown: services },
    previousMonth: { hasData: false },
  }, { serviceLimit: 9999 }).currentMonth.services).toHaveLength(25);
  expect(buildBotfatherSetup(commands, { limit: 9999 })).toMatchObject({
    displayedCount: 50,
    truncated: true,
  });
});

test('joins and bounds web allowlist entries with their linked bot users', () => {
  const directory = buildWebUserDirectory(
    [
      {
        email: 'old@example.com',
        chatId: '9',
        addedAt: '2026-01-01T00:00:00.000Z',
        addedBy: '42',
      },
      {
        email: 'new@example.com',
        chatId: '7',
        addedAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    [{ chatId: '7', chatName: 'Web racer', nickname: 'Pole' }],
    { limit: 1 },
  );

  expect(directory).toEqual({
    totalCount: 2,
    displayedCount: 1,
    truncated: true,
    users: [
      {
        email: 'new@example.com',
        chatId: '7',
        linkedDisplay: 'Pole',
        addedAt: '2026-02-01T00:00:00.000Z',
        addedBy: null,
      },
    ],
  });
});

test('normalizes and caps billing service rows while retaining totals', () => {
  const billing = buildBillingView({
    currentMonth: {
      hasData: true,
      totalCost: 100.456,
      period: { monthName: 'June', year: 2026, startDate: '2026-06-01', endDate: '2026-06-30' },
      serviceBreakdown: [
        { serviceName: 'Functions', cost: 60.128, currency: 'USD' },
        { serviceName: 'Storage', cost: 40.328, currency: 'USD' },
      ],
    },
    previousMonth: {
      hasData: true,
      totalCost: 80,
      period: { monthName: 'May', year: 2026 },
      serviceBreakdown: [],
    },
  }, { serviceLimit: 1 });

  expect(billing.currentMonth).toMatchObject({
    totalCost: 100.46,
    totalServices: 2,
    truncated: true,
    services: [{ serviceName: 'Functions', cost: 60.13, currency: 'USD' }],
  });
  expect(billing.comparison).toEqual({ difference: 20.46, percentage: 25.6 });
});

test('creates bounded, safe version and BotFather setup views', () => {
  expect(buildVersionInfo({ COMMIT_ID: ' abc ', COMMIT_MESSAGE: ' Fix ', COMMIT_LINK: ' https://example.test/commit ' })).toEqual({
    commitId: 'abc',
    commitMessage: 'Fix',
    commitLink: 'https://example.test/commit',
  });
  expect(buildVersionInfo({})).toEqual({
    commitId: 'N/A',
    commitMessage: 'N/A',
    commitLink: 'N/A',
  });
  expect(buildBotfatherSetup([
    { constant: '/start', description: 'Start the bot' },
    { constant: '/help', description: 'Get help' },
  ], { limit: 1 })).toEqual({
    commands: [{ command: 'start', description: 'Start the bot' }],
    totalCount: 2,
    displayedCount: 1,
    truncated: true,
  });
});
