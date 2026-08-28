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
import { WriteDecisionProvider } from './WriteDecisionContext';

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

function renderLeagues(
  selectionMode?: 'follow_team' | 'unfollow_league',
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <WriteDecisionProvider
        runtimeUrl="https://agent.example.com/api/agent/copilotkit"
        idToken="google-token"
      >
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
        />
      </WriteDecisionProvider>,
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

  test('stages canonical league removal without typed input', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'confirmation_required',
          tool: 'unfollow_league',
          writeNonce: 'nonce-league',
          summary: 'Unfollow Friends League.',
          uiLang: 'en',
        }),
        { status: 200 },
      ),
    );
    const rendered = renderLeagues('unfollow_league');

    await act(async () => {
      Array.from(rendered.container.querySelectorAll('button'))
        .find(
          (button) =>
            button.getAttribute('aria-label') ===
            'Stop following: Friends League',
        )
        ?.click();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://agent.example.com/api/agent/write-proposal',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          tool: 'unfollow_league',
          args: { leagueCode: 'ABC123' },
        }),
      }),
    );
    expect(
      rendered.container.querySelector(
        '[role="dialog"][aria-label="Confirm change: unfollow_league"]',
      ),
    ).not.toBeNull();
    rendered.cleanup();
  });

  test('removes a confirmed league from the visible choices', async () => {
    vi.spyOn(window, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'confirmation_required',
            tool: 'unfollow_league',
            writeNonce: 'nonce-league',
            summary: 'Unfollow Friends League.',
            uiLang: 'en',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            tool: 'unfollow_league',
            summary: 'Unfollowed league ABC123.',
            leagueCode: 'ABC123',
            uiLang: 'en',
          }),
          { status: 200 },
        ),
      );
    const rendered = renderLeagues('unfollow_league');

    await act(async () => {
      Array.from(rendered.container.querySelectorAll('button'))
        .find(
          (button) =>
            button.getAttribute('aria-label') ===
            'Stop following: Friends League',
        )
        ?.click();
    });
    await act(async () => {
      Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Yes, do it')
        ?.click();
    });

    expect(
      rendered.container.querySelector(
        'button[aria-label="Stop following: Friends League"]',
      ),
    ).toBeNull();
    expect(rendered.container.textContent).toContain('No followed leagues.');
    rendered.cleanup();
  });
});
