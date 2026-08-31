import { useCopilotAction } from '@copilotkit/react-core';
import { ToolErrorFallback, isToolErrorResult } from './ToolErrorFallback';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';
import { directionFor, uiLanguageOf } from './uiLanguage';

type GuideTask = {
  id: string;
  topic: string;
  icon: string;
  title: string;
  description: string;
  example: string;
};

type GuideSection = {
  topic: string;
  tasks: GuideTask[];
};

export type AgentGuideResult = {
  status?: 'ok' | 'forbidden';
  topic?: string;
  lang?: string;
  title?: string;
  intro?: string;
  summary?: string;
  profile?: {
    teamCount?: number;
    followedTeamCount?: number;
    leagueCount?: number;
    hasSimulationData?: boolean;
    hasProjectionData?: boolean;
  };
  recommendations?: GuideTask[];
  sections?: GuideSection[];
  notices?: string[];
};

const topicLabels: Record<string, { en: string; he: string }> = {
  teams: { en: 'Team strategy', he: 'אסטרטגיית קבוצה' },
  leagues: { en: 'League room', he: 'מתחם הליגות' },
  races: { en: 'Race weekend', he: 'סוף שבוע המרוץ' },
  settings: { en: 'Settings & support', he: 'הגדרות ותמיכה' },
  admin: { en: 'Admin paddock', he: 'מתחם ניהול' },
};

function TaskCard({
  task,
  recommended = false,
  exampleLabel,
}: {
  task: GuideTask;
  recommended?: boolean;
  exampleLabel: string;
}) {
  return (
    <article
      style={{
        position: 'relative',
        overflow: 'hidden',
        border: recommended
          ? '1px solid var(--app-warning-text)'
          : '1px solid var(--app-border)',
        borderRadius: 10,
        background: recommended
          ? 'var(--app-highlight-surface)'
          : 'var(--app-surface-muted)',
        padding: '13px 14px 12px',
        minHeight: 135,
      }}
    >
      {recommended ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            insetInlineStart: 0,
            top: 0,
            bottom: 0,
            width: 4,
            background: 'var(--app-warning-text)',
          }}
        />
      ) : null}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 7,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 19 }}>
          {task.icon}
        </span>
        <strong style={{ fontSize: 14 }}>{task.title}</strong>
      </div>
      <div
        style={{
          color: 'var(--app-muted)',
          fontSize: 12,
          lineHeight: 1.45,
          marginBottom: 10,
        }}
      >
        {task.description}
      </div>
      <div
        style={{
          borderTop: '1px dashed var(--app-control-border)',
          paddingTop: 8,
          color: 'var(--app-control-text)',
          fontSize: 11,
          lineHeight: 1.4,
        }}
      >
        <span
          style={{
            color: 'var(--app-subtle)',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {exampleLabel}
        </span>
        <div style={{ marginTop: 3 }}>&ldquo;{task.example}&rdquo;</div>
      </div>
    </article>
  );
}

export function AgentGuideCard({
  result,
}: {
  result?: AgentGuideResult;
}) {
  const lang = uiLanguageOf(result);
  const isHebrew = lang === 'he';
  const labels = isHebrew
    ? {
        recommended: 'ההמלצה הבאה שלך',
        eyebrow: 'F1 FANTASY · עמדת פיקוד',
        profile: 'מצב הפיט',
        teams: 'קבוצות',
        tracked: 'במעקב',
        leagues: 'ליגות',
        projections: 'תחזית',
        ready: 'מוכן',
        missing: 'חסר',
        example: 'נסה לשאול',
      }
    : {
        recommended: 'Your next move',
        eyebrow: 'F1 FANTASY · PIT WALL',
        profile: 'Pit status',
        teams: 'Teams',
        tracked: 'Tracked',
        leagues: 'Leagues',
        projections: 'Projections',
        ready: 'Ready',
        missing: 'Missing',
        example: 'Try asking',
      };

  if (result?.status === 'forbidden') {
    return (
      <div
        role="status"
        dir={directionFor(lang)}
        style={{
          border: '1px solid var(--app-danger-border)',
          borderRadius: 10,
          background: 'var(--app-danger-surface)',
          color: 'var(--app-danger-text)',
          padding: 14,
        }}
      >
        {result.summary}
      </div>
    );
  }

  const recommendations = result?.recommendations || [];
  const sections = result?.sections || [];
  const profile = result?.profile || {};

  return (
    <section
      aria-label={result?.title || 'F1 Fantasy agent guide'}
      dir={directionFor(lang)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid var(--app-border)',
        borderRadius: 14,
        background: 'var(--app-surface)',
        color: 'var(--app-text)',
        padding: 16,
        margin: '8px 0',
        boxShadow: 'var(--app-shadow)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          insetInlineStart: 0,
          insetInlineEnd: 0,
          height: 4,
          background:
            'linear-gradient(90deg, var(--app-primary), var(--app-warning-text), var(--app-primary))',
        }}
      />
      <header style={{ paddingTop: 4, marginBottom: 14 }}>
        <div
          style={{
            color: 'var(--app-subtle)',
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginBottom: 5,
          }}
        >
          {labels.eyebrow}
        </div>
        <h3 style={{ margin: 0, fontSize: 21, lineHeight: 1.15 }}>
          {result?.title}
        </h3>
        <p
          style={{
            margin: '7px 0 0',
            color: 'var(--app-muted)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {result?.intro}
        </p>
      </header>

      <div
        role="group"
        aria-label={labels.profile}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 7,
          marginBottom: 16,
        }}
      >
        {[
          [labels.teams, profile.teamCount ?? 0],
          [labels.tracked, profile.followedTeamCount ?? 0],
          [labels.leagues, profile.leagueCount ?? 0],
          [
            labels.projections,
            profile.hasProjectionData ? labels.ready : labels.missing,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{
              border: '1px solid var(--app-control-border)',
              borderRadius: 8,
              background: 'var(--app-control-bg)',
              padding: '8px 9px',
            }}
          >
            <div
              style={{
                color: 'var(--app-subtle)',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {recommendations.length > 0 ? (
        <section style={{ marginBottom: 17 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>
            {labels.recommended}
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))',
              gap: 8,
            }}
          >
            {recommendations.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                recommended
                exampleLabel={labels.example}
              />
            ))}
          </div>
        </section>
      ) : null}

      {sections.map((section) => (
        <section key={section.topic} style={{ marginTop: 15 }}>
          <h4
            style={{
              margin: '0 0 8px',
              color: 'var(--app-primary-strong)',
              fontSize: 13,
            }}
          >
            {topicLabels[section.topic]?.[isHebrew ? 'he' : 'en'] ||
              section.topic}
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))',
              gap: 8,
            }}
          >
            {section.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                exampleLabel={labels.example}
              />
            ))}
          </div>
        </section>
      ))}

      {(result?.notices || []).map((notice) => (
        <div
          key={notice}
          style={{
            marginTop: 12,
            borderInlineStart: '3px solid var(--app-warning-text)',
            background: 'var(--app-warning-surface)',
            color: 'var(--app-warning-text)',
            padding: '7px 9px',
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          {notice}
        </div>
      ))}
    </section>
  );
}

export function useAgentGuideAction() {
  useCopilotAction({
    name: 'get_agent_guide',
    description:
      'Show personalized help, onboarding, example prompts, and capability guidance.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="guide" />;
      }
      const parsed = safeParse(result);
      if (isToolErrorResult(parsed)) {
        return <ToolErrorFallback result={parsed} />;
      }

      return <AgentGuideCard result={parsed as AgentGuideResult | undefined} />;
    },
  });
}
