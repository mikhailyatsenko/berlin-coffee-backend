# 04: Typed resolvers through the generated GraphQL types

Status: done
Blocked by: 02 (Resolvers follow the error contract)
Source: [Type resolvers with the generated GraphQL types](../../backend-audit/issues/02-type-resolvers-with-codegen.md), slicing item 1

## Problem

Resolvers are hand-typed (`_: never`, `__: never`, a separate context shape per file), so nothing checks that a resolver's arguments or return value match the schema. That is how the `deleteReview` / `toggleCharacteristic` shape bugs went unnoticed. Typing the resolver map as `Resolvers` today gives 41 errors (75 across parent / args / context / return), almost all mechanical. Landing this before the bug fixes means those fixes are written against checked signatures.

## Current behaviour

- `codegen.yml` has `contextType: ../../#Context` (the server entry module itself), `mappers` mapping `User`/`Place`/`Review` to Mongoose models although no type has field resolvers, and TS `enum` output that clashes with the string unions the code uses (`ShortlistId`, `PlaceSuggestionStatus`).
- `Context` is declared in `src/index.ts`.
- `resolvers.ts` is untyped; each resolver declares its own parent/args/context types. Spike evidence: branch `spike/typed-resolvers` (commit `fb9196b`, not to be merged).

## Expected behaviour

- `codegen.yml`: drop `mappers`, add `enumsAsTypes: true` and `useTypeImports: true`; `contextType` points at `src/graphql/context.ts`, where `Context` now lives (if ticket 01 already created that file, reuse it).
- Every resolver is typed through its generated signature (`QueryResolvers["places"]`, `MutationResolvers["addRating"]`, …); the per-file context types go; `resolvers.ts` is typed as `Resolvers`.
- No behavior change. Nullable arguments are handled explicitly where the code relied on `null` being falsy.
- Any remaining genuine mismatch that belongs to a later ticket (the `averageRating` string in `deleteReview` → ticket 21; unreturned schema fields → ticket 09) is marked with a `@ts-expect-error` naming that ticket, not papered over with a cast.
- If one session isn't enough, split by `Query` / `Mutation`, typing the map last.

## Acceptance criteria

- [x] `resolvers.ts` is typed as `Resolvers`; `tsc --noEmit` is clean.
- [x] `Context` lives in `src/graphql/context.ts`; codegen no longer imports the server entry module.
- [x] No resolver declares its own context type or uses `_: never` / `__: never`.
- [x] Every `@ts-expect-error` names the ticket that removes it.
- [x] Codegen drift check (`npm run generate` leaves no diff) and `npm test` pass.

## Comments

**2026-09-29, implemented** (branch `feat/typed-resolvers`).

- `codegen.yml`: `mappers` dropped, `enumsAsTypes` and `useTypeImports` added, `contextType: ../context.js#Context`. The `Context` re-export in `src/index.ts` is gone.
- Every root resolver is `export const xResolver: QueryResolvers["x"]` / `MutationResolvers["x"]`. The hand-written arg interfaces, per-file context shapes and the local `Characteristic` union went with them. `resolvers.ts` is typed as `Resolvers`.
- `@ts-expect-error` markers: ticket 09 on `places`, `formatFilteredPlace` (`filteredPlaces`, `neighborhoodShortlists`), `place` (`reviews`/`characteristicCounts`) and `placeReviews` (`placeId`). Ticket 21 on the `averageRating` string in `deleteReview` and in `userReviewActivity`. The aggregates behind those two now carry a result type, because an untyped `aggregate` returns `any` and would hide the mismatch. `place` and `deleteReview` also declare their return type, so the marker lands on the one property instead of on the whole resolver.
- Nullable args are handled explicitly: `places` no longer defaults `offset` (the schema already does), `filteredPlaces` turns `minRating: null` into "no filter". Deviations from "no behavior change", all in inputs that are nonsense:
  - `null` *inside* a `filteredPlaces` list is now dropped. It used to crash (`neighborhood`) or match nothing (`additionalInfo`).
  - `refreshToken` without `req` now throws UNAUTHENTICATED instead of a TypeError. This can't happen under Express.
  - `userReviewActivity.placeId` is `.toString()`ed. The client gets the same string.
- `resolveActorRef` takes `{ id?: string }`: a Mongoose `Document`'s `id` is optional in its type.
- New `src/utils/markedCharacteristics.ts` replaces two copies of the `Object.entries(...).filter` logic (`formatFilteredPlace`, `placeReviews`).
- Tests call resolvers through `tests/support/callResolver.ts` (`callResolver(resolver, args, context)` with a partial `TestContext`), since a generated resolver type is optional and a function-or-object union.
- Files that were Prettier-clean before are formatted; the rest keep their old style, so the diff stays reviewable.
- Code review (standards and spec) found nothing blocking. Its findings are applied: the ticket 21 marker in `userReviewActivity`, the shared helper, and a name. Worth a look later: `claimGuestReviews` still says "guest session", a term CONTEXT.md avoids. That wording was already there before this ticket.
- `tsc --noEmit` is clean, `npm run generate` leaves no diff, and `npm test` passes 115/115. Nothing to hand off to the frontend: the schema is unchanged.
