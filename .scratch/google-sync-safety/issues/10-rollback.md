# 10: Rolling back from an Applied sync

Status: done

**Spec:** [spec.md](../spec.md) (Applying and rolling back, Testing Decisions scenarios 9, 10).

**What to build:** when an applied Google sync turns out wrong, the admin runs `rollback <applied.json>` and every field it wrote gets its previous value back, except fields edited again since, which are left alone and reported.

**Blocked by:** 09 (Applying a Sync plan and recording the Applied sync).

- [x] For each written entry: database value equals what `apply` wrote → write the recorded previous value back; otherwise leave it and report "changed since apply".
- [x] Skipped entries in the Applied sync are ignored.
- [x] Typed refusal when the Applied sync's database identity differs from the connected database.
- [x] `rollback(appliedPath)` returns restored / left alone per entry; CLI `rollback <applied.json>` prints it.
- [x] Tests: (9) values restored, a field edited after the apply left alone and reported; (10) refusal on a different database identity.

## Comments

- 2026-10-06: Done on `feat/gss-10-rollback`.
  - `src/scripts/googleSync.ts` exports `rollback(appliedPath)`, which returns `RollbackResult`: `{ restored: [{ placeId, name, field, restored, replaced }], leftAlone: [{ placeId, name, field, reason: "changed since apply" }] }`. `restored` is the Applied sync's `current` written back, `replaced` the `proposed` it overwrote. The CLI `rollback <applied.json>` prints one line per entry and the counts; `rollback` without exactly one argument prints an error plus help and exits 1 before connecting. Help text lists the subcommand.
  - Reuses `comparable`/`sameValue` and `DatabaseMismatchError` from `apply`. Per written entry: database value equals `proposed` (same normalisation) → write `current` back; anything else, including a Place deleted since, is left alone as "changed since apply". `skipped` of the Applied sync is never read.
  - Decisions within the ticket: same one-compare-and-set-`updateOne`-per-Place as `apply` (filter holds every field to restore exactly as just read; no match → all those entries left alone). Rollback writes no file of its own: the result and the CLI output are the record. A field that was absent before the apply is restored to its normalised empty value (`null`, `"OPERATIONAL"`, `[]`), as noted in 09. A written entry whose `field` is not one of the five sync fields refuses the whole Applied sync before anything is written, like `apply`. Rerunning `rollback` is harmless: every entry is then "changed since apply".
  - For 12: rolling back a `googleNotFoundId` entry must clear both `googleNotFoundId` and `googleNotFoundAt`; the one-`$set`-per-field assumption here needs the same special case as in `apply`.
  - Tests: `tests/googleSyncRollback.test.ts`, 5 tests (Applied syncs made through `plan` + `apply` with the fake Google; nothing reaches Google from `rollback`). Full suite 344/344, `tsc --noEmit` clean. `rollback` was not run against any real database.
