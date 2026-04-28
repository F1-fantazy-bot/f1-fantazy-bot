const { t } = require('../i18n');
const { listUserLeagues } = require('../leagueRegistryService');
const {
  LEAGUE_UNFOLLOW_CALLBACK_TYPE,
  COMMAND_FOLLOW_LEAGUE,
} = require('../constants');

async function handleUnfollowLeagueCommand(bot, msg) {
  const chatId = msg.chat.id;

  let leagues;
  try {
    leagues = await listUserLeagues(chatId);
  } catch (err) {
    console.error('Error listing user leagues for unfollow:', err);
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

  const keyboard = leagues.map((league) => [
    {
      text: league.leagueName || league.leagueCode,
      callback_data: `${LEAGUE_UNFOLLOW_CALLBACK_TYPE}:${league.leagueCode}`,
    },
  ]);

  await bot.sendMessage(
    chatId,
    t('Which league do you want to unfollow?', chatId),
    {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: keyboard },
    },
  );
}

module.exports = { handleUnfollowLeagueCommand };
