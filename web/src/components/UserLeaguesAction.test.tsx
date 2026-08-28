import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { InteractiveUserLeagues } from './UserLeaguesAction';

const addMessage = vi.fn();
const runAgent = vi.fn().mockResolvedValue(undefined);
const agent = { addMessage };

vi.mock('@copilotkit/react-core/v2', () => ({
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

afterEach(() => {
  addMessage.mockReset();
  runAgent.mockClear();
});

function renderLeagues(selectionMode?: 'follow_team') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <InteractiveUserLeagues
        result={{
          lang: 'en',
          selectionMode,
          leagues: [
            {
              leagueCode: 'ABC123',
              leagueName: 'Friends League',
            },
          ],
        }}
      />,
    );
  });

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('InteractiveUserLeagues', () => {
  test('continues follow_team with the clicked canonical league', async () => {
    const rendered = renderLeagues('follow_team');
    const leagueButton = rendered.container.querySelector('button');

    await act(async () => {
      leagueButton?.click();
    });

    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'developer',
        content: expect.stringContaining(
          'leagueCode and selectionMode="follow_team"',
        ),
      }),
    );
    expect(addMessage.mock.calls[0][0].content).toContain('ABC123');
    expect(runAgent).toHaveBeenCalledWith({ agent });
    rendered.cleanup();
  });

  test('keeps league cards read-only outside follow_team selection mode', () => {
    const rendered = renderLeagues();

    expect(rendered.container.querySelector('button')).toBeNull();
    expect(rendered.container.textContent).toContain('Friends League');
    rendered.cleanup();
  });
});
