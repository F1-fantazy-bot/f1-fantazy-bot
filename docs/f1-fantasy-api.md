# F1 Fantasy API Reference

> Reverse-engineered from fantasy.formula1.com (June 2025).
> All `/services/*` endpoints require an authenticated browser session.
>
> **See [f1-fantasy-api-examples.md](./f1-fantasy-api-examples.md) for full response examples.**

## Base URL

```
https://fantasy.formula1.com
```

## Authentication

The F1 Fantasy site is protected by **Distil/reese84 bot detection** — direct HTTP
requests (curl/axios) are blocked. A real Chromium browser (via Playwright) is required.

### Login Flow

1. Navigate to `https://account.formula1.com/#/en/login?redirect=https%3A%2F%2Ffantasy.formula1.com%2Fen%2F&lead_source=web_fantasy`
2. Dismiss cookie-consent banner (iframe overlay blocks form)
3. Fill email + password with human-like typing (50-100 ms/char delay)
4. Click **Sign In**
5. Browser POSTs to `api.formula1.com/v2/account/subscriber/authenticate/by-password`
   ```json
   {
     "Login": "<email>",
     "Password": "<pwd>",
     "DistributionChannel": "d861e38f-05ea-4063-8776-a7e2b6d885a4"
   }
   ```
6. On success → `login-session` cookie set on `.formula1.com`, redirect to `fantasy.formula1.com`
7. Call `POST /services/session/login` to obtain Fantasy GUID & Token

### Session Login

```
POST /services/session/login
Body: { "optType": 1, "platformId": 1, "platformVersion": "1", "platformCategory": "web", "clientId": 1 }
```

**Response:**

```json
{
  "GUID": "3dbedbda-3994-11f1-9222-c9d91d11b5d6",
  "Token": "<jwt>",
  "IsRegistered": 1,
  "TeamCount": 1,
  "SocialId": 188548302,
  "UserId": 200301063,
  "FirstName": "drive",
  "LastName": "senna",
  "HomeCountry": 80
}
```

The `GUID` is used as a path parameter in most authenticated endpoints.

---

## Authenticated Endpoints

### User Gameplay

#### Get User Game Days

```
GET /services/user/gameplay/{GUID}/getusergamedaysv1/{teamNo}
```

Returns matchday list with points, chip usage (wildcard/limitless/extraboost), team name.

- `teamNo` — 1-based team index (users can have multiple teams; see `TeamCount`)
- Key fields: `cumdid` (current matchday ID), `ftmdid` (first matchday ID)

#### Get User Team

```
GET /services/user/gameplay/{GUID}/getteam/{teamNo}/1/{matchdayId}/1
```

Returns team composition: player IDs, captain, team value, balance, points.

---

### League

#### League Landing (all user leagues)

```
GET /services/user/league/{GUID}/leaguelandingv1
```

Returns array of leagues the user belongs to:

```json
{
  "league_id": 2976007,
  "league_code": "C7UYMMWIO07",
  "league_name": "MSFT%20ILDC%202026%20League",
  "league_type": "Private",
  "teams_count": 16,
  "cur_rank": 5
}
```

League types: `Global`, `Private`, `Team`, `Driver`, `Country`.

#### Get League Info

```
GET /services/user/league/getleagueinfo/{leagueCode}
```

Returns league details: name, member count, admin, date created, and a **partial** `user_list`
(may not include all members — observed 3 out of 16).

#### Featured Leagues

```
GET /services/user/league/{GUID}/featuredleaguev1
```

---

### Leaderboard

#### User Rank

```
GET /services/user/leaderboard/{GUID}/userrankgetv1/0/{teamNo}/{leagueType}/{leagueId}
```

`leagueType` must be **lowercase**: `global`, `private`, `team`, `driver`, `country`.

Returns **only the current user's** rank in the specified league (as a single-element array):

```json
{
  "trend": 0,
  "cur_rank": 5,
  "social_id": 188548302,
  "team_name": "the%20best%20bot",
  "user_name": "drive%20senna",
  "user_guid": "3dbedbda-3994-11f1-9222-c9d91d11b5d6-0-188548302",
  "cur_points": 496
}
```

> ⚠️ No single endpoint returns the **full** league leaderboard with all members.
> The web app loads individual opponent data via the opponent endpoints below.

---

### Opponent Data

Requires the **opponent GUID** (format: `{guid}-0-{socialId}`).

#### Opponent Game Days

```
GET /services/user/opponentteam/opponentgamedayget/{teamNo}/{opponentGUID}/{v}
```

Returns opponent's matchday points, chip usage, team count.

#### Opponent Team

```
GET /services/user/opponentteam/opponentgamedayplayerteamget/{teamNo}/{opponentGUID}/{v}/{matchdayId}/{v}
```

Returns opponent's full team: player IDs, captain, value, balance, points.

---

## Public Endpoints (no auth required)

#### Drivers Feed

```
GET /feeds/drivers/{matchdayId}_en.json
```

All drivers with: `PlayerId`, `Value`, `TeamId`, `FullName`, `DisplayName`, `DriverTLA`,
`OverallPoints`, `GamedayPoints`, `SelectedPercentage`, `OldPlayerValue`.

#### Live Game State

```
GET /feeds/live/mixapi.json
```

#### Web Config

```
GET /feeds/v2/apps/web_config.json
```

Contains `tourId`, current matchday info, feature flags.

#### Race Schedule

```
GET /feeds/v2/schedule/raceday_en.json
```

---

## Key Values

| Item                 | Value                                  |
| -------------------- | -------------------------------------- |
| MSFT league ID       | `2976007`                              |
| MSFT league code     | `C7UYMMWIO07`                          |
| Test league code     | `C6LTNQCNB04`                          |
| User team name       | `the best bot`                         |
| Opponent GUID format | `{guid}-0-{socialId}`                  |
| Team names           | URL-encoded (e.g., `the%20best%20bot`) |

## Stealth Requirements

- `--disable-blink-features=AutomationControlled`
- `navigator.webdriver = false`
- Realistic user-agent string
- Char-by-char typing with 50-100 ms random delay
- Mouse hover before click
- Rate limit: max 1 login per email per minute, 3 per 5 minutes
