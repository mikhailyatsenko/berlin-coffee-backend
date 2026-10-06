# 07: Sync plan instead of a direct write: the `plan` subcommand

Status: ready-for-agent

**Spec:** [spec.md](../spec.md) (Module shape, Sync plan file, Testing Decisions).

**What to build:** the Google sync stops writing to Places. Running the script with `plan` looks up the Places and writes a Sync plan JSON file for review; running it with no arguments prints help and sends nothing; `--apply` and the billed "dry run" are gone. The sync becomes a module whose `plan({ limit, dir, now })` returns what it did, behind a thin CLI that parses arguments, connects, calls it and prints. This is the tracer bullet: later tickets add the Sync budget, `apply`, `rollback`, the summary and Lost Google match to this module.

**Blocked by:** None (can start immediately).

Until ticket 13 (rollout) is done, nobody runs `plan` against production: the Sync budget only arrives in 08.

- [ ] A shared fake Google in test support replaces the global `fetch`: answers per Google Place ID with 200 + body, 404, 429 or 500 and records each call (URL, API key header, field mask), following the Text Search fake in the Place suggestion tests.
- [ ] `plan` keeps today's request (field mask, `languageCode=en`, concurrency 3, order by `_id`) and opening-hours normalisation; the 429 retry loop is removed (a 429 is recorded as failed for now; 08 turns it into a stop).
- [ ] The plan file has `meta` (created-at, database identity as host + database name from `MONGO_URI` without credentials, Places looked up, `limit`, field-mask version), `places: [{ placeId, name, changes: [{ field, current, proposed }] }]`, `notFound` and `failed`.
- [ ] Only `businessStatus`, `googleId`, `openingHours`, `phone`, `website` produce changes, only when Google returns a value that differs; Places with no change and already-closed unchanged Places have no entry.
- [ ] `plan` writes `<datetime>-plan.json` into the given `dir` (the CLI defaults to `untracked/google-sync/`) and writes nothing to Places.
- [ ] `--limit=N` looks up only the first N Places by `_id`.
- [ ] No-arg prints help listing the subcommands; `--apply` is rejected as unknown.
- [ ] Tests (throwaway mongod + fake Google): entries per changed field, unchanged Places absent, 404 → `notFound`, 500 → `failed`, `--limit`, the file lands in `dir`, Places unchanged in the database, the fake saw the expected field mask and key.
