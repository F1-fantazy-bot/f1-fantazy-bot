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

const DECISION = Object.freeze({
  APPROVE: 'approve',
  CANCEL: 'cancel',
});

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
    payload.decision !== DECISION.CANCEL
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
        message: 'writeNonce and decision (approve or cancel) are required.',
      },
    };
  }

  if (input.decision === DECISION.APPROVE) {
    const intent = await approvePendingWrite({
      chatId,
      writeNonce: input.writeNonce,
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

    return {
      status: 200,
      body: { status: 'approved', writeNonce: input.writeNonce },
    };
  }

  await cancelPendingWrite({
    chatId,
    writeNonce: input.writeNonce,
  });

  // Cancellation is intentionally idempotent: an expired/already-cancelled
  // nonce is still safely cancelled from the user's perspective.
  return {
    status: 200,
    body: { status: 'cancelled', writeNonce: input.writeNonce },
  };
}

module.exports = { applyWriteDecision, validatePayload, DECISION };
