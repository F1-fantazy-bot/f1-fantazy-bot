const { isAdminMessage } = require('../utils');
const {
  COMMAND_TRIGGER_SCRAPING,
  COMMAND_TRIGGER_API_DATA,
  COMMAND_TRIGGER_API_DATA_LOCKED,
  COMMAND_TRIGGER_NEXT_RACE_INFO,
  COMMAND_TRIGGER_LIVE_SCORE_SCHEDULER,
} = require('../constants');
const { t } = require('../i18n');
const { triggerManualJob } = require('../manualTriggerService');

const MANUAL_TRIGGER_COMMANDS = [
  {
    command: COMMAND_TRIGGER_SCRAPING,
    triggerId: 'scraper',
    title: '🔄 Trigger Scraping',
    successMessage: 'Web scraping triggered successfully.',
    failureMessage: 'Failed to trigger web scraping: {ERROR}',
  },
  {
    command: COMMAND_TRIGGER_API_DATA,
    triggerId: 'api_data',
    title: '📊 Trigger API Data',
    successMessage: 'API data trigger started successfully.',
    failureMessage: 'Failed to trigger API data: {ERROR}',
  },
  {
    command: COMMAND_TRIGGER_API_DATA_LOCKED,
    triggerId: 'api_data_locked',
    title: '🔒 Trigger API Data Locked',
    successMessage: 'API data locked trigger started successfully.',
    failureMessage: 'Failed to trigger API data locked: {ERROR}',
  },
  {
    command: COMMAND_TRIGGER_NEXT_RACE_INFO,
    triggerId: 'next_race_info',
    title: '🏁 Run Next Race Info Scheduler',
    successMessage: 'Next race info scheduler started successfully.',
    failureMessage: 'Failed to run next race info scheduler: {ERROR}',
  },
  {
    command: COMMAND_TRIGGER_LIVE_SCORE_SCHEDULER,
    triggerId: 'live_score_scheduler',
    title: '🔴 Run Live Score Scheduler',
    successMessage: 'Live score scheduler started successfully.',
    failureMessage: 'Failed to run live score scheduler: {ERROR}',
  },
];

async function handleManualTriggerCommand(bot, msg, triggerId) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can trigger manual jobs.', chatId),
    );

    return;
  }

  const triggerCommand = MANUAL_TRIGGER_COMMANDS.find(
    (candidate) => candidate.triggerId === triggerId,
  ) || {
    failureMessage: 'Failed to trigger manual job: {ERROR}',
  };
  const result = await triggerManualJob(triggerId);

  if (result.success) {
    await bot.sendMessage(chatId, t(triggerCommand.successMessage, chatId));
  } else {
    await bot.sendMessage(
      chatId,
      t(triggerCommand.failureMessage, chatId, { ERROR: result.error }),
    );
  }
}

async function handleTriggerScrapingCommand(bot, msg) {
  await handleManualTriggerCommand(bot, msg, 'scraper');
}

async function handleTriggerApiDataCommand(bot, msg) {
  await handleManualTriggerCommand(bot, msg, 'api_data');
}

async function handleTriggerApiDataLockedCommand(bot, msg) {
  await handleManualTriggerCommand(bot, msg, 'api_data_locked');
}

async function handleTriggerNextRaceInfoCommand(bot, msg) {
  await handleManualTriggerCommand(bot, msg, 'next_race_info');
}

async function handleTriggerLiveScoreSchedulerCommand(bot, msg) {
  await handleManualTriggerCommand(bot, msg, 'live_score_scheduler');
}

module.exports = {
  MANUAL_TRIGGER_COMMANDS,
  handleManualTriggerCommand,
  handleTriggerScrapingCommand,
  handleTriggerApiDataCommand,
  handleTriggerApiDataLockedCommand,
  handleTriggerNextRaceInfoCommand,
  handleTriggerLiveScoreSchedulerCommand,
};
