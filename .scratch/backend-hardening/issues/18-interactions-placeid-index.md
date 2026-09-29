# 18: Index on `interactions.placeId`

Status: ready-for-agent
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

- [ ] Test (`tests/support/mongod.ts`): after the script runs, `interactions` has an index whose first key is `placeId`; running it again succeeds and changes nothing.
- [ ] Test: `Interaction.find({ placeId }).explain()` uses `IXSCAN`, not `COLLSCAN`.
- [ ] `tsc --noEmit` and `npm test` pass.
