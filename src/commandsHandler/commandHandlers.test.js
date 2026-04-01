const { executeCommand } = require('./commandHandlers');
const { COMMAND_DEADLINE } = require('../constants');

jest.mock('./deadlineHandler', () => ({
  handleDeadlineCommand: jest.fn().mockResolvedValue(undefined),
}));

const { handleDeadlineCommand } = require('./deadlineHandler');

describe('executeCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes /deadline through msg-shaped handler signature for menu/ask execution', async () => {
    const bot = {};
    const msg = { chat: { id: 321 }, text: '/menu' };

    await executeCommand(bot, msg, COMMAND_DEADLINE);

    expect(handleDeadlineCommand).toHaveBeenCalledWith(
      bot,
      expect.objectContaining({
        chat: { id: 321 },
        text: COMMAND_DEADLINE,
      }),
    );
  });
});
