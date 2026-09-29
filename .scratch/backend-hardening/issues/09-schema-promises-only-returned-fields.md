# 09: The schema doesn't promise fields the resolvers never return

Status: ready-for-agent
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

- [ ] Test: a `place` query selecting `characteristicCounts` works; a `places` query selecting it returns `null` without an error.
- [ ] Test: a `placeReviews` query selecting `placeId` returns the Place id on every Review.
- [ ] `PlaceProperties.reviews` no longer exists in the schema.
- [ ] Frontend codegen/`tsc` check done and recorded in Comments.
- [ ] `tsc --noEmit`, codegen drift check and `npm test` pass.
