const { handleBillingStats } = require('./billingStatsHandler');
const { getMonthlyBillingStats } = require('../azureBillingService');
const { sendLogMessage, isAdminMessage } = require('../utils/utils');

// Mock the dependencies
jest.mock('../azureBillingService');
jest.mock('../utils/utils');

describe('billingStatsHandler', () => {
  let mockBot;
  let mockMsg;
  const mockChatId = 123456;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock bot with sendMessage method
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({}),
    };

    // Mock message object
    mockMsg = {
      chat: { id: mockChatId },
      from: { id: 111111 },
    };

    // Mock sendLogMessage and isAdminMessage
    sendLogMessage.mockResolvedValue();
    isAdminMessage.mockReturnValue(true); // Default to admin
  });

  describe('handleBillingStats', () => {
    it('should successfully fetch and send billing statistics', async () => {
      // Mock successful billing stats data with current and previous month
      const mockBillingData = {
        currentMonth: {
          hasData: true,
          totalCost: 150.25,
          serviceBreakdown: [
            { serviceName: 'Azure Functions', cost: 75.12, currency: 'USD' },
            { serviceName: 'Azure Storage', cost: 45.67, currency: 'USD' },
            { serviceName: 'Azure Bot Service', cost: 29.46, currency: 'USD' },
          ],
          period: {
            startDate: '2025-06-01',
            endDate: '2025-06-30',
            monthName: 'June',
            year: 2025,
          },
        },
        previousMonth: {
          hasData: true,
          totalCost: 125.8,
          serviceBreakdown: [
            { serviceName: 'Azure Functions', cost: 65.2, currency: 'USD' },
            { serviceName: 'Azure Storage', cost: 35.3, currency: 'USD' },
            { serviceName: 'Azure Bot Service', cost: 25.3, currency: 'USD' },
          ],
          period: {
            startDate: '2025-05-01',
            endDate: '2025-05-31',
            monthName: 'May',
            year: 2025,
          },
        },
      };
      getMonthlyBillingStats.mockResolvedValue(mockBillingData);

      await handleBillingStats(mockBot, mockMsg);

      // Verify billing stats message was sent with formatted content
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('*Azure Billing Statistics*'),
        { parse_mode: 'Markdown' }
      );
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('*Current Month*'),
        { parse_mode: 'Markdown' }
      );
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('*Previous Month*'),
        { parse_mode: 'Markdown' }
      );
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('*📈 Month-over-Month Comparison:*'),
        { parse_mode: 'Markdown' }
      );
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('📊 *Service Breakdown:*'),
        { parse_mode: 'Markdown' }
      );

      // Verify admin check was performed
      expect(isAdminMessage).toHaveBeenCalledWith(mockMsg);
    });

    it('should deny access to non-admin users', async () => {
      // Mock non-admin user
      isAdminMessage.mockReturnValue(false);

      await handleBillingStats(mockBot, mockMsg);

      // Verify access denied message was sent
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        'Sorry, only admins can access billing statistics.'
      );

      // Verify billing stats were NOT fetched
      expect(getMonthlyBillingStats).not.toHaveBeenCalled();
      expect(isAdminMessage).toHaveBeenCalledWith(mockMsg);
    });

    it('should handle no data gracefully', async () => {
      // Mock billing data with no results
      const mockBillingData = {
        currentMonth: {
          hasData: false,
          totalCost: 0,
          serviceBreakdown: [],
          period: {
            startDate: '2025-06-01',
            endDate: '2025-06-30',
            monthName: 'June',
            year: 2025,
          },
        },
        previousMonth: {
          hasData: false,
          totalCost: 0,
          serviceBreakdown: [],
          period: {
            startDate: '2025-05-01',
            endDate: '2025-05-31',
            monthName: 'May',
            year: 2025,
          },
        },
      };
      getMonthlyBillingStats.mockResolvedValue(mockBillingData);

      await handleBillingStats(mockBot, mockMsg);

      // Verify no data message was sent
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('No billing data available for this period'),
        { parse_mode: 'Markdown' }
      );

      // Verify admin check was performed
      expect(isAdminMessage).toHaveBeenCalledWith(mockMsg);
    });

    it('should handle errors gracefully', async () => {
      // Mock billing service error
      const mockError = new Error('Azure authentication failed');
      getMonthlyBillingStats.mockRejectedValue(mockError);

      await handleBillingStats(mockBot, mockMsg);

      // Verify error message was sent
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        '❌ Error fetching billing statistics: Azure authentication failed\n\nPlease check your Azure configuration and permissions.'
      );

      // Verify error logging
      expect(sendLogMessage).toHaveBeenCalledWith(
        mockBot,
        'Error fetching billing stats: Azure authentication failed'
      );

      // Verify admin check was performed
      expect(isAdminMessage).toHaveBeenCalledWith(mockMsg);
    });

    it('should handle bot sendMessage errors gracefully', async () => {
      // Mock successful billing stats data
      const mockBillingData = {
        currentMonth: {
          hasData: true,
          totalCost: 150.25,
          serviceBreakdown: [
            { serviceName: 'Azure Functions', cost: 75.12, currency: 'USD' },
          ],
          period: {
            startDate: '2025-06-01',
            endDate: '2025-06-30',
            monthName: 'June',
            year: 2025,
          },
        },
        previousMonth: {
          hasData: true,
          totalCost: 125.8,
          serviceBreakdown: [
            { serviceName: 'Azure Functions', cost: 65.2, currency: 'USD' },
          ],
          period: {
            startDate: '2025-05-01',
            endDate: '2025-05-31',
            monthName: 'May',
            year: 2025,
          },
        },
      };
      getMonthlyBillingStats.mockResolvedValue(mockBillingData);

      // Mock bot sendMessage to fail
      mockBot.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      // Mock console.error to avoid noise in test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleBillingStats(mockBot, mockMsg);

      // Verify console.error was called for the sendMessage error
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error sending billing stats message:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
