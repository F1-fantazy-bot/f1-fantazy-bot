import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';

type Session = { date?: string; time?: string };

type Race = {
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit?: {
    circuitName?: string;
    Location?: { locality?: string; country?: string };
  };
  Sprint?: Session;
  SprintQualifying?: Session;
  FirstPractice?: Session;
  SecondPractice?: Session;
  ThirdPractice?: Session;
  Qualifying?: Session;
};

type NextRacesResult = {
  season?: string;
  races?: Race[];
  counts?: { total?: number; sprint?: number };
};

function formatRaceDate(race: Race): string {
  if (!race.date) return 'TBD';
  const iso = race.time ? `${race.date}T${race.time}` : race.date;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return race.date;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function NextRacesTable({ result }: { result?: NextRacesResult }) {
  if (!result || !result.races || result.races.length === 0) {
    return (
      <div style={{ padding: 12, color: 'var(--app-muted)' }}>
        No upcoming races found.
      </div>
    );
  }

  const { races, season, counts } = result;

  return (
    <div
      style={{
        margin: '8px 0',
        border: '1px solid var(--app-border)',
        borderRadius: 8,
        background: 'var(--app-surface)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--app-border)',
          background: 'var(--app-surface-muted)',
          fontWeight: 600,
        }}
      >
        Upcoming Races{season ? ` — ${season}` : ''}
      </div>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}
      >
        <thead>
          <tr
            style={{
              background: 'var(--app-surface-subtle)',
              textAlign: 'left',
            }}
          >
            <th style={cellHeader}>Rd</th>
            <th style={cellHeader}>Race</th>
            <th style={cellHeader}>Country</th>
            <th style={cellHeader}>Circuit</th>
            <th style={cellHeader}>Race date</th>
            <th style={{ ...cellHeader, textAlign: 'center' }}>Sprint?</th>
          </tr>
        </thead>
        <tbody>
          {races.map((race) => {
            const country = race.Circuit?.Location?.country ?? '';
            const circuit = race.Circuit?.circuitName ?? '';
            const isSprint = Boolean(race.Sprint);
            return (
              <tr
                key={race.round}
                style={{ borderTop: '1px solid var(--app-border)' }}
              >
                <td style={cellBody}>{race.round}</td>
                <td style={cellBody}>{race.raceName}</td>
                <td style={cellBody}>{country || '—'}</td>
                <td style={cellBody}>{circuit || '—'}</td>
                <td style={cellBody}>{formatRaceDate(race)}</td>
                <td style={{ ...cellBody, textAlign: 'center' }}>
                  {isSprint ? '🏁' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {counts ? (
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--app-border)',
            fontSize: 13,
            color: 'var(--app-muted)',
          }}
        >
          {counts.total ?? races.length} race
          {(counts.total ?? races.length) === 1 ? '' : 's'} left
          {typeof counts.sprint === 'number'
            ? ` · ${counts.sprint} sprint format`
            : ''}
        </div>
      ) : null}
    </div>
  );
}

const cellHeader: React.CSSProperties = {
  padding: '8px 12px',
  fontWeight: 600,
  fontSize: 12,
  textTransform: 'uppercase',
  color: 'var(--app-muted)',
  letterSpacing: 0,
};

const cellBody: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'top',
};

// Hook that registers the frontend render for the `get_next_races`
// backend action. Called once from App.tsx. The backend handler in
// src/agent/tools.js produces the data; this render decides how it
// appears in the chat stream.
//
// `available: 'frontend'` tells CopilotKit this action is render-only
// (no client-side handler) — it visualises the result of a backend
// tool call with the matching name.
export function useNextRacesAction() {
  useCopilotAction({
    name: 'get_next_races',
    description:
      'Get the list of upcoming F1 races for the current season. Returns season, race list, and counts.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <div style={{ padding: 10, color: 'var(--app-muted)' }}>
            Loading upcoming races…
          </div>
        );
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return <NextRacesTable result={parsed as NextRacesResult | undefined} />;
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
