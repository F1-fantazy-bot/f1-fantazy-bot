const { AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPEN_AI_MODEL } = process.env;
const { AzureOpenAI } = require('openai');
const { t } = require('../i18n');
const { sendLogMessage, sendErrorMessage, isAdminMessage } = require('../utils');
const { handleNumberMessage } = require('./numberInputHandler');
const { executeCommand } = require('./commandHandlers');

const { buildAskSystemPrompt } = require('../prompts');

const apiVersion = '2024-04-01-preview';
const client = new AzureOpenAI({
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY,
  AZURE_OPEN_AI_MODEL,
  apiVersion,
});


async function handleAskCommand(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (!text) {
    await bot.sendMessage(
      chatId,
      t('Please provide a question.', chatId)
    );

    return;
  }

  const isAdmin = isAdminMessage(msg);
  const systemMessage = { role: 'system', content: buildAskSystemPrompt(isAdmin) };
  const userMessage = { role: 'user', content: text };

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: AZURE_OPEN_AI_MODEL,
      messages: [systemMessage, userMessage],
    });
  } catch (error) {
    await sendErrorMessage(bot, `AzureOpenAI error: ${error.message}`);
    await bot.sendMessage(chatId, t('Error executing command', chatId));

    return;
  }

  const usage = completion.usage;
  const tokensInfo = `Azure OpenAI model - ${AZURE_OPEN_AI_MODEL}, tokens - prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens}, total: ${usage.total_tokens}`;
  await sendLogMessage(bot, tokensInfo);

  let commands;
  try {
    commands = JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    await sendErrorMessage(
      bot,
      `Failed to parse AI response: ${completion.choices[0].message.content}`
    );
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

module.exports = { handleAskCommand };
