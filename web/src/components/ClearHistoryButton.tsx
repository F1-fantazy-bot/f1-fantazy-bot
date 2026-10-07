import { useState } from 'react';
import { useWorkflowHistory } from './workflowHistoryContext';
import { useUiLanguage } from './uiLanguage';

export function ClearHistoryButton() {
  const { clearHistory, clearing } = useWorkflowHistory();
  const { lang } = useUiLanguage();
  const [error, setError] = useState(false);
  const onClick = async () => {
    setError(false);
    try {
      await clearHistory();
    } catch {
      setError(true);
    }
  };
  return (
    <span>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={clearing}
        aria-busy={clearing}
        style={{
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--app-control-text)',
          background: 'var(--app-control-bg)',
          border: '1px solid var(--app-control-border)',
          borderRadius: 6,
          cursor: 'pointer',
        }}
        aria-label="Clear chat history"
      >
        Clear chat history
      </button>
      {clearing && (
        <span role="status">
          {lang === 'he'
            ? 'מבטל תהליכים ומנקה היסטוריה…'
            : 'Stopping workflows and clearing history…'}
        </span>
      )}
      {error && (
        <span role="alert">
          {lang === 'he'
            ? 'לא ניתן לבטל את כל התהליכים. ההיסטוריה נשמרה; נסה שוב.'
            : 'Could not stop all workflows. History was kept; please try again.'}
        </span>
      )}
    </span>
  );
}
