const { KILZI_CHAT_ID } = require('../constants');

jest.mock('../i18n', () => ({
  getLanguage: jest.fn().mockReturnValue('en'),
}));

const { getLanguage } = require('../i18n');
const { handleFlowCommand } = require('./flowHandler');

describe('handleFlowCommand', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getLanguage.mockReturnValue('en');
  });

  it('should send the English flow message by default', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/flow',
    };

    await handleFlowCommand(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];

    expect(sentMessage).toContain('F1 Fantasy Bot - Usage Flow');
    expect(sentMessage).toContain('Upload Your Data');
    expect(sentMessage).toContain('Choose a Chip (Optional)');
    expect(sentMessage).toContain('Adjust Budget Change Ranking (Optional)');
    expect(sentMessage).toContain('Calculate Best Teams');
    expect(sentMessage).toContain('Get Team Details');
    expect(sentMessage).toContain('Check Live Score');
    expect(sentMessage).toContain('Explore Race Info');
    expect(sentMessage).toContain('Tips:');
    expect(sentMessage).toContain('/menu');
    expect(sentMessage).toContain('/best\\_teams');
    expect(sentMessage).toContain('/live\\_score');
    expect(sentMessage).toContain('/set\\_best\\_team\\_ranking');

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      sentMessage,
      { parse_mode: 'Markdown' }
    );
  });

  it('should send the Hebrew flow message when language is Hebrew', async () => {
    getLanguage.mockReturnValue('he');

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/flow',
    };

    await handleFlowCommand(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);

    const sentMessage = botMock.sendMessage.mock.calls[0][1];

    expect(sentMessage).toContain('תהליך שימוש');
    expect(sentMessage).toContain('העלאת נתונים');
    expect(sentMessage).toContain('בחירת צ\'יפ (אופציונלי)');
    expect(sentMessage).toContain('דירוג שינויי תקציב (אופציונלי)');
    expect(sentMessage).toContain('חישוב הקבוצות הטובות ביותר');
    expect(sentMessage).toContain('פרטי קבוצה');
    expect(sentMessage).toContain('ניקוד חי');
    expect(sentMessage).toContain('מידע על מרוצים');
    expect(sentMessage).toContain('טיפים:');
    expect(sentMessage).toContain('/live\\_score');
    expect(sentMessage).toContain('/set\\_best\\_team\\_ranking');

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      sentMessage,
      { parse_mode: 'Markdown' }
    );
  });

  it('should handle sendMessage errors gracefully', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '/flow',
    };

    botMock.sendMessage.mockRejectedValue(new Error('Network error'));

    await handleFlowCommand(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledTimes(1);
  });
});
