const { defineTool } = require('@copilotkit/runtime/v2');
const { parameters } = require('../../utils/availableChipsRequest');
const { getAvailableChips } = require('../../cores/availableChipsCore');
const { getFreshLanguagePreference } = require('../../services/setLanguageService');
const { getAgentChatId } = require('../identity');
const { wrapToolExecute } = require('../wrapToolExecute');
function localizeAvailableChips(result, lang) {
  if (result.choice === 'scope' && lang === 'he') {
    result = { ...result, options: result.options.map((option, index) => ({ ...option, label: ['קבוצה אחת', 'כל הקבוצות במעקב', 'ליגה שלמה'][index] })) };
  }

  return { ...result, lang };
}
const getAvailableChipsTool = defineTool({
  name: 'get_available_chips',
  description: 'Show the six chips unused this calendar season, based on stored standings and locked snapshots, regardless of activation windows. No target opens scope choices. Explicit team arguments imply team scope (any team in a followed league); league arguments imply league scope. Use scope tracked for all tracked teams. Unknown usage stays null; [] means none remaining. Never changes the active team or selected chips.',
  parameters,
  execute: wrapToolExecute('get_available_chips', async (args = {}) => {
    const chatId = getAgentChatId();
    const [{ lang }, result] = await Promise.all([getFreshLanguagePreference(chatId), getAvailableChips({ ...parameters.parse(args), chatId })]);

    return localizeAvailableChips(result, lang);
  }),
});
module.exports = { getAvailableChipsTool, parameters, localizeAvailableChips };
