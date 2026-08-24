const { t, getLanguage } = require('../i18n');
const { getAzureOpenAiClient } = require('../azureOpenAiClient');
const { sendErrorMessage, sendLogMessage } = require('../utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData, getLockedTeamsData } = require('../azureStorageService');
const { filterExcludedGraphTeams } = require('../utils/leagueGraphFilter');
const {
  COMMAND_FOLLOW_LEAGUE,
  RACE_SUMMARY_CALLBACK_TYPE,
} = require('../constants');
const { buildRaceSummarySystemPrompt } = require('../prompts');

function rosterKey(team) {
  return `${team?.userName || team?.teamName || ''}:${team?.teamNo || 1}`;
}

function memberName(member) {
  return typeof member === 'string' ? member : member?.name;
}

function rosterNames(team, field) {
  return (Array.isArray(team?.[field]) ? team[field] : [])
    .map(memberName)
    .filter(Boolean);
}

function buildTeamDifference(subject, comparison, label) {
  const uniqueMembers = (field, first, second) => {
    const secondNames = new Set(rosterNames(second, field));

    return rosterNames(first, field).filter((name) => !secondNames.has(name));
  };

  return {
    label,
    subject: {
      teamName: subject.teamName,
      racePlace: subject.racePlace,
      raceScore: subject.latestRaceScore,
      uniqueDrivers: uniqueMembers('drivers', subject, comparison),
      uniqueConstructors: uniqueMembers('constructors', subject, comparison),
    },
    comparison: {
      teamName: comparison.teamName,
      racePlace: comparison.racePlace,
      raceScore: comparison.latestRaceScore,
      uniqueDrivers: uniqueMembers('drivers', comparison, subject),
      uniqueConstructors: uniqueMembers('constructors', comparison, subject),
    },
    scoreGap: subject.latestRaceScore - comparison.latestRaceScore,
  };
}

function buildKeyTeamDifferences(teams) {
  const raceOrder = [...teams]
    .sort((a, b) => b.latestRaceScore - a.latestRaceScore)
    .map((team, index) => ({ ...team, racePlace: index + 1 }));
  const winner = raceOrder[0];
  if (!winner) {
    return [];
  }

  const comparisons = [];
  if (raceOrder[1]) {
    comparisons.push(
      buildTeamDifference(winner, raceOrder[1], 'winner_vs_2nd'),
    );
  }
  if (raceOrder[2]) {
    comparisons.push(
      buildTeamDifference(winner, raceOrder[2], 'winner_vs_3rd'),
    );
  }
  const bottom = raceOrder.at(-1);
  if (bottom && bottom.teamName !== winner.teamName) {
    comparisons.push(buildTeamDifference(winner, bottom, 'top_vs_bottom'));
  }

  return comparisons;
}

function buildRaceSummaryData(leagueData, lockedTeamsData) {
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

  const latestMatchdayNumber = Number(
    String(latestMatchday).replace(/^matchday_/, ''),
  );
  const lockedMatchesRace =
    Number(lockedTeamsData?.matchdayId) === latestMatchdayNumber;
  const lockedByTeam = new Map(
    filterExcludedGraphTeams(
      lockedMatchesRace ? lockedTeamsData?.teams : [],
    ).map((team) => [rosterKey(team), team]),
  );
  const summaryTeams = teams.map((team) => {
    const lockedTeam = lockedByTeam.get(rosterKey(team));

    return {
      teamName: team.teamName || team.userName,
      userName: team.userName,
      currentPosition: team.position,
      totalScore: team.totalScore,
      latestRaceScore: latestMatchday
        ? Number(team.raceScores?.[latestMatchday]) || 0
        : null,
      seasonRankChange:
        ranksByRound.length > 1
          ? ranksByRound.at(-2).get(team) - ranksByRound.at(-1).get(team)
          : 0,
      raceScores: team.raceScores || {},
      drivers: lockedTeam?.drivers || team.drivers || [],
      constructors: lockedTeam?.constructors || team.constructors || [],
      chipsUsed: lockedTeam?.chipsUsed || team.chipsUsed || [],
    };
  });

  return {
    leagueName: leagueData?.leagueName || leagueData?.leagueCode,
    latestMatchday,
    teams: summaryTeams,
    keyTeamDifferences: buildKeyTeamDifferences(summaryTeams),
  };
}

async function generateRaceSummary(summaryData, language) {
  const completion = await getAzureOpenAiClient().chat.completions.create({
    model: process.env.AZURE_OPEN_AI_MODEL,
    messages: [
      {
        role: 'system',
        content: buildRaceSummarySystemPrompt(language),
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
  let lockedTeamsData;
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
  buildKeyTeamDifferences,
  buildRaceSummaryData,
  generateRaceSummary,
  sendRaceSummary,
  handleRaceSummaryCommand,
};
