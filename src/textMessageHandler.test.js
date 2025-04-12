const { handleMessage } = require('./messageHandler');
const { KILZI_CHAT_ID } = require('./constants');
jest.mock('./utils', () => ({
  getChatName: jest.fn().mockReturnValue('Unknown'),
  sendLogMessage: jest.fn(),
}));
const { sendLogMessage } = require('./utils');

const timesCalledSendLogMessageInMessageHandler = 1;
describe('handleTextMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('when got message without json inside, return error', () => {
    const msgMock = {
      chat: {
        id: KILZI_CHAT_ID,
      },
      text: 'Hello',
    };

    handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Invalid JSON format. Please send valid JSON.'
    );
    expect(sendLogMessage).toHaveBeenCalledTimes(
      timesCalledSendLogMessageInMessageHandler + 1
    );
    expect(sendLogMessage).toHaveBeenCalledWith(
      botMock,
      expect.stringContaining(
        `Failed to parse JSON data: ${msgMock.text}. Error:`
      )
    );
  });
});
