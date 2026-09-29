# 09: The schema doesn't promise fields the resolvers never return

Status: done
Blocked by: 04 (Typed resolvers)
Source: [Type resolvers with the generated GraphQL types](../../backend-audit/issues/02-type-resolvers-with-codegen.md), slicing item 3

## Problem

The schema declares non-null fields that no resolver fills. Any client that selects them gets an error instead of data. The frontend doesn't select them today, so nothing breaks in production, but the schema lies about the API.

## Current behaviour

- `PlaceProperties.reviews: [Review!]!` is not returned by `places`, `filteredPlaces`, `place` or `neighborhoodShortlists`.
- `PlaceProperties.characteristicCounts` (non-null) is not returned by the list resolvers.
- `Review.placeId: ID!` is not returned by `placeReviews`.
- Ticket 04 may have left `@ts-expect-error` markers on these.

## Expected behaviour

- `PlaceProperties.reviews` is removed from the schema (the client gets Reviews through `placeReviews`).
- `PlaceProperties.characteristicCounts` becomes nullable: filled by `place`, `null` in list resolvers.
- `placeReviews` fills `Review.placeId` (cheap: it is the argument).
- Codegen regenerated; the `@ts-expect-error` markers for these fields are gone.
- Frontend check (read-only): `../berlincoffeemap` codegen and `tsc` still pass against the new schema; its operations don't select `PlaceProperties.reviews`. If they would break, stop and report instead of editing the frontend.

## Acceptance criteria

- [x] Test: a `place` query selecting `characteristicCounts` works; a `places` query selecting it returns `null` without an error.
- [x] Test: a `placeReviews` query selecting `placeId` returns the Place id on every Review.
- [x] `PlaceProperties.reviews` no longer exists in the schema.
- [x] Frontend codegen/`tsc` check done and recorded in Comments.
- [x] `tsc --noEmit`, codegen drift check and `npm test` pass.

## Comments

**2026-09-29, implemented** (branch `fix/schema-promises-only-returned-fields`).

- `PlaceProperties.reviews` is gone from `place.graphql`. `characteristicCounts` is nullable and documented as "Filled by place only, null elsewhere". `placeReviews` sets `placeId` on each Review from its argument.
- The four `@ts-expect-error` "Ticket 09" markers (`places`, `formatFilteredPlace`, `place`, `placeReviews`) are removed. The two ticket 21 markers stay.
- New `tests/schemaPromises.test.ts` runs queries through a real ApolloServer with the server's schema, resolvers and `formatError`, so an unfilled non-null field shows up as an error: `place` with `characteristicCounts`, `places` with `characteristicCounts: null`, `placeReviews` with `placeId`, and a query for `PlaceProperties.reviews` that fails validation. `filteredPlaces` and `neighborhoodShortlists` are covered only by type: they go through `formatFilteredPlace`, which does not set the field.
- **Frontend check** (read-only, done in a temporary worktree of `../berlincoffeemap` HEAD with its codegen pointed at this branch's schema): codegen passes, and no operation selects `PlaceProperties.reviews`. **`tsc` fails with 6 errors** (0 against `main`'s schema): `PlaceQuery…characteristicCounts` becomes nullable, and `useToggleCharacteristic.ts`, `DetailedPlace.tsx` and `RateBlock.test.tsx` expect it non-null. Nothing breaks at runtime, because `place` still fills it. The user chose to ship the backend and hand off the frontend fix: ready-for-agent ticket `../berlincoffeemap/.scratch/backend-hardening/issues/07-nullable-characteristic-counts.md`. That fix has to land before the frontend's next `codegen` against this API.
- Code review, spec axis: nothing found. Standards axis: the doc string wording was aligned with its neighbours and a comment's term was fixed. Not applied: extracting the `images:<placeId>` cache key, the `seedPlace` Place literal and the `executeOperation` helper into shared helpers. Each has two copies at most, and the cache key only keeps the test off ImageKit (`getPlaceImages` swallows errors anyway).
- `tsc --noEmit` is clean, `npm run generate` leaves no diff, and `npm test` passes 189/189.
