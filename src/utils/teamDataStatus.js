const ROSTER_STATUSES = new Set(['current', 'reconstructed-race-start', 'historical', 'unavailable']);
const BUDGET_STATUSES = new Set(['live', 'calculated-race-start', 'unknown']);
const TRANSFER_STATUSES = new Set(['live', 'calculated-race-start', 'unlimited', 'unknown']);

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') {return null;}
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function teamDataStatus(team = {}) {
  const result = {};
  for (const [key, allowed] of [['teamStateStatus', ROSTER_STATUSES], ['budgetStatus', BUDGET_STATUSES], ['transfersStatus', TRANSFER_STATUSES]]) {
    if (Object.prototype.hasOwnProperty.call(team, key)) {
      result[key] = allowed.has(team[key]) ? team[key] : key === 'teamStateStatus' ? 'unavailable' : 'unknown';
    }
  }
  for (const key of ['matchdayId', 'teamStateMatchdayId', 'budgetSourceMatchdayId', 'transfersSourceMatchdayId']) {
    if (Object.prototype.hasOwnProperty.call(team, key)) {
      const value = finiteNumber(team[key]);
      result[key] = Number.isInteger(value) && value > 0 ? value : null;
    }
  }

  return result;
}

function publicFreeTransfers(team) {
  return team?.transfersStatus === 'unlimited' ? null : finiteNumber(team?.freeTransfers);
}

function recommendationIssue(team, priceMatchdayId) {
  // Imported/manual legacy data keeps its existing JSON validation path.
  if (!team?.teamStateStatus && !team?.budgetStatus && !team?.transfersStatus) {return null;}
  if (['historical', 'unavailable'].includes(team?.teamStateStatus)) {return 'missing_team_baseline';}
  if (team?.teamStateStatus && (team.drivers?.length !== 5 || team.constructors?.length !== 2)) {return 'missing_team_baseline';}
  if (team?.teamStateStatus && (!Number.isInteger(team.matchdayId) ||
      (priceMatchdayId !== undefined && !Number.isInteger(priceMatchdayId)) ||
      (Number.isInteger(priceMatchdayId) && team.matchdayId !== priceMatchdayId))) {return 'race_mismatch';}
  if (team?.budgetStatus === 'unknown' || !Number.isFinite(team?.costCapRemaining)) {return 'missing_team_budget';}
  if (team?.transfersStatus === 'unknown' ||
      (team?.transfersStatus !== 'unlimited' && !Number.isFinite(team?.freeTransfers))) {return 'missing_team_transfers';}

  return null;
}

module.exports = { finiteNumber, teamDataStatus, publicFreeTransfers, recommendationIssue };
