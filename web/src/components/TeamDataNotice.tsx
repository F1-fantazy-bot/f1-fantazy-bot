export type TeamDataStatus = {
  teamStateStatus?: 'current' | 'reconstructed-race-start' | 'historical' | 'unavailable';
  budgetStatus?: 'live' | 'calculated-race-start' | 'unknown';
  transfersStatus?: 'live' | 'calculated-race-start' | 'unlimited' | 'unknown';
  matchdayId?: number | null;
  teamStateMatchdayId?: number | null;
  budgetSourceMatchdayId?: number | null;
  transfersSourceMatchdayId?: number | null;
};

export const weeklyErrorMessages = {
  en: {
    missing_team_baseline: 'The starting roster is unavailable. Try after the weekly data refresh.',
    missing_team_budget: 'The team budget is unknown. Recommendations need a verified starting budget.',
    missing_team_transfers: 'The transfer allowance is unknown. Recommendations need a verified starting allowance.',
    race_mismatch: 'Team data and prices are for different races. Try after the weekly data refresh.',
  },
  he: {
    missing_team_baseline: 'הרכב הפתיחה אינו זמין. נסה שוב לאחר העדכון השבועי.',
    missing_team_budget: 'תקציב הקבוצה אינו ידוע. המלצות דורשות תקציב פתיחה מאומת.',
    missing_team_transfers: 'מכסת ההעברות אינה ידועה. המלצות דורשות מכסת פתיחה מאומתת.',
    race_mismatch: 'נתוני הקבוצה והמחירים שייכים למרוצים שונים. נסה שוב לאחר העדכון השבועי.',
  },
};
export type RecommendationIssue = keyof typeof weeklyErrorMessages.en;

export function RecommendationDataError({ status, lang }: { status?: string; lang?: string }) {
  const messages = weeklyErrorMessages[lang === 'he' ? 'he' : 'en'];
  const message = messages[status as RecommendationIssue];
  return message ? <p role="status" dir={lang === 'he' ? 'rtl' : 'ltr'} style={{ padding: 12, color: 'var(--app-warning-text)' }}>{message}</p> : null;
}

export function transferLabel(value: number | null | undefined, status: TeamDataStatus | undefined, lang?: string) {
  if (status?.transfersStatus === 'unlimited') return lang === 'he' ? 'ללא הגבלה' : 'Unlimited';
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : lang === 'he' ? 'לא ידוע' : 'Unknown';
}

export function TeamDataNotice({ status, lang }: { status?: TeamDataStatus; lang?: string }) {
  const he = lang === 'he';
  const parts: string[] = [];
  if (status?.teamStateStatus === 'reconstructed-race-start') {
    parts.push(he ? `הרכב פתיחה למרוץ ${status.matchdayId ?? '?'}, לפני השינויים של השבוע.` : `Starting roster for race ${status.matchdayId ?? '?'}, before this week’s changes.`);
  } else if (status?.teamStateStatus === 'historical' || status?.teamStateStatus === 'unavailable') {
    parts.push(he ? 'הרכב הפתיחה אינו זמין; מוצגים נתונים ישנים שנשמרו.' : 'Starting roster unavailable; showing older saved data.');
  }
  if (status?.budgetStatus === 'calculated-race-start') parts.push(he ? 'התקציב חושב בתחילת המרוץ.' : 'Budget calculated at race start.');
  if (status?.transfersStatus === 'calculated-race-start') parts.push(he ? 'ההעברות הן מכסת הפתיחה; השימוש של השבוע אינו כלול.' : 'Transfers are the race-start allowance; this week’s usage is not included.');
  if (status?.budgetStatus === 'unknown') parts.push(he ? 'התקציב אינו ידוע.' : 'Budget unknown.');
  if (status?.transfersStatus === 'unknown') parts.push(he ? 'ההעברות אינן ידועות.' : 'Transfers unknown.');
  return parts.length ? <p role="note" style={{ margin: '8px 12px', fontSize: 12, color: 'var(--app-muted)', lineHeight: 1.5 }}>{parts.join(' ')}</p> : null;
}
