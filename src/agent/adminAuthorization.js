const { defineTool } = require('@copilotkit/runtime/v2');
const { t, getLanguage } = require('../i18n');
const { isAdminChatId } = require('../adminIdentity');
const { sendLogMessage } = require('../utils/utils');
const { getAgentChatId } = require('./identity');
const { getRequestContext } = require('./requestContext');
const { getNotifierBot } = require('./notifierBot');
const { wrapToolExecute } = require('./wrapToolExecute');
const { defineWriteTool } = require('./writeToolHelpers');

const ADMIN_TOOL_REGISTRY = new Map();

function adminDeniedResult(chatId, toolName) {
  return {
    status: 'forbidden',
    tool: toolName,
    summary: t('Sorry, only admins can use this command.', chatId),
    uiLang: getLanguage(chatId),
  };
}

function actorLabel(chatId) {
  const { email } = getRequestContext() || {};

  return email ? `${chatId} (${email})` : String(chatId);
}

async function defaultAudit({ chatId, toolName, outcome, status }) {
  const suffix = status ? `, status: ${status}` : '';

  await sendLogMessage(
    getNotifierBot(),
    `Agent admin tool "${toolName}" ${outcome} by ${actorLabel(chatId)}${suffix}`,
  );
}

async function auditSafely(event, audit = defaultAudit) {
  try {
    await audit(event);
  } catch (err) {
    console.error(
      `AGENT: failed to audit admin tool "${event.toolName}":`,
      err,
    );
  }
}

async function requireAgentAdmin({
  chatId = getAgentChatId(),
  toolName,
  audit,
} = {}) {
  if (isAdminChatId(chatId)) {
    return null;
  }

  await auditSafely(
    { chatId, toolName, outcome: 'denied', status: 'forbidden' },
    audit,
  );

  return adminDeniedResult(chatId, toolName);
}

function defineAdminReadTool({
  name,
  description,
  parameters,
  execute,
  audit,
}) {
  if (typeof execute !== 'function') {
    throw new Error(`defineAdminReadTool("${name}"): execute required`);
  }

  const tool = defineTool({
    name,
    description,
    parameters,
    execute: wrapToolExecute(name, async (args) => {
      const chatId = getAgentChatId();
      const denied = await requireAgentAdmin({
        chatId,
        toolName: name,
        audit,
      });
      if (denied) {
        return denied;
      }

      const result = await execute({ chatId, args });
      await auditSafely(
        {
          chatId,
          toolName: name,
          outcome: 'completed',
          status: result?.status,
        },
        audit,
      );

      return result;
    }),
  });
  ADMIN_TOOL_REGISTRY.set(name, tool);

  return tool;
}

function defineAdminWriteTool({
  name,
  description,
  parameters,
  validate,
  buildSummary,
  commit,
  audit,
}) {
  if (typeof commit !== 'function') {
    throw new Error(`defineAdminWriteTool("${name}"): commit required`);
  }

  const tool = defineWriteTool({
    name,
    description,
    parameters,
    buildSummary,
    validate: async (context) => {
      const denied = await requireAgentAdmin({
        chatId: context.chatId,
        toolName: name,
        audit,
      });
      if (denied) {
        return denied;
      }

      return typeof validate === 'function'
        ? await validate(context)
        : undefined;
    },
    commit: async (context) => {
      const denied = await requireAgentAdmin({
        chatId: context.chatId,
        toolName: name,
        audit,
      });
      if (denied) {
        return denied;
      }

      const result = await commit(context);
      await auditSafely(
        {
          chatId: context.chatId,
          toolName: name,
          outcome: 'completed',
          status: result?.status,
        },
        audit,
      );

      return result;
    },
  });
  ADMIN_TOOL_REGISTRY.set(name, tool);

  return tool;
}

function getRegisteredAdminTools() {
  return new Map(ADMIN_TOOL_REGISTRY);
}

function resetAdminToolRegistryForTests() {
  ADMIN_TOOL_REGISTRY.clear();
}

module.exports = {
  adminDeniedResult,
  requireAgentAdmin,
  defineAdminReadTool,
  defineAdminWriteTool,
  getRegisteredAdminTools,
  resetAdminToolRegistryForTests,
};
