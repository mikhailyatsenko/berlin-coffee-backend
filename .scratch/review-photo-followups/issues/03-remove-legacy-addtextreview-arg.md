# Remove the deprecated client-supplied `reviewImages` on `addTextReview`

Status: done

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

- [x] `addTextReview` no longer accepts or applies a `reviewImages` argument, in the schema and the resolver.
- [x] Generated types are regenerated and committed.
- [x] Existing `addTextReview` tests (if any) still pass; frontend is unaffected since it doesn't send the argument.

## Comments

Implemented in `342a44d` ("fix: remove deprecated reviewImages arg from
addTextReview"), merged to `main` via `66c3168`. Dropped the arg from
`root.graphql`, the resolver's args type, and the `$set` branch.

At the time, `npm run generate` was throwing the `getNodeComment` crash
later diagnosed and fixed in `.scratch/codegen-drift/issues/01-...md`, so
`types.ts` was hand-edited to match what codegen would emit rather than
regenerated. Confirmed now (after that fix landed) that `npm run generate`
produces no diff against the committed file, so the hand-edit was correct.

No `addTextReview`-specific tests exist in this repo to re-run.

Backdating this checklist/comment now — the commit closed the ticket in
its message but never updated this file, so it sat looking open. See
[[update-ticket-doc-on-implement-completion]].
