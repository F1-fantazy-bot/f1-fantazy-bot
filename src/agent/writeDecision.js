// Authenticated out-of-band approval/cancellation for staged write intents.
//
// This module is invoked only by agentWebhook's `/api/agent/write-decision`
// route after Google auth + allowlist resolution. The LLM cannot call this
// route as a tool, so marking an intent approved here is the server-enforced
// proof that a human clicked Yes.

const {
  approvePendingWrite,
  cancelPendingWrite,
} = require('../services/pendingWritesStore');
const {
  executeConfirmedWrite,
} = require('./writeToolHelpers');

const DECISION = Object.freeze({
  APPROVE: 'approve',
  APPROVE_AND_CONFIRM: 'approve_and_confirm',
  CANCEL: 'cancel',
  REVOKE: 'revoke',
});
const DIRECT_CONFIRM_TOOLS = Object.freeze([
  'select_team',
  'follow_team',
  'unfollow_league',
  'report_bug',
]);

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (
    typeof payload.writeNonce !== 'string' ||
    payload.writeNonce.length === 0
  ) {
    return null;
  }
  if (
    payload.decision !== DECISION.APPROVE &&
    payload.decision !== DECISION.APPROVE_AND_CONFIRM &&
    payload.decision !== DECISION.CANCEL &&
    payload.decision !== DECISION.REVOKE
  ) {
    return null;
  }

  return {
    writeNonce: payload.writeNonce,
    decision: payload.decision,
  };
}

async function applyWriteDecision({ chatId, payload }) {
  const input = validatePayload(payload);
  if (!input) {
    return {
      status: 400,
      body: {
        status: 'invalid_input',
        message:
          'writeNonce and decision (approve, approve_and_confirm, cancel, or revoke) are required.',
      },
    };
  }

  if (
    input.decision === DECISION.APPROVE ||
    input.decision === DECISION.APPROVE_AND_CONFIRM
  ) {
    const intent = await approvePendingWrite({
      chatId,
      writeNonce: input.writeNonce,
      expectedTools:
        input.decision === DECISION.APPROVE_AND_CONFIRM
          ? DIRECT_CONFIRM_TOOLS
          : undefined,
    });
    if (!intent) {
      return {
        status: 404,
        body: {
          status: 'not_found',
          message: 'The pending change was not found or has expired.',
        },
      };
    }

    if (input.decision === DECISION.APPROVE_AND_CONFIRM) {
      return {
        status: 200,
        body: await executeConfirmedWrite({
          chatId,
          writeNonce: input.writeNonce,
        }),
      };
    }

    return {
      status: 200,
      body: { status: 'approved', writeNonce: input.writeNonce },
    };
  }

  const cancelled = await cancelPendingWrite({
    chatId,
    writeNonce: input.writeNonce,
    requireExisting: input.decision === DECISION.REVOKE,
  });

  if (input.decision === DECISION.REVOKE && !cancelled) {
    return {
      status: 409,
      body: {
        status: 'uncertain',
        message:
          'The pending change was already consumed or removed; its final status could not be verified.',
      },
    };
  }

  // Cancellation is intentionally idempotent: an expired/already-cancelled
  // nonce is still safely cancelled from the user's perspective.
  return {
    status: 200,
    body: {
      status:
        input.decision === DECISION.REVOKE ? 'revoked' : 'cancelled',
      writeNonce: input.writeNonce,
    },
  };
}

module.exports = {
  applyWriteDecision,
  validatePayload,
  DECISION,
  DIRECT_CONFIRM_TOOLS,
};
