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
  description: 'Show the six chips unused this calendar season from stored standings and locked snapshots, regardless of activation windows. For a generic question (Show remaining chips / מה הציפים שנשארו לשימוש), omit ALL arguments or pass null to open scope choices. Never infer tracked scope or a selected team. Use tracked ONLY for an explicit all-tracked-teams request. Use team arguments only for an explicitly named/selected team in a followed league, or league arguments for an explicitly named/selected league. Unused targets must be null/omitted, never placeholder strings. Unknown usage stays null; [] means none remain. Does not change preferences.',
  parameters,
  execute: wrapToolExecute('get_available_chips', async (args = {}) => {
    const chatId = getAgentChatId();
    const [{ lang }, result] = await Promise.all([getFreshLanguagePreference(chatId), getAvailableChips({ ...parameters.parse(args), chatId })]);

    return localizeAvailableChips(result, lang);
  }),
});
module.exports = { getAvailableChipsTool, parameters, localizeAvailableChips };
