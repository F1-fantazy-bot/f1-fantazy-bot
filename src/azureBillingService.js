const { CostManagementClient } = require('@azure/arm-costmanagement');
const { DefaultAzureCredential } = require('@azure/identity');

let costManagementClient;

/**
 * Initialize Azure Cost Management client using environment variables
 * @throws {Error} If required Azure configuration is missing
 */
function initializeAzureCostManagement() {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;

  if (!subscriptionId) {
    throw new Error(
      'Missing required Azure configuration: AZURE_SUBSCRIPTION_ID'
    );
  }

  // Use DefaultAzureCredential which will try multiple authentication methods
  const credential = new DefaultAzureCredential();
  costManagementClient = new CostManagementClient(credential, subscriptionId);
}

/**
 * Get Azure billing statistics for current and previous month
 * @returns {Promise<Object>} Billing data object with current and previous month data
 */
async function getMonthlyBillingStats() {
  try {
    // Fetch both current and previous month data in parallel
    const [currentMonth, previousMonth] = await Promise.all([
      getBillingStatsForMonth(0), // Current month
      getBillingStatsForMonth(-1), // Previous month
    ]);

    return {
      currentMonth,
      previousMonth,
    };
  } catch (error) {
    throw new Error(`Failed to get billing statistics: ${error.message}`);
  }
}

/**
 * Get Azure billing statistics for a specific month
 * @param {number} monthOffset - Number of months to offset from current (0 = current, -1 = previous)
 * @returns {Promise<Object>} Billing data object with totalCost, serviceBreakdown, etc.
 */
async function getBillingStatsForMonth(monthOffset = 0) {
  try {
    if (!costManagementClient) {
      initializeAzureCostManagement();
    }

    const period = getMonthDateRange(monthOffset);
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;

    // Define the query parameters for cost analysis
    const queryDefinition = {
      type: 'ActualCost',
      timeframe: 'Custom',
      timePeriod: {
        from: period.startDate,
        to: period.endDate,
      },
      dataset: {
        granularity: 'None',
        aggregation: {
          totalCost: {
            name: 'PreTaxCost',
            function: 'Sum',
          },
        },
        grouping: [
          {
            type: 'Dimension',
            name: 'ServiceName',
          },
        ],
      },
    };

    // Execute the query
    const scope = `/subscriptions/${subscriptionId}`;
    const queryResult = await costManagementClient.query.usage(
      scope,
      queryDefinition
    );

    return processBillingData(queryResult, period);
  } catch (error) {
    throw new Error(
      `Failed to get billing statistics for month offset ${monthOffset}: ${error.message}`
    );
  }
}

/**
 * Get a month's date range for billing queries
 * @param {number} monthOffset - Number of months to offset from current (0 = current, -1 = previous)
 * @returns {Object} Object with startDate, endDate as ISO strings, and monthName
 */
function getMonthDateRange(monthOffset = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + monthOffset;

  // Handle year rollover for previous months
  const targetDate = new Date(year, month, 1);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();

  // Create start date (first day of target month)
  const startDate = new Date(targetYear, targetMonth, 1);

  // Create end date (last day of target month)
  const endDate = new Date(targetYear, targetMonth + 1, 0);

  // Format dates as YYYY-MM-DD in local timezone
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  const monthName = startDate.toLocaleDateString('en-US', { month: 'long' });

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    monthName,
    year: targetYear,
  };
}

/**
 * Process cost data from Azure API response
 * @param {Object} queryResult - The query result from Azure Cost Management API
 * @param {Object} period - The date period object with startDate and endDate
 * @returns {Object} Processed billing data object
 */
function processBillingData(queryResult, period) {
  if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
    return {
      hasData: false,
      totalCost: 0,
      serviceBreakdown: [],
      period,
    };
  }

  let totalCost = 0;
  const serviceBreakdown = [];

  // Process the query results
  queryResult.rows.forEach((row) => {
    if (queryResult.columns) {
      let serviceName = 'Unknown Service';
      let cost = 0;
      let currency = 'USD';

      queryResult.columns.forEach((column, index) => {
        switch (column.name) {
          case 'ServiceName':
          case 'ServiceTier':
          case 'Service':
            if (row[index]) {
              serviceName = row[index];
            }
            break;
          case 'Cost':
          case 'PreTaxCost':
            cost = parseFloat(row[index]) || 0;
            break;
          case 'Currency':
            if (row[index]) {
              currency = row[index];
            }
            break;
        }
      });

      if (cost > 0) {
        totalCost += cost;
        serviceBreakdown.push({ serviceName, cost, currency });
      }
    }
  });

  // Sort services by cost (highest first)
  serviceBreakdown.sort((a, b) => b.cost - a.cost);

  return {
    hasData: true,
    totalCost,
    serviceBreakdown,
    period,
  };
}

module.exports = {
  getMonthlyBillingStats,
  initializeAzureCostManagement,
};
