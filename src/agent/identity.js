// Resolves the user identity the agent operates as.
//
// Phase 1 (v1): a single hardcoded chatId is provided via the
// AGENT_HARDCODED_CHAT_ID env var. The LLM never sees or controls
// this — it is read from the environment by tool handlers when they
// need it to look up the user's teams/caches/leagues.
//
// Future phases will replace this with proper auth (token / bot login).

function getAgentChatId() {
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
