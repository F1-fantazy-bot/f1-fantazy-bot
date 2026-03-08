const { getUserTeamIds, getSelectedTeam } = require('../cache');
const { TEAM_CALLBACK_TYPE } = require('../constants');
const { t } = require('../i18n');

async function handleSelectTeamCommand(bot, msg) {
  const chatId = msg.chat.id;
  const teamIds = getUserTeamIds(chatId);

  if (teamIds.length === 0) {
    await bot.sendMessage(
      chatId,
      t('No teams found. Please upload a team screenshot first.', chatId),
    );

    return;
  }

  const selectedTeam = getSelectedTeam(chatId);

  const keyboard = teamIds.map((teamId) => [
    {
      text: teamId === selectedTeam ? `✅ ${teamId}` : teamId,
      callback_data: `${TEAM_CALLBACK_TYPE}:${teamId}`,
    },
  ]);

  await bot.sendMessage(chatId, t('Select your active team:', chatId), {
    reply_to_message_id: msg.message_id,
    reply_markup: { inline_keyboard: keyboard },
  });
}

module.exports = { handleSelectTeamCommand };
