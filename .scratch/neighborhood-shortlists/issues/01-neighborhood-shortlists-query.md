# 01: Query `neighborhoodShortlists` for the Neighborhood page

**Status:** done

**What to build:** a new query that returns the four Shortlists of a Neighborhood, so the frontend's Neighborhood page can show them between Top rated and the full list. A Place makes a Shortlist when it is visible, is in the Neighborhood, has all the Shortlist's Amenities (each through its synonyms) and has an Average rating of at least 4.0.

**Source:** frontend spec `../berlincoffeemap/.scratch/neighborhood-shortlists/spec.md` (sections "Shortlist definitions", "Backend: new query neighborhoodShortlists", "Testing Decisions"), frontend ticket `../berlincoffeemap/.scratch/neighborhood-shortlists/issues/03-shortlists-on-the-page.md`. That ticket's frontend part waits for this one. Domain terms: `CONTEXT.md` (Shortlist, Amenity, Average rating, Neighborhood).

**Out of scope:** `ownRating` / `ownCharacteristics` on `PlaceProperties` (frontend ticket 05 asks for them separately).

## Shortlist definitions

A new module next to the synonym table, `src/amenities/shortlists.ts`. It holds the ids, their order and the Amenities; the frontend owns titles, anchors and card questions.

| Order | Id | Amenities (all required, canonical names) |
|---|---|---|
| 1 | `work` | Good for working on laptop, Wi-Fi |
| 2 | `dogFriendly` | Dogs allowed |
| 3 | `outdoorSeating` | Outdoor seating |
| 4 | `breakfastBrunch` | Breakfast |

Use the canonical spellings from `src/amenities/synonyms.ts` (`Wi-Fi` covers `Free Wi-Fi`, `Dogs allowed` covers the inside and outside variants, `Breakfast` covers `Brunch`). Check the exact spelling of "Good for working on laptop" and "Outdoor seating" against `availableAdditionalInfoTags`, since they are not in the synonym table.

## Schema

```graphql
enum ShortlistId { work dogFriendly outdoorSeating breakfastBrunch }

type Shortlist {
  id: ShortlistId!
  "Canonical Amenity names, for the map's Filters."
  amenities: [String!]!
  "Top 5 by Average rating."
  places: [Place!]!
  "All Places that qualify."
  total: Int!
}

type Query {
  neighborhoodShortlists(neighborhood: String!): [Shortlist!]!
}
```

Run `npm run generate` after the schema change (CI checks the generated types for drift).

## Rules

- All four Shortlists are always returned, in the table's order, even with 0 Places. The frontend hides a Shortlist with `total` under 3, so the server doesn't filter.
- `places`: top 5 sorted by Average rating desc, then Rating count desc, then name asc. `total`: every Place that qualifies.
- Reuse the `filteredPlaces` aggregation (`src/graphql/resolvers/filteredPlacesResolver/services/filteredPlacesAggregationService.ts`: visibility, Amenity match through `amenitySpellings`, Average rating, Favorites) instead of a second pipeline. It has no sort or limit today; add them as options, or sort and slice the result. Either way, the 4.0 threshold works exactly like `filteredPlaces` with `minRating: 4` on the unrounded Average rating, so "See all N on the map" (the frontend calls `filteredPlaces` with the Neighborhood, the Shortlist's `amenities` and `minRating: 4`) shows the same N as `total`.
- Share the Neighborhood normalization with `filteredPlaces` (`normalizeNeighborhood` in `filteredPlacesResolver.ts` today, private): the slug `friedrichshain-kreuzberg` becomes `Friedrichshain-Kreuzberg`. Move it to a shared place, don't copy it.
- Places in the response have the same shape as in `filteredPlaces` (the mapping to GraphQL format there); share that too.
- An unknown Neighborhood returns four empty Shortlists (`places: []`, `total: 0`), no error.
- Actor (User / Guest) is passed through as in `filteredPlaces`, so `isFavorite` is right.

## Tests

`tests/neighborhoodShortlists.test.ts`, driving `neighborhoodShortlistsResolver` against a throwaway mongod (`tests/support/mongod.ts`, prior art `tests/filteredPlaces.test.ts`), seeding Places and Ratings. Assert what the query returns, not pipeline stages.

- [x] Shortlist definitions module (`src/amenities/shortlists.ts`), ids, order and Amenities as in the table
- [x] Schema, resolver registered in `resolvers.ts`, `npm run generate`
- [x] Neighborhood normalization and Place mapping shared with `filteredPlaces`
- [x] Test: a Place qualifies only with all Amenities of the set (Work needs both)
- [x] Test: 4.0 threshold (a Place at 3.9 is out, one at 4.0 is in; a Place with no Rating is out)
- [x] Test: order by Average rating, then Rating count, then name; at most 5 `places`; `total` counts all
- [x] Test: synonym spellings qualify (only "Free Wi-Fi" + laptop → Work; only "Dogs allowed inside" → Dog friendly; only "Brunch" → Breakfast & brunch)
- [x] Test: hidden (closed) Places and Places in other Neighborhoods are left out
- [x] Test: slug `friedrichshain-kreuzberg` normalized; unknown Neighborhood → four empty Shortlists in order
- [x] Test: `filteredPlaces` with the Shortlist's `amenities` and `minRating: 4` returns `total` equal to the Shortlist's `total`
- [x] `npm test` and `tsc` green

When done, tell the frontend session: the frontend part of ticket 03 then runs codegen against this schema.

## Comments

- 2026-09-26: Implemented on `feat/neighborhood-shortlists-query` (that branch name
  was already taken by an old, fully merged pointer, so it was fast-forwarded to
  `main` first).
- `getFilteredPlacesWithStats` gained a `{ sortByRating, limit }` options argument
  instead of a second pipeline: `$sort` (Average rating, Rating count, name, `_id`)
  and `$limit` go after the `minRating` match and the count, so `total` counts every
  match. The 4.0 threshold is the same `minRating: 4` on the unrounded Average
  rating that `filteredPlaces` uses; a test covers 3.96 (shows as 4.0, stays out).
- Shared with `filteredPlaces`: `normalizeNeighborhood` (`src/utils/neighborhood.ts`)
  and the Place mapping (`formatFilteredPlace.ts`). `placesResolver`, `placeResolver`
  and `favoritePlacesResolver` keep their own copies of the rounding; not touched.
- Spellings checked: "Good for working on laptop" and "Outdoor seating" are the names
  in `availableAdditionalInfoTags` (209 / 268 Places per the frontend's data-coverage
  note); neither has a synonym.
- The four Shortlists run as four parallel aggregations (each does a count and a
  list, so eight in all). Fine at 408 Places; if the Neighborhood page gets slow,
  the count and the list could share one `$facet`.
- Tests: `tests/neighborhoodShortlists.test.ts` (10 tests), including
  the `filteredPlaces` agreement on `total` for all four Shortlists. `npm test`
  (34 pass), `tsc` and `npm run generate` (no drift) are green.
- Frontend session: the frontend part of ticket 03 can now run codegen against this
  schema.
- 2026-09-26: Merged into `main` in `ad5bd3e` (commit `74da6c5`).
