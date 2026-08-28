// Generic result card rendered when a write tool (or `confirm_write`)
// returns a non-`confirmation_required` status. Mirrors the visual
// language of `ToolErrorFallback` so success / failure feel like one
// design system.

import { useEffect } from 'react';
import { useUiLanguage } from './uiLanguage';
import { TEAM_SELECTION_CHANGED_EVENT } from './UserTeamsList';

export type WriteResultStatus =
  | 'ok'
  | 'invalid_input'
  | 'not_found'
  | 'forbidden'
  | 'limit_exceeded'
  | 'failed';

export type WriteResult = {
  status?: WriteResultStatus | string;
  tool?: string;
  summary?: string;
  details?: unknown;
  uiLang?: string;
  teamId?: string;
  leagueCode?: string;
  reportAction?: {
    type?: string;
    leagueCode?: string;
    message?: string;
  };
};

const STATUS_STYLES: Record<
  WriteResultStatus,
  { bg: string; border: string; fg: string; icon: string; title: string }
> = {
  ok: {
    bg: '#eefaf0',
    border: '#bfe5c7',
    fg: '#1e5b2d',
    icon: '✅',
    title: 'Done',
  },
  invalid_input: {
    bg: '#fff7e6',
    border: '#f1d28a',
    fg: '#7a4f10',
    icon: '⚠️',
    title: "Couldn't apply that change",
  },
  not_found: {
    bg: '#f4f4f6',
    border: '#d5d5dc',
    fg: '#4a4a52',
    icon: 'ℹ️',
    title: 'Nothing to do',
  },
  forbidden: {
    bg: '#fff1f1',
    border: '#f3c2c2',
    fg: '#7a1f1f',
    icon: '🚫',
    title: 'Not allowed',
  },
  limit_exceeded: {
    bg: '#fff1f1',
    border: '#f3c2c2',
    fg: '#7a1f1f',
    icon: '🚦',
    title: 'Limit reached',
  },
  failed: {
    bg: '#fff1f1',
    border: '#f3c2c2',
    fg: '#7a1f1f',
    icon: '⚠️',
    title: 'Action failed',
  },
};

function isKnownStatus(value: unknown): value is WriteResultStatus {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(STATUS_STYLES, value)
  );
}

export function isWriteResult(value: unknown): value is WriteResult {
  if (value === null || typeof value !== 'object') return false;
  const status = (value as { status?: unknown }).status;
  return isKnownStatus(status);
}

export function WriteResultCard({ result }: { result: WriteResult }) {
  const { setLang } = useUiLanguage();
  const status = isKnownStatus(result.status) ? result.status : 'ok';
  const style = STATUS_STYLES[status];
  const isHebrew = result.uiLang === 'he';
  useEffect(() => {
    if (result.uiLang === 'he' || result.uiLang === 'en') {
      setLang(result.uiLang);
    }
  }, [result.uiLang, setLang]);
  useEffect(() => {
    if (
      result.status === 'ok' &&
      result.tool === 'select_team' &&
      typeof result.teamId === 'string'
    ) {
      window.dispatchEvent(
        new CustomEvent(TEAM_SELECTION_CHANGED_EVENT, {
          detail: result.teamId,
        }),
      );
    }
  }, [result.status, result.teamId, result.tool]);
  const titles: Record<WriteResultStatus, string> = isHebrew
    ? {
        ok: 'בוצע',
        invalid_input: 'לא ניתן לבצע את השינוי',
        not_found: 'אין מה לבצע',
        forbidden: 'הפעולה אינה מורשית',
        limit_exceeded: 'הגעת למגבלה',
        failed: 'הפעולה נכשלה',
      }
    : {
        ok: style.title,
        invalid_input: STATUS_STYLES.invalid_input.title,
        not_found: STATUS_STYLES.not_found.title,
        forbidden: STATUS_STYLES.forbidden.title,
        limit_exceeded: STATUS_STYLES.limit_exceeded.title,
        failed: STATUS_STYLES.failed.title,
      };
  const summary =
    typeof result.summary === 'string' && result.summary.length > 0
      ? result.summary
      : isHebrew
        ? 'לא סופקו פרטים.'
        : 'No details provided.';

  return (
    <div
      role="status"
      dir={isHebrew ? 'rtl' : 'ltr'}
      style={{
        padding: '12px 14px',
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 8,
        color: style.fg,
        margin: '6px 0',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {style.icon} {titles[status]}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.4 }}>{summary}</div>
      {result.tool ? (
        <details style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            {isHebrew ? 'פרטים' : 'Details'}
          </summary>
          <div style={{ marginTop: 4, fontFamily: 'monospace' }}>
            <div>
              {isHebrew ? 'כלי' : 'tool'}: {result.tool}
            </div>
            <div>
              {isHebrew ? 'מצב' : 'status'}: {String(result.status ?? '')}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
