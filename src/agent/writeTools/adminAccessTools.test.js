jest.mock('../adminAuthorization', () => ({
  defineAdminWriteTool: jest.fn((spec) => spec),
}));
jest.mock('../../services/adminAccessService', () => ({
  STATUS: {
    OK: 'ok',
    INVALID_INPUT: 'invalid_input',
    NOT_FOUND: 'not_found',
    CHANGED: 'changed',
  },
  createAdminAccessService: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));
jest.mock('../writeToolHelpers', () => ({
  WRITE_RESULT_STATUSES: {
    OK: 'ok',
    INVALID_INPUT: 'invalid_input',
    NOT_FOUND: 'not_found',
  },
}));

const {
  createAdminAccessService,
} = require('../../services/adminAccessService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  setUserNicknameTool,
  allowWebUserTool,
  revokeWebUserTool,
} = require('./adminAccessTools');

const service = {
  inspectNickname: jest.fn(),
  nicknameSummary: jest.fn(),
  nicknameNoopSummary: jest.fn(),
  setUserNickname: jest.fn(),
  inspectWebUserAllowance: jest.fn(),
  allowSummary: jest.fn(),
  allowNoopSummary: jest.fn(),
  allowWebUser: jest.fn(),
  inspectWebUserRevocation: jest.fn(),
  revokeWebUser: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  createAdminAccessService.mockReturnValue(service);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'en' });
});

test('nickname proposal canonicalizes a fresh target and stages its current value for commit revalidation', async () => {
  service.inspectNickname.mockResolvedValue({
    status: 'ok',
    targetChatId: '7',
    nickname: 'Pole',
    currentNickname: 'Old',
    changed: true,
    user: { chatName: 'Fast Driver' },
  });
  service.nicknameSummary.mockReturnValue('Set nickname.');

  await expect(
    setUserNicknameTool.validate({
      chatId: 42,
      args: { chatId: ' 7 ', nickname: ' Pole ' },
    }),
  ).resolves.toEqual({
    args: { chatId: '7', nickname: 'Pole' },
    intentArgs: {
      targetChatId: '7',
      nickname: 'Pole',
      expectedNickname: 'Old',
    },
    summary: 'Set nickname.',
  });
});

test('nickname no-op does not stage a confirmation', async () => {
  service.inspectNickname.mockResolvedValue({
    status: 'ok',
    targetChatId: '7',
    nickname: 'Pole',
    changed: false,
  });
  service.nicknameNoopSummary.mockReturnValue('Already set.');

  await expect(
    setUserNicknameTool.validate({
      chatId: 42,
      args: { chatId: '7', nickname: 'Pole' },
    }),
  ).resolves.toMatchObject({
    status: 'ok',
    tool: 'set_user_nickname',
    summary: 'Already set.',
  });
  expect(service.setUserNickname).not.toHaveBeenCalled();
});

test('allow proposal uses normalized exact email and safely stages the existing mapping fingerprint', async () => {
  service.inspectWebUserAllowance.mockResolvedValue({
    status: 'ok',
    email: 'doron@example.com',
    targetChatId: '7',
    existing: { chatId: '4' },
    changed: true,
    user: { chatName: 'Fast Driver' },
  });
  service.allowSummary.mockReturnValue('Allow access.');

  await expect(
    allowWebUserTool.validate({
      chatId: 42,
      args: { email: 'Doron@Example.com', chatId: '7' },
    }),
  ).resolves.toEqual({
    args: { email: 'doron@example.com', chatId: '7' },
    intentArgs: {
      email: 'doron@example.com',
      targetChatId: '7',
      expectedExistingChatId: '4',
    },
    summary: 'Allow access.',
  });
});

test('allow no-op does not stage a confirmation or call the mutation service', async () => {
  service.inspectWebUserAllowance.mockResolvedValue({
    status: 'ok',
    email: 'doron@example.com',
    targetChatId: '7',
    changed: false,
  });
  service.allowNoopSummary.mockReturnValue('Already allowed.');

  await expect(
    allowWebUserTool.validate({
      chatId: 42,
      args: { email: 'doron@example.com', chatId: '7' },
    }),
  ).resolves.toMatchObject({
    status: 'ok',
    tool: 'allow_web_user',
    summary: 'Already allowed.',
  });
  expect(service.allowWebUser).not.toHaveBeenCalled();
});

test('revoke no-op is returned before confirmation and a changed target is safe at commit', async () => {
  service.inspectWebUserRevocation.mockResolvedValue({
    status: 'not_found',
    summary: 'Nothing to revoke.',
  });
  await expect(
    revokeWebUserTool.validate({ chatId: 42, args: { email: 'gone@example.com' } }),
  ).resolves.toMatchObject({
    status: 'not_found',
    tool: 'revoke_web_user',
  });

  service.revokeWebUser.mockResolvedValue({
    status: 'changed',
    summary: 'Review again.',
  });
  await expect(
    revokeWebUserTool.commit({
      chatId: 42,
      args: { email: 'doron@example.com', expectedExistingChatId: '7' },
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    tool: 'revoke_web_user',
  });
});

test('expected input failures stay out of the confirmation flow', async () => {
  service.inspectWebUserAllowance.mockResolvedValue({
    status: 'invalid_input',
    summary: 'Invalid email.',
  });
  await expect(
    allowWebUserTool.validate({
      chatId: 42,
      args: { email: 'not-an-email', chatId: '7' },
    }),
  ).resolves.toMatchObject({
    status: 'invalid_input',
    tool: 'allow_web_user',
  });
});
