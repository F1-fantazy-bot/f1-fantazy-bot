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

const appendMessage = vi.fn();

vi.mock('@copilotkit/react-core', () => ({
  useCopilotChat: () => ({ appendMessage }),
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

function renderCard() {
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

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent === label,
  );
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}

afterEach(() => {
  appendMessage.mockReset();
  vi.restoreAllMocks();
});

describe('WriteConfirmCard', () => {
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
    appendMessage.mockResolvedValue(undefined);
    const { container, cleanup } = renderCard();

    act(() => {
      button(container, 'Yes, do it').click();
    });
    expect(appendMessage).not.toHaveBeenCalled();

    await act(async () => {
      resolveFetch?.(
        new Response(
          JSON.stringify({ status: 'approved', writeNonce: 'nonce-1' }),
          { status: 200 },
        ),
      );
      await Promise.resolve();
    });

    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(
      String(appendMessage.mock.calls[0][0].content),
    ).toContain('nonce-1');
    cleanup();
  });

  test('cancel deletes the server intent and does not send the nonce to the LLM', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'cancelled', writeNonce: 'nonce-1' }),
        { status: 200 },
      ),
    );
    appendMessage.mockResolvedValue(undefined);
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
    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(String(appendMessage.mock.calls[0][0].content)).not.toContain(
      'nonce-1',
    );
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

    expect(appendMessage).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      'The pending change was not found or has expired.',
    );
    expect(button(container, 'Yes, do it').disabled).toBe(false);
    cleanup();
  });
});
