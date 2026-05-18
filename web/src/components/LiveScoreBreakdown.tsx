import { useCopilotAction } from '@copilotkit/react-core';

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

function formatExtractedAt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function MemberCard({
  member,
  isConstructor = false,
}: {
  member: MemberBreakdown;
  isConstructor?: boolean;
}) {
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
        border: '1px solid #eef0f5',
        borderRadius: 8,
        padding: '10px 12px',
        background: member.missing ? '#fff5f5' : '#fafbfd',
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
              background: '#fff3c2',
              color: '#7a5a00',
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
              background: '#eef4ff',
              color: '#1c4f99',
              fontWeight: 700,
            }}
          >
            x2
          </span>
        ) : null}
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#1c3d70' }}>
          {formatNumber(effective)} pts
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#5a6471' }}>
        Δ {formatSigned(member.priceChange)}
        {member.missing ? ' · ⚠️ no live data yet' : ''}
      </div>
      {sessionLines.length > 0 ? (
        <div style={{ marginTop: 6, fontSize: 12, color: '#37404f' }}>
          {sessionLines.map((s) => (
            <div key={s.label}>
              <strong>{s.label}:</strong> {s.metrics.join(', ')}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LiveScoreBreakdown({ result }: { result?: LiveScoreTeamResult }) {
  if (!result || result.status === 'invalid_input') {
    return (
      <div style={{ padding: 12, color: '#555' }}>
        Live-score request was missing data. Tell me which league.
      </div>
    );
  }
  if (result.status === 'not_followed') {
    return (
      <div style={{ padding: 12, color: '#7a1f1f' }}>
        You don't follow that league. Run <code>/follow_league</code> in
        Telegram first.
      </div>
    );
  }
  if (result.status === 'not_found') {
    return (
      <div style={{ padding: 12, color: '#555' }}>
        No locked roster snapshot for this league yet. Wait for the next
        session lock.
      </div>
    );
  }
  if (result.status === 'team_not_found') {
    return (
      <div style={{ padding: 12, color: '#7a1f1f' }}>
        Couldn't match that team. Try one of:{' '}
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
      style={{
        margin: '8px 0',
        border: '1px solid #e2e6ee',
        borderRadius: 10,
        background: '#fff',
        overflow: 'hidden',
        fontSize: 13,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e6ee',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          🏎️ Live score — {result.leagueName ?? result.leagueCode} ·{' '}
          {result.teamName}
        </div>
        <div style={{ color: '#5a6471', marginTop: 2, fontSize: 12 }}>
          Matchday {result.matchdayId ?? '?'} · updated{' '}
          {formatExtractedAt(result.extractedAt)}
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                color: '#7d8693',
              }}
            >
              Total live points
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#1c3d70' }}>
              {formatNumber(breakdown.totalPoints)}
            </div>
            {typeof breakdown.transferPenalty === 'number' &&
            breakdown.transferPenalty > 0 ? (
              <div style={{ fontSize: 12, color: '#7a1f1f' }}>
                Transfer penalty: -{breakdown.transferPenalty.toFixed(2)} (
                pre-penalty {formatNumber(breakdown.pointsBeforePenalty)})
              </div>
            ) : null}
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                color: '#7d8693',
              }}
            >
              Live price Δ
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1c3d70' }}>
              {formatSigned(breakdown.totalPriceChange)}
            </div>
          </div>
          {breakdown.noNegativeApplied ? (
            <div
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: '#eef4ff',
                color: '#1c4f99',
                fontWeight: 700,
                fontSize: 12,
                alignSelf: 'center',
              }}
            >
              🛡️ No Negative active
            </div>
          ) : null}
        </div>
      </div>

      {drivers.length > 0 ? (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>👤 Drivers</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 8,
            }}
          >
            {drivers.map((m) => (
              <MemberCard key={m.code} member={m} />
            ))}
          </div>
        </div>
      ) : null}

      {constructors.length > 0 ? (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            🛠️ Constructors
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 8,
            }}
          >
            {constructors.map((m) => (
              <MemberCard key={m.code} member={m} isConstructor />
            ))}
          </div>
        </div>
      ) : null}

      {breakdown.missingMembers && breakdown.missingMembers.length > 0 ? (
        <div
          style={{
            padding: '8px 16px',
            background: '#fff5f5',
            color: '#7a1f1f',
            fontSize: 12,
            borderTop: '1px solid #f3c4c4',
          }}
        >
          ⚠️ Missing live data: {breakdown.missingMembers.join(', ')}
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
        return (
          <div style={{ padding: 10, color: '#666' }}>
            Loading live score…
          </div>
        );
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
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
