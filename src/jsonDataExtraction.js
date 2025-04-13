const { AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPEN_AI_MODEL } =
  process.env;
const { AzureOpenAI } = require('openai');
const { EXTRACT_JSON_FROM_PHOTO_SYSTEM_PROMPT } = require('./constants');

const apiVersion = '2024-04-01-preview';
const options = {
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY,
  AZURE_OPEN_AI_MODEL,
  apiVersion,
};
const client = new AzureOpenAI(options);

exports.extractJsonDataFromPhotos = async function (photos) {
  const systemMessage = {
    role: 'system',
    content: EXTRACT_JSON_FROM_PHOTO_SYSTEM_PROMPT,
  };

  // Build an image_url message for every photo
  const photoMessages = photos.map((photo) => ({
    type: 'image_url',
    image_url: {
      url: photo.fileLink,
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
