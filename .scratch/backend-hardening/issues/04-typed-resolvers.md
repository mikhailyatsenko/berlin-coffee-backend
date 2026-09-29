# 04: Typed resolvers through the generated GraphQL types

Status: ready-for-agent
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

- [ ] `resolvers.ts` is typed as `Resolvers`; `tsc --noEmit` is clean.
- [ ] `Context` lives in `src/graphql/context.ts`; codegen no longer imports the server entry module.
- [ ] No resolver declares its own context type or uses `_: never` / `__: never`.
- [ ] Every `@ts-expect-error` names the ticket that removes it.
- [ ] Codegen drift check (`npm run generate` leaves no diff) and `npm test` pass.
