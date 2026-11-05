// Local browser fixture. No credentials, external services, or live writes.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowCard, type Workflow } from '../src/components/WorkflowCard';
import { UiLanguageProvider } from '../src/components/uiLanguage';
import '../src/index.css';
function Preview() {
  const he = new URLSearchParams(location.search).get('lang') === 'he';
  const [workflow, setWorkflow] = useState<Workflow>({
    id: 'fixture',
    revision: 1,
      state: 'awaiting_approval',
    request: he
      ? 'בחר אקסטרה DRS והצג קבוצות מיטביות'
      : 'Select Extra DRS and show best teams',
    steps: [
      {
        id: 'chip',
        tool: 'activate_chip',
        summary: he
          ? 'בחירת אקסטרה DRS לקבוצה X. הבחירה הקודמת בהמלצה תימחק.'
          : 'Set Extra DRS for Team X. Clears the previous recommendation selection.',
        state: 'waiting',
        write: true,
      },
      {
        id: 'teams',
        tool: 'get_best_teams',
        summary: he
          ? 'חישוב הקבוצות המיטביות לקבוצה X'
          : 'Calculate best teams for Team X',
        state: 'waiting',
        write: false,
      },
    ],
  });
  function decision(action: string) {
    if (action === 'cancel') {
      setWorkflow((f) => ({
        ...f,
        state: 'cancelled',
        steps: f.steps.map((s) => ({
          ...s,
          state: s.state === 'waiting' ? 'cancelled' : s.state,
        })),
      }));
      return;
    }
    setWorkflow((f) => ({
      ...f,
      state: 'running',
      steps: f.steps.map((s, index) =>
        index === 0 ? { ...s, state: 'running' } : s,
      ),
    }));
    window.setTimeout(
      () =>
        setWorkflow((f) => ({
          ...f,
          state: f.state === 'cancelled' ? 'cancelled' : 'failed',
          steps: [
            {
              ...f.steps[0],
              state: 'completed',
              result: {
                tool: 'activate_chip',
                status: 'ok',
                uiLang: he ? 'he' : 'en',
                summary: he ? 'הצ׳יפ נשמר לקבוצה X.' : 'Chip saved for Team X.',
              },
            },
            {
              ...f.steps[1],
              state: 'failed',
              result: {
                status: 'tool_error',
                tool: 'get_best_teams',
                uiLang: he ? 'he' : 'en',
                errorId: 'fixture',
              },
            },
          ],
        })),
      300,
    );
  }
  return (
    <UiLanguageProvider initialLanguage={he ? 'he' : 'en'}>
      <main style={{ maxWidth: 900, margin: '24px auto', padding: 12 }}>
        <WorkflowCard workflow={workflow} onDecision={decision} />
      </main>
    </UiLanguageProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
