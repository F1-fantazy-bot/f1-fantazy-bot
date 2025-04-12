const { getChatName, sendLogMessage } = require('./utils');

describe('utils', () => {
  describe('getChatName', () => {
    it('when msg is undefined, return Unknown Chat', () => {
      const result = getChatName();
      expect(result).toBe('Unknown Chat');
    });

    it('when msg.chat is undefined, return Unknown Chat', () => {
      const result = getChatName({});
      expect(result).toBe('Unknown Chat');
    });

    it('when msg.chat.title is defined, return title', () => {
      const result = getChatName({ chat: { title: 'Test Title' } });
      expect(result).toBe('Test Title');
    });

    it('when msg.chat.username is defined, return username', () => {
      const result = getChatName({ chat: { username: 'TestUsername' } });
      expect(result).toBe('TestUsername');
    });

    it('when msg.chat.first_name and msg.chat.last_name are defined, return full name', () => {
      const result = getChatName({
        chat: { first_name: 'John', last_name: 'Doe' },
      });
      expect(result).toBe('John Doe');
    });

    it('when msg.chat.first_name is defined, return first name', () => {
      const result = getChatName({ chat: { first_name: 'John' } });
      expect(result).toBe('John ');
    });

    it('when msg.chat.last_name is defined, return last name', () => {
      const result = getChatName({ chat: { last_name: 'Doe' } });
      expect(result).toBe(' Doe');
    });

    it('when msg.chat is empty, return Unknown Chat', () => {
      const result = getChatName({ chat: {} });
      expect(result).toBe('Unknown Chat');
    });
  });

  describe('sendLogMessage', () => {
    it('when LOG_CHANNEL_ID is undefined, bot.sendMessage does not have been called', () => {
      // Reset module registry to ensure the mocks take effect
      jest.resetModules();
      // Mock the constants module so that LOG_CHANNEL_ID is undefined
      jest.mock('../constants', () => ({
        LOG_CHANNEL_ID: undefined,
      }));

      const botMock = {
        sendMessage: jest.fn(),
      };
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Re-require utils so it picks up the mocked constants
      const { sendLogMessage } = require('./utils');
      sendLogMessage(botMock, 'Log message without channel ID');

      expect(botMock.sendMessage).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('LOG_CHANNEL_ID is not set');

      consoleErrorSpy.mockRestore();
    });

    it('when LOG_CHANNEL_ID is defined, bot.sendMessage has been called', () => {
      const botMock = {
        sendMessage: jest.fn(),
      };

      sendLogMessage(botMock, 'Log message with channel ID');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        expect.any(Number), // LOG_CHANNEL_ID
        expect.stringContaining('Log message with channel ID')
      );
    });

    it('when NODE_ENV is production, log message contains prod', () => {
      process.env.NODE_ENV = 'production';
      const botMock = {
        sendMessage: jest.fn(),
      };

      sendLogMessage(botMock, 'Log message in production');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        expect.any(Number), // LOG_CHANNEL_ID
        expect.stringContaining('env: prod')
      );
    });

    it('when NODE_ENV is not production, log message contains dev', () => {
      process.env.NODE_ENV = 'development';
      const botMock = {
        sendMessage: jest.fn(),
      };

      sendLogMessage(botMock, 'Log message in development');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        expect.any(Number), // LOG_CHANNEL_ID
        expect.stringContaining('env: dev')
      );
    });
  });
});
