# 21: One Place stats module for Average rating and counts

Status: ready-for-agent
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

- [ ] Test: for one Place with a known set of Ratings (including a Review without a Rating and an empty document left by `deleteAll`), `places`, `filteredPlaces`, `place`, `favoritePlaces`, `addRating` and `deleteReview` return the same `averageRating` and counts.
- [ ] Test: `deleteReview` returns `averageRating` as a number.
- [ ] Only the stats module contains the Average rating aggregation.
- [ ] `tsc --noEmit` and `npm test` pass.
