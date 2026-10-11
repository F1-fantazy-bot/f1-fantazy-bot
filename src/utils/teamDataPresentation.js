const { t } = require('../i18n');
const ISSUE_MESSAGES = {
  missing_team_baseline: 'The starting roster is unavailable. Try again after the weekly data refresh.',
  missing_team_budget: 'The team budget is unknown. Recommendations need a verified starting budget.',
  missing_team_transfers: 'The transfer allowance is unknown. Recommendations need a verified starting allowance.',
  race_mismatch: 'Team data and prices are for different races. Try again after the weekly data refresh.',
};

function recommendationMessage(issue, chatId) {
  return ISSUE_MESSAGES[issue] ? t(ISSUE_MESSAGES[issue], chatId) : null;
}

function teamDataNotice(status, chatId) {
  const parts = [];
  if (status?.teamStateStatus === 'reconstructed-race-start') {
    parts.push(t('Starting roster for race {RACE}, before this week’s changes.', chatId, { RACE: status.matchdayId ?? '?' }));
  } else if (['historical', 'unavailable'].includes(status?.teamStateStatus)) {
    parts.push(t('Starting roster unavailable; showing older saved data.', chatId));
  }
  if (status?.budgetStatus === 'calculated-race-start') {parts.push(t('Budget calculated at race start.', chatId));}
  if (status?.transfersStatus === 'calculated-race-start') {parts.push(t('Transfers are the race-start allowance; this week’s usage is not included.', chatId));}
  if (status?.budgetStatus === 'unknown') {parts.push(t('Budget unknown.', chatId));}
  if (status?.transfersStatus === 'unknown') {parts.push(t('Transfers unknown.', chatId));}
  if (status?.transfersStatus === 'unlimited') {parts.push(t('Unlimited transfers.', chatId));}

  return parts.join('\n');
}

module.exports = { recommendationMessage, teamDataNotice };
