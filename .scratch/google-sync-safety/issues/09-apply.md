# 09: Applying a Sync plan and recording the Applied sync

Status: done

**Spec:** [spec.md](../spec.md) (Applying and rolling back, Testing Decisions scenarios 8, 10, 11). Decisions: [Sync plan shape, applying it, and rolling it back](03-sync-plan-and-rollback.md).

**What to build:** after reviewing and trimming a Sync plan, the admin runs `apply <plan.json>` and only what is left in it reaches Places, without ever overwriting a field edited since the plan was made. Every write is recorded in an Applied sync file so it can be undone.

**Blocked by:** 07 (Sync plan instead of a direct write: the `plan` subcommand).

- [x] Per entry: database value equals `current` → write `proposed`; equals `proposed` → "already applied"; otherwise skip as "changed since plan". Opening hours compare with the same normalisation as `plan`. A Place's other entries still apply when one is skipped.
- [x] `notFound` and `failed` sections are ignored.
- [x] Typed refusal when the plan's database identity differs from the connected database; nothing written.
- [x] A plan older than 7 days (by `now`) applies with a warning in the result.
- [x] `<datetime>-applied.json` next to the plan, appended after each Place: the plan's database identity, written entries with `current` as read at write time, skipped entries with their reason.
- [x] `apply(planPath, { now })` returns written / already applied / skipped per entry; CLI `apply <plan.json>` prints it.
- [x] Tests: (8) the three per-entry outcomes, other entries of the Place still applied; (10) refusal on a different database identity; (11) old plan applies with a warning; the Applied sync file holds what was written with previous values.

## Comments

- 2026-10-06: Done on `feat/gss-09-apply`.
  - `src/scripts/googleSync.ts` exports `apply(planPath, { now })`, which returns `{ path, appliedSync, warnings }`, plus `DatabaseMismatchError` (fields `file` and `connected`, both `{ host, name }`) and the `AppliedSync` / `SkipReason` types. The CLI `apply <plan.json>` prints warnings, one line per entry and the counts; `apply` without exactly one argument prints an error plus help and exits 1 before connecting.
  - Applied sync file: `{ meta: { plan, planCreatedAt, appliedAt, database }, written: [{ placeId, name, field, current, proposed }], skipped: [{ placeId, name, field, reason }] }`. `meta.plan` is the plan's file name; `meta.database` is the plan's identity (equal to the connected one, or `apply` would have refused). `reason` is `"already applied"` or `"changed since plan"`, so "already applied" lives in `skipped`, not in a third list. The file is written once before the first Place (an empty run still leaves one) and rewritten in full after each Place. Name `<datetime>-applied.json` from `now`, same stamp as the plan.
  - Comparison: both sides go through one normaliser that matches how `plan` records `current` (missing `businessStatus` → `"OPERATIONAL"`, missing strings → `null`, hours as plain `{ day, hours }` with narrow/no-break spaces turned into spaces). The `current` stored in `written` is that normalised value, not the raw document value (so for an old document without `phone` it is `null`, not absent).
  - Decisions within the ticket: writes are one compare-and-set `updateOne` per Place whose filter holds every field to write exactly as just read (missing field → `$exists: false`); if it matches nothing, all those entries go to skipped as "changed since plan". A Place deleted since the plan has all its entries skipped as "changed since plan". The database identity is compared against `databaseIdentity(config.mongoUri)`, like `plan`, not against the live connection's host. "Older than 7 days" is strictly more than 7×24 h; the warning names the age in whole days. A plan entry whose `field` is not one of the five sync fields refuses the whole plan before anything is written (guards a hand-edited JSON from reaching e.g. `name`).
  - For 10: rollback can reuse the normaliser (`comparable`/`sameValue`) and `DatabaseMismatchError` (its message says "The file was made from…", fine for an Applied sync too). Per written entry: database value equals `proposed` → write `current` back. `current` is the normalised value, so restoring a field that was absent writes `null`/`"OPERATIONAL"`/`[]`, which reads the same everywhere. Ignore `skipped`.
  - For 12: `SYNC_FIELDS` is the whitelist `apply` checks; the `googleNotFoundId` entry must be added there, and it sets two properties (`googleNotFoundId` + `googleNotFoundAt`), so the one-`$set`-per-field assumption in `apply` needs a special case.
  - Tests: `tests/googleSyncApply.test.ts`, 8 tests (plans made through `plan` with the fake Google; nothing reaches Google from `apply`). Full suite 339/339, `tsc --noEmit` clean.
