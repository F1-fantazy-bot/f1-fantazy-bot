const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const { getLatestAnnouncement } = require('../../announcementsService');
const { buildWhatsNewResult } = require('../../cores/announcementsCore');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { getAgentChatId } = require('../identity');
const { wrapToolExecute } = require('../wrapToolExecute');

const getWhatsNewTool = defineTool({
  name: 'get_whats_new',
  description:
    'Get the latest F1 Fantasy Bot release announcement. This has no arguments and returns either status="ok" with the latest announcement text and metadata, or status="empty" when no release notes are available.',
  parameters: z.object({}),
  execute: wrapToolExecute('get_whats_new', async () => {
    const chatId = getAgentChatId();
    const [{ lang }, latest] = await Promise.all([
      getFreshLanguagePreference(chatId),
      Promise.resolve().then(() => getLatestAnnouncement()),
    ]);

    return {
      ...buildWhatsNewResult(latest),
      lang,
    };
  }),
});

module.exports = { getWhatsNewTool };
