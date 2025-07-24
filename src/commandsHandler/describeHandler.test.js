const { KILZI_CHAT_ID, COMMAND_DESCRIBE } = require('../constants');

jest.mock('openai', () => {
  const createMock = jest.fn();

  return {
    AzureOpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: { create: createMock },
      },
    })),
    __createMock: createMock,
  };
});

const { __createMock } = require('openai');

jest.mock('./bestTeamsHandler', () => ({
  handleBestTeamsMessage: jest.fn(),
}));
jest.mock('./numberInputHandler', () => ({
  handleNumberMessage: jest.fn(),
}));

const { handleBestTeamsMessage } = require('./bestTeamsHandler');
const { handleNumberMessage } = require('./numberInputHandler');
const { handleDescribeCommand } = require('./describeHandler');

describe('handleDescribeCommand', () => {
  const botMock = { sendMessage: jest.fn().mockResolvedValue() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call AzureOpenAI and execute returned commands', async () => {
    const msgMock = { chat: { id: KILZI_CHAT_ID }, text: `${COMMAND_DESCRIBE} best teams` };
    const mockResponse = {
      choices: [{ message: { content: '["/best_teams","1"]' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    __createMock.mockResolvedValue(mockResponse);

    await handleDescribeCommand(botMock, msgMock);

    expect(__createMock).toHaveBeenCalled();
    expect(handleBestTeamsMessage).toHaveBeenCalledWith(botMock, KILZI_CHAT_ID);
    expect(handleNumberMessage).toHaveBeenCalledWith(botMock, KILZI_CHAT_ID, '1');
  });

  it('should notify when no text provided', async () => {
    const msgMock = { chat: { id: KILZI_CHAT_ID }, text: COMMAND_DESCRIBE };

    await handleDescribeCommand(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Please provide a description after the command.'
    );
  });
});
