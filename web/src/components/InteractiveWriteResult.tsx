import { useState } from 'react';
import {
  WriteConfirmCard,
  isConfirmationRequired,
  type WriteConfirmationRequired,
} from './WriteConfirmCard';
import {
  WriteResultCard,
  isWriteResult,
  type WriteResult,
} from './WriteResultCard';
import { useWriteDecision } from './WriteDecisionContext';

function getMissingLeagueReport(result: WriteResult) {
  const action = result.reportAction;
  if (
    result.tool !== 'follow_league' ||
    result.status !== 'not_found' ||
    action?.type !== 'report_missing_league' ||
    typeof action.leagueCode !== 'string' ||
    typeof action.message !== 'string'
  ) {
    return null;
  }

  return {
    leagueCode: action.leagueCode,
    message: action.message,
  };
}

export function InteractiveWriteResult({ result }: { result: WriteResult }) {
  const { propose } = useWriteDecision();
  const [confirmation, setConfirmation] =
    useState<WriteConfirmationRequired | null>(null);
  const [feedback, setFeedback] = useState<WriteResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const report = getMissingLeagueReport(result);
  const isHebrew = result.uiLang === 'he';
  const labels = isHebrew
    ? {
        report: 'דווח על ליגה חסרה',
        preparing: 'מכין דיווח…',
        error: 'לא ניתן להכין את הדיווח. נסה שוב.',
      }
    : {
        report: 'Report missing league',
        preparing: 'Preparing report…',
        error: 'Unable to prepare the report. Please try again.',
      };

  async function prepareReport() {
    if (
      !report ||
      submitting ||
      confirmation ||
      (feedback && feedback.status !== 'failed')
    ) {
      return;
    }
    setSubmitting(true);
    setErrorMessage('');
    setFeedback(null);
    try {
      const proposal = await propose('report_bug', {
        message: report.message,
      });
      if (isConfirmationRequired(proposal)) {
        setConfirmation(proposal);

        return;
      }
      if (isWriteResult(proposal)) {
        setFeedback(proposal);

        return;
      }
      throw new Error('Unexpected bug-report proposal response');
    } catch {
      setErrorMessage(labels.error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <WriteResultCard result={result} />
      {report && !confirmation && (!feedback || feedback.status === 'failed') ? (
        <div
          dir={isHebrew ? 'rtl' : 'ltr'}
          style={{ marginTop: 8 }}
        >
          <button
            type="button"
            onClick={prepareReport}
            disabled={submitting}
            aria-label={`${labels.report}: ${report.leagueCode}`}
            style={{
              border: '1px solid var(--app-primary)',
              borderRadius: 6,
              background: 'var(--app-surface)',
              color: 'var(--app-primary)',
              padding: '7px 12px',
              fontWeight: 700,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.65 : 1,
            }}
          >
            {submitting ? labels.preparing : labels.report}
          </button>
        </div>
      ) : null}
      {confirmation ? (
        <WriteConfirmCard
          result={confirmation}
          directConfirm
          onSettled={(outcome, message, finalResult) => {
            if (outcome === 'confirmed' && finalResult) {
              setFeedback(finalResult);
              setConfirmation(null);
            }
            if (outcome === 'cancelled' || outcome === 'error') {
              setConfirmation(null);
            }
            if (outcome === 'error') {
              setErrorMessage(message || labels.error);
            }
          }}
        />
      ) : null}
      {feedback ? <WriteResultCard result={feedback} /> : null}
      {errorMessage ? (
        <div
          role="alert"
          dir={isHebrew ? 'rtl' : 'ltr'}
          style={{
            marginTop: 8,
            color: 'var(--app-danger-text)',
            fontSize: 12,
          }}
        >
          {errorMessage}
        </div>
      ) : null}
    </>
  );
}
