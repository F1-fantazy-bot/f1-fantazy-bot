const { AzureOpenAI } = require('openai');
const { t, getLanguage } = require('../i18n');
const { sendErrorMessage, sendLogMessage } = require('../utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');
const { filterExcludedGraphTeams } = require('../utils/leagueGraphFilter');
const {
  COMMAND_FOLLOW_LEAGUE,
  RACE_SUMMARY_CALLBACK_TYPE,
} = require('../constants');

function createOpenAiClient() {
  return new AzureOpenAI({
    AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
    AZURE_OPEN_AI_MODEL: process.env.AZURE_OPEN_AI_MODEL,
    apiVersion: '2024-04-01-preview',
  });
}

function buildRaceSummaryData(leagueData) {
  const teams = filterExcludedGraphTeams(leagueData?.teams);
  const matchdays = [
    ...new Set(teams.flatMap((team) => Object.keys(team.raceScores || {}))),
  ].sort(
    (a, b) =>
      Number(a.replace(/^matchday_/, '')) - Number(b.replace(/^matchday_/, '')),
  );
  const latestMatchday = matchdays.at(-1) || null;
  const ranksByRound = [];
  const totals = new Map(teams.map((team) => [team, 0]));

  for (const matchday of matchdays) {
    for (const team of teams) {
      totals.set(
        team,
        totals.get(team) + (Number(team.raceScores?.[matchday]) || 0),
      );
    }
    ranksByRound.push(
      new Map(
        [...teams]
          .sort((a, b) => totals.get(b) - totals.get(a))
          .map((team, i) => [team, i + 1]),
      ),
    );
  }

  return {
    leagueName: leagueData?.leagueName || leagueData?.leagueCode,
    latestMatchday,
    teams: teams.map((team) => ({
      teamName: team.teamName || team.userName,
      userName: team.userName,
      currentPosition: team.position,
      totalScore: team.totalScore,
      latestRaceScore: latestMatchday
        ? Number(team.raceScores?.[latestMatchday]) || 0
        : null,
      previousRaceScore:
        matchdays.length > 1
          ? Number(team.raceScores?.[matchdays.at(-2)]) || 0
          : null,
      seasonRankChange:
        ranksByRound.length > 1
          ? ranksByRound.at(-2).get(team) - ranksByRound.at(-1).get(team)
          : 0,
      raceScores: team.raceScores || {},
      chipsUsed: team.chipsUsed || [],
    })),
  };
}

async function generateRaceSummary(summaryData, language) {
  const completion = await createOpenAiClient().chat.completions.create({
    model: process.env.AZURE_OPEN_AI_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a witty F1 Fantasy league columnist. Write entirely in ${language === 'he' ? 'Hebrew' : 'English'}. Create a funny, playfully infuriating post-race recap, but never use hateful, abusive, or invented claims. Include three clearly headed sections: (1) race winners and losers based on latestRaceScore, (2) season trends, risers and fallers using rank changes and score history, (3) storylines and interesting data-backed insights including chips when relevant. Mention team names. Be punchy and under 3000 characters. Return plain text suitable for Telegram, with emoji allowed and no Markdown tables.`,
      },
      { role: 'user', content: JSON.stringify(summaryData) },
    ],
  });

  return {
    text: completion.choices?.[0]?.message?.content?.trim(),
    usage: completion.usage,
  };
}

async function sendRaceSummary(bot, chatId, leagueCode) {
  let leagueData;
  try {
    leagueData = await getLeagueData(leagueCode);
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

  const data = buildRaceSummaryData(leagueData);
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
    const result = await generateRaceSummary(data, getLanguage(chatId));
    if (!result.text) {
      throw new Error('Azure OpenAI returned an empty summary');
    }
    if (result.usage) {
      await sendLogMessage(
        bot,
        `Race summary tokens - prompt: ${result.usage.prompt_tokens}, completion: ${result.usage.completion_tokens}, total: ${result.usage.total_tokens}`,
      );
    }
    await bot.sendMessage(chatId, result.text);
  } catch (error) {
    await sendErrorMessage(
      bot,
      `AzureOpenAI race summary error: ${error.message}`,
    );
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
  buildRaceSummaryData,
  generateRaceSummary,
  sendRaceSummary,
  handleRaceSummaryCommand,
};
