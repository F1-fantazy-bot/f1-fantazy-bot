const { t, getLanguage } = require('../i18n');
const { sendErrorMessage, sendLogMessage } = require('../utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData, getLockedTeamsData } = require('../azureStorageService');
const {
  COMMAND_FOLLOW_LEAGUE,
  RACE_SUMMARY_CALLBACK_TYPE,
} = require('../constants');
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const {
  buildKeyTeamDifferences,
  buildRaceSummaryData,
  findRaceName,
} = require('../cores/raceSummaryCore');
const {
  generateRaceSummary: generateRaceSummaryFromService,
} = require('../services/raceSummaryService');

// Preserve the handler's historical public helper signature for callers and
// tests while routing the implementation through the shared service.
function generateRaceSummary(summaryData, language, options = {}) {
  return generateRaceSummaryFromService({
    summaryData,
    language,
    ...options,
  });
}

async function sendRaceSummary(bot, chatId, leagueCode) {
  await bot.sendMessage(
    chatId,
    t(
      '🏎️ Creating your race summary... This may take a few seconds.',
      chatId,
    ),
  );

  let leagueData;
  let lockedTeamsData;
  let generationErrorReported = false;
  try {
    [leagueData, lockedTeamsData] = await Promise.all([
      getLeagueData(leagueCode),
      getLockedTeamsData(leagueCode),
    ]);
  } catch (error) {
    await sendErrorMessage(
      bot,
      `Failed to load race-summary data (${leagueCode}): ${error.message}`,
    );
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load league data: {ERROR}', chatId, {
        ERROR: error.message,
      }),
    );

    return;
  }

  const data = buildRaceSummaryData(leagueData, lockedTeamsData);
  if (!leagueData || !data.latestMatchday || data.teams.length === 0) {
    await bot.sendMessage(
      chatId,
      t(
        'Not enough race data yet to create a summary for this league.',
        chatId,
      ),
    );

    return;
  }

  try {
    const seasonData = await fetchCurrentSeasonRaces();
    data.raceName = findRaceName(seasonData, data.raceNumber);
  } catch (error) {
    // A schedule lookup should not prevent an otherwise valid recap.
    console.error(`Failed to load race name for summary: ${error.message}`);
  }

  try {
    const result = await generateRaceSummary(data, getLanguage(chatId), {
      onUsage: ({ message }) => sendLogMessage(bot, message),
      onError: (error) => {
        generationErrorReported = true;

        return sendErrorMessage(
          bot,
          `AzureOpenAI race summary error: ${error.message}`,
        );
      },
    });
    if (!result.text) {
      throw new Error('Azure OpenAI returned an empty summary');
    }
    await bot.sendMessage(chatId, result.text);
  } catch (error) {
    // Generation failures were already reported by the service. Empty output
    // is detected here and keeps the original Telegram error telemetry.
    if (!generationErrorReported) {
      await sendErrorMessage(
        bot,
        `AzureOpenAI race summary error: ${error.message}`,
      );
    }
    await bot.sendMessage(
      chatId,
      t(
        '❌ Failed to create the race summary. Please try again later.',
        chatId,
      ),
    );
  }
}

async function handleRaceSummaryCommand(bot, msg) {
  const chatId = msg.chat.id;
  let leagues;
  try {
    leagues = await listUserLeagues(chatId);
  } catch (error) {
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load your leagues: {ERROR}', chatId, {
        ERROR: error.message,
      }),
    );

    return;
  }
  if (!leagues?.length) {
    await bot.sendMessage(
      chatId,
      t(
        'You are not following any league. Run {CMD} to follow one first.',
        chatId,
        { CMD: COMMAND_FOLLOW_LEAGUE },
      ),
    );

    return;
  }
  if (leagues.length === 1) {
    return sendRaceSummary(bot, chatId, leagues[0].leagueCode);
  }
  await bot.sendMessage(
    chatId,
    t('Which league race summary do you want to see?', chatId),
    {
      reply_to_message_id: msg.message_id,
      reply_markup: {
        inline_keyboard: leagues.map((league) => [
          {
            text: league.leagueName || league.leagueCode,
            callback_data: `${RACE_SUMMARY_CALLBACK_TYPE}:${league.leagueCode}`,
          },
        ]),
      },
    },
  );
}

module.exports = {
  findRaceName,
  buildKeyTeamDifferences,
  buildRaceSummaryData,
  generateRaceSummary,
  sendRaceSummary,
  handleRaceSummaryCommand,
};
