# Documents whose `reviewImages` field is entirely missing never get to upload again

Status: ready-for-agent

## Problem

`uploadReviewImageResolver` filters on `reviewImages` twice — once to take the lease (`reviewImages: { $lt: MAX_IMAGES_PER_REVIEW }`) and once to commit (`reviewImages: previous`, where `previous` is read as `leased.reviewImages ?? 0`). Both filters run against the stored document at the MongoDB level. A document that never had the field written at all (created before the schema had it, or by any insert that skipped the default) doesn't match `{ $lt: 10 }` and doesn't match `{ reviewImages: 0 }` either — Mongo's query matching sees no field, not `0`, even though the Mongoose schema default is `0` and the JS-side `?? 0` treats it as `0`.

Such a document can never take the lease, so every upload attempt on it gets the wrong error forever (`FORBIDDEN` if `Interaction.exists` is somehow also affected, more likely just falls through to `UPLOAD_IN_PROGRESS` since the "does it exist" check only looks at `_id` + owner, not at whether the lease-filter's `reviewImages` condition is what's failing).

## Current behaviour

- `src/graphql/resolvers/uploadReviewImageResolver/uploadReviewImageResolver.ts`, the lease-acquire `findOneAndUpdate` filter: `reviewImages: { $lt: MAX_IMAGES_PER_REVIEW }`.
- Same file, the commit `updateOne` filter: `reviewImages: previous` (with `previous = leased.reviewImages ?? 0`).
- Neither matches a document where `reviewImages` doesn't exist as a field.

## Expected behaviour

- Both filters treat a missing `reviewImages` the same as `0`: add `$or` branches (or a migration) so `{ reviewImages: { $exists: false } }` is accepted wherever `{ reviewImages: 0 }` currently is, and `{ $lt: MAX_IMAGES_PER_REVIEW }` also accepts a missing field.
- First check whether any `Interaction` documents in the real database actually lack the field (a read-only `Interaction.countDocuments({ reviewImages: { $exists: false } })` is enough) — write that count in the ticket's resolution note. If the count is 0 today, the fix is still worth making (defensive, cheap), but it isn't urgent.

## Acceptance criteria

- [ ] A regression test creates an `Interaction` document with `reviewImages` unset (not `0` — actually absent) and confirms an upload on it succeeds and lands at `image_1.jpg`.
- [ ] The lease-acquire and commit filters both treat "missing" the same as "zero".
- [ ] The real count of affected documents (if any) is noted in the resolution.
