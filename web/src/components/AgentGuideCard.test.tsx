import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import {
  AgentGuideCard,
  type AgentGuideResult,
} from './AgentGuideCard';

const addMessage = vi.fn();
const setMessages = vi.fn();
const subscribe = vi.fn();
const unsubscribe = vi.fn();
const runAgent = vi.fn();
let runSubscriber: {
  onRunFailed?: () => void;
  onRunErrorEvent?: () => void;
} = {};
const agent = {
  addMessage,
  setMessages,
  subscribe,
  messages: [] as Array<{ id: string; role: string; content: string }>,
  isRunning: false,
};

vi.mock('@copilotkit/react-core/v2', () => ({
  UseAgentUpdate: { OnRunStatusChanged: 'run-status' },
  useAgent: () => ({ agent }),
  useCopilotKit: () => ({ copilotkit: { runAgent } }),
}));

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  addMessage.mockReset();
  setMessages.mockReset();
  subscribe.mockReset();
  unsubscribe.mockReset();
  runAgent.mockReset();
  runAgent.mockResolvedValue(undefined);
  agent.messages = [];
  agent.isRunning = false;
  runSubscriber = {};
  addMessage.mockImplementation((message) => {
    agent.messages = [...agent.messages, message];
  });
  setMessages.mockImplementation((messages) => {
    agent.messages = messages;
  });
  subscribe.mockImplementation((subscriber) => {
    runSubscriber = subscriber;

    return { unsubscribe };
  });
});

function renderGuide(result: AgentGuideResult) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<AgentGuideCard result={result} />));

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('AgentGuideCard', () => {
  test('renders personalized status and recommendations', () => {
    const rendered = renderGuide({
      status: 'ok',
      lang: 'en',
      title: 'Your F1 Fantasy pit wall',
      intro: 'Ask naturally.',
      profile: {
        teamCount: 3,
        followedTeamCount: 2,
        leagueCount: 1,
        hasProjectionData: true,
      },
      recommendations: [
        {
          id: 'optimize_team',
          topic: 'teams',
          icon: '🏆',
          title: 'Optimize your team',
          description: 'Compare projected lineups.',
          example: 'Best teams for Kilzid',
        },
      ],
      sections: [],
      notices: [],
    });

    expect(rendered.container.textContent).toContain('PIT WALL');
    expect(rendered.container.textContent).toContain('Your next move');
    expect(rendered.container.textContent).toContain('Optimize your team');
    expect(rendered.container.textContent).toContain('Best teams for Kilzid');
    expect(rendered.container.textContent).toContain('3');
    expect(rendered.container.textContent).toContain('Ready');
    rendered.cleanup();
  });

  test('clicking a task sends its example as a user prompt', async () => {
    const rendered = renderGuide({
      status: 'ok',
      lang: 'he',
      title: 'עמדת הפיקוד שלך',
      intro: 'אפשר לשאול באופן טבעי.',
      profile: {},
      recommendations: [
        {
          id: 'live_score',
          topic: 'leagues',
          icon: '🔴',
          title: 'בדוק ניקוד חי',
          description: 'ראה פירוט ניקוד חי.',
          example: 'הצג את טבלת הניקוד החי של kilzi test',
        },
      ],
      sections: [],
      notices: [],
    });

    await act(async () => {
      rendered.container
        .querySelector<HTMLButtonElement>(
          'button[aria-label^="בדוק ניקוד חי:"]',
        )
        ?.click();
    });

    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        content: 'הצג את טבלת הניקוד החי של kilzi test',
      }),
    );
    expect(runAgent).toHaveBeenCalledWith({ agent });
    rendered.cleanup();
  });

  test('does not start from a card while the agent is already running', () => {
    agent.isRunning = true;
    const rendered = renderGuide({
      status: 'ok',
      lang: 'en',
      title: 'Guide',
      intro: 'Ask naturally.',
      profile: {},
      recommendations: [
        {
          id: 'live_score',
          topic: 'leagues',
          icon: '🔴',
          title: 'Check live scoring',
          description: 'See live scores.',
          example: 'Show live scores',
        },
      ],
      sections: [],
      notices: [],
    });

    const button = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Check live scoring:"]',
    );
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    act(() => button?.click());
    expect(addMessage).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
    rendered.cleanup();
  });

  test('rolls back when CopilotKit resolves after a run failure', async () => {
    runAgent.mockImplementation(async () => {
      runSubscriber.onRunFailed?.();

      return { newMessages: [] };
    });
    const rendered = renderGuide({
      status: 'ok',
      lang: 'en',
      title: 'Guide',
      intro: 'Ask naturally.',
      profile: {},
      recommendations: [
        {
          id: 'live_score',
          topic: 'leagues',
          icon: '🔴',
          title: 'Check live scoring',
          description: 'See live scores.',
          example: 'Show live scores',
        },
      ],
      sections: [],
      notices: [],
    });

    await act(async () => {
      rendered.container
        .querySelector<HTMLButtonElement>(
          'button[aria-label^="Check live scoring:"]',
        )
        ?.click();
    });

    expect(setMessages).toHaveBeenCalledWith([]);
    expect(agent.messages).toEqual([]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toBe(
      'Unable to send the request. Please try again.',
    );
    rendered.cleanup();
  });

  test('treats a run error event as a failed prompt execution', async () => {
    runAgent.mockImplementation(async () => {
      runSubscriber.onRunErrorEvent?.();

      return { newMessages: [] };
    });
    const rendered = renderGuide({
      status: 'ok',
      lang: 'en',
      title: 'Guide',
      intro: 'Ask naturally.',
      profile: {},
      recommendations: [
        {
          id: 'live_score',
          topic: 'leagues',
          icon: '🔴',
          title: 'Check live scoring',
          description: 'See live scores.',
          example: 'Show live scores',
        },
      ],
      sections: [],
      notices: [],
    });

    await act(async () => {
      rendered.container
        .querySelector<HTMLButtonElement>(
          'button[aria-label^="Check live scoring:"]',
        )
        ?.click();
    });

    expect(agent.messages).toEqual([]);
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toBe(
      'Unable to send the request. Please try again.',
    );
    rendered.cleanup();
  });

  test('shares one in-flight lock across multiple guide cards', async () => {
    let finishRun: () => void = () => {};
    runAgent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRun = resolve;
        }),
    );
    const guideResult: AgentGuideResult = {
      status: 'ok',
      lang: 'en',
      title: 'Guide',
      intro: 'Ask naturally.',
      profile: {},
      recommendations: [
        {
          id: 'live_score',
          topic: 'leagues',
          icon: '🔴',
          title: 'Check live scoring',
          description: 'See live scores.',
          example: 'Show live scores',
        },
      ],
      sections: [],
      notices: [],
    };
    const first = renderGuide(guideResult);
    const second = renderGuide(guideResult);

    act(() => {
      first.container
        .querySelector<HTMLButtonElement>(
          'button[aria-label^="Check live scoring:"]',
        )
        ?.click();
      second.container
        .querySelector<HTMLButtonElement>(
          'button[aria-label^="Check live scoring:"]',
        )
        ?.click();
    });

    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledTimes(1);
    await act(async () => finishRun());
    first.cleanup();
    second.cleanup();
  });

  test('renders Hebrew content in RTL', () => {
    const rendered = renderGuide({
      status: 'ok',
      lang: 'he',
      title: 'עמדת הפיקוד שלך',
      intro: 'אפשר לשאול באופן טבעי.',
      profile: {
        teamCount: 1,
        followedTeamCount: 1,
        leagueCount: 1,
        hasProjectionData: false,
      },
      recommendations: [],
      sections: [
        {
          topic: 'races',
          tasks: [
            {
              id: 'race_schedule',
              topic: 'races',
              icon: '🗓️',
              title: 'תכנן את סוף שבוע המרוץ',
              description: 'קבל מידע על המרוץ.',
              example: 'ספר לי על המרוץ הבא',
            },
          ],
        },
      ],
      notices: ['נתוני התחזית עדיין אינם מוכנים.'],
    });

    expect(
      rendered.container.querySelector('section')?.getAttribute('dir'),
    ).toBe('rtl');
    expect(rendered.container.textContent).toContain('סוף שבוע המרוץ');
    expect(rendered.container.textContent).toContain('נסה לשאול');
    expect(rendered.container.textContent).toContain('חסר');
    expect(rendered.container.textContent).toContain('F1 FANTASY · עמדת פיקוד');
    expect(rendered.container.textContent).not.toContain('PIT WALL');
    expect(
      rendered.container.querySelector('[role="group"]')?.getAttribute(
        'aria-label',
      ),
    ).toBe('מצב הפיט');
    rendered.cleanup();
  });

  test('renders a safe forbidden state for admin guidance', () => {
    const rendered = renderGuide({
      status: 'forbidden',
      lang: 'en',
      summary: 'Administrative guidance is available only to administrators.',
    });

    expect(rendered.container.querySelector('[role="status"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain(
      'available only to administrators',
    );
    rendered.cleanup();
  });
});
