// Shared fallback component rendered by every tool-render hook when
// the backend returned `{ status: 'tool_error', ... }` (produced by
// `wrapToolExecute` in `src/agent/wrapToolExecute.js`).
//
// Design rules:
// - NEVER display the raw technical error in the UI. Azure error
//   messages routinely leak URLs, container names, request IDs.
// - Show the friendly `userMessage` prominently.
// - Show the `errorId` in a collapsed `<details>` block so users can
//   quote it in a bug report — that's the correlation token to find
//   the full error in the Telegram error channel.

export type ToolErrorResult = {
  status: 'tool_error';
  tool?: string;
  errorId?: string;
  userMessage?: string;
  uiLang?: string;
};

export function isToolErrorResult(value: unknown): value is ToolErrorResult {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as { status?: unknown }).status === 'tool_error'
  );
}

const DEFAULT_USER_MESSAGE =
  'Something went wrong while looking that up. Please try again in a moment.';

export function ToolErrorFallback({ result }: { result: ToolErrorResult }) {
  const isHebrew = result.uiLang === 'he';
  const message = isHebrew
    ? 'אירעה שגיאה בעת הבדיקה. נסה שוב בעוד רגע.'
    : typeof result.userMessage === 'string' && result.userMessage.length > 0
      ? result.userMessage
      : DEFAULT_USER_MESSAGE;

  return (
    <div
      role="alert"
      dir={isHebrew ? 'rtl' : 'ltr'}
      style={{
        padding: '12px 14px',
        background: 'var(--app-danger-surface)',
        border: '1px solid var(--app-danger-border)',
        borderRadius: 8,
        color: 'var(--app-danger-text)',
        margin: '6px 0',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        ⚠️ {isHebrew ? 'משהו השתבש' : 'Something went wrong'}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.4 }}>{message}</div>
      {(result.tool || result.errorId) && (
        <details
          style={{
            marginTop: 8,
            fontSize: 11,
            color: 'var(--app-danger-text)',
          }}
        >
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            {isHebrew ? 'פרטי תמיכה' : 'Support details'}
          </summary>
          <div style={{ marginTop: 4, fontFamily: 'monospace' }}>
            {result.tool ? (
              <div>
                {isHebrew ? 'כלי' : 'tool'}: {result.tool}
              </div>
            ) : null}
            {result.errorId ? (
              <div>
                {isHebrew ? 'מזהה שגיאה' : 'errorId'}: {result.errorId}
              </div>
            ) : null}
          </div>
        </details>
      )}
    </div>
  );
}
