import { useCopilotAction } from '@copilotkit/react-core';
import { Fragment, useId } from 'react';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
import { safeParse } from './safeParse';
import { ToolLoading } from './ToolLoading';
import { directionFor, localeFor, uiLanguageOf } from './uiLanguage';

type Announcement = {
  id?: string | null;
  createdAt?: string | number | null;
  version?: 'standard' | 'wow';
  text?: string;
};

export type WhatsNewResult = {
  status?: 'ok' | 'empty' | 'error';
  lang?: string;
  announcement?: Announcement | null;
};

function formatAnnouncementDate(
  createdAt: Announcement['createdAt'],
  lang: 'en' | 'he',
) {
  const date = new Date(createdAt ?? '');
  if (!Number.isFinite(date.getTime())) return null;

  return new Intl.DateTimeFormat(localeFor(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jerusalem',
  }).format(date);
}

function InlineMarkdown({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*\n]+\*)/g).map((part, index) =>
        part.startsWith('*') && part.endsWith('*') ? (
          <strong key={`${part}-${index}`}>{part.slice(1, -1)}</strong>
        ) : (
          <Fragment key={`${part}-${index}`}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function AnnouncementBody({ text }: { text: string }) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div style={{ display: 'grid', gap: 12, lineHeight: 1.55 }}>
      {blocks.map((block, blockIndex) => {
        const items: string[] = [];
        const prose: string[] = [];
        for (const line of block.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('- ')) {
            items.push(trimmed.slice(2));
          } else if (trimmed) {
            prose.push(trimmed);
          }
        }

        return (
          <section key={`${block.slice(0, 24)}-${blockIndex}`}>
            {prose.map((line, lineIndex) => (
              <p key={`${line}-${lineIndex}`} style={{ margin: lineIndex === 0 ? 0 : '6px 0 0' }}>
                <InlineMarkdown text={line} />
              </p>
            ))}
            {items.length ? (
              <ul style={{ margin: prose.length ? '8px 0 0' : 0, paddingInlineStart: 22 }}>
                {items.map((item, itemIndex) => (
                  <li key={`${item}-${itemIndex}`} style={{ marginTop: itemIndex ? 5 : 0 }}>
                    <InlineMarkdown text={item} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function WhatsNewCard({ result }: { result?: WhatsNewResult }) {
  const headingId = useId();
  const lang = uiLanguageOf(result);
  const labels =
    lang === 'he'
      ? {
          title: 'מה חדש',
          updated: 'עודכן',
          standard: 'עדכון גרסה',
          wow: 'עדכון מיוחד',
          empty: 'עדיין אין הודעות עדכון.',
          emptyHint: 'כאן יופיעו עדכוני הבוט האחרונים.',
          error: 'לא ניתן להציג את העדכון כרגע.',
        }
      : {
          title: "What's new",
          updated: 'Updated',
          standard: 'Release update',
          wow: 'Special release',
          empty: 'No release notes are available yet.',
          emptyHint: 'The latest F1 Fantasy Bot updates will appear here.',
          error: 'The release announcement cannot be displayed right now.',
        };
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
        <p style={{ color: 'var(--app-danger-text)', marginBottom: 0 }}>
          {labels.error}
        </p>
      </section>
    );
  }

  if (result.status === 'empty') {
    return (
      <section aria-labelledby={headingId} dir={directionFor(lang)} style={shellStyle}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 16 }}>{labels.empty}</h3>
        <p style={{ margin: '7px 0 0', color: 'var(--app-muted)' }}>{labels.emptyHint}</p>
      </section>
    );
  }

  const announcement = result.announcement;
  if (result.status !== 'ok' || !announcement || !announcement.text) {
    return (
      <section role="alert" dir={directionFor(lang)} style={shellStyle}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{labels.title}</h3>
        <p style={{ color: 'var(--app-danger-text)', marginBottom: 0 }}>
          {labels.error}
        </p>
      </section>
    );
  }

  const date = formatAnnouncementDate(announcement.createdAt, lang);
  const version = announcement.version === 'wow' ? labels.wow : labels.standard;

  return (
    <article aria-labelledby={headingId} dir={directionFor(lang)} style={shellStyle}>
      <header style={{ borderBottom: '1px solid var(--app-border)', paddingBottom: 10 }}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 18 }}>{labels.title}</h3>
        <div style={{ marginTop: 4, color: 'var(--app-muted)', fontSize: 12 }}>
          {version}
          {date ? ` · ${labels.updated}: ${date}` : ''}
        </div>
      </header>
      <div style={{ marginTop: 12 }}>
        <AnnouncementBody text={announcement.text} />
      </div>
    </article>
  );
}

export function useWhatsNewAction() {
  useCopilotAction({
    name: 'get_whats_new',
    description: 'Show the latest F1 Fantasy Bot release announcement.',
    parameters: [],
    available: 'frontend',
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ToolLoading kind="whatsNew" />;
      }
      const parsed = safeParse(result);
      if (isToolErrorResult(parsed)) return <ToolErrorFallback result={parsed} />;

      return <WhatsNewCard result={parsed as WhatsNewResult | undefined} />;
    },
  });
}
