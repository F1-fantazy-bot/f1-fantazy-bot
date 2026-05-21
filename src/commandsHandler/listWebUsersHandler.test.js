jest.mock('../webUserAllowlistService', () => ({
  listAllowedUsers: jest.fn(),
}));

jest.mock('../userRegistryService', () => ({
  listAllUsers: jest.fn(),
}));

jest.mock('../i18n', () => ({
  t: jest.fn((key, _chatId, vars) => {
    if (!vars) {return key;}

    return Object.entries(vars).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`{${k}}`, 'g'), String(v)),
      key,
    );
  }),
}));

jest.mock('../utils/utils', () => ({
  isAdminMessage: jest.fn(),
  sendErrorMessage: jest.fn().mockResolvedValue(),
  formatDateTime: jest.fn(() => ({ dateStr: '2026-05-21', timeStr: '12:00' })),
}));

const { listAllowedUsers } = require('../webUserAllowlistService');
const { listAllUsers } = require('../userRegistryService');
const { isAdminMessage, sendErrorMessage } = require('../utils/utils');
const { handleListWebUsersCommand } = require('./listWebUsersHandler');

describe('listWebUsersHandler', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = { sendMessage: jest.fn().mockResolvedValue() };
  });

  it('rejects non-admin users', async () => {
    isAdminMessage.mockReturnValue(false);

    await handleListWebUsersCommand(botMock, { chat: { id: 999 } });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      999,
      'Sorry, only admins can use this command.',
    );
    expect(listAllowedUsers).not.toHaveBeenCalled();
  });

  it('shows "no users" when the allowlist is empty', async () => {
    isAdminMessage.mockReturnValue(true);
    listAllowedUsers.mockResolvedValueOnce([]);
    listAllUsers.mockResolvedValueOnce([]);

    await handleListWebUsersCommand(botMock, { chat: { id: 123 } });

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      'No web users allowlisted yet.',
    );
  });

  it('renders allowlist rows joined with user registry for display names', async () => {
    isAdminMessage.mockReturnValue(true);
    listAllowedUsers.mockResolvedValueOnce([
      {
        email: 'foo@example.com',
        chatId: '12345',
        addedBy: '454873194',
        addedAt: '2026-05-21T12:00:00.000Z',
      },
    ]);
    listAllUsers.mockResolvedValueOnce([
      { chatId: '12345', chatName: 'Foo User', nickname: 'TheFoo' },
    ]);

    await handleListWebUsersCommand(botMock, { chat: { id: 123 } });

    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
    const [target, body, options] = botMock.sendMessage.mock.calls[0];
    expect(target).toBe(123);
    expect(options).toEqual({ parse_mode: 'Markdown' });
    expect(body).toContain('Web Allowlist');
    expect(body).toContain('foo@example.com');
    expect(body).toContain('12345');
    expect(body).toContain('TheFoo');
    expect(body).toContain('Added: 2026-05-21, 12:00');
    expect(body).toContain('Added by');
  });

  it('falls back to chatName when no nickname is set, and (unknown) when user not in registry', async () => {
    isAdminMessage.mockReturnValue(true);
    listAllowedUsers.mockResolvedValueOnce([
      { email: 'a@e.com', chatId: '1' },
      { email: 'b@e.com', chatId: '9999' },
    ]);
    listAllUsers.mockResolvedValueOnce([
      { chatId: '1', chatName: 'Just Name' },
    ]);

    await handleListWebUsersCommand(botMock, { chat: { id: 123 } });

    const [, body] = botMock.sendMessage.mock.calls[0];
    expect(body).toContain('Just Name');
    expect(body).toContain('(unknown)');
  });

  it('reports failures via sendErrorMessage and user-facing text', async () => {
    isAdminMessage.mockReturnValue(true);
    listAllowedUsers.mockRejectedValueOnce(new Error('storage down'));
    listAllUsers.mockResolvedValueOnce([]);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await handleListWebUsersCommand(botMock, { chat: { id: 123 } });

    expect(sendErrorMessage).toHaveBeenCalledWith(
      botMock,
      expect.stringContaining('storage down'),
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      123,
      '❌ Error fetching web allowlist: storage down',
    );
  });
});
