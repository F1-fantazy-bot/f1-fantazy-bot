const { t } = require('../i18n');
const { isAdminMessage, sendMessageToUser } = require('../utils/utils');
const { listUserLeagues } = require('../leagueRegistryService');
const azureStorageService = require('../azureStorageService');
const { updateUserAttributes } = require('../userRegistryService');
const {
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
  userCache,
  leagueTeamsDataCache,
  clearAllSelectedBestTeams,
  serializeSelectedBestTeamByTeam,
  getPrintableCache,
} = require('../cache');
const {
  COMMAND_FOLLOW_LEAGUE,
  CURRENT_TEAM_PHOTO_TYPE,
  LEAGUE_TEAM_SELECT_CALLBACK_TYPE,
  LEAGUE_TEAM_PICK_CALLBACK_TYPE,
  NAME_TO_CODE_MAPPING,
} = require('../constants');

function mapNameToCode(name) {
  if (name === null || name === undefined) {
    return name;
  }

  const key = String(name).toLowerCase().trim();

  return NAME_TO_CODE_MAPPING[key] || name;
}

/**
 * Sanitize a team name so it can be safely embedded into blob paths.
 * Keeps the result short and readable.
 */
function sanitizeTeamName(name) {
  const base = String(name || 'team')
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const trimmed = base.length > 0 ? base : 'team';

  return trimmed.slice(0, 40);
}

function buildTeamId(leagueCode, teamName) {
  return `${leagueCode}_${sanitizeTeamName(teamName)}`;
}

/**
 * Map one league team entry (from teams-data.json) to the bot's team cache shape.
 */
function mapLeagueTeamToBotTeam(leagueTeam) {
  const drivers = Array.isArray(leagueTeam.drivers) ? leagueTeam.drivers : [];
  const constructors = Array.isArray(leagueTeam.constructors)
    ? leagueTeam.constructors
    : [];

  const sumPrices = (items) =>
    items.reduce((acc, item) => acc + (Number(item.price) || 0), 0);

  // Pick the "boost" driver: prefer isCaptain, then isMegaCaptain, else first driver.
  const captain =
    drivers.find((d) => d.isCaptain) ||
    drivers.find((d) => d.isMegaCaptain) ||
    drivers[0];
  const boost = captain ? mapNameToCode(captain.name) : null;

  const budget = Number(leagueTeam.budget);
  const costCapRemaining = Number.isFinite(budget)
    ? Math.round((budget - sumPrices(drivers) - sumPrices(constructors)) * 100) /
      100
    : 0;

  const transfersRemainingRaw = Number(leagueTeam.transfersRemaining);
  const freeTransfers = Number.isFinite(transfersRemainingRaw)
    ? Math.max(0, transfersRemainingRaw)
    : 0;

  return {
    drivers: drivers.map((d) => mapNameToCode(d.name)),
    constructors: constructors.map((c) => mapNameToCode(c.name)),
    boost,
    freeTransfers,
    costCapRemaining,
  };
}

async function loadLeagueTeamsData(leagueCode) {
  if (leagueTeamsDataCache[leagueCode]) {
    return leagueTeamsDataCache[leagueCode];
  }

  const data = await azureStorageService.getLeagueTeamsData(leagueCode);
  if (data) {
    leagueTeamsDataCache[leagueCode] = data;
  }

  return data;
}

function sortTeamsByPosition(teams) {
  return [...teams].sort(
    (a, b) => (a.position || 0) - (b.position || 0),
  );
}

/**
 * Send an inline keyboard so the admin can pick which team from the league to load.
 * Exported for reuse from the league-choice callback.
 */
async function promptTeamPick(bot, chatId, leagueCode, replyToMessageId) {
  let data;
  try {
    data = await loadLeagueTeamsData(leagueCode);
  } catch (err) {
    console.error('Error fetching league teams data:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load league teams data: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  if (!data || !Array.isArray(data.teams) || data.teams.length === 0) {
    await bot.sendMessage(
      chatId,
      t(
        'No team roster is available yet for this league. Please try again later.',
        chatId,
      ),
    );

    return;
  }

  const sortedTeams = sortTeamsByPosition(data.teams);
  const keyboard = sortedTeams.map((team) => {
    const pos = team.position ?? '?';
    const label = `${pos}. ${team.teamName || team.userName || '—'}`;

    return [
      {
        text: label,
        callback_data: `${LEAGUE_TEAM_PICK_CALLBACK_TYPE}:${leagueCode}:${team.position}`,
      },
    ];
  });

  const options = { reply_markup: { inline_keyboard: keyboard } };
  if (replyToMessageId) {
    options.reply_to_message_id = replyToMessageId;
  }

  await bot.sendMessage(
    chatId,
    t('Which team do you want to load?', chatId),
    options,
  );
}

/**
 * Apply the user's league team selection:
 * - Remove all existing cached teams (blob + in-memory) for the user
 * - Load the selected league team as the sole active team
 * - Update selectedTeam and persist preferences
 */
async function applyLeagueTeamSelection(bot, chatId, leagueCode, position) {
  let data;
  try {
    data = await loadLeagueTeamsData(leagueCode);
  } catch (err) {
    console.error('Error fetching league teams data:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load league teams data: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  if (!data || !Array.isArray(data.teams)) {
    await bot.sendMessage(
      chatId,
      t(
        'No team roster is available yet for this league. Please try again later.',
        chatId,
      ),
    );

    return;
  }

  const positionNum = Number(position);
  const leagueTeam = data.teams.find((team) => team.position === positionNum);
  if (!leagueTeam) {
    await bot.sendMessage(
      chatId,
      t('❌ Could not find that team in the league anymore.', chatId),
    );

    return;
  }

  const teamId = buildTeamId(leagueCode, leagueTeam.teamName);
  const teamData = mapLeagueTeamToBotTeam(leagueTeam);

  // Drop every previously cached team (screenshot or prior league) so the league
  // team becomes the single active team, matching the rule "work with one source
  // at a time".
  try {
    await azureStorageService.deleteAllUserTeams(bot, chatId);
  } catch (err) {
    console.error('Error deleting existing user teams:', err);
  }

  delete currentTeamCache[chatId];
  delete bestTeamsCache[chatId];
  delete selectedChipCache[chatId];

  currentTeamCache[chatId] = { [teamId]: teamData };

  try {
    await azureStorageService.saveUserTeam(bot, chatId, teamId, teamData);
  } catch (err) {
    console.error('Error saving league-loaded team:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to save league team: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  const key = String(chatId);
  if (!userCache[key]) {
    userCache[key] = {};
  }
  userCache[key].selectedTeam = teamId;
  const selectedBestTeamByTeam = clearAllSelectedBestTeams(chatId);

  await updateUserAttributes(chatId, {
    selectedTeam: teamId,
    selectedBestTeamByTeam: serializeSelectedBestTeamByTeam(
      selectedBestTeamByTeam,
    ),
  });

  const leagueLabel = data.leagueName || leagueCode;
  const teamLabel = leagueTeam.teamName || leagueTeam.userName || teamId;

  await bot.sendMessage(
    chatId,
    t(
      '✅ Loaded team {TEAM} from league {LEAGUE}. Previous teams have been cleared.',
      chatId,
      { TEAM: teamLabel, LEAGUE: leagueLabel },
    ),
  );

  await sendMessageToUser(
    bot,
    chatId,
    getPrintableCache(chatId, CURRENT_TEAM_PHOTO_TYPE),
    {
      useMarkdown: true,
      errorMessageToLog: 'Error sending loaded league team data to user',
    },
  );
}

async function handleSelectTeamFromLeagueCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  let leagues;
  try {
    leagues = await listUserLeagues(chatId);
  } catch (err) {
    console.error('Error listing user leagues:', err);
    await bot.sendMessage(
      chatId,
      t('❌ Failed to load your leagues: {ERROR}', chatId, {
        ERROR: err.message,
      }),
    );

    return;
  }

  if (!leagues || leagues.length === 0) {
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
    await promptTeamPick(bot, chatId, leagues[0].leagueCode, msg.message_id);

    return;
  }

  const keyboard = leagues.map((league) => [
    {
      text: league.leagueName || league.leagueCode,
      callback_data: `${LEAGUE_TEAM_SELECT_CALLBACK_TYPE}:${league.leagueCode}`,
    },
  ]);

  await bot.sendMessage(
    chatId,
    t('Which league do you want to select a team from?', chatId),
    {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: keyboard },
    },
  );
}

module.exports = {
  handleSelectTeamFromLeagueCommand,
  promptTeamPick,
  applyLeagueTeamSelection,
  mapLeagueTeamToBotTeam,
  mapNameToCode,
  buildTeamId,
  sanitizeTeamName,
};
