# Repair review data already corrupted by the pre-fix bug

Status: ready-for-agent

## Problem

Before `9ce727a`/`0a085dd`, the old reserve-then-rollback scheme could leave `reviewImages` pointing past files that were never stored. One confirmed case: Review `6ab785f66ab114864549eb0a` (Place `68861721af72dc0dcf7c0102`) has `reviewImages=10` while `image_5.jpg` 404s. There may be others from the same window.

## Task

Write a one-off script under `src/scripts/`, in the dry-run/`--apply` style `docs/google-places-sync.md` documents for `syncGooglePlaces` (default dry-run, explicit `--apply` to write, never run `--apply` without the owner's explicit go-ahead — same rule as that script):

1. Query `Interaction` for every document with `reviewImages > 0`.
2. For each, list the actual files under `3welle/review-images/<placeId>/<reviewId>/` via `imagekit.listFiles` (the same read-only call `getPlaceImages` already uses, scoped to the review's folder instead of the place's).
3. Compute the safe repaired count: the largest `N` such that `image_1.jpg .. image_N.jpg` all exist contiguously from 1 (not just "how many files exist" — the frontend renders `image_1..image_<reviewImages>` in order and stops rendering at the first missing one in practice, so a gap at `image_5` means the safe count is 4, even if `image_6..10` exist).
4. Dry-run: print every review whose stored count disagrees with the safe repaired count, and what it would become.
5. `--apply`: write the repaired count for those reviews only.

## Acceptance criteria

- [ ] Dry-run output, run against the real database, includes Review `6ab785f66ab114864549eb0a` with a repaired count of 4.
- [ ] `--apply` is a separate explicit flag; the script never writes without it.
- [ ] `--apply` is not run by an agent without the owner's explicit go-ahead in the moment, same as `syncGooglePlaces`.
