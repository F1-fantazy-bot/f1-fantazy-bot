const { testAgent } = vi.hoisted(() => ({ testAgent: { isRunning: false } }));
vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({ agent: testAgent }),
}));
vi.mock('@copilotkit/react-core', () => ({ useCopilotAction: vi.fn() }));
vi.mock('./ActionChoicesCard', () => ({
  ActionChoicesCard: () => null,
  isActionChoices: () => false,
  writeActionChoices: () => null,
}));
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { WorkflowCard, WorkflowWorkspace, type Workflow } from './WorkflowCard';
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
        <span>Chat</span>
      </WorkflowWorkspace>,
    ),
  );
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
    await act(async () => root.render(<WorkflowWorkspace runtimeUrl="http://localhost/api/agent/copilotkit"><span>Chat</span></WorkflowWorkspace>));
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
