/**
 * Quick verification script for f1FantasyApiService.
 * Run: F1_HEADLESS=false node src/verifyFantasyApi.js
 */
require('dotenv').config();
const fantasyApi = require('./f1FantasyApiService');
// Note: run from project root: node src/f1FantasyApi/verifyFantasyApi.js

async function main() {
  console.log('🏎️  F1 Fantasy API Service — Verification\n');

  try {
    // 1. Init (login)
    console.log('--- INIT (login) ---');
    const session = await fantasyApi.init();
    console.log(`✅ Logged in as: ${session.FirstName} ${session.LastName}`);
    console.log(`   GUID: ${session.GUID}`);
    console.log(`   Teams: ${session.TeamCount}, Registered: ${session.IsRegistered}\n`);

    // 2. Get leagues
    console.log('--- LEAGUES ---');
    const leagues = await fantasyApi.getLeagues();
    if (Array.isArray(leagues)) {
      leagues.forEach((l) => {
        const rank = l.teams?.[0]?.cur_rank ?? '?';
        console.log(
          `   ${decodeURIComponent(l.league_name)} (${l.league_type}) — rank #${rank}`,
        );
      });
    }
    console.log();

    // 3. Get user game days
    console.log('--- USER GAME DAYS ---');
    const gameDays = await fantasyApi.getUserGameDays(1);
    console.log(`   Team: ${decodeURIComponent(gameDays.teamname || 'unknown')}`);
    console.log(`   Current matchday: ${gameDays.cumdid}`);
    console.log(`   Matchday details: ${gameDays.mddetails?.length || 0} entries\n`);

    // 4. Get user team for current matchday
    const currentMatchday = gameDays.cumdid;
    if (currentMatchday) {
      console.log('--- USER TEAM ---');
      const teamData = await fantasyApi.getUserTeam(1, currentMatchday);
      const team = teamData?.userTeam?.[0] || teamData;
      console.log(`   Team value: ${team.teamval}`);
      console.log(`   Balance: ${team.teambal}`);
      console.log(`   Players: ${team.playerid?.length || 0}\n`);
    }

    // 5. Get league info for MSFT league
    console.log('--- LEAGUE INFO (MSFT) ---');
    const leagueInfo = await fantasyApi.getLeagueInfo('C7UYMMWIO07');
    console.log(`   Name: ${decodeURIComponent(leagueInfo.leagueName || '')}`);
    console.log(`   Members: ${leagueInfo.memberCount}`);
    console.log(`   Admin: ${decodeURIComponent(leagueInfo.userName || '')}`);
    console.log(`   User list: ${leagueInfo.user_list?.length || 0} entries\n`);

    // 6. Get user rank in MSFT league
    console.log('--- USER RANK (MSFT private league) ---');
    const rankData = await fantasyApi.getUserRank(1, 'private', 2976007);
    if (Array.isArray(rankData)) {
      const rank = rankData[0];
      console.log(`   Rank: #${rank?.cur_rank}`);
      console.log(`   Points: ${rank?.cur_points}`);
      console.log(`   Team: ${decodeURIComponent(rank?.team_name || '')}\n`);
    } else {
      console.log(`   Response:`, JSON.stringify(rankData).substring(0, 200), '\n');
    }

    // 7. Drivers feed
    console.log('--- DRIVERS (public) ---');
    const drivers = await fantasyApi.getDrivers(currentMatchday);
    const driverList = Array.isArray(drivers) ? drivers : drivers?.Players || [];
    console.log(`   ${driverList.length} drivers loaded`);
    driverList.slice(0, 3).forEach((d) => {
      console.log(`   ${d.DisplayName || d.FullName}: ${d.OverallPoints} pts, $${d.Value}M`);
    });

    console.log('\n✅ All API calls successful!');
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (err.stack) {console.error(err.stack.split('\n').slice(1, 4).join('\n'));}
  } finally {
    await fantasyApi.close();
    console.log('🏁 Done.');
  }
}

main();
