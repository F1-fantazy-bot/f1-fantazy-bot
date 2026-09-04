const {
  STATUS,
  MAX_AGENT_MESSAGE_LENGTH,
  MAX_TELEGRAM_TEXT_LENGTH,
  inspectAgentMessage,
  buildBroadcastSummary,
  createAdminMessagingService,
} = require('./adminMessagingService');
const { setLanguage } = require('../i18n');

function createPorts() {
  return {
    registry: {
      getUserById: jest.fn(),
      listAllUsers: jest.fn(),
    },
    messenger: {
      sendMessage: jest.fn(),
      sendPhoto: jest.fn(),
    },
    audit: jest.fn(),
  };
}

test('validates bounded, non-empty text for the text-only agent surface', () => {
  expect(inspectAgentMessage({ chatId: 7, message: '  hello  ' })).toMatchObject({
    status: STATUS.OK,
    message: 'hello',
  });
  expect(inspectAgentMessage({ chatId: 7, message: '   ' })).toMatchObject({
    status: STATUS.INVALID_INPUT,
  });
  expect(
    inspectAgentMessage({
      chatId: 7,
      message: 'x'.repeat(MAX_AGENT_MESSAGE_LENGTH + 1),
    }),
  ).toMatchObject({ status: STATUS.INVALID_INPUT });
});

test('builds a localized, bounded broadcast confirmation preview', () => {
  setLanguage('he', 4242);
  const summary = buildBroadcastSummary({
    chatId: 4242,
    audience: { count: 3 },
    message: 'x'.repeat(700),
  });

  expect(summary).toContain('לשדר את ההודעה הזו ל־3 משתמשים רשומים:');
  expect(summary).toContain('התצוגה המקדימה קוצרה');
  expect(summary.length).toBeLessThan(900);
});

test('rechecks a direct recipient and localizes the existing text prefix to that recipient', async () => {
  const ports = createPorts();
  ports.registry.getUserById.mockResolvedValue({
    chatId: '7',
    chatName: 'Fast Driver',
  });
  ports.messenger.sendMessage.mockResolvedValue();
  const service = createAdminMessagingService(ports);

  const result = await service.sendDirect({
    actorChatId: 42,
    targetChatId: ' 7 ',
    message: 'Hello from admin!',
  });

  expect(result).toMatchObject({
    status: STATUS.OK,
    recipient: { chatId: '7', chatName: 'Fast Driver' },
    delivery: { chunks: 1 },
  });
  expect(ports.messenger.sendMessage).toHaveBeenCalledWith(
    7,
    '📩 Message from bot admin:\n\nHello from admin!',
  );
  expect(ports.audit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'send_user_message',
    actorChatId: 42,
    targetChatId: '7',
    outcome: 'sent',
  }));
});

test('does not send when a direct recipient no longer exists at commit time', async () => {
  const ports = createPorts();
  ports.registry.getUserById.mockResolvedValue(null);
  const service = createAdminMessagingService(ports);

  await expect(
    service.sendDirect({
      actorChatId: 42,
      targetChatId: '7',
      message: 'Important update',
    }),
  ).resolves.toMatchObject({ status: STATUS.NOT_FOUND, targetChatId: '7' });
  expect(ports.messenger.sendMessage).not.toHaveBeenCalled();
});

test('chunks an oversized text send without changing the normal text prefix', async () => {
  const ports = createPorts();
  ports.registry.getUserById.mockResolvedValue({ chatId: '7', chatName: 'X' });
  ports.messenger.sendMessage.mockResolvedValue();
  const service = createAdminMessagingService(ports);

  const result = await service.sendDirect({
    actorChatId: 42,
    targetChatId: '7',
    message: 'x'.repeat(MAX_TELEGRAM_TEXT_LENGTH + 100),
  });

  expect(result).toMatchObject({ status: STATUS.OK });
  expect(ports.messenger.sendMessage).toHaveBeenCalledTimes(2);
  for (const [, text] of ports.messenger.sendMessage.mock.calls) {
    expect(text.length).toBeLessThanOrEqual(MAX_TELEGRAM_TEXT_LENGTH);
  }
});

test('keeps Telegram photo delivery as one prefixed photo send', async () => {
  const ports = createPorts();
  ports.registry.getUserById.mockResolvedValue({ chatId: '7', chatName: 'X' });
  ports.messenger.sendPhoto.mockResolvedValue();
  const service = createAdminMessagingService(ports);

  await service.sendDirect({
    actorChatId: 42,
    targetChatId: '7',
    message: 'Photo caption',
    photoFileId: 'telegram-file-id',
  });

  expect(ports.messenger.sendPhoto).toHaveBeenCalledWith(7, 'telegram-file-id', {
    caption: '📩 Message from bot admin:\n\nPhoto caption',
  });
  expect(ports.messenger.sendMessage).not.toHaveBeenCalled();
});

test('does not expose a delivery exception in its safe direct summary', async () => {
  const ports = createPorts();
  ports.registry.getUserById.mockResolvedValue({ chatId: '7', chatName: 'X' });
  ports.messenger.sendMessage.mockRejectedValue(new Error('chat blocked token=secret'));
  const service = createAdminMessagingService(ports);

  const result = await service.sendDirect({
    actorChatId: 42,
    targetChatId: '7',
    message: 'Hello',
  });

  expect(result).toMatchObject({ status: STATUS.FAILED });
  expect(result.summary).not.toContain('chat blocked');
  expect(result.errorMessage).toBe('chat blocked token=secret');
});

test('requires the confirmed broadcast audience to remain unchanged before any sends', async () => {
  const ports = createPorts();
  ports.registry.listAllUsers
    .mockResolvedValueOnce([
      { chatId: '7', chatName: 'A' },
      { chatId: '8', chatName: 'B' },
    ])
    .mockResolvedValueOnce([{ chatId: '7', chatName: 'A' }]);
  const service = createAdminMessagingService(ports);

  const proposedAudience = await service.inspectAudience({ chatId: 42 });
  const result = await service.broadcast({
    actorChatId: 42,
    message: 'Important update',
    expectedAudienceFingerprint: proposedAudience.audience.fingerprint,
  });

  expect(result).toMatchObject({ status: STATUS.CHANGED });
  expect(ports.messenger.sendMessage).not.toHaveBeenCalled();
});

test('reports broadcast partial failures without returning provider errors', async () => {
  const ports = createPorts();
  ports.registry.listAllUsers.mockResolvedValue([
    { chatId: '7', chatName: 'A' },
    { chatId: '8', chatName: 'B' },
  ]);
  ports.messenger.sendMessage
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new Error('recipient blocked provider detail'));
  const service = createAdminMessagingService(ports);

  const result = await service.broadcast({
    actorChatId: 42,
    message: 'Important update',
  });

  expect(result).toMatchObject({
    status: STATUS.OK,
    delivery: { sent: 1, failed: 1, total: 2 },
  });
  expect(result.summary).not.toContain('provider detail');
  expect(result.delivery.failedRecipients).toEqual([
    { chatId: '8', name: 'B' },
  ]);
  expect(ports.audit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'broadcast_message',
    actorChatId: 42,
    audienceCount: 2,
    sent: 1,
    failed: 1,
    outcome: 'partial',
  }));
});
