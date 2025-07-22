const { KILZI_CHAT_ID } = require('../constants');
const { setLanguage, getLanguage, t } = require('../i18n');
const { handleSetLanguage } = require('./setLanguageHandler');

describe('handleSetLanguage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setLanguage('en');
  });

  it('should change language when valid code provided', async () => {
    const msgMock = { chat: { id: KILZI_CHAT_ID }, text: '/lang he' };

    await handleSetLanguage(botMock, msgMock);

    expect(getLanguage()).toBe('he');
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      t('Language changed to {LANG}.', { LANG: 'he' })
    );
  });

  it('should send invalid language message for unsupported code', async () => {
    const msgMock = { chat: { id: KILZI_CHAT_ID }, text: '/lang fr' };

    await handleSetLanguage(botMock, msgMock);

    expect(getLanguage()).toBe('en');
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      t('Invalid language. Supported languages: {LANGS}', { LANGS: 'en, he' })
    );
  });

  it('should send usage message when no language provided', async () => {
    const msgMock = { chat: { id: KILZI_CHAT_ID }, text: '/lang', message_id: 5 };

    await handleSetLanguage(botMock, msgMock);

    expect(getLanguage()).toBe('en');
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      t('Please select a language:'),
      expect.objectContaining({
        reply_to_message_id: 5,
        reply_markup: { inline_keyboard: expect.any(Array) },
      })
    );
  });
});
