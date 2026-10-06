# How the Google sync's tests run without real Google requests

Type: grilling
Status: resolved
Blocked by:

## Question

The new script (subcommands `plan`/`apply`/`rollback`/`summary`/`budget`, see 03 and 02) must be testable without billed requests: tests use a fake, never the real key (02 relies on this). Where does the seam go?

- A fake global `fetch` vs. an injected `fetchPlace` (or a small Google client module) passed into `plan`.
- How tests drive the budget paths: refusal up front, atomic reservation with two concurrent runs, release after a run, stop on first 429 with a partial plan, crash leaving a reservation (ledger in the test Mongo, as the existing tests do).
- How tests cover `apply`/`rollback`'s per-entry checks and the database-identity refusal.
- Whether the subcommands are split into modules callable from tests, with the CLI a thin wrapper.
- Lost Google match (05): a 404 proposes `googleNotFoundId`; marked Places are skipped and left out of the reservation; a changed `googleId` makes them looked up again.

Consult `mattpocock-skills:codebase-design` alongside grilling.

## Answer

Resolved by grilling with the owner, 2026-10-06.

**Seam: the global `fetch`**, as `tests/placeSuggestions.test.ts` already does for Text Search. A shared fake in `tests/support/fakeGooglePlaces.ts` answers per Place ID with 200 + body, 404, 429 or 500 and records every call (URL, key, field mask). This keeps the real request code under test, including the status handling the Sync budget depends on (404 marks, 429 stops, everything but 429 counts). An injected Google client was rejected: one real adapter only, and the status mapping would go untested.

**Shape: a module plus a thin CLI.** The subcommands become exported functions (e.g. under `src/googleSync/`): `plan({ limit, dir, now })`, `apply(planPath, { now })`, `rollback(appliedPath)`, `summary(planPath)`, `budget({ set, reason, now })`. They use an already-open mongoose connection, write files to the given `dir`, take `now` for the clock (Pacific month boundary, 7-day plan age), and return results and typed refusals instead of printing. `src/scripts/syncGooglePlaces.ts` only parses argv, connects, calls, prints. (Spawning the CLI in tests was ruled out: the fake `fetch` only works in the test's own process.)

**Tests:** throwaway mongod (`tests/support/mongod.ts`), fake fetch, a temp directory for plan files. The 900 budget isn't overridden; "nearly spent" is set up with `budget({ set: 890 })`. Required scenarios:

1. Plan doesn't fit → refused, no request, reservation untouched.
2. Two concurrent `plan` calls that don't fit together → exactly one refused.
3. After a run `spent` = requests sent (404 and 500 counted, 429 not); the rest of the reservation released.
4. First 429 stops the run: no new requests, plan written with `stoppedOn: "429"`, unanswered Places in `failed`.
5. A run record with no finish shows in `budget`; `budget --set` clears its reservation.
6. Month boundary: `now` on the 1st at 08:59 Berlin is the old month, 09:01 the new one.
7. 404 → `notFound` + `googleNotFoundId` entry; next `plan` skips the Place and leaves it out of the reservation; a changed `googleId` makes it looked up again.
8. `apply` per entry: matches `current` → write; equals `proposed` → "already applied"; otherwise "changed since plan".
9. `rollback` restores values and leaves fields edited since alone.
10. `apply` / `rollback` refuse on a database identity mismatch.
11. Plan older than 7 days → warning only.

Not covered: summary wording (reviewed by eye), the CLI wrapper, a process kill mid-`apply`.
