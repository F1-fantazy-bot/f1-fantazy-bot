const { AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPEN_AI_MODEL } =
  process.env;
const { AzureOpenAI } = require('openai');
const { mapPhotoTypeToSystemPrompt } = require('./utils');
const { sendLogMessage } = require('./utils');

const apiVersion = '2024-04-01-preview';
const options = {
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY,
  AZURE_OPEN_AI_MODEL,
  apiVersion,
};
const client = new AzureOpenAI(options);

exports.extractJsonDataFromPhotos = async function (bot, type, fileLinks) {
  const systemPrompt = mapPhotoTypeToSystemPrompt[type];

  const systemMessage = {
    role: 'system',
    content: systemPrompt,
  };

  // Build an image_url message for every photo
  const photoMessages = fileLinks.map((fileLink) => ({
    type: 'image_url',
    image_url: {
      url: fileLink,
    },
  }));

  const userMessage = {
    role: 'user',
    content: [...photoMessages],
  };

  const completion = await client.chat.completions.create({
    model: AZURE_OPEN_AI_MODEL,
    messages: [systemMessage, userMessage],
  });

  const azureOpenAiTokensString = `Azure OpenAI model - ${AZURE_OPEN_AI_MODEL}, tokens - prompt: ${completion.usage.prompt_tokens}, completion: ${completion.usage.completion_tokens}, total: ${completion.usage.total_tokens}`;
  console.log(azureOpenAiTokensString);
  sendLogMessage(bot, azureOpenAiTokensString);

  return completion.choices[0].message.content;
};
