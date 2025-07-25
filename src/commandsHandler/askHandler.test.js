const { KILZI_CHAT_ID } = require('../constants');

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
const { handleAskCommand } = require('./askHandler');

describe('handleAskCommand', () => {
  const botMock = { sendMessage: jest.fn().mockResolvedValue() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call AzureOpenAI and execute returned commands', async () => {
    const msgMock = { chat: { id: KILZI_CHAT_ID }, text: 'best teams' };
    const mockResponse = {
      choices: [{ message: { content: '["/best_teams","1"]' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    __createMock.mockResolvedValue(mockResponse);

    await handleAskCommand(botMock, msgMock);

    expect(__createMock).toHaveBeenCalled();
    expect(handleBestTeamsMessage).toHaveBeenCalledWith(botMock, KILZI_CHAT_ID);
    expect(handleNumberMessage).toHaveBeenCalledWith(botMock, KILZI_CHAT_ID, '1');
  });

  it('should notify when no text provided', async () => {
    const msgMock = { chat: { id: KILZI_CHAT_ID }, text: '' };

    await handleAskCommand(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Please provide a question.'
    );
  });
});
