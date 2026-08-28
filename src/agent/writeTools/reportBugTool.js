const z = require('zod');
const { REPORTED_BUGS_GROUP_ID } = require('../../constants');
const { t } = require('../../i18n');
const {
  getDisplayName,
  sendErrorMessage,
  sendMessageToAdmins,
} = require('../../utils/utils');
const {
  createReportBugService,
} = require('../../services/reportBugService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { getRequestContext } = require('../requestContext');
const { getNotifierBot } = require('../notifierBot');
const {
  defineWriteTool,
  WRITE_RESULT_STATUSES,
} = require('../writeToolHelpers');

const parameters = z.object({
  message: z.string(),
});

function createAgentReportBugService() {
  const bot = getNotifierBot();

  return createReportBugService({
    messenger: {
      sendToAdmins: (text) => sendMessageToAdmins(bot, text),
      sendToBugsGroup: async (text) => {
        try {
          await bot.sendMessage(REPORTED_BUGS_GROUP_ID, text);
        } catch (err) {
          await sendErrorMessage(
            bot,
            `Agent bug report delivery to bugs group failed: ${err.message}`,
          );
        }
      },
    },
  });
}

const reportBugTool = defineWriteTool({
  name: 'report_bug',
  description:
    'Send a bug report or feedback message to the administrators. Pass the user-provided report text exactly. The authenticated user must confirm before it is sent. Reports are limited to 4000 characters and 3 per hour.',
  parameters,
  validate: async ({ chatId, args }) => {
    await getFreshLanguagePreference(chatId);
    const inspected = createAgentReportBugService().inspect({
      chatId,
      message: args.message,
    });
    if (inspected.status !== 'ok') {
      return {
        ...inspected,
        status:
          inspected.status === 'forbidden'
            ? WRITE_RESULT_STATUSES.FORBIDDEN
            : WRITE_RESULT_STATUSES.INVALID_INPUT,
        tool: 'report_bug',
      };
    }

    return { args: { message: inspected.message } };
  },
  buildSummary: ({ chatId, args }) =>
    `${t('Send this bug report to the administrators:', chatId)}\n\n${args.message}`,
  commit: ({ chatId, args }) => {
    const requestContext = getRequestContext() || {};
    const displayName = getDisplayName(chatId);

    return createAgentReportBugService().report({
      chatId,
      message: args.message,
      source: 'web-agent',
      email: requestContext.email,
      chatName: requestContext.name || displayName,
      displayName,
    });
  },
});

module.exports = {
  createAgentReportBugService,
  reportBugTool,
};
