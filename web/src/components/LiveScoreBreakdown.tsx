import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import {
  directionFor,
  localeFor,
  uiLanguageOf,
  USER_TIME_ZONE,
  type UiLanguage,
} from './uiLanguage';
import { ToolLoading } from './ToolLoading';

type SessionDetails = Record<string, number | undefined>;

type MemberBreakdown = {
  code?: string;
  points?: number;
  priceChange?: number;
  details?: Record<string, SessionDetails | unknown>;
  isBoost?: boolean;
  isExtraBoost?: boolean;
  missing?: boolean;
};

type LiveScoreBreakdownData = {
  totalPoints?: number;
  pointsBeforePenalty?: number;
  transferPenalty?: number;
  noNegativeApplied?: boolean;
  totalPriceChange?: number;
  driverBreakdown?: MemberBreakdown[];
  constructorBreakdown?: MemberBreakdown[];
  missingMembers?: string[];
};

type LiveScoreTeamResult = {
  lang?: string;
  status?:
    | 'ok'
    | 'not_followed'
    | 'not_found'
    | 'team_not_found'
    | 'invalid_input';
  leagueCode?: string;
  leagueName?: string;
  matchdayId?: number | null;
  extractedAt?: string | null;
  teamId?: string;
  teamName?: string;
  userName?: string;
  position?: number | null;
  breakdown?: LiveScoreBreakdownData;
  availableTeams?: Array<{
    teamName?: string;
    userName?: string;
    teamNo?: number;
    position?: number | null;
    teamId?: string;
  }>;
};

const SESSION_ORDER = ['Sprint', 'Qualifying', 'Race'] as const;
const SESSION_METRICS = ['POS', 'PG', 'OV', 'FL', 'DD', 'TW', 'FP'] as const;

function formatSigned(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  const fixed = value.toFixed(2);
  return value >= 0 ? `+${fixed}` : fixed;
}

function formatNumber(value: number | undefined, digits = 2): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

function formatExtractedAt(
  iso: string | null | undefined,
  lang: UiLanguage,
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(localeFor(lang), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: USER_TIME_ZONE,
  });
}

function MemberCard({
  member,
  lang,
  isConstructor = false,
}: {
  member: MemberBreakdown;
  lang: UiLanguage;
  isConstructor?: boolean;
}) {
  const labels =
    lang === 'he'
      ? {
          points: "נק'",
          noData: 'אין עדיין נתונים חיים',
          sessions: {
            Sprint: 'ספרינט',
            Qualifying: 'דירוג',
            Race: 'מרוץ',
          } as Record<string, string>,
        }
      : {
          points: 'pts',
          noData: 'no live data yet',
          sessions: {} as Record<string, string>,
        };
  const base = typeof member.points === 'number' ? member.points : 0;
  const effective = member.isExtraBoost
    ? base * 3
    : member.isBoost
      ? base * 2
      : base;

  const sessionLines: Array<{ label: string; metrics: string[] }> = [];
  if (!isConstructor && member.details && typeof member.details === 'object') {
    for (const label of SESSION_ORDER) {
      const sessionData = (member.details as Record<string, unknown>)[label];
      if (!sessionData || typeof sessionData !== 'object') continue;
      const metrics: string[] = [];
      for (const m of SESSION_METRICS) {
        const v = (sessionData as Record<string, unknown>)[m];
        if (typeof v === 'number' && v !== 0) {
          metrics.push(`${m} ${v}`);
        }
      }
      if (metrics.length) sessionLines.push({ label, metrics });
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--app-border)',
        borderRadius: 8,
        padding: '10px 12px',
        background: member.missing
          ? 'var(--app-danger-surface)'
          : 'var(--app-surface-subtle)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <strong style={{ fontSize: 14 }}>
          {member.isExtraBoost ? '🏆 ' : member.isBoost ? '⭐ ' : ''}
          {member.code}
        </strong>
        {member.isExtraBoost ? (
          <span
            style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 999,
              background: 'var(--app-warning-surface)',
              color: 'var(--app-warning-text)',
              fontWeight: 700,
            }}
          >
            x3
          </span>
        ) : member.isBoost ? (
          <span
            style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 999,
              background: 'var(--app-primary-surface)',
              color: 'var(--app-primary)',
              fontWeight: 700,
            }}
          >
            x2
          </span>
        ) : null}
        <span
          style={{
            marginLeft: 'auto',
            fontWeight: 700,
            color: 'var(--app-primary-strong)',
          }}
        >
          {formatNumber(effective)} {labels.points}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--app-muted)' }}>
        Δ {formatSigned(member.priceChange)}
        {member.missing ? ` · ⚠️ ${labels.noData}` : ''}
      </div>
      {sessionLines.length > 0 ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: 'var(--app-control-text)',
          }}
        >
          {sessionLines.map((s) => (
            <div key={s.label}>
              <strong>{labels.sessions[s.label] ?? s.label}:</strong>{' '}
              {s.metrics.join(', ')}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LiveScoreBreakdown({
  result,
}: {
  result?: LiveScoreTeamResult;
}) {
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          invalid: 'חסרים נתונים לבקשת הניקוד החי. נא לציין איזו ליגה.',
          notFollowed: 'אינך עוקב אחר הליגה הזו. יש לעקוב אחריה בטלגרם.',
          notFound:
            'עדיין אין צילום מצב נעול לליגה. יש להמתין לנעילת המקצה הבא.',
          teamNotFound: 'לא נמצאה קבוצה מתאימה. נסה אחת מהאפשרויות:',
          title: 'ניקוד חי',
          matchday: 'מחזור',
          updated: 'עודכן',
          totalPoints: 'סך נקודות חי',
          transferPenalty: 'קנס העברות',
          beforePenalty: 'לפני הקנס',
          priceChange: 'שינוי מחיר חי',
          noNegative: "צ'יפ ללא שלילי פעיל",
          drivers: 'נהגים',
          constructors: 'קבוצות',
          missing: 'חסרים נתוני ניקוד חי',
        }
      : {
          invalid: 'Live-score request was missing data. Tell me which league.',
          notFollowed:
            "You don't follow that league. Follow it in Telegram first.",
          notFound:
            'No locked roster snapshot for this league yet. Wait for the next session lock.',
          teamNotFound: "Couldn't match that team. Try one of:",
          title: 'Live score',
          matchday: 'Matchday',
          updated: 'updated',
          totalPoints: 'Total live points',
          transferPenalty: 'Transfer penalty',
          beforePenalty: 'pre-penalty',
          priceChange: 'Live price Δ',
          noNegative: 'No Negative active',
          drivers: 'Drivers',
          constructors: 'Constructors',
          missing: 'Missing live data',
        };
  if (!result || result.status === 'invalid_input') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.invalid}
      </div>
    );
  }
  if (result.status === 'not_followed') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-danger-text)' }}
      >
        {labels.notFollowed}
      </div>
    );
  }
  if (result.status === 'not_found') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.notFound}
      </div>
    );
  }
  if (result.status === 'team_not_found') {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-danger-text)' }}
      >
        {labels.teamNotFound}{' '}
        {(result.availableTeams || [])
          .map((t) => t.teamName || t.userName)
          .filter(Boolean)
          .join(', ') || '—'}
        .
      </div>
    );
  }
  if (result.status !== 'ok') return null;

  const breakdown = result.breakdown || {};
  const drivers = breakdown.driverBreakdown || [];
  const constructors = breakdown.constructorBreakdown || [];

  return (
    <div
      dir={directionFor(lang)}
      style={{
        margin: '8px 0',
        border: '1px solid var(--app-border)',
        borderRadius: 10,
        background: 'var(--app-surface)',
        overflow: 'hidden',
        fontSize: 13,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--app-surface-muted)',
          borderBottom: '1px solid var(--app-border)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          🏎️ {labels.title} — {result.leagueName ?? result.leagueCode} ·{' '}
          {result.teamName}
        </div>
        <div style={{ color: 'var(--app-muted)', marginTop: 2, fontSize: 12 }}>
          {labels.matchday} {result.matchdayId ?? '?'} · {labels.updated}{' '}
          {formatExtractedAt(result.extractedAt, lang)}
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                color: 'var(--app-subtle)',
              }}
            >
              {labels.totalPoints}
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: 'var(--app-primary-strong)',
              }}
            >
              {formatNumber(breakdown.totalPoints)}
            </div>
            {typeof breakdown.transferPenalty === 'number' &&
            breakdown.transferPenalty > 0 ? (
              <div style={{ fontSize: 12, color: 'var(--app-danger-text)' }}>
                {labels.transferPenalty}: -{breakdown.transferPenalty.toFixed(2)} (
                {labels.beforePenalty} {formatNumber(breakdown.pointsBeforePenalty)})
              </div>
            ) : null}
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                color: 'var(--app-subtle)',
              }}
            >
              {labels.priceChange}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--app-primary-strong)',
              }}
            >
              {formatSigned(breakdown.totalPriceChange)}
            </div>
          </div>
          {breakdown.noNegativeApplied ? (
            <div
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: 'var(--app-primary-surface)',
                color: 'var(--app-primary)',
                fontWeight: 700,
                fontSize: 12,
                alignSelf: 'center',
              }}
            >
              🛡️ {labels.noNegative}
            </div>
          ) : null}
        </div>
      </div>

      {drivers.length > 0 ? (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            👤 {labels.drivers}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 8,
            }}
          >
            {drivers.map((m) => (
              <MemberCard key={m.code} member={m} lang={lang} />
            ))}
          </div>
        </div>
      ) : null}

      {constructors.length > 0 ? (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            🛠️ {labels.constructors}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 8,
            }}
          >
            {constructors.map((m) => (
              <MemberCard
                key={m.code}
                member={m}
                lang={lang}
                isConstructor
              />
            ))}
          </div>
        </div>
      ) : null}

      {breakdown.missingMembers && breakdown.missingMembers.length > 0 ? (
        <div
          style={{
            padding: '8px 16px',
            background: 'var(--app-danger-surface)',
            color: 'var(--app-danger-text)',
            fontSize: 12,
            borderTop: '1px solid var(--app-danger-border)',
          }}
        >
          ⚠️ {labels.missing}: {breakdown.missingMembers.join(', ')}
        </div>
      ) : null}
    </div>
  );
}

export function useLiveScoreBreakdownAction() {
  useCopilotAction({
    name: 'get_live_score_for_team',
    description: 'Per-team live-score breakdown for a followed league.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="liveScore" />;
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return (
        <LiveScoreBreakdown
          result={parsed as LiveScoreTeamResult | undefined}
        />
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
