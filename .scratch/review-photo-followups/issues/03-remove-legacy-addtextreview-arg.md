# Remove the deprecated client-supplied `reviewImages` on `addTextReview`

Status: ready-for-agent

## Problem

`addTextReviewResolver` still accepts a client-supplied `reviewImages` and `$set`s it onto the Interaction (`...(!actor.isGuest && reviewImages ? { reviewImages } : {})`). This is exactly the defect class the rest of this map closes: a client-set counter can point past files that don't exist. It was kept only for a previous frontend build; confirmed gone (`../berlincoffeemap`'s current `ADD_REVIEW`/`AddTextReview` mutation sends no `reviewImages` — see `src/shared/query/reviews/mutations.ts`).

## Current behaviour

- `src/graphql/resolvers/addTextReviewResolver/addTextReviewResolver.ts`: `reviewImages` is an optional arg, applied via `$set` for non-guest actors.
- `src/graphql/typeDefs/root.graphql`: `addTextReview(... reviewImages: Int ...)`, commented `# Deprecated: the server counts uploaded images itself. Kept so the previous frontend build keeps working during the rollout.`

## Expected behaviour

- Stop honoring the argument: drop the `$set` branch in the resolver.
- Remove the `reviewImages` argument from the `addTextReview` schema entry in `root.graphql` and from the resolver's args type.
- Regenerate GraphQL types (`npm run generate`) so `src/graphql/generated/types.ts` drops it too.

## Acceptance criteria

- [ ] `addTextReview` no longer accepts or applies a `reviewImages` argument, in the schema and the resolver.
- [ ] Generated types are regenerated and committed.
- [ ] Existing `addTextReview` tests (if any) still pass; frontend is unaffected since it doesn't send the argument.
