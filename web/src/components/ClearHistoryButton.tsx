import { useId, useState } from 'react';
import './ClearHistoryButton.css';
import { useWorkflowHistory } from './workflowHistoryContext';
import { useUiLanguage } from './uiLanguage';

export function ClearHistoryButton() {
  const { clearHistory, clearing } = useWorkflowHistory();
  const { lang } = useUiLanguage();
  const errorId = useId();
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
        className="clear-history-control__button"
        onClick={() => void onClick()}
        disabled={clearing}
        aria-busy={clearing}
        aria-describedby={error ? errorId : undefined}
        style={{
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--app-control-text)',
          background: 'var(--app-control-bg)',
          border: '1px solid var(--app-control-border)',
          borderRadius: 6,
          cursor: clearing ? 'wait' : 'pointer',
        }}
        aria-label="Clear chat history"
      >
        {clearing && <span className="clear-history-control__spinner" aria-hidden="true" />}
        Clear chat history
      </button>
      {error && (
        <div id={errorId} className="clear-history-control__message clear-history-control__message--error" role="alert" dir={lang === 'he' ? 'rtl' : 'ltr'}>
          {lang === 'he'
            ? 'לא ניתן להשלים את ניקוי ההיסטוריה. נסה שוב.'
            : 'Unable to finish clearing history. Please try again.'}
        </div>
      )}
    </div>
  );
}
