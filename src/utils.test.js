const { getChatName } = require('./utils');

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
});
