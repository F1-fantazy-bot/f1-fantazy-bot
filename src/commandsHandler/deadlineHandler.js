const { t } = require('../i18n');
const { buildDate, fetchNextRace } = require('../raceScheduleService');
const { DEADLINE_CALLBACK_TYPE } = require('../constants');

function getDurationParts(totalMilliseconds) {
  const totalSeconds = Math.max(0, Math.floor(totalMilliseconds / 1000));
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

function formatDuration(totalMilliseconds, chatId) {
  const { days, hours, minutes, seconds } = getDurationParts(totalMilliseconds);

  const dayLabel = t(days === 1 ? 'day' : 'days', chatId);
  const hourLabel = t(hours === 1 ? 'hour' : 'hours', chatId);
  const minuteLabel = t(minutes === 1 ? 'minute' : 'minutes', chatId);
  const secondLabel = t(seconds === 1 ? 'second' : 'seconds', chatId);

  return `${days} ${dayLabel}, ${hours} ${hourLabel}, ${minutes} ${minuteLabel} ${t('and', chatId)} ${seconds} ${secondLabel}`;
}

function getDeadlineSession(race) {
  const sprintDate = buildDate(race?.Sprint?.date, race?.Sprint?.time);
  if (sprintDate) {
    return {
      type: 'sprint',
      label: 'sprint',
      startsAt: sprintDate,
    };
  }

  const qualifyingDate = buildDate(race?.Qualifying?.date, race?.Qualifying?.time);

  return {
    type: 'qualifying',
    label: 'quali',
    startsAt: qualifyingDate,
  };
}

function buildDeadlineMessage(chatId, raceName, deadlineSession, now = new Date()) {
  const title = `*${t('Teams Lock Deadline', chatId)}*`;
  const raceLabel = t('Race', chatId);
  const raceValue = raceName || t('Unavailable', chatId);
  const sessionLabel = t('Session type', chatId);
  const reminder = t('Dont forget to lock the team before that time', chatId);

  if (!deadlineSession?.startsAt) {
    return [
      title,
      `${raceLabel}: ${raceValue}`,
      `${sessionLabel}: ${t('Unavailable', chatId)}`,
      t('Unable to determine deadline for the next race.', chatId),
      reminder,
    ].join('\n\n');
  }

  const millisecondsToDeadline = deadlineSession.startsAt.getTime() - now.getTime();

  if (millisecondsToDeadline <= 0) {
    return [
      title,
      `${raceLabel}: ${raceValue}`,
      `${sessionLabel}: ${t(deadlineSession.label, chatId)}`,
      t('This session already started.', chatId),
      reminder,
    ].join('\n\n');
  }

  const duration = formatDuration(millisecondsToDeadline, chatId);

  return [
    title,
    `${raceLabel}: ${raceValue}`,
    `${sessionLabel}: ${t(deadlineSession.label, chatId)}`,
    duration,
    reminder,
  ].join('\n\n');
}

function getRefreshMarkup(chatId) {
  return {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        {
          text: t('🔄 Refresh', chatId),
          callback_data: `${DEADLINE_CALLBACK_TYPE}:refresh`,
        },
      ]],
    },
  };
}

async function getDeadlinePayload(chatId, now = new Date()) {
  const race = await fetchNextRace();

  if (!race) {
    return {
      text: t('Next race information is currently unavailable.', chatId),
      options: getRefreshMarkup(chatId),
    };
  }

  const deadlineSession = getDeadlineSession(race);
  const text = buildDeadlineMessage(chatId, race.raceName, deadlineSession, now);

  return {
    text,
    options: getRefreshMarkup(chatId),
  };
}

async function handleDeadlineCommand(bot, msg) {
  const chatId = msg.chat.id;

  try {
    const payload = await getDeadlinePayload(chatId);
    await bot.sendMessage(chatId, payload.text, payload.options);
  } catch (error) {
    await bot.sendMessage(
      chatId,
      t('Failed to fetch deadline data. Please try again later.', chatId),
      getRefreshMarkup(chatId),
    );
  }
}

module.exports = {
  getDurationParts,
  formatDuration,
  getDeadlineSession,
  buildDeadlineMessage,
  getRefreshMarkup,
  getDeadlinePayload,
  handleDeadlineCommand,
};
