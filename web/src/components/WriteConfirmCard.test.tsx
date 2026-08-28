import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { WriteConfirmCard } from './WriteConfirmCard';
import { WriteDecisionProvider } from './WriteDecisionContext';

const addMessage = vi.fn();
const runAgent = vi.fn();
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

function renderCard(
  uiLang?: string,
  onSettled?: (
    outcome: 'confirmed' | 'cancelled' | 'error',
    message?: string,
  ) => void,
  directConfirm = false,
  directConfirmErrorMessage?: string,
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      <WriteDecisionProvider
        runtimeUrl="https://agent.example.com/api/agent/copilotkit"
        idToken="google-token"
      >
        <WriteConfirmCard
          result={{
            status: 'confirmation_required',
            tool: 'set_language',
            writeNonce: 'nonce-1',
            summary: 'Change language to Hebrew.',
            uiLang,
          }}
          directConfirm={directConfirm}
          directConfirmErrorMessage={directConfirmErrorMessage}
          onSettled={onSettled}
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

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent === label,
  );
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}

afterEach(() => {
  addMessage.mockReset();
  runAgent.mockReset();
  vi.restoreAllMocks();
});

describe('WriteConfirmCard', () => {
  test('direct cancellation deletes the nonce without invoking the model', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'cancelled', writeNonce: 'nonce-1' }),
        { status: 200 },
      ),
    );
    const onSettled = vi.fn();
    const { container, cleanup } = renderCard(
      undefined,
      onSettled,
      true,
    );

    await act(async () => {
      button(container, 'Cancel').click();
      await Promise.resolve();
    });

    expect(addMessage).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith('cancelled');
    cleanup();
  });

  test('direct confirmation returns the final write result without invoking the model', async () => {
    const finalResult = {
      status: 'ok',
      tool: 'select_team',
      summary: 'Active team switched.',
      uiLang: 'en',
    };
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(finalResult), { status: 200 }),
    );
    const onSettled = vi.fn();
    const { container, cleanup } = renderCard(
      undefined,
      onSettled,
      true,
    );

    await act(async () => {
      button(container, 'Yes, do it').click();
      await Promise.resolve();
    });

    expect(window.fetch).toHaveBeenCalledWith(
      'https://agent.example.com/api/agent/write-decision',
      expect.objectContaining({
        body: JSON.stringify({
          writeNonce: 'nonce-1',
          decision: 'approve_and_confirm',
        }),
      }),
    );
    expect(addMessage).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith(
      'confirmed',
      undefined,
      finalResult,
    );
    cleanup();
  });

  test('keeps direct confirmation blocked when final status is uncertain', async () => {
    vi.spyOn(window, 'fetch').mockRejectedValue(new Error('network lost'));
    const onSettled = vi.fn();
    const { container, cleanup } = renderCard(
      undefined,
      onSettled,
      true,
    );

    await act(async () => {
      button(container, 'Yes, do it').click();
      await Promise.resolve();
    });

    expect(onSettled).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'final status could not be verified',
    );
    expect(button(container, 'Yes, do it').disabled).toBe(true);
    cleanup();
  });

  test('supports action-specific direct confirmation recovery guidance', async () => {
    vi.spyOn(window, 'fetch').mockRejectedValue(new Error('network lost'));
    const { container, cleanup } = renderCard(
      undefined,
      vi.fn(),
      true,
      'Check the admin channels before trying again.',
    );

    await act(async () => {
      button(container, 'Yes, do it').click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Check the admin channels before trying again.',
    );
    expect(button(container, 'Yes, do it').disabled).toBe(true);
    cleanup();
  });

  test('revokes an approved nonce before reporting a failed confirmation run', async () => {
    vi.spyOn(window, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'approved', writeNonce: 'nonce-1' }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'cancelled', writeNonce: 'nonce-1' }),
          { status: 200 },
        ),
      );
    runAgent.mockRejectedValue(new Error('agent unavailable'));
    const onSettled = vi.fn();
    const { container, cleanup } = renderCard(undefined, onSettled);

    await act(async () => {
      button(container, 'Yes, do it').click();
      await Promise.resolve();
    });

    expect(window.fetch).toHaveBeenCalledTimes(2);
    expect(window.fetch).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/api/agent/write-decision',
      expect.objectContaining({
        body: JSON.stringify({
          writeNonce: 'nonce-1',
          decision: 'revoke',
        }),
      }),
    );
    expect(onSettled).toHaveBeenCalledWith('error', 'agent unavailable');
    expect(button(container, 'Yes, do it').disabled).toBe(true);
    cleanup();
  });

  test('keeps the flow blocked when an approved nonce cannot be revoked', async () => {
    vi.spyOn(window, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'approved', writeNonce: 'nonce-1' }),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error('cancel unavailable'));
    runAgent.mockRejectedValue(new Error('agent unavailable'));
    const onSettled = vi.fn();
    const { container, cleanup } = renderCard(undefined, onSettled);

    await act(async () => {
      button(container, 'Yes, do it').click();
      await Promise.resolve();
    });

    expect(onSettled).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'could not be completed or revoked',
    );
    expect(button(container, 'Yes, do it').disabled).toBe(true);
    expect(button(container, 'Cancel').disabled).toBe(true);
    cleanup();
  });

  test('notifies an interactive parent after cancellation', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'cancelled', writeNonce: 'nonce-1' }),
        { status: 200 },
      ),
    );
    runAgent.mockResolvedValue({ newMessages: [] });
    const onSettled = vi.fn();
    const { container, cleanup } = renderCard(undefined, onSettled);

    await act(async () => {
      button(container, 'Cancel').click();
      await Promise.resolve();
    });

    expect(onSettled).toHaveBeenCalledWith('cancelled');
    cleanup();
  });

  test('renders the full confirmation shell in Hebrew when uiLang is he', () => {
    const { container, cleanup } = renderCard('he');

    expect(container.querySelector('[role="dialog"]')?.getAttribute('dir')).toBe(
      'rtl',
    );
    expect(container.textContent).toContain('אישור שינוי');
    expect(container.textContent).toContain('כן, בצע');
    expect(container.textContent).toContain('ביטול');
    expect(container.textContent).toContain('מה יקרה');

    cleanup();
  });

  test('does not expose the nonce to the LLM until authenticated approval succeeds', async () => {
    let resolveFetch:
      | ((response: Response) => void)
      | undefined;
    vi.spyOn(window, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    runAgent.mockResolvedValue({ newMessages: [] });
    const { container, cleanup } = renderCard();

    act(() => {
      button(container, 'Yes, do it').click();
    });
    expect(addMessage).not.toHaveBeenCalled();

    await act(async () => {
      resolveFetch?.(
        new Response(
          JSON.stringify({ status: 'approved', writeNonce: 'nonce-1' }),
          { status: 200 },
        ),
      );
      await Promise.resolve();
    });

    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledWith({ agent });
    expect(
      addMessage.mock.invocationCallOrder[0],
    ).toBeLessThan(runAgent.mock.invocationCallOrder[0]);
    expect(
      String(addMessage.mock.calls[0][0].content),
    ).toContain('nonce-1');
    expect(addMessage.mock.calls[0][0].role).toBe('developer');
    cleanup();
  });

  test('cancel deletes the server intent and does not send the nonce to the LLM', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'cancelled', writeNonce: 'nonce-1' }),
        { status: 200 },
      ),
    );
    runAgent.mockResolvedValue({ newMessages: [] });
    const { container, cleanup } = renderCard();

    await act(async () => {
      button(container, 'Cancel').click();
      await Promise.resolve();
    });

    expect(window.fetch).toHaveBeenCalledWith(
      'https://agent.example.com/api/agent/write-decision',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          writeNonce: 'nonce-1',
          decision: 'cancel',
        }),
      }),
    );
    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledWith({ agent });
    expect(String(addMessage.mock.calls[0][0].content)).not.toContain(
      'nonce-1',
    );
    expect(addMessage.mock.calls[0][0].role).toBe('user');
    cleanup();
  });

  test('approval failure leaves the buttons retryable and does not message the LLM', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'not_found',
          message: 'The pending change was not found or has expired.',
        }),
        { status: 404 },
      ),
    );
    const { container, cleanup } = renderCard();

    await act(async () => {
      button(container, 'Yes, do it').click();
      await Promise.resolve();
    });

    expect(addMessage).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      'The pending change was not found or has expired.',
    );
    expect(button(container, 'Yes, do it').disabled).toBe(false);
    cleanup();
  });

  test('renders localized Hebrew errors instead of English transport messages', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'not_found',
          message: 'The pending change was not found or has expired.',
        }),
        { status: 404 },
      ),
    );
    const { container, cleanup } = renderCard('he');

    await act(async () => {
      button(container, 'כן, בצע').click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('לא ניתן לאשר את השינוי. נסה שוב.');
    expect(container.textContent).not.toContain(
      'The pending change was not found or has expired.',
    );
    expect(addMessage).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();

    cleanup();
  });
});
