const { AzureOpenAI } = require('openai');
const { t, getLanguage } = require('../i18n');
const { sendErrorMessage, sendLogMessage } = require('../utils');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData, getLockedTeamsData } = require('../azureStorageService');
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

function rosterKey(team) {
  return `${team?.userName || team?.teamName || ''}:${team?.teamNo || 1}`;
}

function memberName(member) {
  return typeof member === 'string' ? member : member?.name;
}

function buildRosterDifferentials(teams) {
  const entities = new Map();

  for (const team of teams) {
    for (const [type, members] of [
      ['driver', team.drivers],
      ['constructor', team.constructors],
    ]) {
      for (const member of Array.isArray(members) ? members : []) {
        const name = memberName(member);
        if (!name) {
          continue;
        }
        const key = `${type}:${name}`;
        if (!entities.has(key)) {
          entities.set(key, { type, name, owners: [] });
        }
        entities.get(key).owners.push(team.teamName);
      }
    }
  }

  return [...entities.values()]
    .filter((entity) => entity.owners.length < teams.length)
    .map((entity) => {
      const ownerSet = new Set(entity.owners);
      const owners = teams.filter((team) => ownerSet.has(team.teamName));
      const nonOwners = teams.filter((team) => !ownerSet.has(team.teamName));
      const average = (rows) =>
        rows.reduce((sum, team) => sum + team.latestRaceScore, 0) / rows.length;

      return {
        ...entity,
        nonOwners: nonOwners.map((team) => team.teamName),
        ownerAverageRaceScore: Math.round(average(owners) * 10) / 10,
        nonOwnerAverageRaceScore: Math.round(average(nonOwners) * 10) / 10,
        averageScoreDifference:
          Math.round((average(owners) - average(nonOwners)) * 10) / 10,
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.averageScoreDifference) - Math.abs(a.averageScoreDifference),
    );
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
    rosterDifferentials: buildRosterDifferentials(summaryTeams),
  };
}

function buildRaceSummarySystemPrompt(language) {
  const isHebrew = language === 'he';
  const languageName = isHebrew ? 'Hebrew' : 'English';
  const targetAlphabet = isHebrew ? 'Hebrew letters' : 'Latin letters';
  const example = isHebrew
    ? 'For example, write "אלונסו" rather than "Alonso".'
    : 'For example, transliterate a Hebrew fantasy-team name into Latin letters.';

  return `You are a witty F1 Fantasy league columnist. Write entirely in ${languageName}. Transliterate every driver name, constructor name, fantasy-team name, and user/owner name into ${targetAlphabet}, even when the input uses a different alphabet. Preserve the name's pronunciation; do not translate its meaning, and do not repeat the original spelling in parentheses. ${example} Create a funny, playfully infuriating post-race recap, but never use hateful, abusive, or invented claims. Include four clearly headed sections: (1) race winners and losers based on latestRaceScore, (2) season trends, risers and fallers using seasonRankChange and the full raceScores history, (3) main roster differences explaining which drivers or constructors separated teams this race, using rosterDifferentials and naming both beneficiaries and sufferers, (4) storylines and interesting data-backed insights including chips when relevant. Treat roster differential score differences as correlation, not an individual driver's verified points. Do not mention or compare the immediately previous race result; only use historical scores for broader multi-race or season trends. Mention team names. Be punchy and under 3000 characters. Return plain text suitable for Telegram, with emoji allowed and no Markdown tables.`;
}

async function generateRaceSummary(summaryData, language) {
  const completion = await createOpenAiClient().chat.completions.create({
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
  buildRaceSummaryData,
  buildRaceSummarySystemPrompt,
  generateRaceSummary,
  sendRaceSummary,
  handleRaceSummaryCommand,
};
