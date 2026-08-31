const { getLanguage } = require('../i18n');
const {
  getTelegramUsageFlow,
} = require('../cores/agentGuideCore');

function buildFlowMessage(chatId) {
  const lang = getLanguage(chatId);
  const flow = getTelegramUsageFlow(lang);
  const steps = flow.steps
    .map(
      ([marker, title, body]) =>
        `${marker} ${title}\n   ${body}`,
    )
    .join('\n\n');

  return `${flow.title}\n\n${flow.intro}\n\n${steps}\n\n${flow.tipsTitle}\n${flow.tips.join('\n')}`;
}

async function handleFlowCommand(bot, msg) {
  const chatId = msg.chat.id;
  const flowMessage = buildFlowMessage(chatId);

  await bot
    .sendMessage(chatId, flowMessage, { parse_mode: 'Markdown' })
    .catch((err) => console.error('Error sending flow message:', err));
}

module.exports = { handleFlowCommand };
