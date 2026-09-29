# 07: A concurrent first write to an Interaction doesn't become a 500

Status: done
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

- [x] None of the four resolvers creates an Interaction with `create` after a `findOne`.
- [x] Test (per resolver, on `tests/support/mongod.ts`): two concurrent first calls for the same owner and Place both succeed, and exactly one Interaction exists afterwards.
- [x] Test: the Guest quota is consumed once for a first Rating and not for an update.
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

**2026-09-29, implemented** (branch `feat/upsert-first-interaction`).

- New `src/utils/upsertInteraction.ts`: `upsertInteraction(actor, placeId, update, req)` writes the Review with one `findOneAndUpdate(..., { upsert: true, new: true, includeResultMetadata: true, runValidators: true })`, retrying once on E11000. `toggleInteractionField(actor, placeId, field, req)` makes sure the Review exists (an upsert with only `$setOnInsert`, so the schema defaults apply), then flips the field with an update pipeline (`$not: [{ $eq: ["$field", true] }]`) computed on the server. `field` is typed as `ToggleField` (`"isFavorite"` or `` `characteristics.${…}` ``).
- `addRating` and `addTextReview` go through `upsertInteraction`; `toggleCharacteristic` and `toggleFavorite` go through `toggleInteractionField`. None of them calls `findOne`, `create` or `save` any more. The ticket 06 order (value → actor → Place → Guest quota) holds, because the quota is taken inside the helper, after `assertPlaceExists`.
- Guest quota, derived from the upsert result:
  - A Guest's write is first tried as a plain `findOneAndUpdate` without upsert. This is an atomic write, not a separate read. If it matches, it was a revision: no quota is charged, and an exhausted Guest can still revise.
  - Otherwise the quota is **taken before** the upsert with `consumeRateLimit`, so a refused first write stores nothing. It is **given back** (new `refundRateLimit` in `rateLimit.ts`) when `lastErrorObject.updatedExisting` shows a concurrent call created the Review first, or when the upsert throws.
  - The first version checked before the upsert and counted after it. The Spec review showed that with one slot left, two concurrent first writes to different Places both got stored and one still returned RATE_LIMITED. A test covers this now.
  - A remaining edge, accepted: a Guest with exactly one slot left who double-taps a first write to the same Place gets RATE_LIMITED on the second tap, although it would have merged.
- Behaviour changes:
  - Two concurrent *first* toggles now end **off** (two toggles), where the second one used to fail with a 500.
  - Two concurrent toggles on an existing Review used to lose one update (`doc.save()` overwrote); now they cancel out.
  - A toggle no longer changes `date` on an existing Review, the same as before.
- `userActor(user)` in `reviewActor.ts` builds the actor for User-only mutations (`toggleFavorite`); `resolveReviewActor` uses it too.
- Tests: `tests/concurrentFirstWrite.test.ts` has 18 tests. They cover a concurrent double first call per resolver (one Review afterwards), a Rating and a Characteristic sent together, the returned `reviewId`, toggle on/off and schema defaults, concurrent toggles cancelling out, and the Guest quota: once for a first Rating, not for updates, once for two concurrent first Ratings, and the last-slot race above. They also cover an exhausted Guest revising while a first write is refused and stores nothing, and the E11000 retry happening once and only once (a stubbed `findOneAndUpdate`; the real race is usually absorbed by the server's own upsert retry).
- Code review:
  - Spec found the quota race above (fixed) and the lost schema validation on upsert (fixed with `runValidators`).
  - Standards: applied glossary terms in the test names and comments, `ToggleField` instead of a plain string, and `userActor`.
  - Not applied: splitting quota policy out of `upsertInteraction`. The ordering between the upsert and the quota is the point of the helper.
- `tsc --noEmit` is clean and `npm test` passes 182/182. Frontend: nothing to hand off, the schema is unchanged.
