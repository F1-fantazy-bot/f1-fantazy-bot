const { KILZI_CHAT_ID } = require('../constants');

const mockIsAdminMessage = jest.fn().mockReturnValue(true);
const mockTriggerScraping = jest.fn();

jest.mock('../utils', () => ({
  isAdminMessage: mockIsAdminMessage,
  triggerScraping: mockTriggerScraping,
}));

const { handleScrapingTrigger } = require('./scrapingTriggerHandler');

describe('handleScrapingTrigger', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdminMessage.mockReset();
    mockIsAdminMessage.mockReturnValue(true);
    mockTriggerScraping.mockReset();
  });

  it('should deny access if user is not admin', async () => {
    mockIsAdminMessage.mockReturnValue(false);

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/trigger_scraping',
    };

    await handleScrapingTrigger(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Sorry, only admins can trigger scraping.'
    );
    expect(mockTriggerScraping).not.toHaveBeenCalled();
  });

  it('should trigger scraping successfully when user is admin', async () => {
    mockTriggerScraping.mockResolvedValue({ success: true });

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/trigger_scraping',
    };

    await handleScrapingTrigger(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(mockTriggerScraping).toHaveBeenCalledWith(botMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Web scraping triggered successfully.'
    );
  });

  it('should handle scraping failure', async () => {
    const errorMessage = 'Failed to connect to scraping service';
    mockTriggerScraping.mockResolvedValue({
      success: false,
      error: errorMessage,
    });

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/trigger_scraping',
    };

    await handleScrapingTrigger(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(mockTriggerScraping).toHaveBeenCalledWith(botMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      `Failed to trigger web scraping: ${errorMessage}`
    );
  });

  it('should handle scraping service throwing an error', async () => {
    mockTriggerScraping.mockRejectedValue(new Error('Service unavailable'));

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/trigger_scraping',
    };

    await expect(handleScrapingTrigger(botMock, msgMock)).rejects.toThrow(
      'Service unavailable'
    );

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(mockTriggerScraping).toHaveBeenCalledWith(botMock);
  });

  it('should work with different chat IDs for admin users', async () => {
    const adminChatId = 'admin_chat_999';
    mockTriggerScraping.mockResolvedValue({ success: true });

    const msgMock = {
      chat: { id: adminChatId },
      text: '/trigger_scraping',
    };

    await handleScrapingTrigger(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      adminChatId,
      'Web scraping triggered successfully.'
    );
  });

  it('should verify admin check is called first', async () => {
    mockIsAdminMessage.mockReturnValue(false);

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/trigger_scraping',
    };

    await handleScrapingTrigger(botMock, msgMock);

    expect(mockIsAdminMessage).toHaveBeenCalledWith(msgMock);
    expect(mockTriggerScraping).not.toHaveBeenCalled();
    // Admin check should be called first, and scraping should not be triggered for non-admin
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Sorry, only admins can trigger scraping.'
    );
  });

  it('should handle success result without error field', async () => {
    mockTriggerScraping.mockResolvedValue({ success: true });

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/trigger_scraping',
    };

    await handleScrapingTrigger(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Web scraping triggered successfully.'
    );
  });
});
