// Shared bounded/coalesced UserRegistry point reads.
//
// Language and selected-team preferences are consumed by separate services,
// but Telegram refreshes both before routing an update. Coalescing here keeps
// that refresh to one Azure read per chat and bounds cold table
// initialization + lookup latency.

const { getUserById } = require('../userRegistryService');

const USER_PROFILE_REFRESH_TIMEOUT_MS = 750;
const inFlightProfiles = new Map();

async function getFreshUserProfile(
  chatId,
  { timeoutMs = USER_PROFILE_REFRESH_TIMEOUT_MS } = {},
) {
  const key = String(chatId);
  const existing = inFlightProfiles.get(key);
  if (existing) {
    return await existing;
  }

  const request = (async () => {
    const controller = new AbortController();
    let timeout;
    try {
      const lookup = getUserById(chatId, {
        abortSignal: controller.signal,
      });
      const deadline = new Promise((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          const err = new Error('User preference refresh timed out');
          err.name = 'AbortError';
          reject(err);
        }, timeoutMs);
      });

      return await Promise.race([lookup, deadline]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  })();

  inFlightProfiles.set(key, request);
  try {
    return await request;
  } finally {
    if (inFlightProfiles.get(key) === request) {
      inFlightProfiles.delete(key);
    }
  }
}

function invalidateUserProfileRefresh(chatId) {
  inFlightProfiles.delete(String(chatId));
}

function resetUserProfileSyncForTests() {
  inFlightProfiles.clear();
}

module.exports = {
  getFreshUserProfile,
  invalidateUserProfileRefresh,
  resetUserProfileSyncForTests,
  USER_PROFILE_REFRESH_TIMEOUT_MS,
};
