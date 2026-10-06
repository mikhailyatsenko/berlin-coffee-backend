# 08: Sync budget: reservation, refusal, first-429 stop, and the `budget` subcommand

Status: done

**Spec:** [spec.md](../spec.md) (Sync budget, Schema, Testing Decisions scenarios 1–6). Decisions: [Budget guard](02-budget-guard.md).

**What to build:** `plan` never spends past the Sync budget of 900 Place lookups per US Pacific month, counted in the database so every machine sees the same number. Before any request it reserves what it needs or refuses with how many are left; afterwards it counts what it actually sent and releases the rest; the first 429 stops the run with a partial plan. `budget` shows the month and its runs without asking Google, and `budget --set=N --reason=…` corrects the count.

**Blocked by:** 07 (Sync plan instead of a direct write: the `plan` subcommand).

- [x] Sync budget constant 900 in the module; month key = calendar month of `now` in `America/Los_Angeles`.
- [x] A month document `{ month, spent, reserved }` (unique month) and run records `{ month, kind: plan|correction, host, startedAt, finishedAt?, reserved, sent, outcome?: done|stopped-429|error, planPath?, reason?, setTo? }`.
- [x] `plan` reserves N with one atomic conditional upsert (`spent + reserved + N ≤ 900`); if it fails, a typed refusal with the remaining count and reset time (1st, 00:00 Pacific), and no request sent. N = 0 sends and reserves nothing.
- [x] Every request counts as sent unless answered 429. At the end `spent += sent`, `reserved -= N`, run record finished; on a thrown error the same finalisation runs best-effort with outcome `error`.
- [x] The first 429 stops the run: no new requests, in-flight ones finish, unanswered Places go to `failed` with reason `quota`, the plan is written with `meta.stoppedOn: "429"`, outcome `stopped-429`.
- [x] `budget()` returns spent, reserved, left and the month's run records. `budget({ set, reason })` sets `spent`, zeroes `reserved`, closes unfinished plan records as `error`, adds a `correction` record. CLI: `budget`, `budget --set=N --reason=…`.
- [x] Tests: (1) a plan that doesn't fit is refused, no request, reservation unchanged; (2) two concurrent `plan` calls that don't fit together → exactly one refused; (3) after a run `spent` = sent (404 and 500 counted, 429 not), the rest released; (4) first 429 stops the run as above; (5) a plan record without a finish shows in `budget`, `budget --set` clears its reservation; (6) `now` on the 1st at 08:59 Berlin is the old month, 09:01 the new one. "Nearly spent" is set up with `budget({ set: 890 })`, the constant is not overridden.

## Comments

- 2026-10-06: Done on `feat/gss-08-sync-budget` (off `feat/google-sync-plan`).
  - Module `src/scripts/googleSync.ts` now also exports `SYNC_BUDGET` (900), `SyncBudgetRefusal` (`month`, `needed`, `left`, `resetsAt`; its message suggests `plan --limit=<left>`) and `budget({ set, reason, now })`, which returns `{ month, budget, spent, reserved, left, resetsAt, runs }`. New models `src/models/SyncBudgetMonth.ts` (unique `month`) and `src/models/SyncRun.ts`. CLI: `budget`, `budget --set=N --reason=…` (`--set` and `--reason` only together; checked before connecting). A refusal prints the message and exits 1.
  - Decisions within the ticket:
    - The reservation is two steps: an upsert with `$setOnInsert` makes sure the month document exists (a duplicate key from a concurrent first upsert is ignored), then one atomic conditional `findOneAndUpdate` with `$expr: spent + reserved + N ≤ 900` and `$inc reserved`. A single upsert with `$expr` would turn "doesn't fit" into a duplicate-key error, and two first runs of a fresh month could falsely refuse each other.
    - The run record is created right after the reservation. `startedAt` is `now`; `finishedAt` is `now` plus the real elapsed time. A run with nothing to look up (N = 0) creates no month document and no run record.
    - On a 429 the Place that got it also goes to `failed` with reason `quota`, as do the Places never requested. Answered Places in flight are processed normally. `meta.lookedUp` stays the number of Places selected (N), so the counters still add up in a partial plan.
    - The thrown-error path finishes the run with `error` and swallows any error from the finalisation itself so the original error is rethrown. A network error from `fetch` counts as sent.
    - `budget({ set })` validates a whole, non-negative `set` and a non-empty reason. Unfinished plan records get `finishedAt` = `now` of the correction.
  - Test support: `useFakeGoogle()` gained `hang(id)`. Google never answers that ID, which freezes a run mid-flight the way a killed process would leave it.
  - For 09: `apply` touches no budget. The plan file's `meta` may now carry `stoppedOn: "429"`; `apply` should treat a partial plan like any other.
  - For 11: the summary's first line comes from `meta.stoppedOn`. Places failed with reason `quota` are the ones the stop left unanswered.
  - For 12: N for the reservation is `places.length` after `findPlaces(limit)`. Excluding Lost Google matches belongs in that query (`googleNotFoundId` ≠ `googleId`), so it reduces N automatically. Do the `skipped` lookup separately so it reserves nothing.
  - For 13: the doc should mention `budget --set` for rollout seeding and that a refusal sends nothing.
  - Tests: `tests/googleSyncBudget.test.ts`, 9 tests (scenarios 1–6, plus error finalisation, N = 0 and correction validation). In `tests/googleSyncPlan.test.ts` the 429 case moved out of the 404/500 test into the budget suite, so that file still has 9 tests. Full suite 340/340; `tsc --noEmit` clean for both `tsconfig.build.json` and `tsconfig.json`. No request was sent to Google, and `plan` was not run against any real database.
