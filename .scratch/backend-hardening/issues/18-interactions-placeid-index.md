# 18: Index on `interactions.placeId`

Status: done
Blocked by: 03 (Config module)
Source: `map.md` Notes, "Place stats (A2)" (the index part) and "Facts from production"

## Problem

Every lookup of a Place's Interactions scans the whole collection. On production (2026-09-27: 2381 interactions) a `placeId` lookup is a COLLSCAN, run twice per Place on every map load.

## Current behaviour

- `interactions` has no index with `placeId` as its first key.
- `autoIndex` is off in production, so adding `{ placeId: 1 }` to the schema alone would not create it there.
- One-off scripts live in `src/scripts/` (e.g. `migrateGuestIndexes.ts`).

## Expected behaviour

- `{ placeId: 1 }` declared on the Interaction schema (so development and tests get it through `autoIndex`).
- A migration script in `src/scripts/` that creates the index on the configured database, idempotent (running it twice is harmless), reading the connection from the config module; an npm script to run it.
- The ticket's Comments record the command to run it on production. Running it on production is a human step after merge (read the script first; it only creates an index).

## Acceptance criteria

- [x] Test (`tests/support/mongod.ts`): after the script runs, `interactions` has an index whose first key is `placeId`; running it again succeeds and changes nothing.
- [x] Test: `Interaction.find({ placeId }).explain()` uses `IXSCAN`, not `COLLSCAN`.
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

2026-09-30 (implement): Done on `feat/interactions-placeid-index`.

- `InteractionSchema.index({ placeId: 1 })` in `src/models/Interaction.ts` (dev and tests get it through autoIndex).
- `src/scripts/interactionPlaceIdIndex.ts`: `ensurePlaceIdIndex(connection)` and `PLACE_ID_INDEX` (`placeId_1`), the logic the test calls; `src/scripts/migratePlaceIdIndex.ts` is the runner (connects with `config.mongoUri`, prints the resulting indexes). `createIndex` with a fixed name is a no-op on a second run and creates the collection if missing.
- **Run on production after deploying** (human step; read `src/scripts/migratePlaceIdIndex.ts` first, it only creates an index), from the repo root on the server so dotenv reads the production `.env`:
  ```
  npm run build   # only if the deploy didn't rebuild dist/
  npm run migrate:placeid-index
  ```
  Equivalent: `node dist/scripts/migratePlaceIdIndex.js`. Check that the printed list contains `placeId_1`. An index on `{ placeId: 1 }` under another name would make it fail with IndexOptionsConflict and change nothing; none existed on 2026-09-27.
- Tests: `tests/interactionPlaceIdIndex.test.ts` (4): the schema declares the index the migration creates; the migration creates `placeId_1` after the indexes are dropped and a second run leaves the index list identical; it works on a missing collection; `Interaction.find({ placeId }).explain()` is an IXSCAN on `placeId_1` (fails without the schema declaration, checked).
- Code review, applied: exact name/key assertions, a schema-vs-migration check, `indexName` in the explain test, `beforeEach` `syncIndexes` so the tests don't depend on order, the log line reads the constant, the name-conflict case documented. Not applied: an npm script for `migrateGuestIndexes` too (outside this ticket); the schema still spells the key itself rather than importing from `src/scripts/` (the test now catches drift).
- `tsc --noEmit` clean, `npm test` 301/301.
