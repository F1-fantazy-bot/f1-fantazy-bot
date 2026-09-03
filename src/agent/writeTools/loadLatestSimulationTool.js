const z = require('zod');
const { t, getLanguage } = require('../../i18n');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  refreshSimulationData,
} = require('../../services/simulationRefreshService');
const { getNotifierBot } = require('../notifierBot');
const {
  defineWriteTool,
} = require('../writeToolHelpers');
const {
  formatUserLocalDateTime,
} = require('../../utils/userFacingTime');

function refreshSummary(chatId, result) {
  const matchday =
    result.matchday === null || result.matchday === undefined
      ? ''
      : t(' Matchday {MATCHDAY}.', chatId, {
          MATCHDAY: result.matchday,
        });

  return t(
    'Latest simulation refreshed from the shared durable source: {DRIVERS} drivers and {CONSTRUCTORS} constructors{MATCHDAY}',
    chatId,
    {
      DRIVERS: result.counts.drivers,
      CONSTRUCTORS: result.counts.constructors,
      MATCHDAY: matchday || '.',
    },
  );
}

const loadLatestSimulationTool = defineWriteTool({
  name: 'load_latest_simulation',
  description:
    'Refresh the latest shared F1 Fantasy simulation data in this Function process. This changes the process-local simulation and price caches, so it always requires confirmation. It reads the common durable source, but each already-running bot or agent process refreshes its own in-memory cache independently. The result reports the safe source, refresh time, matchday when available, and driver/constructor counts.',
  parameters: z.object({}),
  validate: async ({ chatId }) => {
    await getFreshLanguagePreference(chatId);

    return null;
  },
  buildSummary: ({ chatId }) =>
    t(
      'Refresh the latest shared F1 Fantasy simulation in this app process. It reads the durable shared source; other running bot and agent processes refresh their own in-memory cache separately.',
      chatId,
    ),
  commit: async ({ chatId }) => {
    const result = await refreshSimulationData({ bot: getNotifierBot() });
    const safeResult = {
      status: result.status,
      source: result.source,
      fetchedAt: result.fetchedAt,
      matchday: result.matchday,
      counts: result.counts,
    };
    const fetchedAt = formatUserLocalDateTime(
      safeResult.fetchedAt,
      getLanguage(chatId),
    );

    return {
      ...safeResult,
      // The service keeps an ISO instant for server-side callers. The agent
      // deliberately returns only the saved-language, Asia/Jerusalem display
      // value so the browser never exposes a raw UTC timestamp.
      fetchedAt,
      summary: refreshSummary(chatId, result),
    };
  },
});

module.exports = {
  loadLatestSimulationTool,
  refreshSummary,
};
