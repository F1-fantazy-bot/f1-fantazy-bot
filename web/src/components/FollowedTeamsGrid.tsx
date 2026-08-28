import { useCopilotAction } from '@copilotkit/react-core';
import { useState } from 'react';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { directionFor, uiLanguageOf } from './uiLanguage';
import { ToolLoading } from './ToolLoading';
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

type LeagueRow = {
  leagueCode: string;
  leagueName: string;
  position: number | null;
};

export type FollowedTeam = {
  teamId: string;
  teamName: string;
  leagues: LeagueRow[];
  isSelected: boolean;
};

export type ListFollowedTeamsResult = {
  lang?: string;
  status?: 'ok' | 'empty';
  teams?: FollowedTeam[];
  selectionMode?: 'unfollow_team';
};

function positionStyle(position: number | null): {
  background: string;
  color: string;
} {
  if (position === 1)
    return {
      background: 'var(--app-warning-surface)',
      color: 'var(--app-warning-text)',
    };
  if (position && position <= 3)
    return {
      background: 'var(--app-primary-surface)',
      color: 'var(--app-primary-strong)',
    };
  return {
    background: 'var(--app-control-bg)',
    color: 'var(--app-control-text)',
  };
}

export function FollowedTeamsGrid({
  result,
  onUnfollowTeam,
  selectionLocked = false,
}: {
  result?: ListFollowedTeamsResult;
  onUnfollowTeam?: (team: FollowedTeam) => void;
  selectionLocked?: boolean;
}) {
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          empty:
            'עדיין אין קבוצות ליגה במעקב. יש להשתמש ב-/follow_league וב-/teams_tracker בבוט הטלגרם.',
          active: 'פעילה',
          noLeagues: '(לא נמצאו ליגות עבור קבוצה זו)',
          positionPrefix: 'מ',
          remove: 'הסר ממעקב',
        }
      : {
          empty:
            'No tracked league teams yet. Run /follow_league + /teams_tracker in the Telegram bot first.',
          active: 'ACTIVE',
          noLeagues: '(no leagues resolved for this team)',
          positionPrefix: 'P',
          remove: 'Stop tracking',
        };
  if (
    result?.status === 'empty' ||
    !result?.teams ||
    result.teams.length === 0
  ) {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.empty}
      </div>
    );
  }

  return (
    <div
      dir={directionFor(lang)}
      style={{
        margin: '8px 0',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 10,
      }}
    >
      {result.teams.map((team) => (
        <div
          key={team.teamId}
          style={{
            border: team.isSelected
              ? '2px solid var(--app-primary)'
              : '1px solid var(--app-border)',
            borderRadius: 10,
            padding: '12px 14px',
            background: 'var(--app-surface)',
            fontSize: 13,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            <strong style={{ fontSize: 15 }}>{team.teamName}</strong>
            {team.isSelected ? (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--app-primary)',
                  fontWeight: 700,
                  letterSpacing: 0,
                }}
              >
                {labels.active}
              </span>
            ) : null}
          </div>
          <div
            style={{ color: 'var(--app-subtle)', fontSize: 11, marginTop: 2 }}
          >
            id: <code>{team.teamId}</code>
          </div>
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {team.leagues.length === 0 ? (
              <div style={{ color: 'var(--app-subtle)', fontSize: 12 }}>
                {labels.noLeagues}
              </div>
            ) : (
              team.leagues.map((row) => {
                const pos = row.position;
                const chip = positionStyle(pos);
                return (
                  <div
                    key={`${team.teamId}:${row.leagueCode}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span style={{ color: 'var(--app-control-text)' }}>
                      {row.leagueName}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: chip.background,
                        color: chip.color,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pos === null ? '—' : `${labels.positionPrefix}${pos}`}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          {onUnfollowTeam ? (
            <button
              type="button"
              onClick={() => onUnfollowTeam(team)}
              disabled={selectionLocked}
              aria-label={`${labels.remove}: ${team.teamName}`}
              style={{
                marginTop: 12,
                border: '1px solid var(--app-danger-border)',
                borderRadius: 6,
                background: 'var(--app-danger-surface)',
                color: 'var(--app-danger-text)',
                padding: '6px 10px',
                fontWeight: 700,
                cursor: selectionLocked ? 'wait' : 'pointer',
                opacity: selectionLocked ? 0.6 : 1,
              }}
            >
              {labels.remove}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function InteractiveFollowedTeams({
  result,
}: {
  result?: ListFollowedTeamsResult;
}) {
  const { propose } = useWriteDecision();
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [confirmation, setConfirmation] =
    useState<WriteConfirmationRequired | null>(null);
  const [feedback, setFeedback] = useState<WriteResult | null>(null);
  const [removedTeamIds, setRemovedTeamIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedOverride, setSelectedOverride] = useState<
    string | null | undefined
  >(undefined);
  const [errorMessage, setErrorMessage] = useState('');
  const canSelect = result?.selectionMode === 'unfollow_team';
  const lang = uiLanguageOf(result);
  const isHebrew = lang === 'he';
  const labels = isHebrew
    ? {
        error: 'לא ניתן להכין את הסרת הקבוצה. נסה שוב.',
        uncertain:
          'לא ניתן לאמת אם הקבוצה הוסרה. רענן את הקבוצות במעקב לפני ניסיון נוסף.',
      }
    : {
        error: 'Unable to prepare the team removal. Please try again.',
        uncertain:
          'The final status could not be verified. Refresh your followed teams before trying again.',
      };
  const displayedResult = result?.teams
    ? {
        ...result,
        teams: result.teams
          .filter((team) => !removedTeamIds.has(team.teamId))
          .map((team) =>
            selectedOverride === undefined
              ? team
              : { ...team, isSelected: team.teamId === selectedOverride },
          ),
      }
    : result;

  async function unfollowTeam(team: FollowedTeam) {
    if (!canSelect || selectedTeamId) return;
    setSelectedTeamId(team.teamId);
    setFeedback(null);
    setErrorMessage('');
    try {
      const proposal = await propose('follow_team', {
        action: 'remove',
        teamId: team.teamId,
      });
      if (isConfirmationRequired(proposal)) {
        setConfirmation(proposal);

        return;
      }
      if (isWriteResult(proposal)) {
        setFeedback(proposal);
        setSelectedTeamId('');

        return;
      }
      throw new Error('Unexpected unfollow-team proposal response');
    } catch {
      setSelectedTeamId('');
      setErrorMessage(labels.error);
    }
  }

  return (
    <>
      <FollowedTeamsGrid
        result={displayedResult}
        onUnfollowTeam={canSelect ? unfollowTeam : undefined}
        selectionLocked={Boolean(selectedTeamId)}
      />
      {confirmation ? (
        <WriteConfirmCard
          result={confirmation}
          directConfirm
          directConfirmErrorMessage={labels.uncertain}
          onSettled={(outcome, message, finalResult) => {
            if (outcome === 'confirmed' && finalResult) {
              setFeedback(finalResult);
              setConfirmation(null);
              setSelectedTeamId('');
              if (finalResult.status === 'ok') {
                const removedId = finalResult.teamId || selectedTeamId;
                setRemovedTeamIds((current) => {
                  const next = new Set(current);
                  next.add(removedId);

                  return next;
                });
                setSelectedOverride(finalResult.fallbackSelectedTeam);
              }
            }
            if (outcome === 'cancelled' || outcome === 'error') {
              setSelectedTeamId('');
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
          dir={directionFor(lang)}
          style={{
            color: 'var(--app-danger-text)',
            fontSize: 12,
            marginTop: 8,
          }}
        >
          {errorMessage}
        </div>
      ) : null}
    </>
  );
}

export function useFollowedTeamsAction() {
  useCopilotAction({
    name: 'list_followed_teams',
    description:
      "List the user's followed F1 Fantasy teams enriched with each league they appear in and their current position.",
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="followedTeams" />;
      }
      const parsed = typeof result === 'string' ? safeParse(result) : result;
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }
      return (
        <InteractiveFollowedTeams
          result={parsed as ListFollowedTeamsResult | undefined}
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
