const {
  STATUS,
  createAdminAccessService,
  isValidEmail,
  normalizeEmail,
} = require('./adminAccessService');

function createPorts() {
  return {
    registry: {
      getUserById: jest.fn(),
      updateUserAttributes: jest.fn(),
    },
    allowlist: {
      getAllowedUserByEmail: jest.fn(),
      addAllowedUser: jest.fn(),
      removeAllowedUser: jest.fn(),
    },
    cache: {},
  };
}

test('normalizes Google emails with the same permissive preflight as Telegram', () => {
  expect(normalizeEmail('  Doron@Example.COM  ')).toBe('doron@example.com');
  expect(isValidEmail('Doron@Example.COM')).toBe(true);
  expect(isValidEmail('not an email')).toBe(false);
});

test('sets a nickname only after a fresh target lookup and publishes the durable value to cache', async () => {
  const ports = createPorts();
  ports.registry.getUserById.mockResolvedValue({
    chatId: '7',
    chatName: 'Fast Driver',
    nickname: 'Old name',
  });
  const service = createAdminAccessService(ports);

  const result = await service.setUserNickname({
    chatId: 42,
    targetChatId: ' 7 ',
    nickname: ' New name ',
  });

  expect(result).toMatchObject({
    status: STATUS.OK,
    targetChatId: '7',
    nickname: 'New name',
    changed: true,
  });
  expect(ports.registry.updateUserAttributes).toHaveBeenCalledWith('7', {
    nickname: 'New name',
  });
  expect(ports.cache).toEqual({ '7': { nickname: 'New name' } });
});

test('detects nickname no-ops and confirmation-time target changes without writing', async () => {
  const ports = createPorts();
  ports.registry.getUserById.mockResolvedValue({
    chatId: '7',
    chatName: 'Fast Driver',
    nickname: 'Existing',
  });
  const service = createAdminAccessService(ports);

  await expect(
    service.setUserNickname({
      chatId: 42,
      targetChatId: '7',
      nickname: 'Existing',
    }),
  ).resolves.toMatchObject({ status: STATUS.OK, changed: false });
  expect(ports.registry.updateUserAttributes).not.toHaveBeenCalled();

  await expect(
    service.setUserNickname({
      chatId: 42,
      targetChatId: '7',
      nickname: 'New name',
      expectedNickname: 'Old name',
    }),
  ).resolves.toMatchObject({ status: STATUS.CHANGED });
  expect(ports.registry.updateUserAttributes).not.toHaveBeenCalled();
});

test('normalizes and previews an allowlist remap, then writes the canonical mapping', async () => {
  const ports = createPorts();
  ports.registry.getUserById.mockResolvedValue({
    chatId: '7',
    chatName: 'Fast Driver',
  });
  ports.allowlist.getAllowedUserByEmail.mockResolvedValue({
    email: 'doron@example.com',
    chatId: '4',
  });
  const service = createAdminAccessService(ports);

  const inspected = await service.inspectWebUserAllowance({
    chatId: 42,
    email: ' Doron@Example.COM ',
    targetChatId: '7',
  });
  expect(inspected).toMatchObject({
    status: STATUS.OK,
    email: 'doron@example.com',
    targetChatId: '7',
    changed: true,
  });

  const result = await service.allowWebUser({
    chatId: 42,
    email: 'Doron@Example.COM',
    targetChatId: '7',
    expectedExistingChatId: '4',
  });
  expect(result).toMatchObject({ status: STATUS.OK, changed: true });
  expect(ports.allowlist.addAllowedUser).toHaveBeenCalledWith(
    'doron@example.com',
    '7',
    42,
  );
});

test('does not overwrite an allowlist entry changed after the proposal', async () => {
  const ports = createPorts();
  ports.registry.getUserById.mockResolvedValue({ chatId: '7', chatName: 'X' });
  ports.allowlist.getAllowedUserByEmail.mockResolvedValue({
    email: 'doron@example.com',
    chatId: '99',
  });
  const service = createAdminAccessService(ports);

  await expect(
    service.allowWebUser({
      chatId: 42,
      email: 'doron@example.com',
      targetChatId: '7',
      expectedExistingChatId: null,
    }),
  ).resolves.toMatchObject({ status: STATUS.CHANGED });
  expect(ports.allowlist.addAllowedUser).not.toHaveBeenCalled();
});

test('revokes only a still-matching normalized allowlist entry', async () => {
  const ports = createPorts();
  ports.allowlist.getAllowedUserByEmail.mockResolvedValue({
    email: 'doron@example.com',
    chatId: '7',
  });
  const service = createAdminAccessService(ports);

  const result = await service.revokeWebUser({
    chatId: 42,
    email: ' Doron@Example.COM ',
    expectedExistingChatId: '7',
  });
  expect(result).toMatchObject({ status: STATUS.OK, email: 'doron@example.com' });
  expect(ports.allowlist.removeAllowedUser).toHaveBeenCalledWith(
    'doron@example.com',
  );
});

test('returns a no-op for a web user that is no longer allowlisted', async () => {
  const ports = createPorts();
  ports.allowlist.getAllowedUserByEmail.mockResolvedValue(null);
  const service = createAdminAccessService(ports);

  await expect(
    service.revokeWebUser({ chatId: 42, email: 'gone@example.com' }),
  ).resolves.toMatchObject({ status: STATUS.NOT_FOUND });
  expect(ports.allowlist.removeAllowedUser).not.toHaveBeenCalled();
});
