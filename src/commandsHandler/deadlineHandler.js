const { t } = require('../i18n');
const {
  buildDate,
  fetchCurrentSeasonRaces,
  findNextRace,
} = require('../raceScheduleService');

const REFRESH_F1_COUNTDOWN_CALLBACK = 'refresh_f1_countdown';

function buildRefreshKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: t('🔄 Refresh'),
            callback_data: REFRESH_F1_COUNTDOWN_CALLBACK,
          },
        ],
      ],
    },
  };
}

function formatCountdownParts(targetDate) {
  const diffMs = Math.max(0, targetDate - new Date());
  const totalSeconds = Math.floor(diffMs / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

function buildDeadlineMessage(raceName, raceDate, chatId) {
  const { days, hours, minutes, seconds } = formatCountdownParts(raceDate);

  return `${t('🏎️ **{RACE_NAME}** starts in:', chatId, {
    RACE_NAME: raceName,
  })}\n${t('⏳ {DAYS} days, {HOURS} hours, {MINUTES} minutes, {SECONDS} seconds.', chatId, {
    DAYS: days,
    HOURS: hours,
    MINUTES: minutes,
    SECONDS: seconds,
  })}`;
}

async function getNextRaceForCountdown() {
  const data = await fetchCurrentSeasonRaces();
  const races = data?.MRData?.RaceTable?.Races || [];
  const nextRace = findNextRace(races);

  if (!nextRace) {
    return null;
  }

  const raceDate = buildDate(nextRace.date, nextRace.time);
  if (!raceDate) {
    return null;
  }

  return {
    raceName: nextRace.raceName,
    raceDate,
  };
}

async function handleDeadlineCommand(bot, msg) {
  const chatId = msg.chat.id;

  try {
    const nextRace = await getNextRaceForCountdown();

    if (!nextRace) {
      await bot.sendMessage(
        chatId,
        t('No upcoming race found.', chatId),
      );

      return;
    }

    const messageText = buildDeadlineMessage(
      nextRace.raceName,
      nextRace.raceDate,
      chatId,
    );

    await bot.sendMessage(chatId, messageText, {
      parse_mode: 'Markdown',
      ...buildRefreshKeyboard(),
    });
  } catch (error) {
    console.error('Error handling deadline command:', error);
    await bot.sendMessage(
      chatId,
      t('Failed to fetch race schedule. Please try again later.', chatId),
    );
  }
}

module.exports = {
  REFRESH_F1_COUNTDOWN_CALLBACK,
  buildDeadlineMessage,
  buildRefreshKeyboard,
  getNextRaceForCountdown,
  handleDeadlineCommand,
};
