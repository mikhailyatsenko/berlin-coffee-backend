# 07: Sync plan instead of a direct write: the `plan` subcommand

Status: done

**Spec:** [spec.md](../spec.md) (Module shape, Sync plan file, Testing Decisions).

**What to build:** the Google sync stops writing to Places. Running the script with `plan` looks up the Places and writes a Sync plan JSON file for review; running it with no arguments prints help and sends nothing; `--apply` and the billed "dry run" are gone. The sync becomes a module whose `plan({ limit, dir, now })` returns what it did, behind a thin CLI that parses arguments, connects, calls it and prints. This is the tracer bullet: later tickets add the Sync budget, `apply`, `rollback`, the summary and Lost Google match to this module.

**Blocked by:** None (can start immediately).

Until ticket 13 (rollout) is done, nobody runs `plan` against production: the Sync budget only arrives in 08.

- [x] A shared fake Google in test support replaces the global `fetch`: answers per Google Place ID with 200 + body, 404, 429 or 500 and records each call (URL, API key header, field mask), following the Text Search fake in the Place suggestion tests.
- [x] `plan` keeps today's request (field mask, `languageCode=en`, concurrency 3, order by `_id`) and opening-hours normalisation; the 429 retry loop is removed (a 429 is recorded as failed for now; 08 turns it into a stop).
- [x] The plan file has `meta` (created-at, database identity as host + database name from `MONGO_URI` without credentials, Places looked up, `limit`, field-mask version), `places: [{ placeId, name, changes: [{ field, current, proposed }] }]`, `notFound` and `failed`.
- [x] Only `businessStatus`, `googleId`, `openingHours`, `phone`, `website` produce changes, only when Google returns a value that differs; Places with no change and already-closed unchanged Places have no entry.
- [x] `plan` writes `<datetime>-plan.json` into the given `dir` (the CLI defaults to `untracked/google-sync/`) and writes nothing to Places.
- [x] `--limit=N` looks up only the first N Places by `_id`.
- [x] No-arg prints help listing the subcommands; `--apply` is rejected as unknown.
- [x] Tests (throwaway mongod + fake Google): entries per changed field, unchanged Places absent, 404 → `notFound`, 500 → `failed`, `--limit`, the file lands in `dir`, Places unchanged in the database, the fake saw the expected field mask and key.

## Comments

- 2026-10-06: Done on `feat/google-sync-plan`.
  - Module `src/scripts/googleSync.ts` exports `plan({ limit, dir, now })`, which returns `{ path, syncPlan }`, plus `databaseIdentity(uri)`. `src/scripts/syncGooglePlaces.ts` is the thin CLI. No arguments print help (exit 0). `--apply`, an unknown subcommand and an invalid `--limit` (0, not a number) print an error plus help and exit 1, before any connection to Mongo.
  - The fake Google is `tests/support/fakeGoogle.ts`: `useFakeGoogle()` returns `place(id, body)`, `status(id, code)`, `calls` and `reset()`. An ID that was not set up answers 404. The Text Search test in `placeSuggestions.test.ts` still uses its own inline fake; moving it onto the shared helper is optional.
  - Decisions within the ticket: the file name is `2026-10-06T12-34-56Z-plan.json` (UTC, `:` replaced by `-`). `fieldMaskVersion` is `1`. `meta.limit` is `null` without `--limit`. In the file, `places`/`notFound`/`failed` are sorted by `_id` (the pool finishes out of order). A network error from `fetch` goes to `failed` with its message instead of crashing the run. The plan is written even when nothing was looked up.
  - For 08: `FetchResult` still has a single `error` variant, and a 429 differs only by the `"429 …"` text in `reason`. 08 needs its own variant to stop the run and not count the request.
  - For 09: `current` comes from `lean()` (no mongoose defaults). A missing `businessStatus` is written as `"OPERATIONAL"`, and missing `phone`/`website` as `null`. `apply` must compare the database value with the same normalisation, or old documents without these fields will go to "changed since plan".
  - `docs/google-places-sync.md` still describes `--apply` and the dry run; ticket 13 rewrites it.
  - Tests: `tests/googleSyncPlan.test.ts`, 9 tests. Full suite 331/331. No requests were sent to Google, and `plan` was not run against any real database.
