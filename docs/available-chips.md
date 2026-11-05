# Remaining chips

Telegram `/available_chips` and web `get_available_chips` use
`src/cores/availableChipsCore.js`. Available means unused in the current UTC
calendar season. All six chips are included, independent of activation windows:
Wildcard, Limitless, Final Fix, Extra DRS Boost, No Negative, Autopilot.

No target opens **One team**, **All tracked teams**, **Entire league**. Manual team
selection chooses a followed league first (automatically only if there is one),
then any team in its standings. Explicit team/league names resolve case-insensitively,
with exact matches preferred and ambiguous matches offered as clickable choices.
A team target implies team scope; a league target otherwise implies league scope.
Tracked teams are deduplicated by account ID and team number, including across leagues;
unavailable/legacy tracked teams remain visible as unknown.

The optional arguments are `scope: team | tracked | league`, `teamId`, `teamName`,
`leagueCode`, `leagueName`. Model calls may omit unused fields or send JSON null;
a generic request must omit scope/targets and open the scope picker. Blank and
literal `undefined`/`null` target placeholders are treated as absent, never as team
or league identifiers. Telegram also accepts these as a validated JSON suffix,
including ASK's unchanged array-of-strings protocol:

```text
/available_chips {"scope":"tracked"}
/available_chips {"teamName":"kilzid1"}
/available_chips {"leagueName":"Friends"}
```

Natural-language examples: “Which chips are left for kilzid1?”, “Remaining chips
for all teams I track”, “Show unused chips for the Friends league”,
“אילו צ׳יפים נשארו לקבוצה kilzid1?”, “הצג צ׳יפים שנותרו לכל הקבוצות במעקב”.

## Data contract

The scraper writes `chipUsageStatus: known | unknown` alongside existing
`chipsUsed`. Known requires all six valid taken flags in a successful response.
A used flag remains usage even without an activation game day.

Each core call authorizes followed leagues before reading their standings and
latest locked snapshot once each. Chip reads select the locked blob by storage
update time (not highest race number), so season race-number resets remain safe. Standings determine membership and names;
only account ID + team number join chip records. The newest source `fetchedAt`
wins, including unknown data. Conflicting equally dated records, absent markers,
invalid lists/names/timestamps, and records outside the current calendar year
are unknown. Chip aliases and duplicates normalize before subtraction.
`availableChips: null` is unknown; `[]` proves all six used. Source update times
are returned per team. These are stored records, not live F1 activation status.
Missing/failing sources preserve readable rows and report partial results.

Reads do not bootstrap mutable team caches, change active teams, follow/unfollow,
select chips, or change saved recommendations. Telegram stores only temporary
picker options in `available-chips-sessions/{chatId}.json`; random tokens and a
one-hour TTL reject stale/foreign callbacks. Selectors show 20 items per page;
plain-text Telegram results split below 4,096 characters. Web choices share the
existing run lock and failed-run rollback. Rich tables support English/Hebrew/RTL,
loading/error/empty states, workflow results, and display-only history recovery.

## Scraper-first rollout

1. Release the scraper marker before the bot/web feature.
2. Let the next **normal scheduled** scrape write verified usage. A separately
   authorized local/production scrape may also populate it. Publishing a scraper
   image does not prove a scrape ran.
3. Existing blobs remain **Usage unavailable** until verified marked records
   arrive. Do not backfill/infer known status from historical empty lists.
4. Locked captures retain the existing schedule-verified qualifying-to-race-end
   write window. Never start a production scraper automatically for this feature.

Read-only local validation on 2026-11-02 checked 22 distinct account/team pairs: all 22
had valid flags, with zero unknown responses or failures. No uploads/notifications
were attempted. Browser verification uses the offline fixture
`web/e2e/available-chips-preview.html`; production data/writes are not required.

Best-team scenarios (`/best_team_scenarios` and `get_best_team_scenarios`) use
the same authorized lookup once per resolved canonical team. All four ranking
presets retain Without Chip, followed by unused Limitless, Extra Boost (catalog
Extra DRS Boost), and Wildcard in that order. Other catalog chips do not add
scenarios. Omitted chips never reach the optimizer. Unknown, failed or partial
reads and teams without canonical identity return four no-chip baselines, with:
“Chip usage could not be verified; showing no-chip scenarios only.” Both surfaces
localize this notice in Hebrew. Known usage with no supported chips left needs
no notice. Results include optional `chipAvailability: { status: 'known' |
'unknown', updatedAt: string | null }`; old saved cards keep their original rows
and render without this field. Each new workflow calculation resolves its own
team's availability afresh. Saved chip preferences and follow settings are
unchanged.

The offline scenario preview is `web/e2e/scenario-chips-preview.html`: use
`?lang=he` for Hebrew, `?unknown=1` for the fallback, and `?historical=1` for
old saved payloads. Its three-team fixtures expect Without Chip + Wildcard for
Kilzid, Without Chip only for Kilzid2, and Without Chip + Limitless for Kilzid 3.
