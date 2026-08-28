// Authenticated direct proposal entry point for deterministic rich-UI writes.
//
// The browser may request a proposal for an explicitly allowlisted tool, but
// it cannot approve or commit it here. The response is the same durable
// confirmation envelope returned by the LLM-facing tool.

const {
  proposeRegisteredWrite,
} = require('./writeToolHelpers');

const DIRECT_PROPOSAL_TOOLS = new Set([
  'select_team',
  'follow_team',
  'unfollow_league',
  'report_bug',
]);

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  if (
    typeof payload.tool !== 'string' ||
    !DIRECT_PROPOSAL_TOOLS.has(payload.tool)
  ) {
    return null;
  }
  if (
    !payload.args ||
    typeof payload.args !== 'object' ||
    Array.isArray(payload.args)
  ) {
    return null;
  }

  return { tool: payload.tool, args: payload.args };
}

async function applyWriteProposal({ chatId, payload }) {
  const input = validatePayload(payload);
  if (!input) {
    return {
      status: 400,
      body: {
        status: 'invalid_input',
        message: 'A supported tool and args object are required.',
      },
    };
  }

  const result = await proposeRegisteredWrite({
    chatId,
    tool: input.tool,
    args: input.args,
  });
  if (!result) {
    return {
      status: 404,
      body: {
        status: 'not_found',
        message: 'The requested write tool is not registered.',
      },
    };
  }

  return { status: 200, body: result };
}

module.exports = {
  applyWriteProposal,
  validatePayload,
  DIRECT_PROPOSAL_TOOLS,
};
