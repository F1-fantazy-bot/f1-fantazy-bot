import { useId, useState } from 'react';
import './ClearHistoryButton.css';
import { useWorkflowHistory } from './workflowHistoryContext';
import { useUiLanguage } from './uiLanguage';

export function ClearHistoryButton() {
  const { clearHistory, clearing } = useWorkflowHistory();
  const { lang } = useUiLanguage();
  const statusId = useId();
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
    <div className="clear-history-control">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={clearing}
        aria-busy={clearing}
        aria-describedby={clearing || error ? statusId : undefined}
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
        <div id={statusId} className="clear-history-control__message" role="status" dir={lang === 'he' ? 'rtl' : 'ltr'}>
          {lang === 'he'
            ? 'מבטל תהליכים ומנקה היסטוריה…'
            : 'Stopping workflows and clearing history…'}
        </div>
      )}
      {error && (
        <div id={statusId} className="clear-history-control__message clear-history-control__message--error" role="alert" dir={lang === 'he' ? 'rtl' : 'ltr'}>
          {lang === 'he'
            ? 'לא ניתן לבטל את כל התהליכים. ההיסטוריה נשמרה; נסה שוב.'
            : 'Could not stop all workflows. History was kept; please try again.'}
        </div>
      )}
    </div>
  );
}
