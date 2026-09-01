import { useCopilotAction } from '@copilotkit/react-core';
import {
  UseAgentUpdate,
  useAgent,
  useCopilotKit,
} from '@copilotkit/react-core/v2';
import { useId, useState } from 'react';
import {
  isAgentRunActive,
  releaseAgentRun,
  tryAcquireAgentRun,
} from './agentRunLock';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';
import { directionFor, uiLanguageOf } from './uiLanguage';

type LeagueChoice = {
  leagueCode: string;
  leagueName: string;
};

type NameChanges = { in: string[]; out: string[] };
type RoleChange = { from: string | null; to: string | null } | null;

export type LeagueChangeTeam = {
  teamName: string | null;
  userName: string | null;
  position: number | null;
  isNew: boolean;
  hasChanges: boolean;
  drivers: NameChanges;
  constructors: NameChanges;
  captain: RoleChange;
  megaCaptain: RoleChange;
  chipsActivated: string[];
};

export type LeagueChangesResult = {
  status?:
    | 'select_league'
    | 'no_followed_leagues'
    | 'not_followed'
    | 'missing_locked'
    | 'missing_planning'
    | 'matchday_mismatch'
    | 'ok'
    | 'error';
  lang?: string;
  leagueCode?: string | null;
  leagueName?: string | null;
  matchdayId?: number | string | null;
  lockedMatchdayId?: number | string | null;
  planningMatchdayId?: number | string | null;
  leagues?: LeagueChoice[];
  changedTeams?: LeagueChangeTeam[];
  unchangedTeams?: LeagueChangeTeam[];
};

function names(values: string[]): string {
  return values.join(', ');
}

export function LeagueChangesCard({
  result,
}: {
  result?: LeagueChangesResult;
}) {
  const { agent } = useAgent({
    agentId: 'default',
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();
  const [selectedCode, setSelectedCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const headingId = useId();
  const lang = uiLanguageOf(result);
  const isHebrew = lang === 'he';
  const labels = isHebrew
    ? {
        title: 'שינויים בליגה',
        choose: 'בחר ליגה להצגת השינויים',
        chooseHint: 'הליגות שלך',
        loading: 'טוען שינויים…',
        selectError: 'לא ניתן לטעון את שינויי הליגה. נסה שוב.',
        noLeagues: 'אין ליגות במעקב.',
        noLeaguesHint: 'אפשר לעקוב אחר ליגה לפני בדיקת השינויים.',
        notFollowed: 'הליגה הזו אינה ברשימת המעקב שלך.',
        missingLocked: 'עדיין אין תמונת מצב נעולה לליגה הזו.',
        missingLockedHint: 'נסה שוב אחרי נעילת המקצה הבא.',
        missingPlanning: 'נתוני התכנון השבועיים עדיין אינם זמינים.',
        missingPlanningHint: 'נסה שוב אחרי הרענון השבועי הבא.',
        mismatch: 'נתוני התכנון והנעילה שייכים למחזורי מרוץ שונים.',
        mismatchHint: 'יש להמתין לנעילת המקצה הבא לפני ההשוואה.',
        locked: 'נעול',
        planning: 'תכנון',
        matchday: 'מחזור',
        noChanges: 'לא בוצעו שינויים באף קבוצה במחזור הזה.',
        newTeam: 'קבוצה חדשה',
        driversIn: 'נהגים שנכנסו',
        driversOut: 'נהגים שיצאו',
        constructorsIn: 'קבוצות שנכנסו',
        constructorsOut: 'קבוצות שיצאו',
        captain: 'קפטן',
        megaCaptain: 'מגה קפטן',
        chip: "צ'יפ שהופעל",
        unchanged: 'קבוצות ללא שינויים',
        unknown: 'ללא',
        error: 'לא ניתן להציג את שינויי הליגה כרגע.',
      }
    : {
        title: 'League changes',
        choose: 'Choose a league to view its changes',
        chooseHint: 'Your followed leagues',
        loading: 'Loading changes…',
        selectError: 'Unable to load league changes. Please try again.',
        noLeagues: 'No followed leagues.',
        noLeaguesHint: 'Follow a league before checking its changes.',
        notFollowed: 'This league is not in your followed leagues.',
        missingLocked: 'No locked snapshot is available for this league yet.',
        missingLockedHint: 'Try again after the next session locks.',
        missingPlanning: 'Weekly planning data is not available yet.',
        missingPlanningHint: 'Try again after the next weekly refresh.',
        mismatch: 'The planning and locked data are for different matchdays.',
        mismatchHint: 'Wait for the next session lock before comparing them.',
        locked: 'Locked',
        planning: 'Planning',
        matchday: 'Matchday',
        noChanges: 'No teams made changes for this matchday.',
        newTeam: 'New team',
        driversIn: 'Drivers in',
        driversOut: 'Drivers out',
        constructorsIn: 'Constructors in',
        constructorsOut: 'Constructors out',
        captain: 'Captain',
        megaCaptain: 'Mega captain',
        chip: 'Chip activated',
        unchanged: 'Teams with no changes',
        unknown: 'None',
        error: 'League changes cannot be displayed right now.',
      };

  async function selectLeague(league: LeagueChoice) {
    if (
      selectedCode ||
      agent.isRunning ||
      !tryAcquireAgentRun(agent)
    ) {
      return;
    }

    const previousMessages = [...agent.messages];
    let runFailed = false;
    const subscription = agent.subscribe({
      onRunFailed: () => {
        runFailed = true;
      },
      onRunErrorEvent: () => {
        runFailed = true;
      },
    });
    setSelectedCode(league.leagueCode);
    setErrorMessage('');
    try {
      agent.addMessage({
        id: crypto.randomUUID(),
        role: 'developer',
        content:
          `The user selected followed league "${league.leagueName}" ` +
          `(${league.leagueCode}) for league changes. Call ` +
          'get_league_changes now with this exact canonical leagueCode. ' +
          'Do not call list_user_leagues and do not ask for another target.',
      });
      await copilotkit.runAgent({ agent });
      if (runFailed) throw new Error('Agent run failed');
    } catch {
      agent.setMessages(previousMessages);
      setErrorMessage(labels.selectError);
    } finally {
      subscription.unsubscribe();
      releaseAgentRun(agent);
      setSelectedCode('');
    }
  }

  const shellStyle = {
    border: '1px solid var(--app-border)',
    borderRadius: 8,
    background: 'var(--app-surface)',
    color: 'var(--app-text)',
    padding: 14,
    margin: '8px 0',
  } as const;

  if (!result || result.status === 'error') {
    return (
      <section role="alert" dir={directionFor(lang)} style={shellStyle}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{labels.title}</h3>
        <p style={{ margin: '8px 0 0', color: 'var(--app-danger-text)' }}>
          {labels.error}
        </p>
      </section>
    );
  }

  if (result.status === 'select_league') {
    const leagues = result.leagues || [];
    const busy =
      Boolean(selectedCode) || agent.isRunning || isAgentRunActive(agent);

    return (
      <section
        aria-labelledby={headingId}
        dir={directionFor(lang)}
        style={shellStyle}
      >
        <h3 id={headingId} style={{ margin: 0, fontSize: 16 }}>
          {labels.choose}
        </h3>
        <div style={{ color: 'var(--app-muted)', fontSize: 12, marginTop: 3 }}>
          {labels.chooseHint}
        </div>
        <div
          role="list"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 8,
            marginTop: 12,
          }}
        >
          {leagues.map((league) => (
            <button
              key={league.leagueCode}
              type="button"
              role="listitem"
              aria-disabled={busy}
              aria-label={`${labels.choose}: ${league.leagueName}`}
              onClick={() => selectLeague(league)}
              style={{
                minHeight: 72,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--app-control-border)',
                background:
                  selectedCode === league.leagueCode
                    ? 'var(--app-primary-surface)'
                    : 'var(--app-surface-muted)',
                color: 'var(--app-text)',
                textAlign: 'start',
                cursor: busy ? 'wait' : 'pointer',
                opacity:
                  busy && selectedCode !== league.leagueCode ? 0.55 : 1,
              }}
            >
              <strong style={{ display: 'block' }}>{league.leagueName}</strong>
              <code style={{ display: 'block', fontSize: 11, marginTop: 5 }}>
                {league.leagueCode}
              </code>
              {selectedCode === league.leagueCode ? (
                <span
                  role="status"
                  style={{ display: 'block', fontSize: 11, marginTop: 5 }}
                >
                  {labels.loading}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {errorMessage ? (
          <div role="alert" style={{ color: 'var(--app-danger-text)', marginTop: 9 }}>
            {errorMessage}
          </div>
        ) : null}
      </section>
    );
  }

  if (result.status === 'no_followed_leagues') {
    return (
      <section aria-labelledby={headingId} dir={directionFor(lang)} style={shellStyle}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 16 }}>{labels.noLeagues}</h3>
        <p style={{ margin: '7px 0 0', color: 'var(--app-muted)' }}>{labels.noLeaguesHint}</p>
      </section>
    );
  }

  if (result.status === 'not_followed') {
    return (
      <section role="status" dir={directionFor(lang)} style={shellStyle}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{labels.title}</h3>
        <p style={{ margin: '7px 0 0', color: 'var(--app-warning-text)' }}>{labels.notFollowed}</p>
      </section>
    );
  }

  if (result.status === 'missing_locked' || result.status === 'missing_planning') {
    const missingLocked = result.status === 'missing_locked';
    return (
      <section role="status" dir={directionFor(lang)} style={shellStyle}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{result.leagueName || labels.title}</h3>
        <p style={{ margin: '7px 0 0', color: 'var(--app-warning-text)' }}>
          {missingLocked ? labels.missingLocked : labels.missingPlanning}
        </p>
        <p style={{ margin: '4px 0 0', color: 'var(--app-muted)', fontSize: 12 }}>
          {missingLocked ? labels.missingLockedHint : labels.missingPlanningHint}
        </p>
      </section>
    );
  }

  if (result.status === 'matchday_mismatch') {
    return (
      <section role="status" dir={directionFor(lang)} style={shellStyle}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{result.leagueName || labels.title}</h3>
        <p style={{ margin: '7px 0 0', color: 'var(--app-warning-text)' }}>{labels.mismatch}</p>
        <p style={{ margin: '5px 0 0', fontSize: 12 }}>
          {labels.locked}: {result.lockedMatchdayId ?? '?'} · {labels.planning}: {result.planningMatchdayId ?? '?'}
        </p>
        <p style={{ margin: '4px 0 0', color: 'var(--app-muted)', fontSize: 12 }}>{labels.mismatchHint}</p>
      </section>
    );
  }

  const changedTeams = result.changedTeams || [];
  const unchangedTeams = result.unchangedTeams || [];

  return (
    <section aria-labelledby={headingId} dir={directionFor(lang)} style={shellStyle}>
      <header style={{ marginBottom: 12 }}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 17 }}>
          {labels.title}: {result.leagueName || result.leagueCode}
        </h3>
        <div style={{ color: 'var(--app-muted)', fontSize: 12, marginTop: 3 }}>
          {labels.matchday} {result.matchdayId ?? '?'} · {labels.planning} → {labels.locked}
        </div>
      </header>

      {changedTeams.length === 0 ? (
        <p role="status" style={{ color: 'var(--app-muted)' }}>{labels.noChanges}</p>
      ) : (
        <div role="list" style={{ display: 'grid', gap: 8 }}>
          {changedTeams.map((team, index) => (
            <article
              key={`${team.userName || team.teamName || 'team'}-${index}`}
              role="listitem"
              style={{
                border: '1px solid var(--app-control-border)',
                borderRadius: 8,
                background: 'var(--app-surface-muted)',
                padding: 11,
              }}
            >
              <h4 style={{ margin: 0, fontSize: 14 }}>
                {team.position ? `${team.position}. ` : ''}
                {team.teamName || team.userName || labels.unknown}
              </h4>
              <ul style={{ margin: '8px 0 0', paddingInlineStart: 20, lineHeight: 1.55 }}>
                {team.isNew ? <li>{labels.newTeam}</li> : null}
                {team.drivers.out.length ? <li><strong>{labels.driversOut}:</strong> {names(team.drivers.out)}</li> : null}
                {team.drivers.in.length ? <li><strong>{labels.driversIn}:</strong> {names(team.drivers.in)}</li> : null}
                {team.constructors.out.length ? <li><strong>{labels.constructorsOut}:</strong> {names(team.constructors.out)}</li> : null}
                {team.constructors.in.length ? <li><strong>{labels.constructorsIn}:</strong> {names(team.constructors.in)}</li> : null}
                {team.captain ? <li><strong>{labels.captain}:</strong> {team.captain.from || labels.unknown} → {team.captain.to || labels.unknown}</li> : null}
                {team.megaCaptain ? <li><strong>{labels.megaCaptain}:</strong> {team.megaCaptain.from || labels.unknown} → {team.megaCaptain.to || labels.unknown}</li> : null}
                {team.chipsActivated.map((chip) => <li key={chip}><strong>{labels.chip}:</strong> {chip}</li>)}
              </ul>
            </article>
          ))}
        </div>
      )}

      {unchangedTeams.length > 0 ? (
        <section aria-label={labels.unchanged} style={{ marginTop: 13 }}>
          <h4 style={{ margin: '0 0 5px', fontSize: 13 }}>{labels.unchanged}</h4>
          <ul style={{ margin: 0, paddingInlineStart: 20, color: 'var(--app-muted)', fontSize: 12 }}>
            {unchangedTeams.map((team, index) => (
              <li key={`${team.userName || team.teamName || 'unchanged'}-${index}`}>
                {team.teamName || team.userName || labels.unknown}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

export function useLeagueChangesAction() {
  useCopilotAction({
    name: 'get_league_changes',
    description: 'Show planning-to-locked changes for a followed league.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="leagueChanges" />;
      }
      const parsed = safeParse(result);
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }

      return <LeagueChangesCard result={parsed as LeagueChangesResult | undefined} />;
    },
  });
}
