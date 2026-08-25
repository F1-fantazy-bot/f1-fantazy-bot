const z = require('zod');
const {
  t,
  getLanguageName,
  getSupportedLanguages,
} = require('../../i18n');
const {
  setLanguagePreference,
  getFreshLanguagePreference,
  isSupportedLanguage,
} = require('../../services/setLanguageService');
const {
  defineWriteTool,
  WRITE_RESULT_STATUSES,
} = require('../writeToolHelpers');

const setLanguageTool = defineWriteTool({
  name: 'set_language',
  description:
    'Change the signed-in user\'s saved language preference. Supported values are "en" (English) and "he" (Hebrew). This is a write operation and always requires the confirmation card.',
  parameters: z.object({
    lang: z
      .string()
      .describe('Target language code: "en" for English or "he" for Hebrew.'),
  }),
  validate: async ({ chatId, args }) => {
    const current = await getFreshLanguagePreference(chatId);

    if (!isSupportedLanguage(args.lang)) {
      return {
        status: WRITE_RESULT_STATUSES.INVALID_INPUT,
        tool: 'set_language',
        summary: t(
          'Invalid language. Supported languages: {LANGS}',
          chatId,
          { LANGS: getSupportedLanguages().join(', ') },
        ),
        supportedLanguages: getSupportedLanguages(),
      };
    }

    if (current.fresh && current.lang === args.lang) {
      return {
        status: WRITE_RESULT_STATUSES.OK,
        tool: 'set_language',
        summary: t('Language is already set to {LANG} ({CODE}).', chatId, {
          LANG: getLanguageName(args.lang, chatId),
          CODE: args.lang,
        }),
        lang: args.lang,
        languageName: getLanguageName(args.lang, chatId),
        changed: false,
      };
    }

    return null;
  },
  buildSummary: ({ chatId, args }) =>
    t('Change your saved language to {LANG} ({CODE}).', chatId, {
      LANG: getLanguageName(args.lang, chatId),
      CODE: args.lang,
    }),
  commit: ({ chatId, args }) =>
    setLanguagePreference({ chatId, lang: args.lang }),
});

module.exports = { setLanguageTool };
