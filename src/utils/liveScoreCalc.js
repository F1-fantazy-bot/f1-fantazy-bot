// Pure scoring helpers shared between the Telegram `/live_score` handler
// and the web-chat agent's `get_live_score_*` tools. No bot, no `t()`,
// no `sendMessage` — keep this module pure so both surfaces can wire
// the same calculator into whichever formatter / renderer they use.
//
// Extracted from `src/commandsHandler/liveScoreHandler.js` in Phase 5 of
// the agent rollout. The handler still re-exports these names so its
// existing test (`liveScoreHandler.test.js`) keeps importing them
// unchanged.
const { mapNameToCode } = require('./leagueTeamHelpers');
const { EXTRA_TRANSFER_PENALTY_POINTS } = require('../constants');

/**
 * Map a single locked-snapshot team entry to the `{drivers, constructors,
 * boostDriver, extraBoostDriver}` shape consumed by
 * `calculateLiveScoreBreakdown`. Names are mapped to bot codes via
 * `mapNameToCode`; captain / mega-captain are identified by the
 * per-driver `isCaptain` / `isMegaCaptain` flags.
 */
function mapLockedTeamForScoring(lockedTeam) {
  const drivers = Array.isArray(lockedTeam?.drivers) ? lockedTeam.drivers : [];
  const constructors = Array.isArray(lockedTeam?.constructors)
    ? lockedTeam.constructors
    : [];
  const captain = drivers.find((d) => d?.isCaptain);
  const megaCaptain = drivers.find((d) => d?.isMegaCaptain);

  return {
    drivers: drivers.map((d) => mapNameToCode(d.name)),
    constructors: constructors.map((c) => mapNameToCode(c.name)),
    boostDriver: captain ? mapNameToCode(captain.name) : null,
    extraBoostDriver: megaCaptain ? mapNameToCode(megaCaptain.name) : null,
  };
}

function getLiveMemberData(bucket = {}, code) {
  const memberData = bucket[code];

  if (!memberData) {
    return {
      points: 0,
      priceChange: 0,
      details: {},
      missing: true,
    };
  }

  return {
    points: Number(memberData.TotalPoints) || 0,
    priceChange: Number(memberData.PriceChange) || 0,
    details: memberData,
    missing: false,
  };
}

function calculateLiveScoreBreakdown(realTeam, liveScoreData, options = {}) {
  const noNegativeActive = Boolean(options.noNegativeActive);
  const transferPenalty = Math.max(
    0,
    Number(options.transferPenalty) || 0,
  );
  const driversData = liveScoreData.drivers || {};
  const constructorsData = liveScoreData.constructors || {};
  const boostDriver = realTeam.boostDriver;
  const extraBoostDriver = realTeam.extraBoostDriver;

  // Apply No Negative clamp on the per-member scoring `points` so the
  // captain / mega-captain multipliers (added below) never amplify a
  // negative score that should have been zeroed out first.
  const clampPoints = (raw) =>
    noNegativeActive ? Math.max(0, raw) : raw;

  const driverBreakdown = realTeam.drivers.map((driverCode) => {
    const member = getLiveMemberData(driversData, driverCode);

    return {
      code: driverCode,
      ...member,
      points: clampPoints(member.points),
      isBoost: boostDriver === driverCode,
      isExtraBoost: extraBoostDriver === driverCode,
    };
  });

  const constructorBreakdown = realTeam.constructors.map((constructorCode) => {
    const member = getLiveMemberData(constructorsData, constructorCode);

    return {
      code: constructorCode,
      ...member,
      points: clampPoints(member.points),
      isBoost: false,
      isExtraBoost: false,
    };
  });

  const pointsBeforePenalty =
    driverBreakdown.reduce(
      (sum, driver) =>
        sum +
        driver.points +
        (driver.isExtraBoost
          ? driver.points * 2
          : driver.isBoost
            ? driver.points
            : 0),
      0,
    ) + constructorBreakdown.reduce((sum, constructor) => sum + constructor.points, 0);

  const totalPoints = pointsBeforePenalty - transferPenalty;

  const totalPriceChange =
    driverBreakdown.reduce((sum, driver) => sum + driver.priceChange, 0) +
    constructorBreakdown.reduce((sum, constructor) => sum + constructor.priceChange, 0);

  const missingMembers = [...driverBreakdown, ...constructorBreakdown]
    .filter((member) => member.missing)
    .map((member) => member.code);

  return {
    totalPoints,
    pointsBeforePenalty,
    transferPenalty,
    noNegativeApplied: noNegativeActive,
    totalPriceChange,
    driverBreakdown,
    constructorBreakdown,
    missingMembers,
  };
}

/**
 * Derive the live-score `options` for a team from its locked-snapshot
 * entry. Inspects the team's own `chipsUsed` and `transfersRemaining`:
 *   - Wildcard / Limitless active for THIS matchday → transfer penalty waived.
 *   - No Negative active for THIS matchday → flag noNegativeActive.
 *   - Otherwise → 10 pts × |min(transfersRemaining, 0)| transfer penalty.
 *
 * "Active for this matchday" means the chip's `gameDayId` equals the
 * snapshot's `matchdayId`. (`gameDayId` is misleadingly named — its
 * value is the matchday the chip was activated for; see Phase 6.)
 */
function deriveLiveScoreOptions(lockedTeam) {
  const matchdayId = lockedTeam?.matchdayId;
  const chipsThisMatch = (
    Array.isArray(lockedTeam?.chipsUsed) ? lockedTeam.chipsUsed : []
  ).filter((c) => c && c.gameDayId === matchdayId);
  const noNegativeActive = chipsThisMatch.some(
    (c) => c.name === 'No Negative',
  );
  const wildcardOrLimitless = chipsThisMatch.some(
    (c) => c.name === 'Wildcard' || c.name === 'Limitless',
  );
  const transfersRemainingRaw = Number(lockedTeam?.transfersRemaining);
  const overTransfers = Number.isFinite(transfersRemainingRaw)
    ? Math.max(0, -transfersRemainingRaw)
    : 0;
  const transferPenalty = wildcardOrLimitless
    ? 0
    : overTransfers * EXTRA_TRANSFER_PENALTY_POINTS;

  return { noNegativeActive, transferPenalty };
}

module.exports = {
  mapLockedTeamForScoring,
  calculateLiveScoreBreakdown,
  deriveLiveScoreOptions,
};
