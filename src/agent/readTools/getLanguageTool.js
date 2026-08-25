const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { getAgentChatId } = require('../identity');
const { ensureCacheReady } = require('../cacheBootstrap');
const { wrapToolExecute } = require('../wrapToolExecute');

const getLanguageTool = defineTool({
  name: 'get_language',
  description:
    'Get the signed-in user\'s currently saved language preference. Use this for questions like "what language is configured on my account?" or "is my language English or Hebrew?". This is read-only; NEVER call set_language unless the user explicitly asks to change the setting.',
  parameters: z.object({}),
  execute: wrapToolExecute('get_language', async () => {
    await ensureCacheReady();
    const chatId = getAgentChatId();

    return await getFreshLanguagePreference(chatId);
  }),
});

module.exports = { getLanguageTool };
