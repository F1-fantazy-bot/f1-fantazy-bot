const {
  registerPendingReply,
  hasPendingReply,
  getPendingReply,
  consumePendingReply,
  clearPendingReply,
  pendingReplies,
} = require('./pendingReplyManager');

describe('pendingReplyManager', () => {
  beforeEach(() => {
    for (const key of Object.keys(pendingReplies)) {
      delete pendingReplies[key];
    }
  });

  describe('registerPendingReply', () => {
    it('should register a handler for a chat id', () => {
      const handler = jest.fn();
      registerPendingReply(123, handler);

      expect(pendingReplies[123].handler).toBe(handler);
      expect(pendingReplies[123].validate).toBeNull();
      expect(pendingReplies[123].resendPromptIfNotValid).toBeNull();
    });

    it('should overwrite an existing handler for the same chat id', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      registerPendingReply(123, handler1);
      registerPendingReply(123, handler2);

      expect(pendingReplies[123].handler).toBe(handler2);
    });

    it('should store validate and resendPromptIfNotValid options', () => {
      const handler = jest.fn();
      const validate = jest.fn();
      registerPendingReply(123, handler, { validate, resendPromptIfNotValid: 'Send text only' });

      expect(pendingReplies[123].handler).toBe(handler);
      expect(pendingReplies[123].validate).toBe(validate);
      expect(pendingReplies[123].resendPromptIfNotValid).toBe('Send text only');
    });
  });

  describe('hasPendingReply', () => {
    it('should return false for unknown chat ids', () => {
      expect(hasPendingReply(999)).toBe(false);
    });

    it('should return true after registerPendingReply', () => {
      registerPendingReply(123, jest.fn());

      expect(hasPendingReply(123)).toBe(true);
    });

    it('should return false after consumePendingReply', () => {
      registerPendingReply(123, jest.fn());
      consumePendingReply(123);

      expect(hasPendingReply(123)).toBe(false);
    });
  });

  describe('getPendingReply', () => {
    it('should return the full entry without removing it', () => {
      const handler = jest.fn();
      const validate = jest.fn();
      registerPendingReply(123, handler, { validate, resendPromptIfNotValid: 'prompt' });

      const entry = getPendingReply(123);

      expect(entry.handler).toBe(handler);
      expect(entry.validate).toBe(validate);
      expect(entry.resendPromptIfNotValid).toBe('prompt');
      expect(hasPendingReply(123)).toBe(true);
    });

    it('should return undefined for unknown chat ids', () => {
      expect(getPendingReply(999)).toBeUndefined();
    });
  });

  describe('consumePendingReply', () => {
    it('should return the handler and remove the entry', () => {
      const handler = jest.fn();
      registerPendingReply(123, handler);

      const result = consumePendingReply(123);

      expect(result).toBe(handler);
      expect(hasPendingReply(123)).toBe(false);
    });

    it('should return undefined for unknown chat ids', () => {
      const result = consumePendingReply(999);

      expect(result).toBeUndefined();
    });
  });

  describe('clearPendingReply', () => {
    it('should remove the handler without returning it', () => {
      registerPendingReply(123, jest.fn());
      clearPendingReply(123);

      expect(hasPendingReply(123)).toBe(false);
    });

    it('should not throw for unknown chat ids', () => {
      expect(() => clearPendingReply(999)).not.toThrow();
    });
  });
});
