# 01: Regenerate and commit the drifted GraphQL generated types

**What to build:** `npm run generate` runs clean on a normal install, and the
committed `src/graphql/generated/types.ts` actually reflects the current
`.graphql` schema, so TypeScript is really checking resolver argument/return
shapes against the live schema again.

## Background

Discovered while implementing
`.scratch/review-photo-followups/issues/03-remove-legacy-addtextreview-arg.md`:
running `npm run generate` failed with

```
Cannot read properties of undefined (reading 'find')
  at TsIntrospectionVisitor.getNodeComment (@graphql-codegen/visitor-plugin-common/esm/base-types-visitor.js:425)
```

This reproduces on a clean `main` too (confirmed via `git stash`), so it isn't
caused by any recent schema/resolver change.

**Root cause (diagnosed, verified):** `package.json`/`package-lock.json` pin
`graphql` to `^16.9.0` / `16.9.0`, but the installed `node_modules/graphql` had
drifted to an invalid prerelease, `17.0.0-alpha.9` (outside that range). That
prerelease changed the AST shape codegen's comment-extraction visitor expects,
which is what throws. Running `npm ci` reinstalls the pinned `16.9.0` from the
lockfile and `npm run generate` then succeeds immediately — no code or config
change needed to fix the crash itself.

**The bigger finding:** once codegen actually runs, it produces a large diff.
The committed `types.ts` has been stale for a while and is missing types/args
for operations that already exist in the schema, e.g.:

- Mutations: `createGuestIdentity`, `claimGuestReviews`, `refreshToken`,
  `reportInaccuracy`, `uploadReviewImage`
- Types: `AdditionalInfoTagsResponse`, `AvailableNeighborhoodsResponse`,
  `ClaimGuestReviewsResponse`, `GuestIdentityPayload`, `RefreshTokenResponse`,
  `ReportInaccuracyResponse`, `UploadReviewImageResponse`
- `guestId?`/`guestSecret?` args missing from several `Mutation*Args` types
  (e.g. `MutationAddRatingArgs`)

None of this was ever caught because nothing regenerates or diffs the file in
CI (see ticket 02).

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `npm ci` (or otherwise getting `node_modules/graphql` back to the
      lockfile's `16.9.0`) is confirmed to fix the `getNodeComment` crash;
      note this in the PR description as the known fix if the crash recurs
      for someone else
- [x] `npm run generate` runs with no errors
- [x] The regenerated `src/graphql/generated/types.ts` is reviewed (it will be
      a large diff — mostly additions for the operations listed above) and
      committed
- [x] `tsc --noEmit` passes
- [x] `npm test` passes

## Comments

`node_modules/graphql` was already at the pinned `16.9.0` in this working
tree when work started, so the `getNodeComment` crash didn't reproduce here
— nothing to fix beyond running `npm run generate`. The known fix
(`npm ci` to reinstall the pinned version from the lockfile) is documented
in the PR description for whoever hits it next.

Regenerated diff matches the ticket's prediction: only the listed mutations
(`createGuestIdentity`, `claimGuestReviews`, `refreshToken`,
`reportInaccuracy`, `uploadReviewImage`), listed types
(`AdditionalInfoTagsResponse`, `AvailableNeighborhoodsResponse`,
`ClaimGuestReviewsResponse`, `GuestIdentityPayload`, `RefreshTokenResponse`,
`ReportInaccuracyResponse`, `UploadReviewImageResponse`), and
`guestId?`/`guestSecret?` args across several `Mutation*Args` types, plus a
few incidental schema-drift byproducts (`Review.userId` → nullable,
`QueryPlacesArgs.neighborhood` → array, `additionalInfo` arg added). `tsc
--noEmit` and `npm test` (8/8) both pass. Committed on
`fix/regenerate-stale-graphql-types` (commit `c30a67e`).
