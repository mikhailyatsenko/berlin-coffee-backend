# Map: Safe and economical Google sync

Label: wayfinder:map

## Destination

A spec at `.scratch/google-sync-safety/spec.md` for reworking `src/scripts/syncGooglePlaces.ts` and its flow (`docs/google-places-sync.md`) so that a Google sync never exceeds the free monthly allowance by accident and nothing reaches the production database without the admin having reviewed it and being able to undo it. The spec is then cut into tickets with `/mattpocock-skills:to-tickets`.

## Notes

- **Destination reached 2026-10-06:** [spec.md](spec.md) written (`ready-for-agent`); next is `/mattpocock-skills:to-tickets`.

- Domain terms: **Google sync**, **Sync plan**, **Place** (see `CONTEXT.md`). Resolving sessions consult `grilling` and `domain-modeling`.
- Settled in charting (2026-10-06):
  - Flow is two-phase: Google → Sync plan (JSON) → review → write from the plan, with no second round of Google requests.
  - Review happens on the JSON plus a short human-readable summary; deleting an entry from the plan means "don't apply it". No admin UI.
  - Manual edits are protected only by reviewing the plan; no per-field pinning for now.
  - In scope: the two-phase flow, a budget guard in the script, a hard quota in Google Cloud, backup before writing plus a way to roll back.
- Facts at charting time: 446 Places, all with a Google Place ID; Place Details is billed per Place looked up (free allowance documented as 1000/month, resets on the 1st); a full run was applied in September 2026. `--apply` against prod only with the owner's explicit go-ahead.
- The script runs from the dev's machine and from the server against the same prod `MONGO_URI`.

## Decisions so far

<!-- one line per resolved ticket: [title](issues/NN-slug.md): gist -->

- [Sync plan shape, applying it, and rolling it back](issues/03-sync-plan-and-rollback.md): per-field entries grouped by Place; stale entries skipped on apply; rollback from the Applied sync; files in `untracked/google-sync/`; subcommands `plan`/`apply`/`rollback`/`summary`, no-arg prints help.
- [Places API (New) pricing and quota facts for the Google sync](issues/01-places-pricing-and-quotas.md): each sync request = 1 Place Details Enterprise event (1,000 free/month per billing account, $20/1000, resets 1st 00:00 US Pacific); 404s are billed, 429s are not; quotas are per method (Text Search unaffected), inexact, return 429; a per-day GetPlace quota is not confirmed by docs (check console); billing usage lags up to 48 h, so the script keeps its own ledger.
- [Check which Place Details quotas the Google Cloud console offers](issues/04-check-getplace-quotas.md): Places API (New) has per-method quotas, all adjustable; `GetPlaceRequest per day` (default 125,000) and `per minute` (600) exist, Text Search has its own rows, no API-wide quota, no per-month quota.
- [Budget guard: how the script knows and enforces the monthly allowance](issues/02-budget-guard.md): Sync budget 900/month (Pacific) in a prod-DB ledger; `plan` reserves N atomically up front or refuses, releases the rest at the end; everything but 429 counts; first 429 stops the run; `budget` subcommand to view/correct; Cloud cap `GetPlaceRequest per day = 500` set by hand; plans stay files.
- [Places Google answers "not found" for](issues/05-not-found-places.md): a 404 proposes a `googleNotFoundId` mark through the plan; marked Places (Lost Google match) are skipped while the ID is unchanged and stay on the map; no automatic candidate search, the summary lists them with a Maps link and the admin fixes `googleId` by hand.
- [How the Google sync's tests run without real Google requests](issues/06-testing-without-google.md): fake global `fetch` (shared support fake), subcommands as functions returning results with `dir`/`now` params behind a thin CLI, throwaway mongod; 11 required scenarios.

## Not yet specified

<!-- empty: the way to the spec is clear (2026-10-06). The doc rewrite (`docs/google-places-sync.md`, incl. 01's corrections, 02's daily-cap rule and rollout checklist, 05's Lost Google match flow) goes into the spec as a "Doc changes" section. -->

## Out of scope

- Running the Google sync on a schedule (cron / GitHub Actions): pointless while every plan is reviewed by hand; revisit as its own effort.
- Reviewing the Sync plan in the frontend admin: too costly for a monthly run.
- Per-field pinning of manual edits: protection comes from plan review for now (may return if manual corrections pile up).
- `plan --limit` picking the least recently checked Places first: partial runs are tests or rare; revisit if they become routine (from [Budget guard](issues/02-budget-guard.md)).
- Cleaning up the unrestricted old `API key 2` in Google Cloud: a one-line checklist item for the owner, not part of this route.
