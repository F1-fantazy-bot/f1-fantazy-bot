const { KILZI_CHAT_ID } = require('../constants');

const mockIsAdminMessage = jest.fn().mockReturnValue(true);
const mockSendErrorMessage = jest.fn().mockResolvedValue();
const mockGetLatestAnnouncement = jest.fn();

jest.mock('../utils', () => ({
  isAdminMessage: mockIsAdminMessage,
  sendErrorMessage: mockSendErrorMessage,
}));

jest.mock('../announcementsService', () => ({
  getLatestAnnouncement: mockGetLatestAnnouncement,
}));

const { handleWhatsNewCommand } = require('./whatsNewHandler');

describe('handleWhatsNewCommand', () => {
  let botMock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdminMessage.mockReturnValue(true);
    botMock = {
      sendMessage: jest.fn().mockResolvedValue(),
    };
  });

  it('denies access for non-admin users', async () => {
    mockIsAdminMessage.mockReturnValue(false);
    const msg = { chat: { id: KILZI_CHAT_ID }, text: '/whats_new' };

    await handleWhatsNewCommand(botMock, msg);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Sorry, only admins can use this command.',
    );
    expect(mockGetLatestAnnouncement).not.toHaveBeenCalled();
  });

  it('shows fallback message when there are no announcements', async () => {
    mockGetLatestAnnouncement.mockReturnValue(null);
    const msg = { chat: { id: KILZI_CHAT_ID }, text: '/whats_new' };

    await handleWhatsNewCommand(botMock, msg);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'No release notes available yet.',
    );
  });

  it('sends the latest announcement text with Markdown parse_mode', async () => {
    mockGetLatestAnnouncement.mockReturnValue({
      id: 'x',
      createdAt: '2026-04-15T10:00:00.000Z',
      version: 'standard',
      text: '*בולד* שלום עולם — נסו /best_teams',
    });
    const msg = { chat: { id: KILZI_CHAT_ID }, text: '/whats_new' };

    await handleWhatsNewCommand(botMock, msg);

    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      '*בולד* שלום עולם — נסו /best_teams',
      { parse_mode: 'Markdown' },
    );
  });

  it('falls back to plain text when markdown send fails', async () => {
    mockGetLatestAnnouncement.mockReturnValue({
      id: 'x',
      createdAt: '2026-04-15T10:00:00.000Z',
      version: 'standard',
      text: 'broken *markdown',
    });
    botMock.sendMessage = jest
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('parse error')))
      .mockResolvedValueOnce();
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const msg = { chat: { id: KILZI_CHAT_ID }, text: '/whats_new' };

    await handleWhatsNewCommand(botMock, msg);

    expect(botMock.sendMessage).toHaveBeenCalledTimes(2);
    expect(botMock.sendMessage).toHaveBeenNthCalledWith(
      1,
      KILZI_CHAT_ID,
      'broken *markdown',
      { parse_mode: 'Markdown' },
    );
    expect(botMock.sendMessage).toHaveBeenNthCalledWith(
      2,
      KILZI_CHAT_ID,
      'broken *markdown',
    );
    consoleErrorSpy.mockRestore();
  });
});
