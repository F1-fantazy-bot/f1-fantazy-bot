# F1 Fantasy API — Response Examples

> Captured 2026-04-16. All responses are unwrapped from the standard `{ Data: { Value: ... } }` envelope.
> Some fields are `null` because the current matchday (4) hasn't been scored yet.

---

## POST /services/session/login

```json
{
  "GUID": "3dbedbda-3994-11f1-9222-c9d91d11b5d6",
  "Token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "HomeCountry": "ISR",
  "IsRegistered": 1,
  "TeamCount": 1,
  "SocialId": 233913084,
  "UserId": 5042290105,
  "IsEmailVerified": true,
  "EmailExpiry": 0,
  "FirstName": "das five",
  "LastName": "das",
  "HasSubscription": false,
  "SubscribedProduct": ""
}
```

---

## GET /services/user/league/{GUID}/leaguelandingv1

Returns `user_leagues` array — all leagues the user belongs to.

```json
[
  {
    "teams": [
      {
        "trend": null,
        "team_no": 1,
        "cur_rank": 0,
        "formatted_cur_rank": "0"
      }
    ],
    "is_vip": 0,
    "is_admin": 0,
    "is_sponcer": 0,
    "is_system_name_upd": 0,
    "is_report_flag": 0,
    "raceweeks": null,
    "is_profane_name_flag": 0,
    "league_id": 0,
    "league_code": null,
    "league_name": "Global League",
    "league_type": "Global",
    "no_of_teams": 3,
    "league_order": 1,
    "member_count": 1975805,
    "battle_result": null,
    "top_percentage": null,
    "formatted_member_count": "1.9m+"
  },
  {
    "teams": [
      { "trend": null, "team_no": 1, "cur_rank": 0, "formatted_cur_rank": "0" }
    ],
    "is_vip": 0,
    "is_admin": 0,
    "is_sponcer": 0,
    "is_system_name_upd": 0,
    "is_report_flag": 0,
    "raceweeks": null,
    "is_profane_name_flag": 1,
    "league_id": 2976007,
    "league_code": "C7UYMMWIO07",
    "league_name": "MSFT%20ILDC%202026%20League",
    "league_type": "Private",
    "no_of_teams": 1,
    "league_order": 2,
    "member_count": 16,
    "battle_result": null,
    "top_percentage": null,
    "formatted_member_count": "16"
  },
  {
    "teams": [
      { "trend": null, "team_no": 1, "cur_rank": 0, "formatted_cur_rank": "0" }
    ],
    "league_id": 16870204,
    "league_code": "C6LTNQCNB04",
    "league_name": "kilzi%20test",
    "league_type": "Private",
    "no_of_teams": 3,
    "league_order": 2,
    "member_count": 5,
    "formatted_member_count": "5"
  },
  {
    "league_id": 27,
    "league_code": "27",
    "league_name": "McLaren",
    "league_type": "Team",
    "no_of_teams": 3,
    "member_count": 424667,
    "formatted_member_count": "424k+"
  },
  {
    "league_id": 11059,
    "league_code": "11059",
    "league_name": "Franco Colapinto",
    "league_type": "Driver",
    "member_count": 28495,
    "formatted_member_count": "28.4k+"
  },
  {
    "league_id": 202,
    "league_code": "ALB",
    "league_name": "Albania",
    "league_type": "Country",
    "member_count": 1446,
    "formatted_member_count": "1.4k+"
  }
]
```

---

## GET /services/user/gameplay/{GUID}/getusergamedaysv1/{teamNo}

Response is `{ "0": { ... } }` — keyed by team index. The service unwraps to the `"0"` entry.

```json
{
  "ftmdid": 4,
  "ftgdid": 8,
  "cugdid": 8,
  "cumdid": 4,
  "prvmdid": 3,
  "islastday": 1,
  "lastdaygdid": 0,
  "teamid": 5042290105,
  "teamno": 1,
  "teamname": "the%20best%20bot",
  "iswildcardtaken": 0,
  "wildcardtakengd": 0,
  "islimitlesstaken": 0,
  "limitlesstakengd": 0,
  "isfinalfixtaken": 0,
  "finalfixtakengd": 0,
  "isextradrstaken": 0,
  "extradrstakengd": 0,
  "isnonigativetaken": 0,
  "nonigativetakengd": 0,
  "isautopilottaken": 0,
  "isautopilottakengd": 0,
  "islateonboard": 0,
  "mddetails": {
    "4": { "mds": 0, "phId": 1, "pts": null }
  },
  "userhome": {
    "teanNo": 1,
    "ovPoints": null,
    "racePoints": null,
    "overallBestweek": null,
    "bestDriverWeek": null,
    "bestDriverOverall": null,
    "totalTransfer": null,
    "freeTransfer": null,
    "nigativeTransfer": null
  },
  "teamcount": 1,
  "iswebpurifycalled": 1,
  "webpurifyresponse": "clean",
  "issystemnameupd": 0
}
```

### Key fields

| Field                   | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `cumdid`                | Current matchday ID                                                                  |
| `cugdid`                | Current gameday ID                                                                   |
| `ftmdid`                | First matchday ID                                                                    |
| `prvmdid`               | Previous matchday ID                                                                 |
| `teamname`              | URL-encoded team name                                                                |
| `teamcount`             | How many teams the user has                                                          |
| `mddetails`             | Matchday → points/phase map                                                          |
| `userhome`              | Summary stats (overall points, best week, transfers)                                 |
| `is*taken` / `*takengd` | Chip usage flags (wildcard, limitless, final fix, extra DRS, no-negative, autopilot) |

---

## GET /services/user/gameplay/{GUID}/getteam/{teamNo}/1/{matchdayId}/1

```json
{
  "mdid": 4,
  "userTeam": [
    {
      "gdrank": null,
      "ovrank": null,
      "teamno": 1,
      "teambal": 0.9,
      "teamval": 99.1,
      "gdpoints": null,
      "matchday": 8,
      "ovpoints": null,
      "playerid": [
        {
          "id": "11031",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 2
        },
        {
          "id": "114",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 3
        },
        {
          "id": "115",
          "isfinal": 0,
          "iscaptain": 1,
          "ismgcaptain": 0,
          "playerpostion": 1
        },
        {
          "id": "118",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 4
        },
        {
          "id": "125",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 5
        },
        {
          "id": "2636",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 7
        },
        {
          "id": "29",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 6
        }
      ],
      "teamname": "the%20best%20bot",
      "usersubs": 0,
      "boosterid": null,
      "team_info": {
        "teamBal": 0.9,
        "teamVal": 99.1,
        "maxTeambal": 100,
        "subsallowed": 0,
        "userSubsleft": 0
      },
      "capplayerid": "115",
      "subsallowed": 0,
      "extrasubscost": 10,
      "mgcapplayerid": null,
      "race_category": "S",
      "gd_initial_team": ["115", "11031", "114", "118", "125", "29", "2636"],
      "iswildcardtaken": 0,
      "islimitlesstaken": 0,
      "isextradrstaken": 0,
      "isfinalfixtaken": 0,
      "isnonigativetaken": 0,
      "isautopilottaken": 0,
      "inactive_driver_penality_points": 0
    }
  ],
  "retval": 1
}
```

### Key fields

| Field                      | Description                             |
| -------------------------- | --------------------------------------- |
| `teamval`                  | Total team value (in $M)                |
| `teambal`                  | Remaining budget balance                |
| `playerid[]`               | Array of selected players               |
| `playerid[].id`            | Player ID (cross-ref with drivers feed) |
| `playerid[].iscaptain`     | 1 = captain (2× points)                 |
| `playerid[].ismgcaptain`   | 1 = mega captain                        |
| `playerid[].playerpostion` | Slot position (1-7)                     |
| `capplayerid`              | Captain's player ID                     |
| `gdpoints`                 | Gameday points (null if not scored)     |
| `ovpoints`                 | Overall cumulative points               |
| `race_category`            | "S" = Sprint, "R" = Race                |

---

## GET /services/user/league/getleagueinfo/{leagueCode}

```json
{
  "leagueName": "MSFT%20ILDC%202026%20League",
  "maxMem": 99999999,
  "noOfteam": 1,
  "teamName": "NoNoItsSoNotRightMikeyNO",
  "userName": "Tom Kregenbild",
  "leaugeType": "Private",
  "locktime": null,
  "legaueVipFlag": 0,
  "isSponsor": null,
  "leagueId": 2976007,
  "raceweek": null,
  "extno": [1],
  "isOpted": null,
  "bannerImgURL": null,
  "bannerInternalURL": null,
  "bannerExternalURL": null,
  "translationKey": "league_sponsor_private_2976007",
  "isJoin": 1,
  "isAdmin": 0,
  "dateCreated": "2026-02-25T19:44:58.856754",
  "shareable_league_name": null,
  "leagueCode": "C7UYMMWIO07",
  "teams_count": 16,
  "memberCount": 16,
  "userRank": null,
  "userPoints": null,
  "user_list": ["Doron Kilzi", "Dor Segal", "Ron Cooper"]
}
```

### Notes

- `userName` / `teamName` = league admin's name & team
- `user_list` returns **only a partial** list of member names (3 out of 16) — not all members
- `user_list` entries are plain strings (names), not objects with GUIDs

---

## GET /services/user/leaderboard/{GUID}/userrankgetv1/0/{teamNo}/{leagueType}/{leagueId}

League type must be **lowercase**: `global`, `private`, `team`, `driver`, `country`.

```json
[
  {
    "trend": null,
    "team_no": 1,
    "cur_rank": null,
    "social_id": "233913084",
    "team_name": "the%20best%20bot",
    "user_name": "das five das",
    "user_guid": "3dbedbda-3994-11f1-9222-c9d91d11b5d6-0-233913084",
    "user_team": null,
    "cur_points": null
  }
]
```

### Key fields

| Field        | Description                                               |
| ------------ | --------------------------------------------------------- |
| `cur_rank`   | User's rank in the league (null if season not scored yet) |
| `cur_points` | Total points in this league                               |
| `trend`      | Rank change direction                                     |
| `user_guid`  | Opponent-format GUID: `{guid}-0-{socialId}`               |
| `team_name`  | URL-encoded team name                                     |

---

## GET /services/user/league/{GUID}/featuredleaguev1

```json
{
  "featured_leagues": [
    {
      "is_new": null,
      "is_vip": 0,
      "is_joined": 0,
      "league_id": 412910,
      "raceweeks": null,
      "is_popular": null,
      "is_sponcer": 1,
      "is_official": 0,
      "league_code": "P5SZLUS2W10",
      "league_name": "SKY%20SPORTS%20F1",
      "league_type": "Public",
      "created_date": "2026-03-02T06:09:29.089996",
      "member_count": 140329,
      "is_last_chance": null,
      "lock_datetime_utc": null,
      "formatted_member_count": "140k+",
      "is_ended": 0,
      "is_admin": 0,
      "banner_url_internal": null,
      "banner_url_external": null,
      "banner_img_url": null
    },
    {
      "league_id": 143604,
      "league_code": "P7ECRUYCO04",
      "league_name": "F1%20Nation%20-%20Official%20F1%20Podcast",
      "league_type": "Public",
      "member_count": 68865,
      "formatted_member_count": "68.8k+"
    }
  ]
}
```

---

## GET /services/user/opponentteam/opponentgamedayget/{teamNo}/{opponentGUID}/{v}

Opponent GUID format: `{guid}-0-{socialId}` (e.g. `3dbedbda-3994-11f1-9222-c9d91d11b5d6-0-233913084`).

```json
{
  "ftMdid": 4,
  "ftGdid": 8,
  "CuGdid": 8,
  "mdDetails": {
    "4": { "mds": 0, "phId": 1, "pts": null }
  },
  "teamCount": 1,
  "lastDaygdid": 0,
  "isLastday": 0,
  "isWildcardtaken": 0,
  "wildCardtakengd": 0,
  "isLimitlesstaken": 0,
  "limitLesstakengd": 0,
  "isFinalfixtaken": 0,
  "finalFixtakengd": 0,
  "isExtradrstaken": 0,
  "extraDrstakengd": 0,
  "isNonigativetaken": 0,
  "noNigativetakengd": 0,
  "isAutopilottaken": 0,
  "isAutopilottakengd": 0,
  "islateonboard": 0
}
```

> Note: Field casing differs from user's own game days (e.g. `ftMdid` vs `ftmdid`).

---

## GET /services/user/opponentteam/opponentgamedayplayerteamget/{teamNo}/{opponentGUID}/{v}/{matchdayId}/{v2}

```json
{
  "mdid": 4,
  "userTeam": [
    {
      "gdrank": null,
      "ovrank": null,
      "teamno": 1,
      "teambal": 0.9,
      "teamval": 99.1,
      "gdpoints": null,
      "matchday": 8,
      "ovpoints": null,
      "playerid": [
        {
          "id": "11031",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 2
        },
        {
          "id": "114",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 3
        },
        {
          "id": "115",
          "isfinal": 0,
          "iscaptain": 1,
          "ismgcaptain": 0,
          "playerpostion": 1
        },
        {
          "id": "118",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 4
        },
        {
          "id": "125",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 5
        },
        {
          "id": "2636",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 7
        },
        {
          "id": "29",
          "isfinal": 0,
          "iscaptain": 0,
          "ismgcaptain": 0,
          "playerpostion": 6
        }
      ],
      "socialId": 233913084,
      "teamname": "the%20best%20bot",
      "capplayerid": "115",
      "team_info": {
        "teamBal": 0.9,
        "teamVal": 99.1,
        "maxTeambal": 100,
        "subsallowed": 0,
        "userSubsleft": 0
      },
      "race_category": "S",
      "iswildcardtaken": 0,
      "islimitlesstaken": 0,
      "inactive_driver_penality_points": 0
    }
  ],
  "retval": 1
}
```

> Same shape as user team but includes `socialId` field and excludes some user-specific flags.

---

## GET /feeds/drivers/{matchdayId}\_en.json

Public — no auth. Returns all drivers and constructors.

```json
[
  {
    "PlayerId": "18",
    "Skill": 1,
    "PositionName": "DRIVER",
    "Value": 13.0,
    "TeamId": "23",
    "FUllName": "Pierre Gasly",
    "DisplayName": "P. Gasly",
    "TeamName": "Alpine",
    "Status": "0",
    "IsActive": "1",
    "DriverTLA": "GAS",
    "DriverReference": "PIEGAS01",
    "CountryName": "Rouen, France",
    "OverallPpints": "45.00",
    "GamedayPoints": "0",
    "SelectedPercentage": "18",
    "CaptainSelectedPercentage": "1",
    "OldPlayerValue": 12.8,
    "BestRaceFinished": "6",
    "HigestGridStart": "7",
    "HigestChampFinish": "",
    "FastestPitstopAward": "",
    "BestRaceFinishCount": 1,
    "HighestGridStartCount": 1,
    "QualifyingPoints": "",
    "RacePoints": "",
    "SprintPoints": "",
    "NoNegativePoints": "",
    "F1PlayerId": "8",
    "FirstName": "Pierre",
    "LastName": "Gasly",
    "SessionWisePoints": [
      {
        "sessionnumber": 1,
        "sessiontype": "Sprint Qualifying",
        "points": null,
        "nonegative_points": null
      },
      {
        "sessionnumber": 2,
        "sessiontype": "Qualifying",
        "points": null,
        "nonegative_points": null
      },
      {
        "sessionnumber": 3,
        "sessiontype": "Race",
        "points": null,
        "nonegative_points": null
      }
    ],
    "AdditionalStats": {
      "fastest_lap_pts": 0,
      "dotd_pts": 0,
      "overtaking_pts": 21,
      "q3_finishes_pts": 8,
      "top10_race_position_pts": 15,
      "top8_sprint_position_pts": 0,
      "total_position_pts": 23,
      "total_position_gained_lost": 1,
      "total_dnf_dq_pts": 0,
      "value_for_money": 1.15
    },
    "ProjectedGamedayPoints": "0",
    "ProjectedNoNegativePoints": "0",
    "ProjectedOverallPpints": "45.00"
  }
]
```

### Key fields

| Field                             | Description                                        |
| --------------------------------- | -------------------------------------------------- |
| `PlayerId`                        | Used in team `playerid[].id`                       |
| `Skill`                           | 1 = Driver, 2 = Constructor                        |
| `PositionName`                    | "DRIVER" or "CONSTRUCTOR"                          |
| `Value`                           | Current price in $M                                |
| `OldPlayerValue`                  | Previous price                                     |
| `OverallPpints`                   | Total season points (note: typo in API — "Ppints") |
| `GamedayPoints`                   | Points for current matchday                        |
| `SelectedPercentage`              | % of all teams that selected this player           |
| `CaptainSelectedPercentage`       | % of teams captaining this player                  |
| `DriverTLA`                       | Three-letter abbreviation                          |
| `AdditionalStats.value_for_money` | Points per $M (useful for analysis)                |

---

## GET /feeds/v2/apps/web_config.json

> Large response (~100KB). Key fields only shown here.

```json
{
  "tourId": 4,
  "predictorGameEnabled": true,
  "maintenanceModeReloadCta": true
}
```

> This endpoint returns the full app config including image paths, feature flags, tournament settings, etc.
> The `tourId` is needed for some API calls and changes each season.
