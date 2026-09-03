const z = require('zod');
const { t } = require('../../i18n');
const azureStorageService = require('../../azureStorageService');
const {
  createResetUserDataService,
  STATUS,
} = require('../../services/resetUserDataService');
const { getNotifierBot } = require('../notifierBot');
const { getFreshLanguagePreference } = require('../../services/setLanguageService');
const { defineWriteTool } = require('../writeToolHelpers');

function agentResetService() {
  const bot = getNotifierBot();

  return createResetUserDataService({
    storage: {
      deleteAllUserTeams: (chatId) =>
        azureStorageService.deleteAllUserTeams(bot, chatId),
      saveUserTeam: (chatId, teamId, teamData) =>
        azureStorageService.saveUserTeam(bot, chatId, teamId, teamData),
    },
  });
}

function resetSummary(chatId, impact) {
  const yes = t('Yes', chatId);
  const no = t('No', chatId);

  return t(
    'Reset all saved F1 Fantasy data for this account? This permanently deletes {TEAMS} saved team blob(s), clears the active team ({SELECTED}), {RANKING} points-per-million preference(s), {BEST} saved best-team choice(s), {CHIPS} chip preference(s), and chat-specific projection overrides (drivers: {DRIVERS}, constructors: {CONSTRUCTORS}). This cannot be undone.',
    chatId,
    {
      TEAMS: impact.teamBlobs,
      SELECTED: impact.selectedTeam ? yes : no,
      RANKING: impact.rankingPreferences,
      BEST: impact.selectedBestTeams,
      CHIPS: impact.chipPreferences,
      DRIVERS: impact.driverProjectionOverride ? yes : no,
      CONSTRUCTORS: impact.constructorProjectionOverride ? yes : no,
    },
  );
}

function successSummary(chatId, impact) {
  return t(
    'Your saved F1 Fantasy data was reset. Deleted {TEAMS} team blob(s) and cleared the active team, per-team preferences, and chat-specific projection overrides.',
    chatId,
    { TEAMS: impact.teamBlobs },
  );
}

const resetUserDataTool = defineWriteTool({
  name: 'reset_user_data',
  description:
    'Permanently reset the authenticated user\'s saved F1 Fantasy data. This deletes all saved team blobs and chat-specific projection overrides, then clears the active team and every per-team ranking, selected-best-team, and chip preference. Always requires explicit confirmation.',
  parameters: z.object({}),
  validate: async ({ chatId }) => {
    await getFreshLanguagePreference(chatId);
    const inspection = await agentResetService().inspect({ chatId });
    if (!inspection.hasResettableData) {
      return {
        status: 'not_found',
        summary: t(
          'No saved F1 Fantasy team data or chat-specific projection overrides are available to reset.',
          chatId,
        ),
      };
    }

    return {
      args: {},
      summary: resetSummary(chatId, inspection.impact),
      intentArgs: { fingerprint: inspection.fingerprint },
    };
  },
  buildSummary: ({ chatId }) =>
    t(
      'Reset all saved F1 Fantasy data for this account. This cannot be undone.',
      chatId,
    ),
  commit: async ({ chatId, args }) => {
    const result = await agentResetService().reset({
      chatId,
      expectedFingerprint: args.fingerprint,
    });
    if (result.status === STATUS.CHANGED) {
      return {
        status: 'invalid_input',
        summary: t(
          'Your saved data changed while this confirmation was open. Review the reset details and confirm again.',
          chatId,
        ),
      };
    }

    return {
      status: 'ok',
      impact: result.impact,
      summary: successSummary(chatId, result.impact),
    };
  },
});

module.exports = {
  resetUserDataTool,
  agentResetService,
  resetSummary,
  successSummary,
};
