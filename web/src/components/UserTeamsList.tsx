import { useId, useState } from 'react';
import { directionFor, uiLanguageOf, type UiLanguage } from './uiLanguage';

export type UserTeam = {
  teamId: string;
  teamName: string;
  isLeague: boolean;
  isSelected: boolean;
  chip: string | null;
  drivers: string[];
  constructors: string[];
  boost: string | null;
  freeTransfers: number | null;
  costCapRemaining: number | null;
};

export type ListUserTeamsResult = {
  lang?: string;
  teams?: UserTeam[];
};

function chipBadge(chip: string | null, lang: UiLanguage) {
  if (!chip) return null;
  const chipLabels: Record<string, string> =
    lang === 'he'
      ? {
          EXTRA_BOOST: 'אקסטרה בוסט',
          WILDCARD: 'ווילדקארד',
          LIMITLESS: 'ללא הגבלה',
          WITHOUT_CHIP: "ללא צ'יפ",
        }
      : {};
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: 'var(--app-warning-surface)',
        color: 'var(--app-warning-text)',
        marginInlineStart: 6,
      }}
    >
      {chipLabels[chip] ?? chip.replace('_', ' ').toLowerCase()}
    </span>
  );
}

export function UserTeamsList({
  result,
  onSelectTeam,
}: {
  result?: ListUserTeamsResult;
  onSelectTeam?: (team: UserTeam) => Promise<void> | void;
}) {
  const lang = uiLanguageOf(result);
  const cardIdPrefix = useId();
  const [selectingTeamId, setSelectingTeamId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const labels =
    lang === 'he'
      ? {
          empty:
            'אין קבוצות במעקב. יש להשתמש ב-/follow_league וב-/teams_tracker בבוט הטלגרם.',
          active: 'פעילה',
          league: 'ליגה',
          screenshot: 'צילום מסך',
          drivers: 'נהגים',
          constructors: 'קבוצות',
          boost: 'קפטן',
          freeTransfers: 'העברות חינם',
          capLeft: 'נותרו בתקציב',
          select: 'החלף לקבוצה',
          selecting: 'מכין אישור…',
          selectionError: 'לא ניתן להתחיל את בחירת הקבוצה. נסה שוב.',
          selectHint:
            'כדי להחליף קבוצה, לחץ על "החלף לקבוצה" בכרטיס הרצוי. לאחר מכן יוצג כרטיס אישור.',
        }
      : {
          empty:
            'No tracked teams. Run /follow_league + /teams_tracker in the Telegram bot first.',
          active: 'ACTIVE',
          league: 'league',
          screenshot: 'screenshot',
          drivers: 'Drivers',
          constructors: 'Constructors',
          boost: 'Boost',
          freeTransfers: 'free transfers',
          capLeft: 'cap left',
          select: 'Switch to this team',
          selecting: 'Preparing confirmation…',
          selectionError: 'Unable to start team selection. Please try again.',
          selectHint:
            'To change teams, click "Switch to this team" on the card you want. An approval card will appear next.',
        };
  const teams = result?.teams ?? [];
  if (teams.length === 0) {
    return (
      <div
        dir={directionFor(lang)}
        style={{ padding: 12, color: 'var(--app-muted)' }}
      >
        {labels.empty}
      </div>
    );
  }

  async function selectTeam(team: UserTeam) {
    if (!onSelectTeam || team.isSelected || selectingTeamId) return;

    setSelectingTeamId(team.teamId);
    setSelectionError('');
    try {
      await onSelectTeam(team);
    } catch {
      setSelectionError(labels.selectionError);
    } finally {
      setSelectingTeamId(null);
    }
  }

  return (
    <div dir={directionFor(lang)} style={{ margin: '8px 0' }}>
      {onSelectTeam ? (
        <div
          style={{
            marginBottom: 8,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--app-primary-surface)',
            color: 'var(--app-primary)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {labels.selectHint}
        </div>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 8,
        }}
      >
        {teams.map((team, index) => {
          const detailsId = `${cardIdPrefix}-team-${index}`;
          const teamSource = team.isLeague
            ? labels.league
            : labels.screenshot;
          const drivers =
            team.drivers.length > 0 ? team.drivers.join(', ') : '—';
          const constructors =
            team.constructors.length > 0
              ? team.constructors.join(', ')
              : '—';

          return (
            <div key={team.teamId}>
              <button
                type="button"
                className="user-team-card"
                data-active={team.isSelected ? 'true' : 'false'}
                data-selectable={
                  onSelectTeam && !team.isSelected && !selectingTeamId
                    ? 'true'
                    : 'false'
                }
                disabled={
                  !onSelectTeam || team.isSelected || selectingTeamId !== null
                }
                aria-pressed={team.isSelected}
                aria-describedby={detailsId}
                aria-label={
                  team.isSelected
                    ? `${team.teamName}, ${labels.active}`
                    : `${labels.select}: ${team.teamName}`
                }
                onClick={() => void selectTeam(team)}
              >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <strong style={{ fontSize: 15 }}>{team.teamName}</strong>
              {team.isSelected ? (
                <span
                  style={{
                    marginInlineStart: 6,
                    fontSize: 11,
                    color: 'var(--app-primary)',
                    fontWeight: 600,
                  }}
                >
                  {labels.active}
                </span>
              ) : null}
              {chipBadge(team.chip, lang)}
            </div>
            <div
              style={{ color: 'var(--app-muted)', fontSize: 11, marginTop: 2 }}
            >
              id: <code>{team.teamId}</code>
              {` · ${teamSource}`}
            </div>
            <div style={{ marginTop: 6, color: 'var(--app-muted)' }}>
              <div>
                <span style={{ color: 'var(--app-subtle)', fontSize: 11 }}>
                  {labels.drivers}:{' '}
                </span>
                {drivers}
              </div>
              <div>
                <span style={{ color: 'var(--app-subtle)', fontSize: 11 }}>
                  {labels.constructors}:{' '}
                </span>
                {constructors}
              </div>
              <div>
                <span style={{ color: 'var(--app-subtle)', fontSize: 11 }}>
                  {labels.boost}:{' '}
                </span>
                {team.boost ?? '—'}
              </div>
              <div
                style={{
                  color: 'var(--app-muted)',
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                {team.freeTransfers != null
                  ? `${team.freeTransfers} ${labels.freeTransfers}`
                  : ''}
                {team.costCapRemaining != null
                  ? ` · ${team.costCapRemaining.toFixed?.(1) ?? team.costCapRemaining} ${labels.capLeft}`
                  : ''}
              </div>
            </div>
            {!team.isSelected && onSelectTeam ? (
              <span className="user-team-card__action">
                {selectingTeamId === team.teamId
                  ? labels.selecting
                  : labels.select}
              </span>
            ) : null}
              </button>
              <span id={detailsId} className="visually-hidden">
                {`id: ${team.teamId}. ${teamSource}. ${labels.drivers}: ${drivers}. ${labels.constructors}: ${constructors}. ${labels.boost}: ${team.boost ?? '—'}.`}
              </span>
            </div>
          );
        })}
      </div>
      {selectionError ? (
        <div
          role="alert"
          style={{
            marginTop: 8,
            color: 'var(--app-danger-text)',
            fontSize: 12,
          }}
        >
          {selectionError}
        </div>
      ) : null}
    </div>
  );
}
