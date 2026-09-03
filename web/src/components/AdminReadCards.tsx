import { useCopilotAction } from '@copilotkit/react-core';
import { useEffect, type ReactNode } from 'react';
import { isToolErrorResult, ToolErrorFallback } from './ToolErrorFallback';
import { safeParse } from './safeParse';
import { ToolLoading, type ToolLoadingKind } from './ToolLoading';
import {
  directionFor,
  localeFor,
  USER_TIME_ZONE,
  useUiLanguage,
  type UiLanguage,
} from './uiLanguage';

type AdminResult = {
  status?: string;
  lang?: string;
  uiLang?: string;
  summary?: string;
};
type DirectoryUser = {
  chatId?: string | null;
  chatName?: string | null;
  nickname?: string | null;
  lang?: string;
  firstSeen?: string | null;
  lastSeen?: string | null;
  email?: string | null;
  linkedDisplay?: string | null;
  addedAt?: string | null;
  addedBy?: string | null;
};
type Directory = {
  users?: DirectoryUser[];
  totalCount?: number;
  displayedCount?: number;
  truncated?: boolean;
};

export type AdminVersionResult = AdminResult & {
  status?: 'ok' | 'forbidden';
  version?: { commitId?: string; commitMessage?: string; commitLink?: string };
};
export type BillingResult = AdminResult & {
  status?: 'ok' | 'forbidden';
  billing?: {
    currentMonth?: BillingMonth;
    previousMonth?: BillingMonth;
    comparison?: { difference?: number; percentage?: number } | null;
  };
};
type BillingMonth = {
  hasData?: boolean;
  totalCost?: number;
  period?: {
    monthName?: string | null;
    year?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  };
  services?: { serviceName?: string; cost?: number; currency?: string }[];
  totalServices?: number;
  truncated?: boolean;
};
export type BotUsersResult = AdminResult & {
  status?: 'ok' | 'forbidden';
  directory?: Directory;
};
export type WebUsersResult = AdminResult & {
  status?: 'ok' | 'forbidden';
  directory?: Directory;
};
export type BotfatherSetupResult = AdminResult & {
  status?: 'ok' | 'forbidden';
  setup?: {
    commands?: { command?: string; description?: string }[];
    totalCount?: number;
    displayedCount?: number;
    truncated?: boolean;
  };
};

function adminLanguageOf(result: AdminResult | undefined): UiLanguage {
  return result?.lang === 'he' || result?.uiLang === 'he' ? 'he' : 'en';
}

function useResultLanguage(result: AdminResult | undefined): UiLanguage {
  const { setLang } = useUiLanguage();
  const lang = adminLanguageOf(result);

  useEffect(() => {
    setLang(lang);
  }, [lang, setLang]);

  return lang;
}

function labelsFor(lang: UiLanguage) {
  return lang === 'he'
    ? {
        forbidden: 'פעולה זו זמינה למנהלים בלבד.',
        unavailable: 'לא ניתן להציג מידע זה כרגע.',
        showing: 'מוצגות {shown} מתוך {total}',
        more: 'יש תוצאות נוספות, אך התצוגה מוגבלת מטעמי בטיחות.',
        none: 'אין נתונים להצגה.',
        version: 'גרסת פריסה',
        commitId: 'מזהה Commit',
        commitMessage: 'הודעת Commit',
        commitLink: 'קישור ל-Commit',
        billing: 'חיוב Azure',
        currentMonth: 'החודש הנוכחי',
        previousMonth: 'החודש הקודם',
        total: 'סה״כ',
        period: 'תקופה',
        services: 'פילוח שירותים',
        service: 'שירות',
        cost: 'עלות',
        comparison: 'שינוי חודשי',
        botUsers: 'משתמשי הבוט',
        webUsers: 'משתמשי ווב מורשים',
        name: 'שם',
        nickname: 'כינוי',
        chatId: 'מזהה צ׳אט',
        language: 'שפה',
        firstSeen: 'נראה לראשונה',
        lastSeen: 'נראה לאחרונה',
        email: 'אימייל',
        linkedUser: 'משתמש מקושר',
        added: 'נוסף',
        addedBy: 'נוסף על ידי',
        botfather: 'הגדרת BotFather',
        command: 'פקודה',
        description: 'תיאור',
        noBilling: 'אין נתוני חיוב לתקופה זו.',
        increase: 'עלייה',
        decrease: 'ירידה',
        unchanged: 'ללא שינוי',
        unknown: 'לא ידוע',
      }
    : {
        forbidden: 'This action is available only to administrators.',
        unavailable: 'This information cannot be displayed right now.',
        showing: 'Showing {shown} of {total}',
        more: 'More results exist; the display is safely capped.',
        none: 'No data to show.',
        version: 'Deployment version',
        commitId: 'Commit ID',
        commitMessage: 'Commit message',
        commitLink: 'Commit link',
        billing: 'Azure billing',
        currentMonth: 'Current month',
        previousMonth: 'Previous month',
        total: 'Total',
        period: 'Period',
        services: 'Service breakdown',
        service: 'Service',
        cost: 'Cost',
        comparison: 'Month-over-month change',
        botUsers: 'Bot users',
        webUsers: 'Allowed web users',
        name: 'Name',
        nickname: 'Nickname',
        chatId: 'Chat ID',
        language: 'Language',
        firstSeen: 'First seen',
        lastSeen: 'Last seen',
        email: 'Email',
        linkedUser: 'Linked user',
        added: 'Added',
        addedBy: 'Added by',
        botfather: 'BotFather setup',
        command: 'Command',
        description: 'Description',
        noBilling: 'No billing data is available for this period.',
        increase: 'Increase',
        decrease: 'Decrease',
        unchanged: 'No change',
        unknown: 'Unknown',
      };
}

const shellStyle = {
  margin: '8px 0',
  padding: 14,
  border: '1px solid var(--app-border)',
  borderRadius: 10,
  background: 'var(--app-surface)',
} as const;

function Shell({
  title,
  lang,
  children,
}: {
  title: string;
  lang: UiLanguage;
  children: ReactNode;
}) {
  return (
    <article aria-label={title} dir={directionFor(lang)} style={shellStyle}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {children}
    </article>
  );
}

function Forbidden({
  result,
  lang,
}: {
  result?: AdminResult;
  lang: UiLanguage;
}) {
  const labels = labelsFor(lang);
  return (
    <Shell title={labels.forbidden} lang={lang}>
      <p role="alert" style={{ marginBottom: 0 }}>
        {result?.summary || labels.forbidden}
      </p>
    </Shell>
  );
}

function Unavailable({ title, lang }: { title: string; lang: UiLanguage }) {
  return (
    <Shell title={title} lang={lang}>
      <p role="alert" style={{ marginBottom: 0 }}>
        {labelsFor(lang).unavailable}
      </p>
    </Shell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt style={{ color: 'var(--app-muted)', fontSize: 12 }}>{label}</dt>
      <dd
        style={{ margin: '3px 0 0', fontWeight: 700, overflowWrap: 'anywhere' }}
      >
        {value}
      </dd>
    </div>
  );
}

function localDate(
  value: string | null | undefined,
  lang: UiLanguage,
  unknown: string,
) {
  if (!value || Number.isNaN(Date.parse(value))) return unknown;
  return new Intl.DateTimeFormat(localeFor(lang), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: USER_TIME_ZONE,
  }).format(new Date(value));
}

function money(
  value: number | undefined,
  currency: string | undefined,
  lang: UiLanguage,
) {
  const amount =
    typeof value === 'number' && Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(localeFor(lang), {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function DirectoryNotice({
  directory,
  lang,
}: {
  directory: Directory;
  lang: UiLanguage;
}) {
  const labels = labelsFor(lang);
  if (!directory.totalCount) return null;
  const showing = labels.showing
    .replace('{shown}', String(directory.displayedCount ?? 0))
    .replace('{total}', String(directory.totalCount));
  return (
    <>
      <p style={{ color: 'var(--app-muted)', margin: '7px 0 0' }}>{showing}</p>
      {directory.truncated ? (
        <p style={{ color: 'var(--app-muted)', marginBottom: 0 }}>
          {labels.more}
        </p>
      ) : null}
    </>
  );
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 12,
  fontSize: 13,
} as const;
const cellStyle = {
  padding: '8px 6px',
  borderBottom: '1px solid var(--app-border)',
  textAlign: 'start',
  verticalAlign: 'top',
} as const;
function Table({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>{children}</table>
    </div>
  );
}
function Th({ children }: { children: ReactNode }) {
  return (
    <th scope="col" style={{ ...cellStyle, color: 'var(--app-muted)' }}>
      {children}
    </th>
  );
}
function Td({ children }: { children: ReactNode }) {
  return <td style={cellStyle}>{children}</td>;
}

export function AdminVersionCard({ result }: { result?: AdminVersionResult }) {
  const lang = useResultLanguage(result);
  const labels = labelsFor(lang);
  if (result?.status === 'forbidden')
    return <Forbidden result={result} lang={lang} />;
  if (result?.status !== 'ok')
    return <Unavailable title={labels.version} lang={lang} />;
  const version = result.version || {};
  return (
    <Shell title={labels.version} lang={lang}>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px 16px',
          margin: '14px 0 0',
        }}
      >
        <Metric label={labels.commitId} value={version.commitId || 'N/A'} />
        <Metric
          label={labels.commitMessage}
          value={version.commitMessage || 'N/A'}
        />
        <Metric label={labels.commitLink} value={version.commitLink || 'N/A'} />
      </dl>
    </Shell>
  );
}

function BillingMonthCard({
  month,
  title,
  lang,
}: {
  month?: BillingMonth;
  title: string;
  lang: UiLanguage;
}) {
  const labels = labelsFor(lang);
  if (!month?.hasData)
    return (
      <section>
        <h4 style={{ marginBottom: 6 }}>{title}</h4>
        <p style={{ margin: 0 }}>{labels.noBilling}</p>
      </section>
    );
  const period =
    [month.period?.monthName, month.period?.year].filter(Boolean).join(' ') ||
    labels.unknown;
  return (
    <section>
      <h4 style={{ marginBottom: 6 }}>{title}</h4>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))',
          gap: '8px 12px',
          margin: 0,
        }}
      >
        <Metric
          label={labels.total}
          value={money(month.totalCost, month.services?.[0]?.currency, lang)}
        />
        <Metric label={labels.period} value={period} />
      </dl>
      <h5 style={{ margin: '14px 0 0' }}>{labels.services}</h5>
      {month.services?.length ? (
        <Table>
          <thead>
            <tr>
              <Th>{labels.service}</Th>
              <Th>{labels.cost}</Th>
            </tr>
          </thead>
          <tbody>
            {month.services.map((service, index) => (
              <tr key={`${service.serviceName}-${index}`}>
                <Td>{service.serviceName || labels.unknown}</Td>
                <Td>{money(service.cost, service.currency, lang)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p style={{ color: 'var(--app-muted)', marginBottom: 0 }}>
          {labels.none}
        </p>
      )}
      {month.truncated ? (
        <p style={{ color: 'var(--app-muted)', marginBottom: 0 }}>
          {labels.more}
        </p>
      ) : null}
    </section>
  );
}

export function BillingStatsCard({ result }: { result?: BillingResult }) {
  const lang = useResultLanguage(result);
  const labels = labelsFor(lang);
  if (result?.status === 'forbidden')
    return <Forbidden result={result} lang={lang} />;
  if (result?.status !== 'ok')
    return <Unavailable title={labels.billing} lang={lang} />;
  const comparison = result.billing?.comparison;
  const comparisonDifference = comparison?.difference ?? 0;
  const comparisonLabel = comparison
    ? comparisonDifference === 0
      ? labels.unchanged
      : comparisonDifference > 0
        ? labels.increase
        : labels.decrease
    : null;
  return (
    <Shell title={labels.billing} lang={lang}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 20,
          marginTop: 14,
        }}
      >
        <BillingMonthCard
          month={result.billing?.currentMonth}
          title={labels.currentMonth}
          lang={lang}
        />
        <BillingMonthCard
          month={result.billing?.previousMonth}
          title={labels.previousMonth}
          lang={lang}
        />
      </div>
      {comparison && comparisonLabel ? (
        <p style={{ marginBottom: 0 }}>
          <strong>{labels.comparison}:</strong> {comparisonLabel}{' '}
          {money(Math.abs(comparisonDifference), 'USD', lang)} (
          {comparison.percentage ?? 0}%)
        </p>
      ) : null}
    </Shell>
  );
}

export function BotUsersCard({ result }: { result?: BotUsersResult }) {
  const lang = useResultLanguage(result);
  const labels = labelsFor(lang);
  if (result?.status === 'forbidden')
    return <Forbidden result={result} lang={lang} />;
  if (result?.status !== 'ok')
    return <Unavailable title={labels.botUsers} lang={lang} />;
  const directory = result.directory || {};
  return (
    <Shell title={labels.botUsers} lang={lang}>
      <DirectoryNotice directory={directory} lang={lang} />
      {directory.users?.length ? (
        <Table>
          <thead>
            <tr>
              <Th>{labels.name}</Th>
              <Th>{labels.chatId}</Th>
              <Th>{labels.language}</Th>
              <Th>{labels.lastSeen}</Th>
              <Th>{labels.firstSeen}</Th>
            </tr>
          </thead>
          <tbody>
            {directory.users.map((user, index) => (
              <tr key={`${user.chatId}-${index}`}>
                <Td>{user.nickname || user.chatName || labels.unknown}</Td>
                <Td>
                  <code>{user.chatId || '—'}</code>
                </Td>
                <Td>{user.lang === 'he' ? 'עברית' : 'English'}</Td>
                <Td>{localDate(user.lastSeen, lang, labels.unknown)}</Td>
                <Td>{localDate(user.firstSeen, lang, labels.unknown)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p style={{ marginBottom: 0 }}>{labels.none}</p>
      )}
    </Shell>
  );
}

export function WebUsersCard({ result }: { result?: WebUsersResult }) {
  const lang = useResultLanguage(result);
  const labels = labelsFor(lang);
  if (result?.status === 'forbidden')
    return <Forbidden result={result} lang={lang} />;
  if (result?.status !== 'ok')
    return <Unavailable title={labels.webUsers} lang={lang} />;
  const directory = result.directory || {};
  return (
    <Shell title={labels.webUsers} lang={lang}>
      <DirectoryNotice directory={directory} lang={lang} />
      {directory.users?.length ? (
        <Table>
          <thead>
            <tr>
              <Th>{labels.email}</Th>
              <Th>{labels.linkedUser}</Th>
              <Th>{labels.chatId}</Th>
              <Th>{labels.added}</Th>
              <Th>{labels.addedBy}</Th>
            </tr>
          </thead>
          <tbody>
            {directory.users.map((user, index) => (
              <tr key={`${user.email}-${index}`}>
                <Td>{user.email || '—'}</Td>
                <Td>{user.linkedDisplay || labels.unknown}</Td>
                <Td>
                  <code>{user.chatId || '—'}</code>
                </Td>
                <Td>{localDate(user.addedAt, lang, labels.unknown)}</Td>
                <Td>
                  <code>{user.addedBy || '—'}</code>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p style={{ marginBottom: 0 }}>{labels.none}</p>
      )}
    </Shell>
  );
}

export function BotfatherSetupCard({
  result,
}: {
  result?: BotfatherSetupResult;
}) {
  const lang = useResultLanguage(result);
  const labels = labelsFor(lang);
  if (result?.status === 'forbidden')
    return <Forbidden result={result} lang={lang} />;
  if (result?.status !== 'ok')
    return <Unavailable title={labels.botfather} lang={lang} />;
  const setup = result.setup || {};
  return (
    <Shell title={labels.botfather} lang={lang}>
      <DirectoryNotice
        directory={{
          totalCount: setup.totalCount,
          displayedCount: setup.displayedCount,
          truncated: setup.truncated,
        }}
        lang={lang}
      />
      {setup.commands?.length ? (
        <Table>
          <thead>
            <tr>
              <Th>{labels.command}</Th>
              <Th>{labels.description}</Th>
            </tr>
          </thead>
          <tbody>
            {setup.commands.map((command, index) => (
              <tr key={`${command.command}-${index}`}>
                <Td>
                  <code>/{command.command || ''}</code>
                </Td>
                <Td>{command.description || labels.unknown}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <p style={{ marginBottom: 0 }}>{labels.none}</p>
      )}
    </Shell>
  );
}

function renderAdminAction<T extends AdminResult>({
  status,
  result,
  loadingKind,
  Card,
}: {
  status: string;
  result: unknown;
  loadingKind: ToolLoadingKind;
  Card: ({ result }: { result?: T }) => ReactNode;
}) {
  if (status === 'inProgress' || status === 'executing')
    return <ToolLoading kind={loadingKind} />;
  const parsed = safeParse(result);
  if (isToolErrorResult(parsed)) return <ToolErrorFallback result={parsed} />;
  return <Card result={parsed as T | undefined} />;
}

export function useAdminVersionAction() {
  useCopilotAction({
    name: 'get_admin_version',
    description: 'Show the admin deployment version.',
    parameters: [],
    available: 'frontend',
    render: (props) =>
      renderAdminAction<AdminVersionResult>({
        ...props,
        loadingKind: 'adminVersion',
        Card: AdminVersionCard,
      }),
  });
}
export function useBillingStatsAction() {
  useCopilotAction({
    name: 'get_billing_stats',
    description: 'Show safe admin billing statistics.',
    parameters: [],
    available: 'frontend',
    render: (props) =>
      renderAdminAction<BillingResult>({
        ...props,
        loadingKind: 'billingStats',
        Card: BillingStatsCard,
      }),
  });
}
export function useBotUsersAction() {
  useCopilotAction({
    name: 'list_bot_users',
    description: 'Show the admin bot-user directory.',
    parameters: [],
    available: 'frontend',
    render: (props) =>
      renderAdminAction<BotUsersResult>({
        ...props,
        loadingKind: 'botUsers',
        Card: BotUsersCard,
      }),
  });
}
export function useWebUsersAction() {
  useCopilotAction({
    name: 'list_web_users',
    description: 'Show the admin web-user directory.',
    parameters: [],
    available: 'frontend',
    render: (props) =>
      renderAdminAction<WebUsersResult>({
        ...props,
        loadingKind: 'webUsers',
        Card: WebUsersCard,
      }),
  });
}
export function useBotfatherSetupAction() {
  useCopilotAction({
    name: 'get_botfather_setup',
    description: 'Show the admin BotFather command setup.',
    parameters: [],
    available: 'frontend',
    render: (props) =>
      renderAdminAction<BotfatherSetupResult>({
        ...props,
        loadingKind: 'botfatherSetup',
        Card: BotfatherSetupCard,
      }),
  });
}
