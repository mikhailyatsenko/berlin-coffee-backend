# 21: One Place stats module for Average rating and counts

Status: done
Blocked by: 04 (Typed resolvers), 17 (Guest deletes own Review)
Source: `map.md` Notes, "Place stats (A2)"; [Typed resolvers](../../backend-audit/issues/02-type-resolvers-with-codegen.md) (`averageRating` as a string)

## Problem

The Average rating and the Review/Rating counts of a Place are computed in six places with six slightly different aggregations, so the same Place can show different numbers depending on which query loaded it. `deleteReview` even returns `averageRating` as a string (`toFixed(1)`).

## Current behaviour

Separate `$avg` / count aggregations in `places` (`allPlacesResolver/services/placeAggregationService.ts`), `filteredPlaces` (`filteredPlacesAggregationService.ts`, `formatFilteredPlace.ts`), `place` (`placeResolver/services/placeAggregationService.ts`), `favoritePlaces` (`favoritePlacesService.ts`), `addRating` and `deleteReview`; `userReviewActivity` also touches `averageRating`.

## Expected behaviour

- One module owns how a Place's stats are computed from Interactions (Average rating over Ratings that exist, Rating count, Review count; the same rounding everywhere, returned as a number). It offers a per-Place function and a pipeline stage/lookup for the list queries.
- All six resolvers use it; the numbers they return for the same Place are identical.
- No denormalization (no stored stats on Place).
- `deleteReview` returns `averageRating` as a number; the matching `@ts-expect-error` from ticket 04 is gone.
- Relies on the `placeId` index from ticket 18 for speed but doesn't require it to be correct.

## Acceptance criteria

- [x] Test: for one Place with a known set of Ratings (including a Review without a Rating and an empty document left by `deleteAll`), `places`, `filteredPlaces`, `place`, `favoritePlaces`, `addRating` and `deleteReview` return the same `averageRating` and counts.
- [x] Test: `deleteReview` returns `averageRating` as a number.
- [x] Only the stats module contains the Average rating aggregation.
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

2026-09-30 (implement): Done on `feat/place-stats-module`.

- `src/utils/placeStats.ts`: `getPlaceStats(placeId)` for `addRating` and `deleteReview`, `placeStatsStages()` (a `$lookup` on `_id` plus `$addFields`) for `places`, `filteredPlaces`, `place`, `favoritePlaces` and `userReviewActivity`. The only Rating aggregation in `src`; no `$avg`/`toFixed` left in the resolvers, both `@ts-expect-error Ticket 21` are gone.
- Rounding: half up to one decimal, in integers from sum and count (`floor((20·sum + n) / 2n) / 10`), because `$round` rounds half to even and a float mean can sit on either side of .x5. Same result as the old `toFixed(1)` on the cases tested (4.25 → 4.3).
- The stages also add `unroundedAverageRating`, used by `minRating` and the rating sort, per the Shortlist decision (3.96 shows 4.0 but stays under `minRating: 4`). Each list service projects it away in its final `$project`.
- No Review count: the schema has no such field and none of the old aggregations computed one, so the module doesn't either. `FavoritePlace` has no `ratingCount`; the test compares its `averageRating` only.
- `userReviewActivity` keeps returning `null` for a Place without Ratings.
- Tests: `tests/placeStats.test.ts` (4): one Place with Ratings, a Review without a Rating, the empty `deleteAll` document and a Google review; `addRating` and `deleteReview` against all four queries; `deleteReview` and `userReviewActivity` return a number; an unrated Place is 0/0.
- Code review, applied: dropped the unused `placeIdField` parameter. Not applied: moving the `unroundedAverageRating` projection into the module (the callers filter and sort on it after the stages); glossary terms for "Rating count"/"stats" (for `/domain-modeling`).
- `tsc --noEmit` clean, `npm test` 297/297 (one run had an unrelated timing failure in `emailChangeCollisions`, green on rerun and alone). No frontend change: the schema is unchanged and `deleteReview` now sends the number the type already declared.
