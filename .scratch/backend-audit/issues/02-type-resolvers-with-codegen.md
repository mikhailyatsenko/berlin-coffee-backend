# Type resolvers with the generated GraphQL types

Type: task
Status: resolved
Blocked by: none

## Question

How much does wiring the resolvers to `Resolvers<Context>` from `src/graphql/generated/types.ts` break (architecture item A3), and how should that work be sliced?

AFK: on a throwaway branch, add `contextType`/mappers to `codegen.yml` as needed, type `resolvers.ts` as `Resolvers<Context>`, and run `tsc --noEmit`. Record the error count grouped by kind: arg shape mismatches, return shape mismatches (e.g. `deleteReview` returns `averageRating` as a string, `toggleCharacteristic` returns `false` where an object is expected), and context typing (`never`/`any`, a separate `Context` in each resolver). Also record which of them are real schema/code disagreements, i.e. bugs. Do not merge the branch; the answer is the error inventory plus a recommended slicing.

## Answer

Resolved 2026-09-27. Evidence: throwaway branch `spike/typed-resolvers` (commit `fb9196b`, not merged). There `resolvers.ts` is typed as `Resolvers`, the codegen `mappers` are dropped, and `src/graphql/resolvers/__typecheck.ts` checks each root resolver on four axes separately (parent / args / context / return), because assigning the whole map reports only the first mismatch per field.

`codegen.yml` already had `contextType: ../../#Context` (`Context` is exported from `src/index.ts`), so no context config was missing.

### Raw count

Typing the map as `Resolvers` gives **41 errors** (one per field; baseline `tsc` is clean). 40 of them stop at the parent parameter (`_: never`), and those hide everything behind them. Checked per axis, the actual inventory is:

| Axis | Errors | Kind |
|---|---|---|
| Parent | 40 | `_: never` everywhere; codegen passes `{}`. Mechanical. |
| Args | 9 | 5× `__: never` where the field has no args (`favoritePlaces`, `currentUser`, `userReviewActivity`, `logout`, `deleteAvatar`); 3× nullable arg typed `?: T`, so an explicit `null` isn't covered (`filteredPlaces`, `updatePersonalData`, `setNewPassword`); 1× `deleteOptions` is `String!` in the schema but a union in code (`deleteReview`). |
| Context | 16 | Each resolver declares its own context shape. 14× `user` typed as required or `{id}` or `IUser | undefined`, while `Context.user` is `IUser | null | undefined`; `deleteAccount` has its own `DeleteAccountContext`; `refreshToken` requires `req`, which `Context` marks optional. All of them guard at runtime, so none is a bug. |
| Return (mappers dropped) | 10 | See below. |
| Return (current mappers kept) | +5 | `currentUser`, `loginWithGoogle`, `signInWithEmail`, `refreshToken`, `confirmEmail` return a User DTO, not `IUser`; the same mismatch also hits Place/Review. |

### Return mismatches, sorted

- **Config, not code (4):** `neighborhoodShortlists`, `placeSuggestionForReview`, `publishPlaceSuggestion`, `rejectPlaceSuggestion`. Codegen emits TS `enum`s (`ShortlistId`, `PlaceSuggestionStatus`), and the code uses string unions. Fix: `enumsAsTypes: true`.
- **Wrong mappers (5, above):** `mappers` map `User`/`Place`/`Review` to Mongoose models, but no type has field resolvers; every resolver returns a ready DTO. Fix: drop `mappers`.
- **Real schema/code disagreements (bugs):**
  - `deleteReview` (`deleteReviewResolver.ts:79,90`): with no user, or with someone else's or a missing review, it returns `{success:false, message}`, but `DeleteReviewResult` has no such fields, and `reviewId`/`averageRating`/`ratingCount` are non-null. The client gets "Cannot return null for non-nullable field" instead of the real reason. It also returns `averageRating` as `toFixed(1)`, a string; the Float serializer coerces it, so that part is harmless but wrongly typed. **Scope:** the error branches belong to ticket 01 (the error contract, which already lists `deleteReview`); the number goes to the shared Place stats module (A2, already decided).
  - `toggleCharacteristic` (`toggleCharacteristicResolver.ts:77`): on an unexpected error it returns `false` for a `SuccessResponse!`, so the real error is masked as a non-null violation. **Scope:** error contract (ticket 01).
  - **The schema promises fields the resolvers never fill (latent):** `PlaceProperties.reviews: [Review!]!` isn't returned by `places`, `filteredPlaces`, `place` or `neighborhoodShortlists`; `PlaceProperties.characteristicCounts!` isn't returned by the list resolvers; `Review.placeId: ID!` isn't returned by `placeReviews`. Querying any of them errors. The frontend doesn't select them today (checked in `../berlincoffeemap/src/shared/query/{places,reviews}/queries.ts`), so nothing breaks in production. Recommendation: make `reviews` and `characteristicCounts` in `PlaceProperties` nullable or remove them (the client gets reviews through `placeReviews`), and fill `placeId` in `placeReviews` (cheap). Any schema field change goes to frontend codegen, which is part of the handoff in ticket 10.

Arg nullability (3) isn't a bug today: the code treats `null` as falsy (`if (displayName)`, `oldPassword || ""`, `normalizeNeighborhood(null)` returns `null`, and `minRating: null` passes the range check). Typing will make that handling explicit.

### Recommended slicing

1. **One mechanical foundation ticket "Typed resolvers"** (test: `tsc --noEmit` plus the existing tests). `codegen.yml`: drop `mappers`, add `enumsAsTypes: true` and `useTypeImports: true`. Move `Context` out of `src/index.ts` into `src/graphql/context.ts` (today codegen imports `'../../'`, the server module itself). Type every resolver through the generated signature (`QueryResolvers["places"]` etc.), which removes `_: never` / `__: never` and the per-file context types in one go, and type `resolvers.ts` as `Resolvers`. That covers ~69 of the 75 per-axis errors (40 parent + 5 args + 16 context + 4 enums + 4 of the mapper ones) with no behavior change. It's large (~42 files) but monotonous; if one session isn't enough, split by `Query` / `Mutation`, with the map typed in the last slice. It can use `@ts-expect-error` markers on the bugs below until their tickets land.
2. **Bugs go into the tickets that already own them, not a separate "typing" pile:** the `deleteReview` and `toggleCharacteristic` error branches into the error contract (ticket 01); the number `averageRating` in `deleteReview` into the shared Place stats module (A2).
3. **A small schema ticket "The schema doesn't promise unreturned fields":** `PlaceProperties.reviews` / `characteristicCounts` and `Review.placeId`, per the recommendation above, with a test that queries these fields. It carries a frontend codegen check.

Order: after the error contract (ticket 01), so the error branches get rewritten once, before the rest of the bug fixes. Typed resolvers make their return shapes checkable.
