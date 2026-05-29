// Resolves the user identity the agent operates as.
//
// Resolution order:
//   1. The request-scoped chatId set by `runWithRequestContext` (used
//      by the web agent webhook after verifying the caller's Google ID
//      token and resolving it through the web allowlist). The LLM
//      never sees or controls this — it is set by the webhook before
//      handing the request off to CopilotKit.
//   2. The `AGENT_HARDCODED_CHAT_ID` env var. Used by:
//        - local dev (`scripts/dev-agent-server.js`),
//        - any process running outside an HTTP request scope
//          (e.g. background cache bootstrap).
//
// If neither is available we throw — tools cannot proceed without an
// identity.

const { getRequestContext } = require('./requestContext');

function getAgentChatId() {
  const ctx = getRequestContext();
  if (ctx && typeof ctx.chatId === 'number' && Number.isFinite(ctx.chatId)) {
    return ctx.chatId;
  }

  const raw = process.env.AGENT_HARDCODED_CHAT_ID;
  if (!raw) {
    throw new Error(
      'AGENT_HARDCODED_CHAT_ID is not configured for the agent function.',
    );
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `AGENT_HARDCODED_CHAT_ID must be numeric, got: ${raw}`,
    );
  }

  return parsed;
}

module.exports = { getAgentChatId };
