# `deleteReview` should fence off uploads while it clears Photos

Status: ready-for-agent

## Problem

Ticket 02 made `deleteReview` await the ImageKit folder delete and clear `reviewImages` atomically, which closed the race for an upload whose lease was taken *before* the delete and whose commit lands *after* it. It left a narrower window open, inside `deleteReview`'s own execution:

1. `deleteReview` reads the review (`reviewImages = N`) and `await`s `deleteAllReviewImages` — the folder is now empty.
2. An upload takes the lease (counter is still N), stores `image_{N+1}.jpg`, and commits: its guard `reviewImages: previous` matches, so the counter becomes N+1 and the client is told the upload succeeded.
3. `deleteReview`'s `updateOne` runs and unconditionally sets `reviewImages: 0`.

The client got a successful upload that immediately disappears. No broken image (the counter ends at 0), but the success response lied.

Only the review's owner can trigger it (both resolvers check the same actor), so it takes one person hitting delete and upload at once — two tabs, a double action. Low likelihood, low damage; worth fixing, not urgent.

Things that do **not** fix it (checked while grilling this ticket):
- Adding `photoUploadLease` to delete's `$unset`: by step 3 the upload has already committed, so there's no lease left to invalidate.
- Making delete's counter clear conditional on `reviewImages: N`: `image_1..N` are already gone, so leaving the counter at N+1 would point at missing files — worse than today.
- Clearing the counter *before* the folder delete, with nothing else: a fresh upload then takes the lease at `previous = 0`, and its `image_1.jpg` can be wiped by the still-running folder delete while its commit succeeds — a counted Photo with no file, the exact failure ticket 02 set out to prevent.

The only real fix is that no upload may take the lease while delete is clearing Photos.

## Current behaviour

`src/graphql/resolvers/deleteReviewResolver/deleteReviewResolver.ts` (after ticket 02): read → `await deleteAllReviewImages(...)` (only when there are Photos) → one atomic `updateOne` that unsets text/rating and sets `reviewImages: 0`. It never reads or writes `photoUploadLease`.

## Expected behaviour

Proposed: **delete takes the lease itself, as a fence**, only when it is about to clear Photos (`deleteReviewText`/`deleteAll` with `reviewImages > 0`):

1. One atomic update **before** touching ImageKit: unset text/rating as today, set `reviewImages: 0`, and put its own token on `photoUploadLease` with an `until` of now + a short margin. Take it unconditionally, even over a live lease: an upload that took the lease earlier then fails its commit on both the token and the counter.
2. `await deleteAllReviewImages(...)`. Any upload that arrives meanwhile finds the lease taken and gets `UPLOAD_IN_PROGRESS`, which the client already handles.
3. Release the lease, but only if it is still delete's own (token match), so a later holder is never dropped.

Watch the abandoned-upload hold. A timed-out upload keeps the lease for up to `REVIEW_IMAGE_ABANDONED_LEASE_MS` so no later upload takes its file name and gets overwritten by the late file (see the `uploadReviewImageResolver` doc comment). Delete must not shorten that hold. For example, raise `until` with `$max` instead of `$set`, and in step 3 release only if `until` is still delete's own value. If a longer hold was already there, leave the lease to expire on that schedule.

If delete crashes between steps 1 and 3, the lease expires by itself, the counter is already 0, and leftover files get overwritten by future uploads, the way the upload path already treats stray files.

`deleteRating` doesn't touch Photos and must not touch the lease: an in-flight upload must survive a rating delete.

Alternative, if the abandoned-hold interplay proves too fiddly: **delete refuses while an upload holds the lease**. Take the lease with the same "free or expired" filter uploads use, and fail with an `UPLOAD_IN_PROGRESS`-style error when it's busy. The semantics are cleaner, but the frontend (`../berlincoffeemap`) has to handle a new error on delete, so it needs the user's go-ahead and a matching frontend ticket before it's chosen.

## Acceptance criteria

- [x] An upload that starts while `deleteReview` is waiting on the folder delete fails with `UPLOAD_IN_PROGRESS`; afterwards the counter is 0 and the client was never told it succeeded.
- [x] The ticket 02 regression test (`tests/deleteReviewLeaseRace.test.ts`: lease taken before delete, commit after) still passes.
- [x] An upload started after `deleteReview` returns succeeds as `image_1`.
- [x] Deleting while a timed-out upload holds an extended lease doesn't shorten that hold.
- [x] `deleteRating` leaves an in-flight upload's lease alone and that upload commits normally.
- [x] `deleteReviewText`/`deleteAll` on a review with no Photos still skip both ImageKit and the lease.

## Notes

- Builds on ticket 01 (`fix/missing-reviewimages-field`, commit `11e5288`, merged into `main` in `be27473`). It rewrote the upload's lease/commit filters to treat a missing `reviewImages` as 0 (`reviewImagesBelow`/`reviewImagesEquals` in `uploadReviewImageResolver.ts`); keep delete's lease handling consistent with those.

## Comments

- 2026-09-26: Implemented on `fix/deletereview-fence-upload-lease` with the proposed
  fence, not the "delete refuses" alternative, so the frontend needs no change.
  `deleteReview` (`clearPhotosBehindFence`) clears text/rating, sets `reviewImages: 0`
  and puts its own token on `photoUploadLease` in one `findOneAndUpdate`, raising
  `until` with `$max` to `uploadLeaseUntil(now)` (exported from the upload resolver,
  so the fence always outlasts any regular upload lease). After the folder delete it
  hands the lease back. If nobody moved `until` past the fence, it restores the
  pre-fence lease when that was still live, and unsets it otherwise. If a longer hold
  owns `until`, it only gives the earlier holder its token back.
- Code review (Spec axis) found two ways the first version cut an abandoned hold
  short. (1) A hold ending before the fence got raised to it and then unset. (2) An
  upload fenced mid-flight that later timed out could no longer set its hold, because
  its token was gone. The fix covers both: the restore above, plus
  `holdLeaseWhileAbandoned` now also extends a lease it doesn't own, but only upward
  (`$or: token match | until <= holdUntil`). Tests cover both, and a timeout during
  the fence.
- `tests/deleteReviewLeaseRace.test.ts` now runs with a 1 s upload timeout (was 5 s)
  so the timeout scenarios stay fast.
- Accepted cost (per this ticket): an upload that was fenced and then timed out
  can't release its hold early once the fence raised `until` past its own; the lease
  runs out on the hold's schedule.
- Not done, possible follow-up: the lease rules now live in two resolvers. Moving
  take/hold/release plus `uploadLeaseUntil` into one lease module would keep them
  together.
