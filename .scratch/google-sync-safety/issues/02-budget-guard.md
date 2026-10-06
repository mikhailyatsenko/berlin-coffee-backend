# Budget guard: how the script knows and enforces the monthly allowance

Type: grilling
Status: resolved
Blocked by: 01, 04

## Question

How does a Google sync refuse to go past the free allowance?

- Where the count of Places looked up this month is kept so that runs from the laptop and from the server see the same number (a collection in the prod database, a file, Google's own metrics if 01 finds them readable).
- What counts: every request sent, or only the billed ones per 01; are dry/plan runs and `--limit` runs counted the same way.
- The threshold (the full free allowance or a margin) and what happens when a run would cross it: refuse up front, stop mid-run, or shrink to what is left.
- What hard quota to set in Google Cloud as the second line of defence, and its value, given 01's answer on whether it would also block the free Text Search.
- Facts from 01 that shape this: 404 (Place ID not found) is billed, 429 is not; the free allowance resets on the 1st at 00:00 US Pacific; Google's own usage numbers lag up to 48 h, so a real-time count must be the script's own.
- The 429 retry loop (up to 4 retries, 15–60 s apart): once a hard daily cap is hit, every remaining Place would wait ~2.5 min for nothing. Should the guard stop the run on a cap-shaped 429 instead?
- From "Sync plan shape, applying it, and rolling it back": `--limit` on `plan` is first N Places by `_id` for now. Decide here whether shrinking to the remaining allowance needs "least recently checked first" (a per-Place last-checked mark) so limited runs cover every Place over time. "Log" is reserved for this ticket's spend record; the write record is the **Applied sync**.

## Answer

Resolved by grilling with the owner, 2026-10-06. Glossary: **Sync budget** added in `CONTEXT.md`. Only `syncGooglePlaces.ts` calls Place Details (checked: the backend's only other Places call is Text Search; the frontend makes none).

**Ledger: a collection in the prod database** (the one store the laptop and the server share). One document per billing month, `{ month: "2026-10", spent, reserved }`, keyed by the calendar month in `America/Los_Angeles`. Plus one record per run: hostname, started/finished at, reserved N, requests actually sent, outcome (`done` / `stopped-429`; a run with no finish crashed), plan file path. Manual corrections are records too, with a reason. Google's metrics aren't used (48 h lag).

**What counts:** every request sent, except those answered 429. 404, 5xx and network failures count (conservative). `plan --limit` counts like a full run. `apply`, `rollback`, `summary` send nothing.

**Sync budget = 900/month**, a constant in code (raising it is a commit, not a flag). The margin of 100 covers in-flight requests, month-boundary edge cases and any other project on the billing account.

**Enforcement:**
- `plan` reserves N up front with one atomic conditional update on the month document ("add N if spent + reserved + N ≤ 900"). If it fails, refuse before any request and print "R left, needs N; run `plan --limit=R` or wait for the 1st, 09:00 Berlin". No automatic shrinking: a partial plan is the admin's explicit choice.
- At the end, the unused part of the reservation is released and `spent` gets the requests actually sent. A crash leaves the reservation counted (overcounts, never overspends). A concurrent second run gets an honest refusal.
- A run that starts before Pacific midnight is counted in the month of its reservation.

**`budget` subcommand:** shows the month (spent, reserved, left) and its runs; no Google request. `budget --set=N --reason=…` seeds the month at rollout from the GMP console figure and clears a stuck reservation after a crash.

**429:** retries removed. The first 429 stops the run: no new requests, in-flight ones finish, unanswered Places go to `failed` with reason "quota", the unused reservation is released. The partial plan is still written (its requests are paid for) with `stoppedOn: "429"` in metadata, shown as the summary's first line. At our concurrency (3) and size (446) the 600/min quota is out of reach, so a 429 means the daily cap or a Google fault.

**Google Cloud hard cap (second line):** `GetPlaceRequest per day = 500` on project `berlin-coffee-f0bf8`; per-minute left at 600. A full run fits in a day with ~50 buffer for the cap's inexactness; worst-case leak ≈ 15,000/month (≈ $280) instead of unbounded. Text Search has its own rows, unaffected. Set by the owner by hand at rollout from a checklist in the spec; rule in the doc: when Places exceed ~450, raise to Places + 10 %. Nothing changed in Cloud in this session.

**`--limit`** keeps "first N by `_id`" (partial runs are tests or rare). "Least recently checked first" ruled out of scope for now.

**Sync plan and Applied sync stay files** in `untracked/google-sync/` (closes the hand-over from 03): the run record in the ledger names the host and plan path, which is enough to find it.

**Runs against a non-prod database** are not guarded (the ledger would be empty there): the doc says `plan` runs only against prod, tests use a fake fetch, and the daily cap catches mistakes.
