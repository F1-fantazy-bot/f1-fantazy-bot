const { KILZI_CHAT_ID } = require('../constants');

const mockSendErrorMessage = jest.fn().mockResolvedValue();
const mockGetLatestAnnouncement = jest.fn();

jest.mock('../utils', () => ({
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
    botMock = {
      sendMessage: jest.fn().mockResolvedValue(),
    };
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

  it('escapes underscores inside /commands so Markdown parsing keeps them intact', async () => {
    mockGetLatestAnnouncement.mockReturnValue({
      id: 'x',
      createdAt: '2026-04-15T10:00:00.000Z',
      version: 'standard',
      text: '*בולד* — נסו /best_teams ו־/follow_league',
    });
    const msg = { chat: { id: KILZI_CHAT_ID }, text: '/whats_new' };

    await handleWhatsNewCommand(botMock, msg);

    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      '*בולד* — נסו /best\\_teams ו־/follow\\_league',
      { parse_mode: 'Markdown' },
    );
  });

  it('sends the latest announcement text with Markdown parse_mode', async () => {
    mockGetLatestAnnouncement.mockReturnValue({
      id: 'x',
      createdAt: '2026-04-15T10:00:00.000Z',
      version: 'standard',
      text: '*בולד* שלום עולם',
    });
    const msg = { chat: { id: KILZI_CHAT_ID }, text: '/whats_new' };

    await handleWhatsNewCommand(botMock, msg);

    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      '*בולד* שלום עולם',
      { parse_mode: 'Markdown' },
    );
  });

  it('falls back to the un-escaped plain text when markdown send fails', async () => {
    mockGetLatestAnnouncement.mockReturnValue({
      id: 'x',
      createdAt: '2026-04-15T10:00:00.000Z',
      version: 'standard',
      text: 'broken *markdown /best_teams',
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
      'broken *markdown /best\\_teams',
      { parse_mode: 'Markdown' },
    );
    expect(botMock.sendMessage).toHaveBeenNthCalledWith(
      2,
      KILZI_CHAT_ID,
      'broken *markdown /best_teams',
    );
    consoleErrorSpy.mockRestore();
  });
});
