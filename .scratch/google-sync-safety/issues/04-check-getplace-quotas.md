# Check which Place Details quotas the Google Cloud console offers

Type: task
Status: resolved
Blocked by: 01

## Question

Public docs don't name Places API (New) quotas or say whether Place Details (GetPlace) has a per-day limit or only per-minute (see 01). The owner checks the console so the budget guard can rely on facts. HITL checklist:

1. console.cloud.google.com → project `berlin-coffee-f0bf8` → APIs & Services → Places API (New) → Quotas & System Limits.
2. Filter by "Place Details" / "GetPlace". Write down every quota row: name, unit (per minute / per day), current value, and whether it can be edited.
3. Note the same for Text Search (SearchText), only to confirm it is a separate row.
4. Don't change anything yet; the value to set is decided in the budget guard ticket.

Resolved when the rows are recorded under `## Answer`.

## Answer

Read 2026-10-06 by the agent through chrome-devtools (owner logged in), project `berlin-coffee-f0bf8`: Google Maps Platform → Quotas → Places API (New) → Quotas & System Limits. Read only, nothing changed. 21 rows, all of type Quota, no dimensions, all **Adjustable: Yes**, current usage 0 on every row.

Place Details:

| Name | Value |
| --- | --- |
| GetPlaceRequest per day | 125,000 |
| GetPlaceRequest per minute | 600 |
| GetPlaceRequest per minute per user | Unlimited |

Text Search (a separate set of rows, so a GetPlace cap doesn't touch it):

| Name | Value |
| --- | --- |
| SearchTextRequest per day | 75,000 |
| SearchTextRequest per minute | 600 |
| SearchTextRequest per minute per user | Unlimited |

Other methods follow the same per day / per minute / per minute per user pattern: AutocompletePlacesRequest (175,000 / 12,000 / Unlimited), GetPhotoMediaRequest (175,000 / 600 / Unlimited), SearchNearbyRequest (75,000 / 600 / Unlimited), SearchMediaRequest (Unlimited / 600 / Unlimited), SearchReviewPostsRequest (Unlimited / 600 / Unlimited).

What this means for the budget guard:

- **A per-day GetPlace quota exists and can be edited** (`GetPlaceRequest per day`), and so does a per-minute one. There is no API-wide quota row, so lowering the GetPlace caps doesn't limit Text Search.
- Right now nothing protects the allowance: 125,000/day is the default and far above the 1,000 free per month. A full run (446 Places) fits in one day and easily under 600/min.
- Google has no per-month quota. The best hard cap is per day, and per 01 it is inexact and resets at midnight Pacific. The monthly limit stays with the script's own ledger.
- The value to set is decided in "Budget guard: how the script knows and enforces the monthly allowance".
