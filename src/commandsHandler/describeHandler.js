const { AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPEN_AI_MODEL } = process.env;
const { AzureOpenAI } = require('openai');
const { t } = require('../i18n');
const { sendLogMessage } = require('../utils');
const {
  COMMAND_BEST_TEAMS,
  COMMAND_CURRENT_TEAM_INFO,
  COMMAND_CHIPS,
  COMMAND_PRINT_CACHE,
  COMMAND_RESET_CACHE,
  COMMAND_HELP,
  COMMAND_TRIGGER_SCRAPING,
  COMMAND_LOAD_SIMULATION,
  COMMAND_GET_CURRENT_SIMULATION,
  COMMAND_GET_BOTFATHER_COMMANDS,
  COMMAND_NEXT_RACE_INFO,
  COMMAND_BILLING_STATS,
  COMMAND_VERSION,
  COMMAND_MENU,
  COMMAND_SET_LANGUAGE,
  COMMAND_DESCRIBE,
} = require('../constants');
const {
  handleBestTeamsMessage,
} = require('./bestTeamsHandler');
const { handleChipsMessage } = require('./chipsHandler');
const { calcCurrentTeamInfo } = require('./currentTeamInfoHandler');
const { handleGetBotfatherCommands } = require('./getBotfatherCommandsHandler');
const { handleGetCurrentSimulation } = require('./getCurrentSimulationHandler');
const { displayHelpMessage } = require('./helpHandler');
const { handleLoadSimulation } = require('./loadSimulationHandler');
const { handleNextRaceInfoCommand } = require('./nextRaceInfoHandler');
const { handleNumberMessage } = require('./numberInputHandler');
const { sendPrintableCache } = require('./printCacheHandler');
const { resetCacheForChat } = require('./resetCacheHandler');
const { handleScrapingTrigger } = require('./scrapingTriggerHandler');
const { handleBillingStats } = require('./billingStatsHandler');
const { displayMenuMessage } = require('./menuHandler');
const { handleVersionCommand } = require('./versionHandler');
const { handleSetLanguage } = require('./setLanguageHandler');
const { DESCRIBE_SYSTEM_PROMPT } = require('../prompts');

const apiVersion = '2024-04-01-preview';
const client = new AzureOpenAI({
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY,
  AZURE_OPEN_AI_MODEL,
  apiVersion,
});

const COMMAND_HANDLERS = {
  [COMMAND_BEST_TEAMS]: handleBestTeamsMessage,
  [COMMAND_CURRENT_TEAM_INFO]: calcCurrentTeamInfo,
  [COMMAND_CHIPS]: handleChipsMessage,
  [COMMAND_PRINT_CACHE]: sendPrintableCache,
  [COMMAND_RESET_CACHE]: resetCacheForChat,
  [COMMAND_HELP]: displayHelpMessage,
  [COMMAND_TRIGGER_SCRAPING]: handleScrapingTrigger,
  [COMMAND_LOAD_SIMULATION]: handleLoadSimulation,
  [COMMAND_GET_CURRENT_SIMULATION]: handleGetCurrentSimulation,
  [COMMAND_GET_BOTFATHER_COMMANDS]: handleGetBotfatherCommands,
  [COMMAND_NEXT_RACE_INFO]: handleNextRaceInfoCommand,
  [COMMAND_BILLING_STATS]: handleBillingStats,
  [COMMAND_VERSION]: handleVersionCommand,
  [COMMAND_MENU]: displayMenuMessage,
  [COMMAND_SET_LANGUAGE]: handleSetLanguage,
  [COMMAND_DESCRIBE]: undefined,
};

async function executeCommand(bot, msg, command) {
  const chatId = msg.chat.id;
  const handler = COMMAND_HANDLERS[command];
  if (!handler) {
    return;
  }
  if (command === COMMAND_PRINT_CACHE || command === COMMAND_RESET_CACHE) {
    await handler(chatId, bot);
  } else if (
    command === COMMAND_BEST_TEAMS ||
    command === COMMAND_CURRENT_TEAM_INFO ||
    command === COMMAND_NEXT_RACE_INFO
  ) {
    await handler(bot, chatId);
  } else {
    const subMsg = { ...msg, text: command };
    await handler(bot, subMsg);
  }
}

async function handleDescribeCommand(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text.replace(COMMAND_DESCRIBE, '').trim();

  if (!text) {
    await bot.sendMessage(
      chatId,
      t('Please provide a description after the command.', chatId)
    );

    return;
  }

  const systemMessage = { role: 'system', content: DESCRIBE_SYSTEM_PROMPT };
  const userMessage = { role: 'user', content: text };

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: AZURE_OPEN_AI_MODEL,
      messages: [systemMessage, userMessage],
    });
  } catch (error) {
    console.error('AzureOpenAI error:', error);
    await bot.sendMessage(chatId, t('Error executing command', chatId));

    return;
  }

  const usage = completion.usage;
  const tokensInfo = `Azure OpenAI model - ${AZURE_OPEN_AI_MODEL}, tokens - prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens}, total: ${usage.total_tokens}`;
  console.log(tokensInfo);
  await sendLogMessage(bot, tokensInfo);

  let commands;
  try {
    commands = JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.error('Failed to parse AI response:', completion.choices[0].message.content);
    await bot.sendMessage(chatId, t('Error executing command', chatId));

    return;
  }

  for (const cmd of commands) {
    if (typeof cmd !== 'string') {
      continue;
    }
    if (/^\d+$/.test(cmd)) {
      await handleNumberMessage(bot, chatId, cmd);
      continue;
    }
    await executeCommand(bot, msg, cmd);
  }
}

module.exports = { handleDescribeCommand };
