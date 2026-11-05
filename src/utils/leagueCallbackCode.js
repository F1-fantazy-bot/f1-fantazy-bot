const crypto = require('crypto');

function encodeLeagueCallbackCode(leagueCode) {
  const code = String(leagueCode || '');
  if (Buffer.byteLength(code, 'utf8') <= 20 && !code.includes(':')) {
    return code;
  }

  return `~${crypto.createHash('sha256').update(code).digest('hex').slice(0, 12)}`;
}

async function resolveLeagueCallbackCode(chatId, code, listUserLeagues) {
  if (!code?.startsWith('~')) {
    return code;
  }
  const matches = (await listUserLeagues(chatId) || []).filter((league) =>
    encodeLeagueCallbackCode(league.leagueCode) === code);

  return matches.length === 1 ? matches[0].leagueCode : null;
}

module.exports = { encodeLeagueCallbackCode, resolveLeagueCallbackCode };
