const { randomBytes } = require('crypto');
const { getAvailableChips } = require('../cores/availableChipsCore');
const { parseAvailableChipsCommand, parameters } = require('../utils/availableChipsRequest');
const { saveAvailableChipsSession, getAvailableChipsSession } = require('../azureStorageService');
const { t, getLanguage } = require('../i18n');
const { sendErrorMessage } = require('../utils');
const PAGE_SIZE = 20;
const TTL = 60 * 60 * 1000;
const choiceTitles = { scope: 'Show remaining chips for:', league: 'Choose a league', team: 'Choose a team' };
const messages = {
  no_followed_leagues: 'Follow a league first with /follow_league.',
  not_followed: 'This league is not followed.',
  empty: 'No teams found.',
  unavailable: 'Chip usage data is unavailable. Try again after the next refresh.',
};
function splitText(text, limit = 3900) {
  const parts = [];
  let current = '';
  for (const line of text.split('\n')) {
    let rest = line;
    while (rest.length > limit) {
      if (current) { parts.push(current); current = ''; }
      // Avoid cutting a UTF-16 surrogate pair in oversized names.
      const cut = /[\uD800-\uDBFF]/.test(rest[limit - 1]) ? limit - 1 : limit;
      parts.push(rest.slice(0, cut)); rest = rest.slice(cut);
    }
    if (current.length + rest.length + 1 > limit) { parts.push(current); current = ''; }
    current += (current ? '\n' : '') + rest;
  }
  if (current) {parts.push(current);}

  return parts;
}
function displayTime(value, chatId) {
  const time = Date.parse(value);

  return Number.isFinite(time) ? new Intl.DateTimeFormat(getLanguage(chatId) === 'he' ? 'he-IL' : 'en-GB', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem',
  }).format(time) : t('Unknown update time', chatId);
}
function formatAvailableChips(result, chatId) {
  const lines = [t('🎟️ Chips unused this season', chatId)];
  if (result.partial) {lines.push(t('Some league data could not be loaded; partial results are shown.', chatId));}
  for (const team of result.teams) {
    const chips = team.availableChips === null ? t('Usage unavailable', chatId)
      : team.availableChips.length ? team.availableChips.join(', ') : t('None remaining', chatId);
    const leagues = team.leagues?.map((league) => league.leagueName).join(', ');
    lines.push(`${team.teamName}: ${chips}\n${leagues ? `${leagues} · ` : ''}${t('Updated', chatId)}: ${displayTime(team.updatedAt, chatId)}`);
  }

  return splitText(lines.join('\n'));
}
async function sendPicker(bot, chatId, session, page = 0) {
  const result = session.result;
  const lastPage = Math.max(0, Math.ceil(result.options.length / PAGE_SIZE) - 1);
  page = Math.min(lastPage, Math.max(0, page));
  const keyboard = result.options.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((option, offset) => [{
    text: `${t(option.label, chatId)}${result.choice === 'team' && option.detail ? ` · ${option.detail}` : ''}`.slice(0, 180),
    callback_data: `AC:${session.token}:s:${page * PAGE_SIZE + offset}`,
  }]);
  const navigation = [];
  if (page > 0) {navigation.push({ text: t('Previous', chatId), callback_data: `AC:${session.token}:p:${page - 1}` });}
  if (page < lastPage) {navigation.push({ text: t('Next', chatId), callback_data: `AC:${session.token}:p:${page + 1}` });}
  if (navigation.length) {keyboard.push(navigation);}
  await bot.sendMessage(chatId, t(choiceTitles[result.choice], chatId), { reply_markup: { inline_keyboard: keyboard } });
}
async function sendResult(bot, chatId, args) {
  const result = await getAvailableChips({ ...args, chatId });
  if (result.status === 'selection_required') {
    const session = { token: randomBytes(6).toString('hex'), createdAt: Date.now(), result };
    await saveAvailableChipsSession(chatId, session);

    return sendPicker(bot, chatId, session);
  }
  if (result.status !== 'ok') {return bot.sendMessage(chatId, t(messages[result.status] || messages.unavailable, chatId));}
  // Plain text preserves arbitrary team names without Telegram markup parsing.
  for (const text of formatAvailableChips(result, chatId)) {await bot.sendMessage(chatId, text);}
}
async function handleAvailableChipsCommand(bot, msg, suppliedArgs) {
  const chatId = msg.chat.id;
  let args;
  try { args = suppliedArgs ? parameters.parse(suppliedArgs) : parseAvailableChipsCommand(msg.text); }
  catch { return bot.sendMessage(chatId, t('Invalid available chips request.', chatId)); }
  try { return await sendResult(bot, chatId, args); }
  catch (error) {
    await sendErrorMessage(bot, `Available chips failed: ${error.message}`);

    return bot.sendMessage(chatId, t(messages.unavailable, chatId));
  }
}
async function handleAvailableChipsCallback(bot, query) {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id);
  try {
    const match = query.data.match(/^AC:([a-f0-9]{12}):([sp]):(\d+)$/);
    const session = match && await getAvailableChipsSession(chatId);
    if (!session || session.token !== match[1] || !Number.isFinite(session.createdAt) || Date.now() - session.createdAt > TTL) {
      await bot.sendMessage(chatId, t('Selection expired. Choose again.', chatId));

      return await sendResult(bot, chatId, {});
    }
    const index = Number(match[3]);
    if (match[2] === 'p') {return await sendPicker(bot, chatId, session, index);}
    const option = session.result.options[index];
    if (!option) {return await sendResult(bot, chatId, {});}

    return await sendResult(bot, chatId, parameters.parse(option.args));
  } catch (error) {
    await sendErrorMessage(bot, `Available chips selection failed: ${error.message}`);
    await bot.sendMessage(chatId, t('Selection expired. Choose again.', chatId));

    return await handleAvailableChipsCommand(bot, { chat: { id: chatId }, text: '/available_chips' });
  }
}
module.exports = { handleAvailableChipsCommand, handleAvailableChipsCallback, formatAvailableChips, splitText };
