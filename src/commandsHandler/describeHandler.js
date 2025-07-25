const { AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPEN_AI_MODEL } = process.env;
const { AzureOpenAI } = require('openai');
const { t } = require('../i18n');
const { sendLogMessage } = require('../utils');
const {
  COMMAND_BEST_TEAMS,
  COMMAND_CURRENT_TEAM_INFO,
  COMMAND_PRINT_CACHE,
  COMMAND_RESET_CACHE,
  COMMAND_NEXT_RACE_INFO,
  COMMAND_DESCRIBE,
} = require('../constants');
const { handleNumberMessage } = require('./numberInputHandler');
const { COMMAND_HANDLERS } = require('./commandHandlers');
const { DESCRIBE_SYSTEM_PROMPT } = require('../prompts');

const apiVersion = '2024-04-01-preview';
const client = new AzureOpenAI({
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY,
  AZURE_OPEN_AI_MODEL,
  apiVersion,
});

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
