import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { directionFor, localeFor, uiLanguageOf } from './uiLanguage';
import { ToolLoading } from './ToolLoading';

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
  lang?: string;
  season?: string;
  races?: Race[];
  counts?: { total?: number; sprint?: number };
};

function formatRaceDate(race: Race, locale: string): string {
  if (!race.date) return locale === 'he-IL' ? 'טרם נקבע' : 'TBD';
  const iso = race.time ? `${race.date}T${race.time}` : race.date;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return race.date;
  return d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function NextRacesTable({ result }: { result?: NextRacesResult }) {
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          empty: 'לא נמצאו מרוצים קרובים.',
          title: 'המרוצים הקרובים',
          round: 'סבב',
          race: 'מרוץ',
          country: 'מדינה',
          circuit: 'מסלול',
          date: 'תאריך המרוץ',
          sprint: 'ספרינט?',
          raceSingular: 'מרוץ נותר',
          racePlural: 'מרוצים נותרו',
          sprintFormat: 'בפורמט ספרינט',
        }
      : {
          empty: 'No upcoming races found.',
          title: 'Upcoming Races',
          round: 'Rd',
          race: 'Race',
          country: 'Country',
          circuit: 'Circuit',
          date: 'Race date',
          sprint: 'Sprint?',
          raceSingular: 'race left',
          racePlural: 'races left',
          sprintFormat: 'sprint format',
        };
  if (!result || !result.races || result.races.length === 0) {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.empty}
      </div>
    );
  }

  const { races, season, counts } = result;

  return (
    <div
      dir={directionFor(lang)}
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
        {labels.title}
        {season ? ` — ${season}` : ''}
      </div>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}
      >
        <thead>
          <tr
            style={{
              background: 'var(--app-surface-subtle)',
              textAlign: 'start',
            }}
          >
            <th style={cellHeader}>{labels.round}</th>
            <th style={cellHeader}>{labels.race}</th>
            <th style={cellHeader}>{labels.country}</th>
            <th style={cellHeader}>{labels.circuit}</th>
            <th style={cellHeader}>{labels.date}</th>
            <th style={{ ...cellHeader, textAlign: 'center' }}>
              {labels.sprint}
            </th>
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
                <td style={cellBody}>
                  {formatRaceDate(race, localeFor(lang))}
                </td>
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
          {counts.total ?? races.length}{' '}
          {(counts.total ?? races.length) === 1
            ? labels.raceSingular
            : labels.racePlural}
          {typeof counts.sprint === 'number'
            ? ` · ${counts.sprint} ${labels.sprintFormat}`
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
        return <ToolLoading kind="nextRaces" />;
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
