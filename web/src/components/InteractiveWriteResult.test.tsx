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
import { InteractiveWriteResult } from './InteractiveWriteResult';
import { WriteDecisionProvider } from './WriteDecisionContext';

const agent = { addMessage: vi.fn() };

vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({ agent }),
  useCopilotKit: () => ({ copilotkit: { runAgent: vi.fn() } }),
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
  vi.restoreAllMocks();
});

function renderResult(uiLang = 'en') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <WriteDecisionProvider
        runtimeUrl="https://agent.example.com/api/agent/copilotkit"
        idToken="google-token"
      >
        <InteractiveWriteResult
          result={{
            status: 'not_found',
            tool: 'follow_league',
            summary: 'League was not found.',
            leagueCode: 'ABC123',
            uiLang,
            reportAction: {
              type: 'report_missing_league',
              leagueCode: 'ABC123',
              message: 'Missing league code: ABC123',
            },
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

describe('InteractiveWriteResult', () => {
  test('stages a prefilled report and renders its confirmation card', async () => {
    const fetchSpy = vi
      .spyOn(window, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'confirmation_required',
            tool: 'report_bug',
            writeNonce: 'nonce-report',
            summary: 'Send missing league report.',
            args: { message: 'Missing league code: ABC123' },
            uiLang: 'en',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            tool: 'report_bug',
            summary: 'Your message has been sent to the admins. Thank you!',
            uiLang: 'en',
          }),
          { status: 200 },
        ),
      );
    const rendered = renderResult();
    const reportButton = Array.from(
      rendered.container.querySelectorAll('button'),
    ).find((button) => button.textContent === 'Report missing league');

    expect(reportButton).toBeDefined();
    await act(async () => {
      reportButton?.click();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://agent.example.com/api/agent/write-proposal',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          tool: 'report_bug',
          args: { message: 'Missing league code: ABC123' },
        }),
      }),
    );
    expect(
      rendered.container.querySelector(
        '[role="dialog"][aria-label="Confirm change: report_bug"]',
      ),
    ).not.toBeNull();

    const confirmButton = Array.from(
      rendered.container.querySelectorAll('button'),
    ).find((button) => button.textContent === 'Yes, do it');
    await act(async () => {
      confirmButton?.click();
    });

    expect(fetchSpy).toHaveBeenLastCalledWith(
      'https://agent.example.com/api/agent/write-decision',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          writeNonce: 'nonce-report',
          decision: 'approve_and_confirm',
        }),
      }),
    );
    expect(rendered.container.textContent).toContain(
      'Your message has been sent to the admins. Thank you!',
    );

    rendered.cleanup();
  });

  test('localizes the report action for Hebrew', () => {
    const rendered = renderResult('he');

    expect(rendered.container.textContent).toContain('דווח על ליגה חסרה');
    expect(
      rendered.container.querySelector('button')?.getAttribute('aria-label'),
    ).toBe('דווח על ליגה חסרה: ABC123');

    rendered.cleanup();
  });

  test('stages a new proposal when direct delivery fails', async () => {
    const proposal = () =>
      new Response(
        JSON.stringify({
          status: 'confirmation_required',
          tool: 'report_bug',
          writeNonce: 'nonce-report',
          summary: 'Send missing league report.',
          uiLang: 'en',
        }),
        { status: 200 },
      );
    const fetchSpy = vi
      .spyOn(window, 'fetch')
      .mockResolvedValueOnce(proposal())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'failed',
            tool: 'report_bug',
            summary: 'Unable to send your report right now. Please try again.',
            uiLang: 'en',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(proposal());
    const rendered = renderResult();

    await act(async () => {
      Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Report missing league')
        ?.click();
    });
    await act(async () => {
      Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Yes, do it')
        ?.click();
    });
    expect(rendered.container.textContent).toContain('Action failed');

    await act(async () => {
      Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Report missing league')
        ?.click();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[2][0]).toBe(
      'https://agent.example.com/api/agent/write-proposal',
    );
    expect(
      rendered.container.querySelector(
        '[role="dialog"][aria-label="Confirm change: report_bug"]',
      ),
    ).not.toBeNull();

    rendered.cleanup();
  });
});
