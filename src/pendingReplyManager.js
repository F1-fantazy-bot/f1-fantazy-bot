// Centralized pending reply manager
// Stores chatId -> entry mappings for commands that expect a reply (text or photo)

const pendingReplies = {};

/**
 * Register a pending reply handler for a chat.
 * @param {number} chatId
 * @param {function(bot, msg): Promise<void>} handler - callback invoked with the user's reply
 * @param {object} [options]
 * @param {function(msg): boolean} [options.validate] - returns true if the reply is valid; when false the prompt is re-sent and the handler stays registered
 * @param {string} [options.resendPromptIfNotValid] - message to re-send on validation failure; if omitted and validate is set, a default "Invalid reply. Please try again." message is used
 */
function registerPendingReply(chatId, handler, options = {}) {
  pendingReplies[chatId] = {
    handler,
    validate: options.validate || null,
    resendPromptIfNotValid: options.resendPromptIfNotValid || null,
  };
}

/**
 * Check if a chat has a pending reply handler.
 * @param {number} chatId
 * @returns {boolean}
 */
function hasPendingReply(chatId) {
  return !!pendingReplies[chatId];
}

/**
 * Get the pending reply entry without removing it.
 * @param {number} chatId
 * @returns {{ handler: function, validate: function|null, resendPromptIfNotValid: string|null }|undefined}
 */
function getPendingReply(chatId) {
  return pendingReplies[chatId];
}

/**
 * Get and remove the pending reply handler (one-shot).
 * @param {number} chatId
 * @returns {function|undefined}
 */
function consumePendingReply(chatId) {
  const entry = pendingReplies[chatId];
  delete pendingReplies[chatId];

  return entry ? entry.handler : undefined;
}

/**
 * Remove the pending reply handler without executing it.
 * @param {number} chatId
 */
function clearPendingReply(chatId) {
  delete pendingReplies[chatId];
}

module.exports = { registerPendingReply, hasPendingReply, getPendingReply, consumePendingReply, clearPendingReply, pendingReplies };
