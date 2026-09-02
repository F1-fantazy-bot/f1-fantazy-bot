import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { ToolLoading } from './ToolLoading';
import { USER_TIME_ZONE } from './uiLanguage';

type Sessions = {
  qualifying?: string;
  race?: string;
  sprintQualifying?: string;
  sprint?: string;
};

type WeatherEntry = {
  temperature?: number;
  precipitation?: number;
  wind?: number;
};

type HistoricalRow = {
  season?: number | string;
  winner?: string;
  constructor?: string;
  polePosition?: string;
  poleConstructor?: string;
  secondPlaceDriver?: string;
  secondPlaceConstructor?: string;
  thirdPlaceDriver?: string;
  thirdPlaceConstructor?: string;
  carsFinished?: number;
  overtakes?: number;
  safetyCars?: number;
  redFlags?: number;
};

type TrackHistory = { lang?: string; text?: string };
type UiLanguage = 'en' | 'he';

type RaceInfoResult = {
  status?: 'ok' | 'unavailable';
  lang?: string;
  raceName?: string;
  circuitName?: string;
  circuitImageUrl?: string;
  location?: { locality?: string; country?: string };
  weekendFormat?: string;
  isSprintWeekend?: boolean;
  sessions?: Sessions;
  historicalRaceStats?: HistoricalRow[];
  trackHistory?: TrackHistory[];
  weather?: {
    qualifyingWeather?: WeatherEntry;
    raceWeather?: WeatherEntry;
    sprintQualifyingWeather?: WeatherEntry;
    sprintWeather?: WeatherEntry;
    fetchFailed?: boolean;
  };
};

const copy = {
  en: {
    unavailable:
      "Race information isn't available right now. Try again in a moment.",
    regularWeekend: 'REGULAR weekend',
    sprintWeekend: 'SPRINT weekend',
    circuitMap: 'Circuit map',
    schedule: 'Schedule',
    sprintQualifying: 'Sprint Qualifying',
    sprint: 'Sprint',
    qualifying: 'Qualifying',
    race: 'Race',
    weather: 'Weather forecast',
    qualiShort: 'Quali',
    historical: 'Historical results',
    year: 'Year',
    pole: 'Pole',
    winner: 'Winner',
    second: '2nd',
    third: '3rd',
    finished: 'Finished',
    trackHistory: 'Track history',
  },
  he: {
    unavailable: 'מידע על המרוץ אינו זמין כרגע. נסה שוב בעוד רגע.',
    regularWeekend: 'סוף שבוע רגיל',
    sprintWeekend: 'סוף שבוע ספרינט',
    circuitMap: 'מפת המסלול',
    schedule: 'לוח זמנים',
    sprintQualifying: 'מקצה דירוג ספרינט',
    sprint: 'ספרינט',
    qualifying: 'דירוג',
    race: 'מרוץ',
    weather: 'תחזית מזג האוויר',
    qualiShort: 'דירוג',
    historical: 'תוצאות היסטוריות',
    year: 'שנה',
    pole: 'פול פוזישן',
    winner: 'מנצח',
    second: 'מקום 2',
    third: 'מקום 3',
    finished: 'סיימו',
    trackHistory: 'היסטוריית המסלול',
  },
} as const;

function formatIso(iso: string | undefined, lang: UiLanguage): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: USER_TIME_ZONE,
  });
}

function pickTrackHistory(
  entries: TrackHistory[] | undefined,
  lang: UiLanguage,
): string | null {
  if (!entries || entries.length === 0) return null;
  const preferred = entries.find((h) => h.lang === lang);
  const english = entries.find((h) => h.lang === 'en');
  return (preferred ?? english ?? entries[0]).text ?? null;
}

function WeatherChip({
  label,
  entry,
}: {
  label: string;
  entry?: WeatherEntry;
}) {
  if (!entry || entry.temperature === undefined) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 999,
        background: 'var(--app-primary-surface)',
        color: 'var(--app-primary-strong)',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span>{label}</span>
      <span style={{ color: 'var(--app-primary)' }}>·</span>
      <span>🌡 {entry.temperature}°C</span>
      <span>🌧 {entry.precipitation ?? 0}%</span>
      <span>💨 {entry.wind ?? 0} km/h</span>
    </span>
  );
}

export function RaceInfoCard({ result }: { result?: RaceInfoResult }) {
  const lang: UiLanguage = result?.lang === 'he' ? 'he' : 'en';
  const labels = copy[lang];

  if (!result || result.status === 'unavailable') {
    return (
      <div
        dir={lang === 'he' ? 'rtl' : 'ltr'}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.unavailable}
      </div>
    );
  }

  const trackText = pickTrackHistory(result.trackHistory, lang);
  const stats = (result.historicalRaceStats || [])
    .slice()
    .sort((a, b) => Number(b.season ?? 0) - Number(a.season ?? 0));
  const isSprint = result.isSprintWeekend;
  const sessions = result.sessions || {};
  const weather = result.weather || {};

  return (
    <div
      dir={lang === 'he' ? 'rtl' : 'ltr'}
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
        <div style={{ fontWeight: 700, fontSize: 16 }}>{result.raceName}</div>
        <div style={{ color: 'var(--app-muted)', marginTop: 2 }}>
          {result.circuitName}
          {result.location
            ? ` · ${result.location.locality}, ${result.location.country}`
            : ''}
          {result.weekendFormat
            ? ` · ${
                result.isSprintWeekend
                  ? labels.sprintWeekend
                  : labels.regularWeekend
              }`
            : ''}
        </div>
      </div>

      {result.circuitImageUrl ? (
        <div style={{ padding: '12px 16px 0' }}>
          <img
            src={result.circuitImageUrl}
            alt={`${result.circuitName ?? ''} ${labels.circuitMap}`.trim()}
            style={{
              maxWidth: '100%',
              maxHeight: 260,
              objectFit: 'contain',
              borderRadius: 6,
              border: '1px solid var(--app-border)',
            }}
          />
        </div>
      ) : null}

      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          {labels.schedule}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '4px 12px',
          }}
        >
          {isSprint && sessions.sprintQualifying ? (
            <>
              <div style={{ color: 'var(--app-muted)' }}>
                {labels.sprintQualifying}
              </div>
              <div>{formatIso(sessions.sprintQualifying, lang)}</div>
            </>
          ) : null}
          {isSprint && sessions.sprint ? (
            <>
              <div style={{ color: 'var(--app-muted)' }}>{labels.sprint}</div>
              <div>{formatIso(sessions.sprint, lang)}</div>
            </>
          ) : null}
          <div style={{ color: 'var(--app-muted)' }}>{labels.qualifying}</div>
          <div>{formatIso(sessions.qualifying, lang)}</div>
          <div style={{ color: 'var(--app-muted)' }}>{labels.race}</div>
          <div>{formatIso(sessions.race, lang)}</div>
        </div>
        {/* TODO: surface FP1/FP2/FP3 once nextRaceInfoCache tracks them. */}
      </div>

      {weather.qualifyingWeather && weather.raceWeather ? (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {labels.weather}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {isSprint ? (
              <>
                <WeatherChip
                  label="SQ"
                  entry={weather.sprintQualifyingWeather}
                />
                <WeatherChip
                  label={labels.sprint}
                  entry={weather.sprintWeather}
                />
              </>
            ) : null}
            <WeatherChip
              label={labels.qualiShort}
              entry={weather.qualifyingWeather}
            />
            <WeatherChip label={labels.race} entry={weather.raceWeather} />
          </div>
        </div>
      ) : null}

      {stats.length > 0 ? (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {labels.historical}
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--app-surface-subtle)',
                  textAlign: 'start',
                }}
              >
                <th style={cellHeader}>{labels.year}</th>
                <th style={cellHeader}>{labels.pole}</th>
                <th style={cellHeader}>{labels.winner}</th>
                <th style={cellHeader}>{labels.second}</th>
                <th style={cellHeader}>{labels.third}</th>
                <th style={{ ...cellHeader, textAlign: 'center' }}>
                  {labels.finished}
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr
                  key={String(row.season)}
                  style={{ borderTop: '1px solid var(--app-border)' }}
                >
                  <td style={cellBody}>{row.season ?? '—'}</td>
                  <td style={cellBody}>
                    {row.polePosition ?? '—'}
                    {row.poleConstructor ? (
                      <span style={{ color: 'var(--app-subtle)' }}>
                        {' '}
                        ({row.poleConstructor})
                      </span>
                    ) : null}
                  </td>
                  <td style={cellBody}>
                    {row.winner ?? '—'}
                    {row.constructor ? (
                      <span style={{ color: 'var(--app-subtle)' }}>
                        {' '}
                        ({row.constructor})
                      </span>
                    ) : null}
                  </td>
                  <td style={cellBody}>{row.secondPlaceDriver ?? '—'}</td>
                  <td style={cellBody}>{row.thirdPlaceDriver ?? '—'}</td>
                  <td style={{ ...cellBody, textAlign: 'center' }}>
                    {row.carsFinished ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {trackText ? (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--app-surface-subtle)',
            borderTop: '1px solid var(--app-border)',
            color: 'var(--app-muted)',
            whiteSpace: 'pre-wrap',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: 6,
              color: 'var(--app-text)',
            }}
          >
            {labels.trackHistory}
          </div>
          {trackText}
        </div>
      ) : null}
    </div>
  );
}

const cellHeader: React.CSSProperties = {
  padding: '6px 10px',
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  color: 'var(--app-muted)',
  letterSpacing: 0,
};

const cellBody: React.CSSProperties = {
  padding: '6px 10px',
  verticalAlign: 'top',
};

export function useRaceInfoAction() {
  useCopilotAction({
    name: 'get_next_race_info',
    description:
      'Get detailed info on the next F1 race: circuit, location, schedule, weather snapshot, historical stats, and track history.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="raceInfo" />;
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return <RaceInfoCard result={parsed as RaceInfoResult | undefined} />;
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
