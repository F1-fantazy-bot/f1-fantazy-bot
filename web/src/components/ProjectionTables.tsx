export type ProjectionRow = {
  code?: string;
  price?: number | null;
  expectedPoints?: number | null;
  expectedPriceChange?: number | null;
};

export type ProjectionData = {
  drivers?: ProjectionRow[];
  constructors?: ProjectionRow[];
};

type Language = 'en' | 'he';

function formatNumber(value: number | null | undefined, lang: Language) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';

  return new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPriceChange(value: number | null | undefined, lang: Language) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';

  return `${value > 0 ? '+' : ''}${formatNumber(value, lang)}`;
}

function ProjectionTable({
  title,
  rows,
  lang,
  empty,
}: {
  title: string;
  rows?: ProjectionRow[];
  lang: Language;
  empty: string;
}) {
  const labels =
    lang === 'he'
      ? { code: 'קוד', points: 'נקודות חזויות', price: 'מחיר (M)', change: 'שינוי (M)' }
      : { code: 'Code', points: 'Projected pts', price: 'Price (M)', change: 'Price Δ (M)' };
  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <section
      style={{
        background: 'var(--app-surface-muted)',
        border: '1px solid var(--app-border)',
        borderRadius: 10,
        flex: '1 1 340px',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <h4
        style={{
          borderBottom: '1px solid var(--app-border)',
          margin: 0,
          padding: '10px 12px',
          fontSize: 14,
        }}
      >
        {title}
      </h4>
      {safeRows.length === 0 ? (
        <p style={{ color: 'var(--app-muted)', margin: '12px' }}>{empty}</p>
      ) : (
        <div style={{ maxHeight: 300, overflow: 'auto', padding: '4px 12px 12px' }}>
          <table
            aria-label={title}
            style={{ borderCollapse: 'collapse', minWidth: '100%', width: 'max-content' }}
          >
            <thead>
              <tr>
                {[labels.code, labels.points, labels.price, labels.change].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    style={{
                      background: 'var(--app-surface)',
                      borderBottom: '1px solid var(--app-border)',
                      color: 'var(--app-muted)',
                      fontSize: 12,
                      padding: '7px 10px',
                      position: 'sticky',
                      textAlign: 'start',
                      top: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeRows.map((row, index) => (
                <tr key={`${row.code || 'unknown'}-${index}`}>
                  <th
                    scope="row"
                    style={{
                      borderBottom: '1px solid var(--app-border)',
                      padding: '7px 10px',
                      textAlign: 'start',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.code || '—'}
                  </th>
                  <td style={cellStyle}>{formatNumber(row.expectedPoints, lang)}</td>
                  <td style={cellStyle}>{formatNumber(row.price, lang)}</td>
                  <td style={cellStyle}>{formatPriceChange(row.expectedPriceChange, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const cellStyle = {
  borderBottom: '1px solid var(--app-border)',
  padding: '7px 10px',
  whiteSpace: 'nowrap',
} as const;

export function ProjectionTables({
  projections,
  lang,
  title,
}: {
  projections?: ProjectionData;
  lang: Language;
  title: string;
}) {
  const labels =
    lang === 'he'
      ? {
          drivers: 'תחזית נהגים',
          constructors: 'תחזית קבוצות',
          empty: 'אין נתוני תחזית זמינים.',
        }
      : {
          drivers: 'Driver projections',
          constructors: 'Constructor projections',
          empty: 'No projection data is available.',
        };

  return (
    <section aria-label={title} style={{ marginTop: 16 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 12 }}>
        <ProjectionTable title={labels.drivers} rows={projections?.drivers} lang={lang} empty={labels.empty} />
        <ProjectionTable title={labels.constructors} rows={projections?.constructors} lang={lang} empty={labels.empty} />
      </div>
    </section>
  );
}
