import { useEffect, useMemo, useState } from 'react';
import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { directionFor, localeFor, uiLanguageOf, USER_TIME_ZONE } from './uiLanguage';
import { ToolLoading } from './ToolLoading';

type DeadlineResult = {
  lang?: string;
  status?: 'ok' | 'unavailable';
  raceName?: string;
  sessionType?: 'sprint' | 'qualifying';
  sessionLabel?: string;
  sessionStartsAt?: string;
  nowIso?: string;
  alreadyStarted?: boolean;
};

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function getParts(ms: number): Parts {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatSessionStart(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: USER_TIME_ZONE,
    timeZoneName: 'short',
  });
}

export function DeadlineCountdown({ result }: { result?: DeadlineResult }) {
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          unavailable: 'מועד נעילת הקבוצות הבא אינו זמין כרגע.',
          sprint: 'ספרינט',
          qualifying: 'דירוג',
          session: 'מקצה',
          title: 'מועד נעילת הקבוצות',
          race: 'מרוץ',
          locksAt: 'הנעילה בתחילת',
          started: 'המקצה כבר התחיל.',
          days: 'ימים',
          hours: 'שעות',
          min: 'דקות',
          sec: 'שניות',
          reminder: 'אל תשכח לנעול את הקבוצה לפני המועד.',
        }
      : {
          unavailable: "Next deadline isn't available right now.",
          sprint: 'Sprint',
          qualifying: 'Qualifying',
          session: 'session',
          title: 'Teams lock deadline',
          race: 'Race',
          locksAt: 'Locks at start of',
          started: 'This session has already started.',
          days: 'days',
          hours: 'hours',
          min: 'min',
          sec: 'sec',
          reminder: "Don't forget to lock your team before then.",
        };
  const sessionStartsAt = result?.sessionStartsAt;
  const serverNowIso = result?.nowIso;

  // Capture server↔client clock skew at mount so the ticking countdown is
  // anchored to the server's notion of "now" (which is the source of truth).
  const clockSkewMs = useMemo(() => {
    if (!serverNowIso) return 0;
    const serverNow = new Date(serverNowIso).getTime();
    const clientNowAtMount = Date.now();
    if (Number.isNaN(serverNow)) return 0;
    return serverNow - clientNowAtMount;
  }, [serverNowIso]);

  const [now, setNow] = useState(() => Date.now() + clockSkewMs);

  useEffect(() => {
    if (!sessionStartsAt) return;
    const deadlineMs = new Date(sessionStartsAt).getTime();
    if (Number.isNaN(deadlineMs)) return;
    if (deadlineMs <= Date.now() + clockSkewMs) return;
    const id = window.setInterval(() => {
      const estimated = Date.now() + clockSkewMs;
      setNow(estimated);
      if (estimated >= deadlineMs) {
        window.clearInterval(id);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [sessionStartsAt, clockSkewMs]);

  if (!result || result.status === 'unavailable') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.unavailable}
      </div>
    );
  }

  const sessionType = result.sessionType;
  const sessionLabel =
    sessionType === 'sprint'
      ? labels.sprint
      : sessionType === 'qualifying'
        ? labels.qualifying
        : (result.sessionLabel ?? labels.session);

  const deadlineMs = sessionStartsAt
    ? new Date(sessionStartsAt).getTime()
    : Number.NaN;
  const remainingMs = Number.isNaN(deadlineMs) ? 0 : deadlineMs - now;
  const hasStarted = result.alreadyStarted || remainingMs <= 0;
  const parts = getParts(remainingMs);

  return (
    <div
      dir={directionFor(lang)}
      style={{
        margin: '8px 0',
        border: '1px solid var(--app-border)',
        borderRadius: 12,
        background: 'var(--app-deadline-bg)',
        padding: '16px 18px',
        fontSize: 13,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          color: 'var(--app-primary-strong)',
        }}
      >
        {labels.title}
      </div>
      <div style={{ marginTop: 4, color: 'var(--app-control-text)' }}>
        {labels.race}: <strong>{result.raceName ?? '—'}</strong>
      </div>
      <div style={{ color: 'var(--app-control-text)', marginBottom: 12 }}>
        {labels.locksAt} <strong>{sessionLabel}</strong>
        {sessionStartsAt
          ? ` · ${formatSessionStart(sessionStartsAt, localeFor(lang))}`
          : ''}
      </div>

      {hasStarted ? (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--app-danger-surface)',
            border: '1px solid var(--app-danger-border)',
            borderRadius: 8,
            color: 'var(--app-danger-text)',
            fontWeight: 600,
          }}
        >
          {labels.started}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
          }}
        >
          <CountdownCell label={labels.days} value={parts.days} />
          <CountdownCell label={labels.hours} value={pad(parts.hours)} />
          <CountdownCell label={labels.min} value={pad(parts.minutes)} />
          <CountdownCell label={labels.sec} value={pad(parts.seconds)} />
        </div>
      )}

      <div style={{ marginTop: 10, color: 'var(--app-muted)', fontSize: 12 }}>
        {labels.reminder}
      </div>
    </div>
  );
}

function CountdownCell({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 8,
        textAlign: 'center',
        padding: '10px 6px',
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: 'var(--app-primary-strong)',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--app-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0,
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function useDeadlineCountdownAction() {
  useCopilotAction({
    name: 'get_deadline',
    description:
      'Next F1 Fantasy team-lock deadline with a live ticking countdown.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="deadline" />;
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return (
        <DeadlineCountdown result={parsed as DeadlineResult | undefined} />
      );
    },
  });
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
