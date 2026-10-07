import {
  workflowHistoryCutoff,
  HISTORY_CLEARED_EVENT,
  loadWorkflowPromptIds,
  saveWorkflowPromptIds,
} from '../lib/chatHistoryStore';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useCopilotAction } from '@copilotkit/react-core';
import { useAgent } from '@copilotkit/react-core/v2';
import {
  AssistantMessage,
  UserMessage,
  type AssistantMessageProps,
  type UserMessageProps,
} from '@copilotkit/react-ui';
import type { Message } from '@ag-ui/core';
import {
  isAgentRunActive,
  releaseAgentRun,
  tryAcquireAgentRun,
} from './agentRunLock';
import { useUiLanguage } from './uiLanguage';
import { WorkflowResult } from './workflowRenderers';
import {
  ActionChoicesCard,
  isActionChoices,
  writeActionChoices,
} from './ActionChoicesCard';
import { safeParse } from './safeParse';

type ConversationCard = { id: string; promptId?: string; content: ReactNode };
const WorkflowConversationContext = createContext<ConversationCard[]>([]);

// Use CopilotChat's message slots: React owns the cards' position relative to
// later prompts, while the native components retain text, controls and tool UI.
export function WorkflowUserMessage(props: UserMessageProps) {
  const cards = useContext(WorkflowConversationContext);
  return (
    <>
      <UserMessage {...props} />
      {cards.filter((card) => card.promptId === props.message?.id).map((card) => (
        <div key={card.id}>{card.content}</div>
      ))}
    </>
  );
}

export function WorkflowAssistantMessage(props: AssistantMessageProps) {
  const cards = useContext(WorkflowConversationContext);
  return (
    <>
      <AssistantMessage {...props} />
      {props.messages?.[0]?.id === props.message?.id &&
        cards.filter((card) => !card.promptId).map((card) => (
          <div key={card.id}>{card.content}</div>
        ))}
    </>
  );
}

function workflowPromptId(messages: Message[], flow: Workflow): string | undefined {
  // A tool result identifies its originating turn even when polling returns
  // workflows newest first or the user repeats exactly the same prompt.
  const resultIndex = messages.findIndex((message) => {
    if (message.role !== 'tool') return false;
    const result = safeParse(message.content) as { id?: string } | undefined;
    return result?.id === flow.id;
  });
  const preceding = resultIndex < 0 ? messages : messages.slice(0, resultIndex);
  const users = preceding.filter((message) => message.role === 'user');
  const matching = users.filter((message) => message.content === flow.request);
  return (resultIndex < 0 && matching.length ? matching : users).slice(-1)[0]?.id;
}

export type Workflow = {
  id: string;
  revision: number;
  createdAt?: number;
  state: string;
  request: string;
  steps: Array<{
    id: string;
    tool: string;
    summary: string;
    state: string;
    write: boolean;
    args?: Record<string, unknown>;
    satisfied?: boolean;
    preview?: { audience?: Array<{ chatId: string; name: string }> };
    result?: unknown;
  }>;
};
const states: Record<string, [string, string]> = {
  waiting: ['Waiting', 'ממתין'],
  running: ['Running', 'בביצוע'],
  ready: ['Ready', 'מוכן'],
  awaiting_approval: ['Review the actions', 'בדיקת הפעולות'],
  completed: ['Completed', 'הושלם'],
  already_satisfied: ['Already set', 'כבר מוגדר'],
  failed: ['Failed', 'נכשל'],
  cancelled: ['Cancelled', 'בוטל'],
  cancelling: ['Cancelling future steps', 'ביטול הפעולות הבאות'],
  outcome_unknown: ['Outcome unknown', 'התוצאה אינה ידועה'],
  started: [
    'Started — waiting for verified completion',
    'הופעל — ממתין לאישור סיום',
  ],
};
export function WorkflowCard({
  workflow,
  busy = false,
  onDecision,
}: {
  workflow: Workflow;
  busy?: boolean;
  onDecision: (decision: string) => void;
}) {
  const { lang } = useUiLanguage();
  const he = lang === 'he';
  const label = (value: string) => states[value]?.[he ? 1 : 0] || value;
  const done = ['completed', 'cancelled'].includes(workflow.state);
  return (
    <section
      dir={he ? 'rtl' : 'ltr'}
      aria-label={he ? 'תהליך פעולות' : 'Workflow'}
      style={{
        border: '1px solid var(--app-border)',
        borderRadius: 12,
        padding: 16,
        marginBlock: 12,
        overflowWrap: 'anywhere',
      }}
    >
      <h3>{workflow.request}</h3>
      <p role="status" aria-live="polite">
        {label(workflow.state)}
      </p>
      <ol>
        {workflow.steps.map((step) => (
          <li key={step.id} style={{ marginBlock: 12 }}>
            <p style={{ whiteSpace: 'pre-wrap' }}>
              {step.summary}{' '}
              <strong>
                {' '}
                —{' '}
                {label(
                  step.state === 'waiting' && step.satisfied
                    ? 'already_satisfied'
                    : step.state,
                )}
              </strong>
            </p>
            {step.preview?.audience && (
              <details>
                <summary>
                  {he ? 'נמעני ההודעה' : 'Message recipients'} (
                  {step.preview.audience.length})
                </summary>
                <ul>
                  {step.preview.audience.map((user) => (
                    <li key={user.chatId}>
                      {user.name} ({user.chatId})
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {step.args && (
              <details>
                <summary>{he ? 'פרטי הפעולה' : 'Action details'}</summary>
                <code>{step.tool}</code>
                <pre style={{ whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(step.args).filter(
                        ([key]) => key !== 'message',
                      ),
                    ),
                    null,
                    2,
                  )}
                </pre>
              </details>
            )}
            {step.result != null && (
              <WorkflowResult tool={step.tool} result={step.result} />
            )}
          </li>
        ))}
      </ol>
      {!done && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {workflow.state === 'awaiting_approval' && (
            <button
              disabled={busy}
              onClick={() => onDecision('approve')}
            >
              {he ? 'אישור והפעלה' : 'Approve and run'}
            </button>
          )}
          {['ready', 'failed', 'outcome_unknown'].includes(workflow.state) && (
            <button
              disabled={
                busy ||
                workflow.steps.some((s) => s.write && s.state === 'failed')
              }
              onClick={() => onDecision('resume')}
            >
              {he ? 'המשך' : 'Resume'}
            </button>
          )}
          <button onClick={() => onDecision('cancel')}>
            {he ? 'ביטול' : 'Cancel'}
          </button>
        </div>
      )}
      <p>
        {he
          ? 'פעולות שהושלמו נשארות בתוקף גם אם פעולה מאוחרת נכשלת או מבוטלת.'
          : 'Completed changes remain saved if a later step fails or is cancelled.'}
      </p>
    </section>
  );
}
export function WorkflowArrival({
  result,
  workflow,
  busy = false,
  refresh,
  autoRun,
  onDecision,
  onInlineWorkflow,
}: {
  result: unknown;
  workflow?: Workflow;
  busy?: boolean;
  refresh: () => void;
  autoRun: (flow: Workflow) => boolean;
  onDecision: (flow: Workflow, decision: string) => void;
  onInlineWorkflow: (id: string, visible: boolean) => void;
}) {
  const initialFlow = result as Workflow | undefined;
  const flow =
    workflow?.id && workflow.id === initialFlow?.id ? workflow : initialFlow;
  useEffect(() => {
    if (!flow?.id || flow.state !== 'ready') return;
    const timer = window.setInterval(() => {
      if (autoRun(flow)) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [flow, autoRun]);
  useEffect(() => {
    refresh();
  }, [result, refresh]);
  useEffect(() => {
    if (!flow?.id) return;
    onInlineWorkflow(flow.id, true);
    return () => onInlineWorkflow(flow.id, false);
  }, [flow?.id, onInlineWorkflow]);
  if (isToolErrorResult(result)) return <ToolErrorFallback result={result} />;
  if (isActionChoices(result)) {
    const pending = result as typeof result & {
      pendingWorkflow?: {
        steps: Array<{ id: string; args: Record<string, unknown> }>;
      };
      pendingStepId?: string;
    };
    if (!pending.pendingWorkflow) return <ActionChoicesCard result={result} />;
    const choices = {
      ...result,
      options: result.options.map((option) => ({
        ...option,
        action: 'propose_workflow',
        args: {
          ...pending.pendingWorkflow,
          steps: pending.pendingWorkflow!.steps.map((s) =>
            s.id === pending.pendingStepId
              ? { ...s, tool: option.action, args: option.args }
              : s,
          ),
        },
      })),
    };
    return <ActionChoicesCard result={choices} />;
  }
  const pending = result as
    | {
        pendingWorkflow?: {
          steps: Array<{ id: string; args: Record<string, unknown> }>;
        };
        pendingStepId?: string;
      }
    | undefined;
  const step = pending?.pendingWorkflow?.steps.find(
    (s) => s.id === pending.pendingStepId,
  );
  const choices = writeActionChoices(result, step?.args);
  if (choices && pending?.pendingWorkflow && step) {
    choices.options = choices.options.map((option) => ({
      ...option,
      action: 'propose_workflow',
      args: {
        ...pending.pendingWorkflow,
        steps: pending.pendingWorkflow!.steps.map((s) =>
          s.id === step.id
            ? { ...s, tool: option.action, args: option.args }
            : s,
        ),
      },
    }));
    return <ActionChoicesCard result={choices} />;
  }
  if (flow?.id && Array.isArray(flow.steps)) {
    return (
      <WorkflowCard
        workflow={flow}
        busy={busy}
        onDecision={(decision) => onDecision(flow, decision)}
      />
    );
  }
  const failure = result as { summary?: string; status?: string } | undefined;
  return failure?.summary ? <p role="alert">{failure.summary}</p> : null;
}
export function WorkflowWorkspace({
  runtimeUrl,
  idToken,
  children,
}: {
  runtimeUrl: string;
  idToken?: string;
  children: ReactNode;
}) {
  const promptIds = useRef(loadWorkflowPromptIds());
  const [cutoff, setCutoff] = useState(workflowHistoryCutoff);
  useEffect(() => {
    const update = () => {
      promptIds.current = loadWorkflowPromptIds();
      setCutoff(workflowHistoryCutoff());
    };
    window.addEventListener(HISTORY_CLEARED_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(HISTORY_CLEARED_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [inlineWorkflowIds, setInlineWorkflowIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  const { agent } = useAgent({ agentId: 'default' });
  const messages = agent.messages || [];
  const lastPromptId = messages.filter((message) => message.role === 'user').slice(-1)[0]?.id;
  for (const flow of workflows) {
    if (cutoff && (flow.createdAt || 0) <= cutoff) continue;
    if (!promptIds.current[flow.id]) {
      const promptId = workflowPromptId(messages, flow);
      if (promptId) promptIds.current[flow.id] = promptId;
    }
  }
  useEffect(() => {
    saveWorkflowPromptIds(promptIds.current);
  }, [workflows, messages]);
  const { lang } = useUiLanguage();
  const base = runtimeUrl.replace(/\/copilotkit\/?$/, '');
  const headers = {
    'Content-Type': 'application/json',
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useRef(() => refreshRef.current()).current;
  refreshRef.current = () => {
    fetch(`${base}/workflows`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (alive.current && Array.isArray(data.workflows))
          setWorkflows(data.workflows);
      })
      .catch(() => {});
  };
  useEffect(() => {
    alive.current = true;
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);
  const autoStarted = useRef(new Set<string>());
  const autoRef = useRef<(flow: Workflow) => boolean>(() => false);
  const autoRun = useRef((flow: Workflow) => autoRef.current(flow)).current;
  autoRef.current = (flow) => {
    if (autoStarted.current.has(flow.id)) return true;
    if (agent.isRunning || isAgentRunActive(agent) || active) return false;
    autoStarted.current.add(flow.id);
    void decide(flow, 'resume');
    return true;
  };
  const markInlineWorkflow = useCallback((id: string, visible: boolean) => {
    setInlineWorkflowIds((previous) => {
      const alreadyVisible = previous.has(id);
      if (visible === alreadyVisible) return previous;
      const next = new Set(previous);
      if (visible) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  useCopilotAction({
    name: 'propose_workflow',
    parameters: [],
    available: 'frontend',
    render: ({ result }) => {
      const parsed =
        typeof result === 'string' ? safeParse(result) : result;
      const initial = parsed as Workflow | undefined;
      const live = initial?.id
        ? workflows.find((item) => item.id === initial.id)
        : undefined;

      return (
        <WorkflowArrival
          result={parsed}
          workflow={live}
          busy={active !== null || agent.isRunning || isAgentRunActive(agent)}
          refresh={refresh}
          autoRun={autoRun}
          onDecision={(flow, decision) => {
            void decide(flow, decision);
          }}
          onInlineWorkflow={markInlineWorkflow}
        />
      );
    },
  });
  async function decide(flow: Workflow, decision: string) {
    const cancel = decision === 'cancel';
    if (!cancel && (active || agent.isRunning || !tryAcquireAgentRun(agent)))
      return;
    if (!cancel) setActive(flow.id);
    setError(false);
    const request = async (current: Workflow, action: string) => {
      const response = await fetch(`${base}/workflow-decision`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: current.id,
          revision: current.revision,
          decision: action,
          stepId: current.steps.find(
            (s) => !['completed', 'already_satisfied'].includes(s.state),
          )?.id,
        }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.status && data.status !== 'ok') throw new Error();
      const next = (data.workflow || data) as Workflow;
      if (!next.id) throw new Error();
      if (alive.current)
        setWorkflows((previous) =>
          previous.some((item) => item.id === next.id)
            ? previous.map((item) => (item.id === next.id ? next : item))
            : [...previous, next],
        );
      return next;
    };
    try {
      let current = await request(flow, decision);
      while (
        !cancel &&
        alive.current &&
        current.state === 'ready'
      ) {
        current = await request(current, 'advance');
        if (alive.current) current = await request(current, 'status');
      }
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (!cancel) {
        releaseAgentRun(agent);
        if (alive.current) setActive(null);
      }
      refresh();
    }
  }
  const visibleWorkflows = workflows.filter(
    (flow) =>
      !inlineWorkflowIds.has(flow.id) &&
      (!cutoff || (flow.createdAt || 0) > cutoff),
  ).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const conversationCards: ConversationCard[] = visibleWorkflows.map((flow) => ({
    id: flow.id,
    promptId: messages.some((message) => message.id === promptIds.current[flow.id])
      ? promptIds.current[flow.id] : undefined,
    content: (
      <WorkflowCard
        workflow={flow}
        busy={active !== null || agent.isRunning || isAgentRunActive(agent)}
        onDecision={(decision) => { void decide(flow, decision); }}
      />
    ),
  }));
  if (error) conversationCards.push({
    id: 'workflow-progress-error',
    promptId: lastPromptId,
    content: (
      <p role="alert">
        {lang === 'he'
          ? 'לא ניתן לאמת את ההתקדמות. יש לבדוק את המצב לפני המשך.'
          : 'Progress could not be verified. Check status before resuming.'}
      </p>
    ),
  });
  return (
    <WorkflowConversationContext.Provider value={conversationCards}>
      {children}
    </WorkflowConversationContext.Provider>
  );
}
