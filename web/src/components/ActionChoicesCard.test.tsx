import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import {
  ActionChoicesCard,
  writeActionChoices,
  type ActionChoicesResult,
} from './ActionChoicesCard';
import {
  isAgentRunActive,
  releaseAgentRun,
  tryAcquireAgentRun,
} from './agentRunLock';

const runAgent = vi.fn();
const unsubscribe = vi.fn();
let subscriber: { onRunErrorEvent?: () => void } = {};
const agent = {
  messages: [] as Array<{ id: string; role: string; content: string }>,
  isRunning: false,
  addMessage: vi.fn(),
  setMessages: vi.fn(),
  subscribe: vi.fn(),
};
vi.mock('@copilotkit/react-core/v2', () => ({
  UseAgentUpdate: { OnRunStatusChanged: 'status' },
  useAgent: () => ({ agent }),
  useCopilotKit: () => ({ copilotkit: { runAgent } }),
}));
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});
beforeEach(() => {
  vi.clearAllMocks();
  agent.messages = [];
  agent.isRunning = false;
  releaseAgentRun(agent);
  agent.addMessage.mockImplementation((message) =>
    agent.messages.push(message),
  );
  agent.setMessages.mockImplementation((messages) => {
    agent.messages = messages;
  });
  agent.subscribe.mockImplementation((next) => {
    subscriber = next;
    return { unsubscribe };
  });
  runAgent.mockResolvedValue(undefined);
});
function render(result: ActionChoicesResult, twice = false) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <>
        <ActionChoicesCard result={result} />
        {twice && <ActionChoicesCard result={result} />}
      </>,
    ),
  );
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
const result: ActionChoicesResult = {
  status: 'selection_required',
  lang: 'en',
  choice: 'league',
  options: [
    {
      label: 'My followed league',
      detail: 'CANONICAL',
      action: 'get_live_score_for_team',
      args: { leagueCode: 'CANONICAL', teamId: 'REQUESTED_1' },
    },
  ],
};

test.each(['en', 'he'])(
  'renders accessible clickable options in %s and preserves canonical continuation',
  async (lang) => {
    const view = render({ ...result, lang });
    expect(view.container.querySelector('section')?.getAttribute('dir')).toBe(
      lang === 'he' ? 'rtl' : 'ltr',
    );
    expect(view.container.textContent).toContain(
      lang === 'he' ? 'בחר ליגה' : 'Choose a league',
    );
    await act(async () => view.container.querySelector('button')!.click());
    const message = agent.addMessage.mock.calls[0][0];
    expect(message.role).toBe('developer');
    expect(message.content).toContain('"action":"get_live_score_for_team"');
    expect(message.content).toContain('"leagueCode":"CANONICAL"');
    expect(message.content).toContain('"teamId":"REQUESTED_1"');
    expect(message.content).toContain('never call confirm_write');
    expect(runAgent).toHaveBeenCalledWith({ agent });
    expect(unsubscribe).toHaveBeenCalled();
    expect(isAgentRunActive(agent)).toBe(false);
    view.cleanup();
  },
);

test('shared lock prevents two cards from starting overlapping runs', async () => {
  let finish!: () => void;
  runAgent.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(result, true);
  await act(async () => {
    view.container.querySelectorAll('button')[0].click();
    view.container.querySelectorAll('button')[1].click();
  });
  expect(runAgent).toHaveBeenCalledTimes(1);
  expect(isAgentRunActive(agent)).toBe(true);
  expect(view.container.textContent).toContain('Loading choices');
  await act(async () => finish());
  expect(isAgentRunActive(agent)).toBe(false);
  view.cleanup();
});

test.each(['reject', 'event'])(
  'failed %s rolls back injected messages and unlocks retry',
  async (mode) => {
    const previous = { id: 'user', role: 'user', content: 'live score' };
    agent.messages = [previous];
    runAgent.mockImplementation(async () => {
      if (mode === 'reject') throw new Error('secret provider error');
      subscriber.onRunErrorEvent?.();
    });
    const view = render(result);
    await act(async () => view.container.querySelector('button')!.click());
    expect(agent.messages).toEqual([previous]);
    expect(
      view.container.querySelector('[role="alert"]')?.textContent,
    ).toContain('Unable to continue');
    expect(view.container.textContent).not.toContain('secret');
    expect(isAgentRunActive(agent)).toBe(false);
    runAgent.mockResolvedValue(undefined);
    await act(async () => view.container.querySelector('button')!.click());
    expect(runAgent).toHaveBeenCalledTimes(2);
    view.cleanup();
  },
);

test('empty and already-busy states offer no executable choice', async () => {
  const empty = render({ ...result, options: [] });
  expect(empty.container.textContent).toContain('No options');
  expect(empty.container.querySelector('button')).toBeNull();
  empty.cleanup();
  tryAcquireAgentRun(agent);
  const busy = render(result);
  await act(async () => busy.container.querySelector('button')!.click());
  expect(runAgent).not.toHaveBeenCalled();
  busy.cleanup();
  releaseAgentRun(agent);
});

test('write disambiguation keeps the chosen chip and never treats target selection as approval', () => {
  const choices = writeActionChoices(
    {
      status: 'invalid_input',
      tool: 'activate_chip',
      uiLang: 'he',
      availableTeams: [{ teamId: 'T2', teamName: 'Team 2' }],
    },
    { teamName: 'ambiguous', chip: 'WILDCARD' },
  );
  expect(choices).toMatchObject({
    choice: 'team',
    lang: 'he',
    options: [
      { action: 'activate_chip', args: { teamId: 'T2', chip: 'WILDCARD' } },
    ],
  });
  expect(choices?.options[0].args.teamName).toBeUndefined();
  expect(
    writeActionChoices({
      status: 'forbidden',
      tool: 'activate_chip',
      availableTeams: [],
    }),
  ).toBeNull();
});

test('invalid preset and chip choices preserve the requested team', () => {
  const preset = writeActionChoices(
    {
      status: 'invalid_input',
      tool: 'set_best_team_ranking',
      availablePresets: [
        { id: 'points_lean', label: 'Points Lean', value: 1.3 },
      ],
    },
    { teamId: 'T2' },
  );
  expect(preset?.options[0]).toMatchObject({
    label: 'Points Lean (1.3)',
    args: { teamId: 'T2', presetId: 'points_lean' },
  });
  const chip = writeActionChoices(
    {
      status: 'invalid_input',
      tool: 'activate_chip',
      availableChips: [{ chip: 'LIMITLESS', label: 'Limitless' }],
    },
    { teamId: 'T2' },
  );
  expect(chip?.options[0].args).toEqual({ teamId: 'T2', chip: 'LIMITLESS' });
});
