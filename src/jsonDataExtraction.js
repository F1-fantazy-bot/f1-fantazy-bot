const { AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPEN_AI_MODEL } =
  process.env;
const { AzureOpenAI } = require('openai');
const { PHOTO_TYPE_TO_SYSTEM_PROMPT_MAP } = require('./constants');

const apiVersion = '2024-04-01-preview';
const options = {
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY,
  AZURE_OPEN_AI_MODEL,
  apiVersion,
};
const client = new AzureOpenAI(options);

exports.extractJsonDataFromPhotos = async function (type, fileLinks) {
  const systemPrompt = PHOTO_TYPE_TO_SYSTEM_PROMPT_MAP[type];

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

  return completion.choices[0].message.content;
};
