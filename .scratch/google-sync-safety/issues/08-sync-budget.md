# 08: Sync budget: reservation, refusal, first-429 stop, and the `budget` subcommand

Status: ready-for-agent

**Spec:** [spec.md](../spec.md) (Sync budget, Schema, Testing Decisions scenarios 1–6). Decisions: [Budget guard](02-budget-guard.md).

**What to build:** `plan` never spends past the Sync budget of 900 Place lookups per US Pacific month, counted in the database so every machine sees the same number. Before any request it reserves what it needs or refuses with how many are left; afterwards it counts what it actually sent and releases the rest; the first 429 stops the run with a partial plan. `budget` shows the month and its runs without asking Google, and `budget --set=N --reason=…` corrects the count.

**Blocked by:** 07 (Sync plan instead of a direct write: the `plan` subcommand).

- [ ] Sync budget constant 900 in the module; month key = calendar month of `now` in `America/Los_Angeles`.
- [ ] A month document `{ month, spent, reserved }` (unique month) and run records `{ month, kind: plan|correction, host, startedAt, finishedAt?, reserved, sent, outcome?: done|stopped-429|error, planPath?, reason?, setTo? }`.
- [ ] `plan` reserves N with one atomic conditional upsert (`spent + reserved + N ≤ 900`); if it fails, a typed refusal with the remaining count and reset time (1st, 00:00 Pacific), and no request sent. N = 0 sends and reserves nothing.
- [ ] Every request counts as sent unless answered 429. At the end `spent += sent`, `reserved -= N`, run record finished; on a thrown error the same finalisation runs best-effort with outcome `error`.
- [ ] The first 429 stops the run: no new requests, in-flight ones finish, unanswered Places go to `failed` with reason `quota`, the plan is written with `meta.stoppedOn: "429"`, outcome `stopped-429`.
- [ ] `budget()` returns spent, reserved, left and the month's run records. `budget({ set, reason })` sets `spent`, zeroes `reserved`, closes unfinished plan records as `error`, adds a `correction` record. CLI: `budget`, `budget --set=N --reason=…`.
- [ ] Tests: (1) a plan that doesn't fit is refused, no request, reservation unchanged; (2) two concurrent `plan` calls that don't fit together → exactly one refused; (3) after a run `spent` = sent (404 and 500 counted, 429 not), the rest released; (4) first 429 stops the run as above; (5) a plan record without a finish shows in `budget`, `budget --set` clears its reservation; (6) `now` on the 1st at 08:59 Berlin is the old month, 09:01 the new one. "Nearly spent" is set up with `budget({ set: 890 })`, the constant is not overridden.
