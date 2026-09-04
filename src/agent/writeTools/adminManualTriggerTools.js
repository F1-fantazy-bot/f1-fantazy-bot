const z = require('zod');
const { t } = require('../../i18n');
const { sendLogMessage } = require('../../utils/utils');
const { triggerManualJob } = require('../../manualTriggerService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { getRequestContext } = require('../requestContext');
const { getNotifierBot } = require('../notifierBot');
const { defineAdminWriteTool } = require('../adminAuthorization');
const { WRITE_RESULT_STATUSES } = require('../writeToolHelpers');

const MANUAL_TRIGGER_TOOLS = Object.freeze([
  {
    name: 'trigger_scraping',
    triggerId: 'scraper',
    label: 'F1 Fantasy Scraper',
    confirmation:
      'Run the F1 Fantasy scraper now? This starts a source-data scraping workflow and may refresh shared inputs.',
  },
  {
    name: 'trigger_api_data',
    triggerId: 'api_data',
    label: 'API Data',
    confirmation:
      'Run API data processing now? This starts the shared current-data workflow and may update shared fantasy data.',
  },
  {
    name: 'trigger_api_data_locked',
    triggerId: 'api_data_locked',
    label: 'Locked API Data',
    confirmation:
      'Run locked API data processing now? This starts the locked-snapshot workflow and may update shared locked data.',
  },
  {
    name: 'trigger_next_race_info',
    triggerId: 'next_race_info',
    label: 'Next Race Info Scheduler',
    confirmation:
      'Run the next-race information scheduler now? This starts the shared race-information workflow.',
  },
  {
    name: 'trigger_live_score_scheduler',
    triggerId: 'live_score_scheduler',
    label: 'Live Score Scheduler',
    confirmation:
      'Run the live-score scheduler now? This starts the shared live-score polling workflow.',
  },
]);

function actorLabel(chatId) {
  const email = getRequestContext()?.email;

  return email ? `${chatId} (${email})` : String(chatId);
}

function auditMessage({ chatId, info, outcome, runReference }) {
  const reference = runReference ? ` run=${runReference}` : '';

  return `Agent manual trigger ${info.triggerId} actor=${actorLabel(chatId)} outcome=${outcome}${reference}`;
}

async function auditSafely(event) {
  try {
    await sendLogMessage(getNotifierBot(), auditMessage(event));
  } catch (error) {
    console.error(
      `Failed to audit manual trigger ${event.info.triggerId}:`,
      error,
    );
  }
}

function triggerSummary(chatId, info, result) {
  if (result.success) {
    return t('Started {LABEL}. Run reference: {REFERENCE}.', chatId, {
      LABEL: t(info.label, chatId),
      REFERENCE: result.runReference,
    });
  }
  if (result.deduplicated) {
    return t(
      '{LABEL} already has an active or recent run. Reference: {REFERENCE}. Wait before retrying.',
      chatId,
      { LABEL: t(info.label, chatId), REFERENCE: result.runReference },
    );
  }
  if (result.uncertain) {
    return t(
      'The {LABEL} request may already be running. Do not retry yet. Run reference: {REFERENCE}.',
      chatId,
      { LABEL: t(info.label, chatId), REFERENCE: result.runReference },
    );
  }

  return t('Unable to start {LABEL}. Please try again.', chatId, {
    LABEL: t(info.label, chatId),
  });
}

function safeResult(chatId, info, result) {
  const status = result.success
    ? WRITE_RESULT_STATUSES.OK
    : result.deduplicated
      ? WRITE_RESULT_STATUSES.LIMIT_EXCEEDED
      : WRITE_RESULT_STATUSES.FAILED;

  return {
    status,
    tool: info.name,
    triggerId: info.triggerId,
    ...(typeof result.runReference === 'string'
      ? { runReference: result.runReference }
      : {}),
    summary: triggerSummary(chatId, info, result),
  };
}

function defineManualTriggerTool(info) {
  return defineAdminWriteTool({
    name: info.name,
    description: `Admin only. ${info.confirmation} Always requires confirmation and returns a safe run reference.`,
    parameters: z.object({}),
    validate: async ({ chatId }) => {
      await getFreshLanguagePreference(chatId);

      return null;
    },
    buildSummary: ({ chatId }) => t(info.confirmation, chatId),
    commit: async ({ chatId }) => {
      const result = await triggerManualJob(info.triggerId);
      const outcome = result.success
        ? 'started'
        : result.deduplicated
          ? 'deduplicated'
          : result.uncertain
            ? 'uncertain'
            : 'failed';
      await auditSafely({
        chatId,
        info,
        outcome,
        runReference: result.runReference,
      });

      return safeResult(chatId, info, result);
    },
  });
}

const [
  triggerScrapingTool,
  triggerApiDataTool,
  triggerApiDataLockedTool,
  triggerNextRaceInfoTool,
  triggerLiveScoreSchedulerTool,
] = MANUAL_TRIGGER_TOOLS.map(defineManualTriggerTool);

module.exports = {
  MANUAL_TRIGGER_TOOLS,
  auditMessage,
  triggerSummary,
  safeResult,
  triggerScrapingTool,
  triggerApiDataTool,
  triggerApiDataLockedTool,
  triggerNextRaceInfoTool,
  triggerLiveScoreSchedulerTool,
};
