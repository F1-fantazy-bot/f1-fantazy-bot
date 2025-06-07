const { getMonthlyBillingStats } = require('../azureBillingService');
const { sendLogMessage, isAdminMessage } = require('../utils/utils');

/**
 * Handle the billing statistics command
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} msg - The Telegram message object
 */
async function handleBillingStats(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      'Sorry, only admins can access billing statistics.'
    );

    return;
  }

  try {
    // Get the billing statistics data
    const billingData = await getMonthlyBillingStats();

    // Format the data into a message
    const billingMessage = formatBillingMessage(billingData);

    // Send the formatted billing statistics
    await bot
      .sendMessage(chatId, billingMessage, { parse_mode: 'Markdown' })
      .catch((err) =>
        console.error('Error sending billing stats message:', err)
      );
  } catch (error) {
    console.error('Error in handleBillingStats:', error);
    await sendLogMessage(bot, `Error fetching billing stats: ${error.message}`);

    await bot
      .sendMessage(
        chatId,
        `❌ Error fetching billing statistics: ${error.message}\n\nPlease check your Azure configuration and permissions.`
      )
      .catch((err) =>
        console.error('Error sending billing error message:', err)
      );
  }
}

/**
 * Format billing data for a single month
 * @param {Object} monthData - The billing data for a single month
 * @param {string} title - Title for this month's section
 * @returns {string} Formatted message section for Telegram
 */
function formatMonthSection(monthData, title) {
  if (!monthData.hasData) {
    return `*${title}*\nNo billing data available for this period.\n\n`;
  }

  const { period, totalCost, serviceBreakdown } = monthData;
  let message = `*${title}*\n`;
  message += `📅 ${period.monthName} ${period.year} (${period.startDate} to ${period.endDate})\n`;
  message += `💰 *Total: $${totalCost.toFixed(2)}*\n`;

  if (serviceBreakdown.length > 0) {
    message += `📊 *Service Breakdown:*\n`;
    serviceBreakdown.forEach((service) => {
      message += `• ${service.serviceName}: $${service.cost.toFixed(2)}\n`;
    });
  }

  return message + '\n';
}

/**
 * Format billing data into a Telegram message
 * @param {Object} billingData - The billing data object with current and previous month
 * @returns {string} Formatted message for Telegram
 */
function formatBillingMessage(billingData) {
  const { currentMonth, previousMonth } = billingData;

  let message = `*Azure Billing Statistics*\n\n`;

  // Current month section
  message += formatMonthSection(currentMonth, 'Current Month');

  // Previous month section
  message += formatMonthSection(previousMonth, 'Previous Month');

  // Comparison if both months have data
  if (currentMonth.hasData && previousMonth.hasData) {
    const currentCost = currentMonth.totalCost;
    const previousCost = previousMonth.totalCost;
    const difference = currentCost - previousCost;
    const percentChange =
      previousCost > 0 ? (difference / previousCost) * 100 : 0;

    message += `*📈 Month-over-Month Comparison:*\n`;
    if (difference > 0) {
      message += `📈 Increase: $${difference.toFixed(
        2
      )} (+${percentChange.toFixed(1)}%)\n`;
    } else if (difference < 0) {
      message += `📉 Decrease: $${Math.abs(difference).toFixed(2)} (-${Math.abs(
        percentChange
      ).toFixed(1)}%)\n`;
    } else {
      message += `➡️ No change: $0.00 (0.0%)\n`;
    }
  }

  return message;
}

module.exports = { handleBillingStats };
