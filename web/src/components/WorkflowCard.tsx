import { workflowHistoryCutoff, HISTORY_CLEARED_EVENT } from '../lib/chatHistoryStore';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useCopilotAction } from '@copilotkit/react-core';
import { useAgent } from '@copilotkit/react-core/v2';
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
function WorkflowArrival({
  result,
  refresh,
  autoRun,
}: {
  result: unknown;
  refresh: () => void;
  autoRun: (flow: Workflow) => boolean;
}) {
  useEffect(() => {
    const flow = result as Workflow | undefined;
    if (!flow?.id || flow.state !== 'ready') return;
    const timer = window.setInterval(() => {
      if (autoRun(flow)) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [result, autoRun]);
  useEffect(() => {
    refresh();
  }, [result, refresh]);
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
  const [cutoff, setCutoff] = useState(workflowHistoryCutoff);
  useEffect(() => {
    const update = () => setCutoff(workflowHistoryCutoff());
    window.addEventListener(HISTORY_CLEARED_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(HISTORY_CLEARED_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  const { agent } = useAgent({ agentId: 'default' });
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
  useCopilotAction({
    name: 'propose_workflow',
    parameters: [],
    available: 'frontend',
    render: ({ result }) => (
      <WorkflowArrival
        result={typeof result === 'string' ? safeParse(result) : result}
        refresh={refresh}
        autoRun={autoRun}
      />
    ),
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
          previous.map((item) => (item.id === next.id ? next : item)),
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
  const visibleWorkflows = workflows.filter((flow) => !cutoff || (flow.createdAt || 0) > cutoff);
  return (
    <>
      {children}
      {(visibleWorkflows.length > 0 || error) && (
        <div
          style={{
            maxWidth: 1000,
            width: '100%',
            margin: '0 auto',
            padding: 12,
          }}
        >
          {error && (
            <p role="alert">
              {lang === 'he'
                ? 'לא ניתן לאמת את ההתקדמות. יש לבדוק את המצב לפני המשך.'
                : 'Progress could not be verified. Check status before resuming.'}
            </p>
          )}
          {visibleWorkflows.map((flow) => (
            <WorkflowCard
              key={flow.id}
              workflow={flow}
              busy={
                active !== null || agent.isRunning || isAgentRunActive(agent)
              }
              onDecision={(decision) => {
                void decide(flow, decision);
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
