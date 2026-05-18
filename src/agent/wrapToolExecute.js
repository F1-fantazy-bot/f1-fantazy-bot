// Error UX wrapper for agent tool `execute` functions.
//
// CopilotKit dispatches tool calls by invoking the function passed to
// `defineTool({ execute })`. If that function throws, CopilotKit
// surfaces the raw error to the LLM (and indirectly to the user) —
// Azure errors routinely include URLs, container names, request IDs,
// and stack traces that we MUST NOT expose in the UI.
//
// `wrapToolExecute(toolName, fn)` wraps an execute function in a
// try/catch that:
//   1. Routes the full technical error (including stack) to the
//      Telegram error channel via `sendErrorMessage(getNotifierBot())`.
//   2. Returns a normalized, safe-to-display tool result:
//        { status: 'tool_error', tool, errorId, userMessage }
//      The 8-char `errorId` is the user-visible correlation token —
//      the user can quote it in a bug report to look up the full
//      error in the channel. We deliberately log the errorId on BOTH
//      sides so they match.
//
// The frontend renders a shared `<ToolErrorFallback />` whenever it
// sees `status === 'tool_error'`; the LLM follows a system-prompt
// rule that says "surface userMessage, do not retry, do not invent
// data."
//
// Resilience: a failure in the error-channel send path NEVER breaks
// the tool dispatch — we catch and `console.error` it. The user
// still gets the friendly fallback.

const { randomUUID } = require('crypto');
const { sendErrorMessage } = require('../utils/utils');
const { getNotifierBot } = require('./notifierBot');

const TOOL_ERROR_STATUS = 'tool_error';
const DEFAULT_USER_MESSAGE =
  'Something went wrong while looking that up. Please try again in a moment.';

function isToolErrorResult(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.status === TOOL_ERROR_STATUS
  );
}

function extractTechnicalMessage(err) {
  if (err && typeof err === 'object') {
    const parts = [];
    if (typeof err.message === 'string' && err.message.length > 0) {
      parts.push(err.message);
    } else {
      parts.push(String(err));
    }
    if (typeof err.stack === 'string') {
      parts.push(err.stack);
    }

    return parts.join('\n');
  }

  return String(err);
}

function wrapToolExecute(toolName, fn) {
  return async function wrappedExecute(args) {
    try {
      return await fn(args);
    } catch (err) {
      const errorId = randomUUID().slice(0, 8);
      const technical = extractTechnicalMessage(err);

      try {
        await sendErrorMessage(
          getNotifierBot(),
          `Agent tool "${toolName}" threw [${errorId}]: ${technical}`,
        );
      } catch (logErr) {
        // A notifier outage MUST NOT swallow the original error path —
        // we still return the friendly fallback to the LLM/UI.
        console.error(
          `AGENT: failed to log tool error [${errorId}] for "${toolName}":`,
          logErr,
        );
      }

      return {
        status: TOOL_ERROR_STATUS,
        tool: toolName,
        errorId,
        userMessage: DEFAULT_USER_MESSAGE,
      };
    }
  };
}

module.exports = {
  wrapToolExecute,
  isToolErrorResult,
  TOOL_ERROR_STATUS,
  DEFAULT_USER_MESSAGE,
};
