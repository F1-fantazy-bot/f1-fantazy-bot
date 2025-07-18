const {
  getChatName,
  sendLogMessage,
  calculateTeamInfo,
  validateJsonData,
  formatDateTime,
} = require('./utils');

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
    it('when LOG_CHANNEL_ID is undefined, bot.sendMessage does not have been called', async () => {
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
      await sendLogMessage(botMock, 'Log message without channel ID');

      expect(botMock.sendMessage).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('LOG_CHANNEL_ID is not set');

      consoleErrorSpy.mockRestore();
    });

    it('when LOG_CHANNEL_ID is defined, bot.sendMessage has been called', async () => {
      const botMock = {
        sendMessage: jest.fn(),
      };

      await sendLogMessage(botMock, 'Log message with channel ID');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        expect.any(Number), // LOG_CHANNEL_ID
        expect.stringContaining('Log message with channel ID')
      );
    });

    it('when NODE_ENV is production, log message contains prod', async () => {
      process.env.NODE_ENV = 'production';
      const botMock = {
        sendMessage: jest.fn(),
      };

      await sendLogMessage(botMock, 'Log message in production');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        expect.any(Number), // LOG_CHANNEL_ID
        expect.stringContaining('env: prod')
      );
    });

    it('when NODE_ENV is test, log message contains test', async () => {
      process.env.NODE_ENV = 'test';
      const botMock = {
        sendMessage: jest.fn(),
      };

      await sendLogMessage(botMock, 'Log message in test');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        expect.any(Number), // LOG_CHANNEL_ID
        expect.stringContaining('env: test')
      );
    });

    it('when NODE_ENV is development, log message contains dev', async () => {
      process.env.NODE_ENV = 'development';
      const botMock = {
        sendMessage: jest.fn(),
      };

      await sendLogMessage(botMock, 'Log message in development');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        expect.any(Number), // LOG_CHANNEL_ID
        expect.stringContaining('env: dev')
      );
    });
  });

  describe('calculateTeamInfo', () => {
    it('calculates totalPrice, costCapRemaining, overallBudget, teamExpectedPoints, teamPriceChange correctly', () => {
      const mockDrivers = {
        VER: {
          DR: 'VER',
          price: 30,
          expectedPoints: 25,
          expectedPriceChange: 0.2,
        },
        HAM: {
          DR: 'HAM',
          price: 28,
          expectedPoints: 20,
          expectedPriceChange: 0.1,
        },
        PER: {
          DR: 'PER',
          price: 25,
          expectedPoints: 15,
          expectedPriceChange: -0.1,
        },
        SAI: {
          DR: 'SAI',
          price: 23,
          expectedPoints: 18,
          expectedPriceChange: 0.3,
        },
        LEC: {
          DR: 'LEC',
          price: 24,
          expectedPoints: 19,
          expectedPriceChange: 0.1,
        },
        NOR: {
          DR: 'NOR',
          price: 20,
          expectedPoints: 12,
          expectedPriceChange: 0,
        },
      };

      const mockConstructors = {
        RED: {
          CN: 'RED',
          price: 35,
          expectedPoints: 30,
          expectedPriceChange: 0.5,
        },
        MER: {
          CN: 'MER',
          price: 32,
          expectedPoints: 25,
          expectedPriceChange: 0.2,
        },
        FER: {
          CN: 'FER',
          price: 30,
          expectedPoints: 20,
          expectedPriceChange: -0.1,
        },
      };

      const mockCurrentTeam = {
        drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
        constructors: ['RED', 'MER'],
        drsBoost: 'VER',
        freeTransfers: 2,
        costCapRemaining: 10,
      };

      const result = calculateTeamInfo(
        mockCurrentTeam,
        mockDrivers,
        mockConstructors
      );

      // totalPrice = 30+28+25+23+24 + 35+32 = 197
      // costCapRemaining = 10
      // overallBudget = 197 + 10 = 207
      // teamExpectedPoints = 25+20+15+18+19 + 30+25 + 25 = 177
      // teamPriceChange = 0.2 + 0.1 - 0.1 + 0.3 + 0.1 + 0.5 + 0.2 = 1.3 (1.2999999999999998 - JavaScript floating point behavior)
      expect(result).toEqual({
        totalPrice: 197,
        costCapRemaining: 10,
        overallBudget: 207,
        teamExpectedPoints: 177,
        teamPriceChange: 1.2999999999999998,
      });
    });

    it('returns 0 totalPrice if drivers and constructors are empty', () => {
      const team = {
        drivers: [],
        constructors: [],
        costCapRemaining: 10,
      };
      const drivers = [];
      const constructors = [];

      const result = calculateTeamInfo(team, drivers, constructors);

      expect(result).toEqual({
        totalPrice: 0,
        costCapRemaining: 10,
        overallBudget: 10,
        teamExpectedPoints: 0,
        teamPriceChange: 0,
      });
    });

    it('handles driver and constructor indices correctly', () => {
      const team = {
        drivers: [1, 0],
        constructors: [1, 0],
        costCapRemaining: 0,
      };
      const drivers = [
        { price: 5, expectedPoints: 0, expectedPriceChange: 0 },
        { price: 10, expectedPoints: 0, expectedPriceChange: 0 },
      ];
      const constructors = [
        { price: 20, expectedPoints: 0, expectedPriceChange: 0 },
        { price: 30, expectedPoints: 0, expectedPriceChange: 0 },
      ];

      const result = calculateTeamInfo(team, drivers, constructors);

      // drivers: 10 + 5, constructors: 30 + 20
      expect(result).toEqual({
        totalPrice: 65,
        costCapRemaining: 0,
        overallBudget: 65,
        teamExpectedPoints: 0,
        teamPriceChange: 0,
      });
    });
  });

  describe('validateJsonData', () => {
    let botMock;
    let validJsonData;

    beforeEach(() => {
      botMock = {
        sendMessage: jest.fn().mockResolvedValue(),
      };

      validJsonData = {
        Drivers: Array(20).fill({}),
        Constructors: Array(10).fill({}),
        CurrentTeam: {
          drivers: Array(5).fill('DRIVER'),
          constructors: Array(2).fill('CONSTRUCTOR'),
          drsBoost: 'DRIVER',
          freeTransfers: 2,
          costCapRemaining: 10,
        },
      };
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('returns true for valid JSON data', async () => {
      const result = await validateJsonData(botMock, validJsonData, 123);
      expect(result).toBe(true);
      expect(botMock.sendMessage).not.toHaveBeenCalled();
    });

    it('returns false and sends message if Drivers is missing', async () => {
      const data = { ...validJsonData, Drivers: undefined };
      const result = await validateJsonData(botMock, data, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('20 drivers')
      );
    });

    it('returns false and sends message if Drivers length is not 20', async () => {
      const data = { ...validJsonData, Drivers: Array(19).fill({}) };
      const result = await validateJsonData(botMock, data, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('20 drivers')
      );
    });

    it('returns false and sends message if Constructors is missing', async () => {
      const data = { ...validJsonData, Constructors: undefined };
      const result = await validateJsonData(botMock, data, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('10 constructors')
      );
    });

    it('returns false and sends message if Constructors length is not 10', async () => {
      const data = { ...validJsonData, Constructors: Array(9).fill({}) };
      const result = await validateJsonData(botMock, data, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('10 constructors')
      );
    });

    it('returns false and sends message if CurrentTeam is missing', async () => {
      const data = { ...validJsonData, CurrentTeam: undefined };
      const result = await validateJsonData(botMock, data, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('CurrentTeam')
      );
    });

    it('returns false and sends message if CurrentTeam.drivers is missing', async () => {
      const data = {
        ...validJsonData,
        CurrentTeam: { ...validJsonData.CurrentTeam, drivers: undefined },
      };
      const result = await validateJsonData(botMock, data, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('CurrentTeam')
      );
    });

    it('returns false and sends message if CurrentTeam.drivers length is not 5', async () => {
      const data = {
        ...validJsonData,
        CurrentTeam: {
          ...validJsonData.CurrentTeam,
          drivers: Array(4).fill('DRIVER'),
        },
      };
      const result = await validateJsonData(botMock, data, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('CurrentTeam')
      );
    });

    it('returns false and sends message if CurrentTeam.constructors is missing', async () => {
      const data = {
        ...validJsonData,
        CurrentTeam: { ...validJsonData.CurrentTeam, constructors: undefined },
      };
      const result = await validateJsonData(botMock, data, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('CurrentTeam')
      );
    });

    it('returns false and sends message if CurrentTeam.constructors length is not 2', async () => {
      const data = {
        ...validJsonData,
        CurrentTeam: {
          ...validJsonData.CurrentTeam,
          constructors: Array(1).fill('CONSTRUCTOR'),
        },
      };
      const result = await validateJsonData(botMock, data, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('CurrentTeam')
      );
    });

    it('returns false and sends message if CurrentTeam.drsBoost is missing', async () => {
      delete validJsonData.CurrentTeam.drsBoost;
      const result = await validateJsonData(botMock, validJsonData, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('CurrentTeam')
      );
    });

    it('returns false and sends message if CurrentTeam.freeTransfers is missing', async () => {
      delete validJsonData.CurrentTeam.freeTransfers;
      const result = await validateJsonData(botMock, validJsonData, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('CurrentTeam')
      );
    });

    it('returns false and sends message if CurrentTeam.costCapRemaining is missing', async () => {
      delete validJsonData.CurrentTeam.costCapRemaining;
      const result = await validateJsonData(botMock, validJsonData, 123);
      expect(result).toBe(false);
      expect(botMock.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('CurrentTeam')
      );
    });
  });

  describe('formatDateTime', () => {
    it('formats date and time correctly for a typical UTC date', () => {
      const date = new Date('2025-05-24T14:00:00Z');
      const { dateStr, timeStr } = formatDateTime(date);
      expect(dateStr).toMatch('Saturday, 24 May 2025');
      expect(timeStr).toMatch('17:00 GMT+3');
    });

    it('formats date and time correctly for another UTC date', () => {
      const date = new Date('2025-05-25T13:00:00Z');
      const { dateStr, timeStr } = formatDateTime(date);
      expect(dateStr).toMatch('Sunday, 25 May 2025');
      expect(timeStr).toMatch('16:00 GMT+3');
    });
  });
});
