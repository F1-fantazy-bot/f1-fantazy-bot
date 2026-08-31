// Mock the Azure SDK before importing the module
const mockCostManagementClient = {
  query: {
    usage: jest.fn(),
  },
};

const mockCredential = {};

jest.mock('@azure/arm-costmanagement', () => ({
  CostManagementClient: jest.fn(() => mockCostManagementClient),
}));

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(() => mockCredential),
}));

describe('azureBillingService', () => {
  const originalEnv = process.env;
  let getMonthlyBillingStats, initializeAzureCostManagement;
  let CostManagementClient, DefaultAzureCredential;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Reset environment
    process.env = { ...originalEnv };
    process.env.AZURE_SUBSCRIPTION_ID = 'test-subscription-id';

    // Import fresh modules after reset
    const azureBillingService = require('./azureBillingService');
    ({ getMonthlyBillingStats, initializeAzureCostManagement } =
      azureBillingService);

    const armCostManagement = require('@azure/arm-costmanagement');
    const identity = require('@azure/identity');
    ({ CostManagementClient } = armCostManagement);
    ({ DefaultAzureCredential } = identity);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('initializeAzureCostManagement', () => {
    it('should throw error when AZURE_SUBSCRIPTION_ID is missing', () => {
      delete process.env.AZURE_SUBSCRIPTION_ID;

      expect(() => {
        initializeAzureCostManagement();
      }).toThrow('Missing required Azure configuration: AZURE_SUBSCRIPTION_ID');
    });

    it('should initialize correctly with valid configuration', () => {
      expect(() => {
        initializeAzureCostManagement();
      }).not.toThrow();

      expect(DefaultAzureCredential).toHaveBeenCalled();
      expect(CostManagementClient).toHaveBeenCalledWith(
        mockCredential,
        'test-subscription-id'
      );
    });
  });

  describe('getMonthlyBillingStats', () => {
    it('should return billing data object with service breakdown', async () => {
      // Mock successful API response
      const mockQueryResult = {
        columns: [
          { name: 'ServiceName' },
          { name: 'PreTaxCost' },
          { name: 'Currency' },
        ],
        rows: [
          ['Azure Functions', 75.12, 'USD'],
          ['Azure Storage', 45.67, 'USD'],
          ['Azure Bot Service', 29.46, 'USD'],
        ],
      };

      mockCostManagementClient.query.usage.mockResolvedValue(mockQueryResult);

      const result = await getMonthlyBillingStats();

      expect(result).toEqual({
        currentMonth: {
          hasData: true,
          totalCost: 150.25,
          serviceBreakdown: [
            { serviceName: 'Azure Functions', cost: 75.12, currency: 'USD' },
            { serviceName: 'Azure Storage', cost: 45.67, currency: 'USD' },
            { serviceName: 'Azure Bot Service', cost: 29.46, currency: 'USD' },
          ],
          period: expect.objectContaining({
            startDate: expect.any(String),
            endDate: expect.any(String),
            monthName: expect.any(String),
            year: expect.any(Number),
          }),
        },
        previousMonth: {
          hasData: true,
          totalCost: 150.25,
          serviceBreakdown: [
            { serviceName: 'Azure Functions', cost: 75.12, currency: 'USD' },
            { serviceName: 'Azure Storage', cost: 45.67, currency: 'USD' },
            { serviceName: 'Azure Bot Service', cost: 29.46, currency: 'USD' },
          ],
          period: expect.objectContaining({
            startDate: expect.any(String),
            endDate: expect.any(String),
            monthName: expect.any(String),
            year: expect.any(Number),
          }),
        },
      });

      // Verify the API was called with correct parameters
      expect(mockCostManagementClient.query.usage).toHaveBeenCalledWith(
        '/subscriptions/test-subscription-id',
        expect.objectContaining({
          type: 'ActualCost',
          timeframe: 'Custom',
          dataset: expect.objectContaining({
            granularity: 'None',
            aggregation: expect.objectContaining({
              totalCost: expect.objectContaining({
                name: 'PreTaxCost',
                function: 'Sum',
              }),
            }),
          }),
        }),
        {
          requestOptions: {
            customHeaders: {
              ClientType: 'f1-fantazy-bot',
            },
          },
        }
      );
    });

    it('should handle empty query results', async () => {
      const mockQueryResult = {
        columns: [],
        rows: [],
      };

      mockCostManagementClient.query.usage.mockResolvedValue(mockQueryResult);

      const result = await getMonthlyBillingStats();

      expect(result).toEqual({
        currentMonth: {
          hasData: false,
          totalCost: 0,
          serviceBreakdown: [],
          period: expect.objectContaining({
            startDate: expect.any(String),
            endDate: expect.any(String),
            monthName: expect.any(String),
            year: expect.any(Number),
          }),
        },
        previousMonth: {
          hasData: false,
          totalCost: 0,
          serviceBreakdown: [],
          period: expect.objectContaining({
            startDate: expect.any(String),
            endDate: expect.any(String),
            monthName: expect.any(String),
            year: expect.any(Number),
          }),
        },
      });
    });

    it('should handle null query results', async () => {
      mockCostManagementClient.query.usage.mockResolvedValue(null);

      const result = await getMonthlyBillingStats();

      expect(result).toEqual({
        currentMonth: {
          hasData: false,
          totalCost: 0,
          serviceBreakdown: [],
          period: expect.objectContaining({
            startDate: expect.any(String),
            endDate: expect.any(String),
            monthName: expect.any(String),
            year: expect.any(Number),
          }),
        },
        previousMonth: {
          hasData: false,
          totalCost: 0,
          serviceBreakdown: [],
          period: expect.objectContaining({
            startDate: expect.any(String),
            endDate: expect.any(String),
            monthName: expect.any(String),
            year: expect.any(Number),
          }),
        },
      });
    });

    it('should handle API errors', async () => {
      const mockError = new Error('Azure API rate limit exceeded');
      mockCostManagementClient.query.usage.mockRejectedValue(mockError);

      await expect(getMonthlyBillingStats()).rejects.toThrow(
        'Failed to get billing statistics:'
      );
    });

    it('should cache successful billing data for four hours', async () => {
      const mockQueryResult = {
        columns: [
          { name: 'ServiceName' },
          { name: 'PreTaxCost' },
          { name: 'Currency' },
        ],
        rows: [['Azure Functions', 10, 'USD']],
      };
      let now = 1_000;

      jest.spyOn(Date, 'now').mockImplementation(() => now);
      mockCostManagementClient.query.usage.mockResolvedValue(mockQueryResult);

      const firstResult = await getMonthlyBillingStats();

      now += 4 * 60 * 60 * 1000 - 1;
      const cachedResult = await getMonthlyBillingStats();

      expect(cachedResult).toBe(firstResult);
      expect(mockCostManagementClient.query.usage).toHaveBeenCalledTimes(2);

      now += 1;
      await getMonthlyBillingStats();

      expect(mockCostManagementClient.query.usage).toHaveBeenCalledTimes(4);
    });

    it('should coalesce concurrent billing requests', async () => {
      const mockQueryResult = {
        columns: [],
        rows: [],
      };
      const resolveQueries = [];

      mockCostManagementClient.query.usage.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveQueries.push(resolve);
          })
      );

      const firstRequest = getMonthlyBillingStats();
      const secondRequest = getMonthlyBillingStats();

      expect(mockCostManagementClient.query.usage).toHaveBeenCalledTimes(2);

      resolveQueries.forEach((resolve) => resolve(mockQueryResult));

      await expect(firstRequest).resolves.toEqual(await secondRequest);
      expect(mockCostManagementClient.query.usage).toHaveBeenCalledTimes(2);
    });

    it('should not cache failed billing requests', async () => {
      mockCostManagementClient.query.usage.mockRejectedValueOnce(
        new Error('Temporary Azure error')
      );

      await expect(getMonthlyBillingStats()).rejects.toThrow(
        'Failed to get billing statistics:'
      );

      mockCostManagementClient.query.usage.mockResolvedValue({
        columns: [],
        rows: [],
      });

      await expect(getMonthlyBillingStats()).resolves.toBeDefined();
      expect(mockCostManagementClient.query.usage).toHaveBeenCalledTimes(4);
    });

    it('should filter out zero-cost services', async () => {
      const mockQueryResult = {
        columns: [
          { name: 'ServiceName' },
          { name: 'PreTaxCost' },
          { name: 'Currency' },
        ],
        rows: [
          ['Azure Functions', 75.12, 'USD'],
          ['Azure Free Service', 0, 'USD'],
          ['Azure Storage', 45.67, 'USD'],
        ],
      };

      mockCostManagementClient.query.usage.mockResolvedValue(mockQueryResult);

      const result = await getMonthlyBillingStats();

      expect(result.currentMonth.totalCost).toBe(120.79);
      expect(result.currentMonth.serviceBreakdown).toHaveLength(2);
      expect(result.currentMonth.serviceBreakdown).toEqual([
        { serviceName: 'Azure Functions', cost: 75.12, currency: 'USD' },
        { serviceName: 'Azure Storage', cost: 45.67, currency: 'USD' },
      ]);
    });

    it('should sort services by cost in descending order', async () => {
      const mockQueryResult = {
        columns: [
          { name: 'ServiceName' },
          { name: 'PreTaxCost' },
          { name: 'Currency' },
        ],
        rows: [
          ['Azure Storage', 25.0, 'USD'],
          ['Azure Functions', 100.0, 'USD'],
          ['Azure Bot Service', 50.0, 'USD'],
        ],
      };

      mockCostManagementClient.query.usage.mockResolvedValue(mockQueryResult);

      const result = await getMonthlyBillingStats();

      expect(result.currentMonth.serviceBreakdown[0]).toEqual({
        serviceName: 'Azure Functions',
        cost: 100.0,
        currency: 'USD',
      });
      expect(result.currentMonth.serviceBreakdown[1]).toEqual({
        serviceName: 'Azure Bot Service',
        cost: 50.0,
        currency: 'USD',
      });
      expect(result.currentMonth.serviceBreakdown[2]).toEqual({
        serviceName: 'Azure Storage',
        cost: 25.0,
        currency: 'USD',
      });
    });
  });
});
