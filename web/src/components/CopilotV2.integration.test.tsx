import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import {
  CopilotKitProvider,
  CopilotChat,
  useAgent,
  useCopilotKit,
} from '@copilotkit/react-core/v2';
import { useNextRacesAction } from './NextRacesTable';
import { useDeadlineCountdownAction } from './DeadlineCountdown';
import { UiLanguageProvider } from './uiLanguage';

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function Probe() {
  const { agent } = useAgent({ agentId: 'default' });
  const { copilotkit } = useCopilotKit();
  useNextRacesAction();
  useDeadlineCountdownAction();
  return (
    <button
      onClick={async () => {
        agent.addMessage({
          id: crypto.randomUUID(),
          role: 'user',
          content: 'Independent reads',
        });
        await copilotkit.runAgent({ agent });
      }}
    >
      Run reads
    </button>
  );
}

// Keep the provider, chat, AG-UI parser, and registered rich renderers real.
// The fetch boundary is a controlled synthetic runtime, just as in Playwright.
test('the mounted v2 provider uses refreshed authorization headers and retains every call-ID result', async () => {
  const requests: Array<{ body: Record<string, any>; authorization?: string }> =
    [];
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const envelope = JSON.parse(String(init?.body));
    requests.push({
      body: envelope,
      authorization:
        new Headers(init?.headers).get('Authorization') || undefined,
    });
    if (envelope.method === 'info')
      return new Response(
        JSON.stringify({
          version: '1.85.0',
          agents: { default: { name: 'default' } },
          mode: 'sse',
          threadEndpoints: { list: false, inspect: false, mutations: false },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    if (envelope.method === 'agent/connect')
      return new Response(
        'data: {"type":"MESSAGES_SNAPSHOT","messages":[]}\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    expect(envelope.method).toBe('agent/run');
    expect(envelope.body.tools).toEqual([]);
    const { runId, threadId } = envelope.body;
    const events: Record<string, unknown>[] = [
      { type: 'RUN_STARTED', runId, threadId },
    ];
    for (const [suffix, name] of [
      ['first', 'get_next_races'],
      ['deadline', 'get_deadline'],
      ['second', 'get_next_races'],
    ]) {
      events.push(
        {
          type: 'TOOL_CALL_START',
          toolCallId: `${runId}-${suffix}`,
          toolCallName: name,
          parentMessageId: `${runId}-assistant`,
        },
        {
          type: 'TOOL_CALL_ARGS',
          toolCallId: `${runId}-${suffix}`,
          delta: '{}',
        },
        { type: 'TOOL_CALL_END', toolCallId: `${runId}-${suffix}` },
      );
    }
    for (const suffix of ['second', 'deadline', 'first']) {
      const result =
        suffix === 'deadline'
          ? { lang: 'en', status: 'unavailable' }
          : {
              season: suffix,
              lang: 'en',
              races: [
                { round: '1', raceName: `${suffix} race`, date: '2026-11-01' },
              ],
            };
      events.push({
        type: 'TOOL_CALL_RESULT',
        toolCallId: `${runId}-${suffix}`,
        messageId: `${runId}-${suffix}-result`,
        role: 'tool',
        content: JSON.stringify(result),
      });
    }
    events.push(
      {
        type: 'TEXT_MESSAGE_CHUNK',
        messageId: `${runId}-final`,
        role: 'assistant',
        delta: 'All results received.',
      },
      { type: 'RUN_FINISHED', threadId, runId },
    );
    return new Response(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  });
  vi.stubGlobal('fetch', fetch);
  function Harness() {
    const [token, setToken] = useState('initial-token');
    return (
      <UiLanguageProvider initialLanguage="en">
        <CopilotKitProvider
          runtimeUrl="http://synthetic.test/copilotkit"
          agentId="default"
          useSingleEndpoint
          enableInspector={false}
          headers={() => ({ Authorization: `Bearer ${token}` })}
        >
          <Probe />
          <button onClick={() => setToken('refreshed-token')}>
            Refresh token
          </button>
          <CopilotChat welcomeScreen={false} />
        </CopilotKitProvider>
      </UiLanguageProvider>
    );
  }
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Harness />));
  const button = (text: string) =>
    [...container.querySelectorAll('button')].find(
      (node) => node.textContent === text,
    )!;
  await act(async () => button('Run reads').click());
  await vi.waitFor(() => expect(container.textContent).toContain('first race'));
  expect(
    requests.filter((request) => request.body.method === 'agent/run').slice(-1)[0]
      ?.authorization,
  ).toBe('Bearer initial-token');
  await act(async () => button('Refresh token').click());
  await act(async () => button('Run reads').click());
  await vi.waitFor(() =>
    expect(container.querySelectorAll('table')).toHaveLength(4),
  );
  const runs = requests.filter(
    (request) => request.body.method === 'agent/run',
  );
  expect(runs).toHaveLength(2);
  expect(runs[1].authorization).toBe('Bearer refreshed-token');
  expect(container.textContent?.match(/first race/g)).toHaveLength(2);
  expect(container.textContent?.match(/second race/g)).toHaveLength(2);
  expect(container.textContent?.match(/All results received/g)).toHaveLength(2);
});
