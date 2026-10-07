const { testAgent } = vi.hoisted(() => ({ testAgent: { isRunning: false, messages: [] as Message[], setMessages: vi.fn(), abortRun: vi.fn() } }));
vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({ agent: testAgent }),
}));
vi.mock('@copilotkit/react-core', () => ({ useCopilotAction: vi.fn() }));
vi.mock('@copilotkit/react-ui', () => ({
  UserMessage: ({ message }: { message: { id: string; content: string } }) => <div data-prompt-id={message.id}>{message.content}</div>,
  AssistantMessage: ({ message, subComponent }: { message: { content: string }; subComponent?: React.ReactNode }) => <div>{message.content}{subComponent}</div>,
}));
vi.mock('./ActionChoicesCard', () => ({
  ActionChoicesCard: () => null,
  isActionChoices: () => false,
  writeActionChoices: () => null,
}));
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { useCopilotAction } from '@copilotkit/react-core';
import type { Message } from '@ag-ui/core';
import {
  WorkflowArrival,
  WorkflowCard,
  WorkflowAssistantMessage,
  WorkflowUserMessage,
  WorkflowWorkspace,
  type Workflow,
} from './WorkflowCard';
import { ClearHistoryButton } from './ClearHistoryButton';
import { UiLanguageProvider } from './uiLanguage';
vi.mock('./workflowRenderers', () => ({
  WorkflowResult: ({ result }: { result: { summary?: string } }) => (
    <div>{result.summary}</div>
  ),
}));
const flow: Workflow = {
  id: 'id',
  revision: 1,
  request: 'Select Extra DRS and show best teams',
  state: 'awaiting_approval',
  steps: [
    {
      id: 'chip',
      tool: 'activate_chip',
      summary: 'Set Extra DRS for Team X',
      state: 'waiting',
      write: true,
    },
    {
      id: 'teams',
      tool: 'get_best_teams',
      summary: 'Calculate best teams for Team X',
      state: 'waiting',
      write: false,
    },
  ],
};
const roots: ReturnType<typeof createRoot>[] = [];
function Conversation({ children }: { children?: React.ReactNode }) {
  return (
    <div className="chat-wrapper">
      <div className="copilotKitMessages">
        <div className="copilotKitMessagesContainer">
          <WorkflowAssistantMessage
            message={{ id: 'greeting', role: 'assistant', content: 'Chat' }}
            messages={[{ id: 'greeting', role: 'assistant', content: 'Chat' }]}
            rawData={{}} isLoading={false} isGenerating={false}
          />
          {testAgent.messages.filter((message) => message.role === 'user').map((message) => (
            <WorkflowUserMessage key={message.id} message={message as { id: string; role: 'user'; content: string }} rawData={message} ImageRenderer={() => null} />
          ))}
          {children}
        </div>
      </div>
      <textarea aria-label="Message" />
    </div>
  );
}
function render(workflow = flow, lang: 'en' | 'he' = 'en') {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onDecision = vi.fn();
  act(() =>
    root.render(
      <UiLanguageProvider initialLanguage={lang}>
        <WorkflowCard workflow={workflow} onDecision={onDecision} />
      </UiLanguageProvider>,
    ),
  );
  return { container, onDecision };
}
afterEach(() => {
  roots.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
  testAgent.messages = [];
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
test('one combined approval and exact ordered steps', () => {
  const { container, onDecision } = render();
  expect(container.querySelectorAll('li')).toHaveLength(2);
  const approve = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Approve and run',
  )!;
  act(() => approve.click());
  expect(onDecision).toHaveBeenCalledWith('approve');
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Review the actions',
  );
});
test('Hebrew direction, labels, approval and cancellation remain available', () => {
  const { container, onDecision } = render(flow, 'he');
  expect(container.querySelector('section')?.dir).toBe('rtl');
  const buttons = [...container.querySelectorAll('button')];
  expect(buttons[0].disabled).toBe(false);
  act(() => buttons.find((b) => b.textContent === 'ביטול')!.click());
  expect(onDecision).toHaveBeenCalledWith('cancel');
});
test('partial failure retains both visible outcomes and offers resume', () => {
  const { container } = render({
    ...flow,
    state: 'failed',
    steps: [
      {
        ...flow.steps[0],
        state: 'completed',
        result: { summary: 'Chip saved' },
      },
      {
        ...flow.steps[1],
        state: 'failed',
        result: { summary: 'Calculation failed' },
      },
    ],
  });
  expect(container.textContent).toContain('Chip saved');
  expect(container.textContent).toContain('Calculation failed');
  expect(container.textContent).toContain('Resume');
});

test('workspace uses one approval and advances with status reads without model turns', async () => {
  const approved = { ...flow, state: 'ready' };
  const afterWrite = {
    ...approved,
    steps: [
      {
        ...flow.steps[0],
        state: 'completed',
        result: { summary: 'Chip saved' },
      },
      flow.steps[1],
    ],
  };
  const completed = {
    ...afterWrite,
    state: 'completed',
    steps: [
      afterWrite.steps[0],
      {
        ...flow.steps[1],
        state: 'completed',
        result: { summary: 'Calculated' },
      },
    ],
  };
  let current = flow;
  const decisions: string[] = [];
  const fetchMock = vi.fn(async (_url: unknown, options?: RequestInit) => {
    if (!options?.body)
      return { ok: true, json: async () => ({ workflows: [current] }) };
    const input = JSON.parse(String(options.body));
    decisions.push(input.decision);
    if (input.decision === 'approve') current = approved;
    if (input.decision === 'advance')
      current = input.stepId === 'chip' ? afterWrite : completed;
    return { ok: true, json: async () => current };
  });
  vi.stubGlobal('fetch', fetchMock);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <WorkflowWorkspace runtimeUrl="http://localhost/api/agent/copilotkit">
        <Conversation />
      </WorkflowWorkspace>,
    ),
  );
  const card = container.querySelector('section')!;
  expect(card.closest('.copilotKitMessagesContainer')).not.toBeNull();
  expect(container.querySelectorAll('section')).toHaveLength(1);
  await act(async () =>
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Approve and run')!
      .click(),
  );
  expect(decisions).toEqual([
    'approve',
    'advance',
    'status',
    'advance',
    'status',
  ]);
  expect(container.textContent).toContain('Chip saved');
  expect(container.textContent).toContain('Calculated');
  vi.unstubAllGlobals();
});

test('approval shows the complete message and exact broadcast recipients', () => {
  const message = 'Exact approved text '.repeat(80);
  const { container } = render({
    ...flow,
    steps: [
      {
        ...flow.steps[0],
        tool: 'broadcast_message',
        summary: 'Broadcast:\n\n' + message,
        preview: {
          audience: [
            { chatId: '17', name: 'Recipient A' },
            { chatId: '18', name: 'Recipient B' },
          ],
        },
      },
    ],
  });
  expect(container.textContent).toContain(message);
  expect(container.textContent).toContain('Recipient A (17)');
  expect(container.textContent).toContain('Recipient B (18)');
});

test('clear history hides previous workflows immediately and after remount while showing new workflows', async () => {
  const { clearWorkflowHistory, setHistoryScope } = await import('../lib/chatHistoryStore');
  setHistoryScope('workflow-clear-test');
  const old = { ...flow, createdAt: Date.now() - 10000 };
  let records = [old];
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ workflows: records }) })));
  const container = document.createElement('div');
  document.body.append(container);
  let root = createRoot(container);
  const mount = async () => {
    await act(async () => root.render(<WorkflowWorkspace runtimeUrl="http://localhost/api/agent/copilotkit"><Conversation /></WorkflowWorkspace>));
  };
  await mount();
  expect(container.textContent).toContain(old.request);
  act(() => clearWorkflowHistory());
  expect(container.textContent).not.toContain(old.request);
  act(() => root.unmount());
  records = [old, { ...old, id: 'new', request: 'New request', createdAt: Date.now() + 1000 }];
  root = createRoot(container);
  await mount();
  expect(container.textContent).not.toContain(old.request);
  expect(container.textContent).toContain('New request');
  act(() => root.unmount());
  container.remove();
  setHistoryScope(null);
});


test('workflow arrival renders the live workflow inline and tracks its visibility', async () => {
  const inline = {
    ...flow,
    state: 'completed',
    steps: [
      {
        ...flow.steps[0],
        state: 'completed',
        result: { summary: 'Chip saved inline' },
      },
      {
        ...flow.steps[1],
        state: 'completed',
        result: { summary: 'Calculated inline' },
      },
    ],
  };
  const markInline = vi.fn();
  const refresh = vi.fn();
  const onDecision = vi.fn();
  const autoRun = vi.fn(() => true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(
      <UiLanguageProvider initialLanguage="en">
        <WorkflowArrival
          result={flow}
          workflow={inline}
          refresh={refresh}
          autoRun={autoRun}
          onDecision={onDecision}
          onInlineWorkflow={markInline}
        />
      </UiLanguageProvider>,
    );
  });

  expect(container.textContent).toContain(flow.request);
  expect(container.textContent).toContain('Chip saved inline');
  expect(container.textContent).toContain('Calculated inline');
  expect(markInline).toHaveBeenCalledWith(flow.id, true);
  expect(refresh).toHaveBeenCalled();

  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  container.remove();
  expect(markInline).toHaveBeenCalledWith(flow.id, false);
});

test('polled workflows do not duplicate inline cards and return inside chat after inline unmount', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ workflows: [flow] }) })));
  function Proposal() {
    const calls = vi.mocked(useCopilotAction).mock.calls;
    const registration = calls[calls.length - 1][0];
    const renderProposal = registration.render as (props: { result: Workflow }) => React.ReactNode;
    return renderProposal({ result: flow });
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const mount = async (inline: boolean) => act(async () => root.render(
    <WorkflowWorkspace runtimeUrl="http://localhost/api/agent/copilotkit">
      <Conversation>{inline && <Proposal />}</Conversation>
    </WorkflowWorkspace>,
  ));
  await mount(true);
  expect(container.querySelectorAll('section')).toHaveLength(1);
  expect(container.querySelector('section')?.closest('.copilotKitMessagesContainer')).not.toBeNull();
  await mount(false);
  expect(container.querySelectorAll('section')).toHaveLength(1);
  expect(container.querySelector('section')?.closest('.copilotKitMessagesContainer')).not.toBeNull();
  vi.unstubAllGlobals();
});

test('successive identical prompts keep each recovered workflow below its own prompt through polling and reload', async () => {
  vi.useFakeTimers();
  const first = { ...flow, id: 'first', createdAt: 1 };
  const second = { ...flow, id: 'second', createdAt: 2 };
  let records = [first];
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ workflows: records }) })));
  testAgent.messages = [{ id: 'prompt-1', role: 'user', content: flow.request }];
  const container = document.createElement('div');
  document.body.append(container);
  let root = createRoot(container);
  const mount = async () => act(async () => root.render(
    <WorkflowWorkspace runtimeUrl="http://localhost/api/agent/copilotkit"><Conversation /></WorkflowWorkspace>,
  ));
  const order = () => [...container.querySelectorAll('[data-prompt-id], section')].map((node) => node.getAttribute('data-prompt-id') || 'workflow');
  await mount();
  expect(order()).toEqual(['prompt-1', 'workflow']);
  testAgent.messages = [...testAgent.messages, { id: 'prompt-2', role: 'user', content: flow.request }];
  await mount();
  expect(order()).toEqual(['prompt-1', 'workflow', 'prompt-2']);
  records = [second, first]; // Durable listing order must not reorder the conversation.
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(order()).toEqual(['prompt-1', 'workflow', 'prompt-2', 'workflow']);
  act(() => root.unmount());
  root = createRoot(container);
  await mount();
  expect(order()).toEqual(['prompt-1', 'workflow', 'prompt-2', 'workflow']);
  act(() => root.unmount());
});

test('tool results anchor workflows to the correct earlier turn when a newer prompt already exists', async () => {
  testAgent.messages = [
    { id: 'original', role: 'user', content: 'Original request' },
    { id: 'result', role: 'tool', toolCallId: 'call', content: JSON.stringify(flow) },
    { id: 'latest', role: 'user', content: 'A different question' },
  ];
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ workflows: [flow] }) })));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<WorkflowWorkspace runtimeUrl="http://localhost/api/agent/copilotkit"><Conversation /></WorkflowWorkspace>));
  const order = [...container.querySelectorAll('[data-prompt-id], section')].map((node) => node.getAttribute('data-prompt-id') || 'workflow');
  expect(order).toEqual(['original', 'workflow', 'latest']);
});

test('a hidden blocking workflow can be cancelled without a generic verification error', async () => {
  const { clearWorkflowHistory, setHistoryScope } =
    await import('../lib/chatHistoryStore');
  setHistoryScope('blocked-workflow-test');
  clearWorkflowHistory();
  const older = {
    ...flow,
    id: 'older',
    request: 'Earlier calculation',
    createdAt: Date.now() - 10000,
    state: 'ready',
    steps: [{ ...flow.steps[1], id: 'pending' }],
  };
  const newer = {
    ...older,
    id: 'newer',
    request: 'New calculation',
    createdAt: Date.now() + 1000,
  };
  let cancelled = false;
  let currentNewer = newer;
  const fetchMock = vi.fn(async (_url: unknown, options?: RequestInit) => {
    if (!options?.body)
      return { ok: true, json: async () => ({ workflows: [older, newer] }) };
    const input = JSON.parse(String(options.body));
    if (input.id === older.id && input.decision === 'cancel') {
      cancelled = true;
      return { ok: true, json: async () => ({ ...older, state: 'cancelled' }) };
    }
    if (input.decision === 'advance' && !cancelled)
      return {
        ok: true,
        json: async () => ({
          status: 'busy',
          workflow: newer,
          blockingWorkflow: older,
        }),
      };
    if (input.decision === 'advance')
      currentNewer = { ...newer, state: 'completed' };
    return { ok: true, json: async () => currentNewer };
  });
  vi.stubGlobal('fetch', fetchMock);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <WorkflowWorkspace runtimeUrl="http://localhost/api/agent/copilotkit">
        <Conversation />
      </WorkflowWorkspace>,
    ),
  );
  expect(container.textContent).not.toContain('Earlier calculation');
  await act(async () =>
    [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Resume')!
      .click(),
  );
  expect(container.textContent).toContain(
    'An earlier workflow is still active',
  );
  expect(container.textContent).toContain('Earlier calculation');
  expect(container.textContent).not.toContain('Progress could not be verified');
  const oldCard = [...container.querySelectorAll('section')].find(
    (s) => s.querySelector('h3')?.textContent === 'Earlier calculation',
  )!;
  await act(async () =>
    [...oldCard.querySelectorAll('button')]
      .find((b) => b.textContent === 'Cancel')!
      .click(),
  );
  expect(cancelled).toBe(true);
  expect(container.textContent).not.toContain(
    'An earlier workflow is still active',
  );
  await act(async () =>
    [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Resume')!
      .click(),
  );
  expect(container.textContent).toContain('Completed');
  setHistoryScope(null);
});

test('clear history calls server cancellation before clearing chat and keeps the button text', async () => {
  let complete!: () => void;
  const fetchMock = vi.fn(async (_url: unknown, options?: RequestInit) => {
    if (!options?.body)
      return { ok: true, json: async () => ({ workflows: [flow] }) };
    await new Promise<void>((resolve) => {
      complete = resolve;
    });
    return { ok: true, json: async () => ({ status: 'ok', workflows: [] }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  testAgent.setMessages.mockClear();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <WorkflowWorkspace
        runtimeUrl="http://localhost/api/agent/copilotkit"
        idToken="test-token"
      >
        <ClearHistoryButton /><Conversation />
      </WorkflowWorkspace>,
    ),
  );
  const button = container.querySelector('button')!;
  await act(async () => button.click());
  expect(button.textContent).toBe('Clear chat history');
  expect(button.disabled).toBe(true);
  expect(testAgent.setMessages).not.toHaveBeenCalled();
  const request = fetchMock.mock.calls.find(
    ([, options]) => options?.body,
  )![1]!;
  expect(JSON.parse(String(request.body))).toEqual({ decision: 'cancel_all' });
  expect(request.headers).toMatchObject({ Authorization: 'Bearer test-token' });
  await act(async () => complete());
  expect(testAgent.setMessages).toHaveBeenCalledWith([]);
  expect(button.disabled).toBe(false);
});

test('clear failure preserves chat and offers retry', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) =>
      options?.body
        ? { ok: false }
        : { ok: true, json: async () => ({ workflows: [] }) },
    ),
  );
  testAgent.setMessages.mockClear();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <WorkflowWorkspace runtimeUrl="http://localhost/api/agent/copilotkit">
        <ClearHistoryButton /><Conversation />
      </WorkflowWorkspace>,
    ),
  );
  await act(async () => container.querySelector('button')!.click());
  expect(testAgent.setMessages).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'History was kept',
  );
  expect(container.querySelector('button')!.disabled).toBe(false);
});

test('clear stops automatic advancement after the current request returns', async () => {
  const {setHistoryScope}=await import('../lib/chatHistoryStore');
  setHistoryScope('clear-in-flight');
  let finish!: () => void;
  let advanceCount = 0;
  const reading = {...flow,state:'ready',steps:flow.steps.map(step=>({...step,write:false}))};
  const fetchMock = vi.fn(async (_url:unknown,options?:RequestInit) => {
    if (!options?.body) return {ok:true,json:async()=>({workflows:[reading]})};
    const input = JSON.parse(String(options.body));
    if (input.decision === 'cancel_all') return {ok:true,json:async()=>({status:'ok',workflows:[]})};
    if (input.decision === 'advance') {
      advanceCount++;
      await new Promise<void>(resolve=>{finish=resolve;});
    }
    return {ok:true,json:async()=>reading};
  });
  vi.stubGlobal('fetch',fetchMock);
  const container=document.createElement('div'); document.body.append(container);
  const root=createRoot(container); roots.push(root);
  await act(async()=>root.render(<WorkflowWorkspace runtimeUrl="http://localhost/api/agent/copilotkit"><ClearHistoryButton /><Conversation /></WorkflowWorkspace>));
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Resume')!.click());
  expect(advanceCount).toBe(1);
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Clear chat history')!.click());
  await act(async()=>finish());
  expect(advanceCount).toBe(1);
  expect(container.textContent).not.toContain('Progress could not be verified');
  setHistoryScope(null);
});

test('a late clear response after account change does not erase the new account history', async () => {
  const {setHistoryScope,save,load}=await import('../lib/chatHistoryStore');
  setHistoryScope('old-account'); let finish!: () => void;
  vi.stubGlobal('fetch',vi.fn(async (_url,options)=> {
    if (!options?.body) return {ok:true,json:async()=>({workflows:[]})};
    await new Promise<void>(resolve=>{finish=resolve;});
    return {ok:true,json:async()=>({status:'ok',workflows:[]})};
  }));
  testAgent.setMessages.mockClear();
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  await act(async()=>root.render(<WorkflowWorkspace runtimeUrl="http://localhost/api/agent/copilotkit"><ClearHistoryButton /><Conversation /></WorkflowWorkspace>));
  await act(async()=>container.querySelector('button')!.click());
  act(()=>root.unmount());
  setHistoryScope('new-account');
  save([{id:'new-message',role:'user',content:'Keep this message'}]);
  await act(async()=>finish());
  expect(load()).toHaveLength(1);
  expect(testAgent.setMessages).not.toHaveBeenCalled();
  setHistoryScope(null);
});

test('clear succeeds without chat messages or workflow cards', async () => {
  testAgent.messages = [];
  testAgent.setMessages.mockClear();
  vi.stubGlobal('fetch',vi.fn(async (_url,options) => ({ok:true,json:async()=>options?.body
    ? {status:'ok',workflows:[]} : {workflows:[]}})));
  const container=document.createElement('div'); document.body.append(container);
  const root=createRoot(container); roots.push(root);
  await act(async()=>root.render(<WorkflowWorkspace runtimeUrl="http://localhost/api/agent/copilotkit"><ClearHistoryButton /><Conversation /></WorkflowWorkspace>));
  await act(async()=>container.querySelector('button')!.click());
  expect(testAgent.setMessages).toHaveBeenCalledWith([]);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
