# `deleteReview` races an in-flight upload's lease

Status: done

## Problem

`deleteReviewResolver` clears Photos with a load-modify-`save()` and fires `deleteAllReviewImages` without awaiting it. It doesn't know about `photoUploadLease` at all. If an upload is mid-flight when a delete happens (or the reverse), the counter and the ImageKit folder can end up disagreeing:

- Delete's `interaction.reviewImages = 0; await interaction.save();` is a separate write from the upload resolver's atomic `updateOne`. Two `save()`s (delete racing another delete, or delete racing a stray non-atomic write) can lose an update.
- `deleteAllReviewImages(...)` isn't awaited, so the resolver returns (and the client moves on) before the ImageKit folder is actually gone. An upload that starts right after delete returns can take the lease, land at `image_1.jpg`, and get counted — and then the still-in-flight `deleteFolder` call wipes it out from under the just-saved photo.

## Current behaviour

`src/graphql/resolvers/deleteReviewResolver/deleteReviewResolver.ts`:
- `deleteReviewText` branch: `interaction.reviewText = undefined; deleteAllReviewImages(...); interaction.reviewImages = 0;` then `await interaction.save();` — the delete call isn't awaited, and it fires even when `reviewImages` was already `0` (empty folder, harmless but wasteful).
- `deleteAll` branch: same pattern, gated by `if (interaction.reviewImages && interaction.reviewImages > 0)`.
- Neither branch touches or checks `photoUploadLease`.

## Expected behaviour

- Clear `reviewImages` with an atomic `findOneAndUpdate` (matching the pattern already used in `uploadReviewImageResolver`), not `load → mutate → save()`, so it can't race a concurrent atomic write and lose it.
- `await deleteAllReviewImages(...)` before the resolver returns, so a client that gets the delete response knows the folder is actually gone (accepted cost: delete becomes as slow as an ImageKit call, matching the precedent already set on the upload path).
- Skip the ImageKit call entirely when there's nothing to delete (`reviewImages` was already 0) — already done for `deleteAll` via the `if`, missing for `deleteReviewText`.
- An upload whose lease was taken before the delete, and whose commit lands after: the existing commit guard (`reviewImages: previous`) already fails it once the counter has moved to 0, so no extra lease-awareness is needed here — confirm this with a test rather than adding new coordination.

## Acceptance criteria

- [x] `deleteReviewText` and `deleteAll` both clear `reviewImages` via an atomic update, not `save()`.
- [x] Both branches `await` `deleteAllReviewImages` before returning.
- [x] `deleteReviewText` skips the ImageKit call when `reviewImages` is already 0.
- [x] A regression test: an upload's lease is taken, then `deleteReview` runs to completion, then the upload's commit — the commit must fail (`INTERNAL_SERVER_ERROR` to the client) and the counter must stay at 0, no orphaned file.

## Comments

Replaced the `deleteReviewText`/`deleteAll` load-mutate-`save()` with a single
`Interaction.updateOne` built from a shared `$unset`/`$set` computed per
branch (`clearsText`/`clearsImages`), and moved the `deleteAllReviewImages`
call to `await` before that update, gated on `clearsImages` so it's skipped
for both branches when `reviewImages` is already 0. Used `updateOne`, not
`findOneAndUpdate`: nothing here needs the returned document or an
optimistic-concurrency match against a previous value (delete force-sets
fixed values, not an increment), so the extra guard `findOneAndUpdate` adds
for the upload resolver's lease-take doesn't apply — `updateOne` is equally
atomic and simpler for this write shape.

Added `tests/deleteReviewLeaseRace.test.ts`: stalls an upload mid-flight to
prove it holds `photoUploadLease`, runs `deleteReviewResolver` to completion,
then releases the upload and asserts its commit rejects with
`INTERNAL_SERVER_ERROR`, the counter stays at 0, and the lease is cleared
(no orphaned hold). `npm test` passes 15/15 (all pre-existing tests plus this
one); `tsc --noEmit` and `eslint` are clean on both changed files.

Passed `/mattpocock-skills:code-review` (Standards + Spec, vs `main`).
Standards axis: no hard violations (no documented standards in this repo);
flagged two judgement-call Duplicated Code smells — a repeated branch
condition in the resolver (fixed by extracting `clearsText`) and the new
test file re-declaring fixtures (`createReview`, the `png` buffer, `sleep`)
that already exist in `tests/uploadReviewImage.test.ts` (left as-is: only
two test files share them so far, premature to extract a shared-fixture
module for that alone).

Spec axis: no scope creep, no missing acceptance criteria. Raised one
judgement call not asked for by this ticket: `await deleteAllReviewImages`
and the counter-clearing `updateOne` are two separate awaits, so a narrow
window exists *inside* `deleteReview`'s own execution (not after it
returns) where a fresh upload could take a lease on the still-unzeroed
counter, land a file, and have its commit's `reviewImages: previous` guard
match — right before delete's own unconditional `$set reviewImages: 0` then
overwrites that just-committed count back to 0. This is the same race class
the ticket describes, just narrower; the ticket explicitly scopes out extra
lease-coordination for the case it does describe ("no extra lease-awareness
is needed here"). Closing it needs real added coordination that the four
acceptance criteria above don't ask for, so it was left out of scope here
and filed as ticket 07 (`07-deletereview-fence-upload-lease.md`): delete
takes the upload lease as a fence while it clears Photos. That ticket also
records why the cheaper-looking fixes (unsetting the lease, a conditional
counter clear, reordering the two writes) don't close the window.

Committed on `fix/deletereview-lease-race` (from `main`) and merged into
local `main` without a PR (merge commit `d913450`); not pushed to `origin`
yet.
