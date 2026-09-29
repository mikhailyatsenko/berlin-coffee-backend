# 07: A concurrent first write to an Interaction doesn't become a 500

Status: ready-for-agent
Blocked by: 04 (Typed resolvers)
Source: `map.md` Notes, "Find-then-create races"

## Problem

Four mutations look up the caller's Interaction for a Place and create it if missing. Two concurrent first writes (a double tap, a Rating and a Characteristic sent together) both see "missing", both create, and the second hits the unique index on owner + `placeId` and fails with `INTERNAL_SERVER_ERROR`.

## Current behaviour

`addRating`, `addTextReview`, `toggleCharacteristic` and `toggleFavorite` do `findOne` → `create` (e.g. `addRatingResolver.ts`: `findOne({...actor.owner, placeId})`, then `Interaction.create` when nothing was found).

## Expected behaviour

- Each of the four writes the Interaction with a single atomic upsert (`findOneAndUpdate(filter, update, { upsert: true, new: true })` or equivalent), so a concurrent first write merges instead of failing.
- Behaviour that depends on "is this the first write" keeps working: the Guest quota in `addRating`/`addTextReview` is consumed only on a first write (derive it from the upsert result, e.g. `includeResultMetadata` / `lastErrorObject.updatedExisting`, not from a separate prior read).
- Toggles stay toggles: two concurrent toggles of the same Characteristic/Favorite end in a consistent state, never an error.
- If a duplicate-key error can still occur (upsert race on a unique index), it is retried once.

## Acceptance criteria

- [ ] None of the four resolvers creates an Interaction with `create` after a `findOne`.
- [ ] Test (per resolver, on `tests/support/mongod.ts`): two concurrent first calls for the same owner and Place both succeed, and exactly one Interaction exists afterwards.
- [ ] Test: the Guest quota is consumed once for a first Rating and not for an update.
- [ ] `tsc --noEmit` and `npm test` pass.
