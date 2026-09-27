# 03: Photos in a Place suggestion become Place photos

**Status:** done

**What to build:** the suggester attaches up to 10 photos to their Place suggestion. The admin sees them on the review page, and on Publish the photos they kept become the new Place's Place photos, the first one its card image. Dropped photos, and all photos of a rejected suggestion, are deleted.

**Blocked by:** 02.

**Source:** frontend spec `../berlincoffeemap/.scratch/place-suggestions/spec.md`, frontend ticket `../berlincoffeemap/.scratch/place-suggestions/issues/04-photos.md` (it waits for this one). Domain term: Place photo (`CONTEXT.md` in the frontend repo): an image of the Place itself, never a Review Photo.

## Rules

- **`uploadPlaceSuggestionPhoto(suggestionId, fileBuffer, guestId?, guestSecret?)`:**
  - only the suggester (same User or Guest identity), only while `pending`, at most 10;
  - compressed like Review Photos;
  - stored in a suggestion folder in ImageKit;
  - Guests count towards the existing Guest photo limit;
  - returns the new photo count.
- `placeSuggestionForReview` returns the photo paths in upload order.
- **Publish:**
  - moves the kept photos (the input's paths, which must belong to this suggestion) into the Place's own photo folder, the one the Place page already lists;
  - sets the first kept photo as the Place's card image; with none kept, the default stays;
  - deletes the rest.
- **Reject:** deletes all the suggestion's photos.
- An ImageKit failure during Publish fails the Publish before the suggestion is marked `published`, so the admin can retry.

## Tests

Fake ImageKit bucket as in `tests/uploadReviewImage.test.ts`.

- [x] Only the suggester can upload; others, a decided suggestion and an 11th photo are rejected
- [x] Guest uploads count towards the Guest photo limit
- [x] Publish moves the kept photos to the Place photo folder, sets the card image to the first, deletes the dropped ones
- [x] Publish with no kept photos leaves the default image; paths from another suggestion are rejected
- [x] Reject deletes every photo of the suggestion
- [x] `npm test`, `tsc`, `npm run generate` green

## Comments

- 2026-09-27: Implemented on `feat/place-suggestion-photos`, not merged yet (ticket 02 was already merged to `main` by the time this started).
- Schema: `uploadPlaceSuggestionPhoto(suggestionId, fileBuffer, guestId?, guestSecret?): UploadPlaceSuggestionPhotoResponse!` (`{ photoCount }`). `PlaceSuggestionForReview.photos` (already declared, stubbed empty since ticket 02) now returns the real paths. `PublishPlaceSuggestionInput.photoPaths` is no longer ignored.
- **Storage: an array, not a counter-derived name.** `PlaceSuggestion` gets a `photos: string[]` field (full ImageKit paths, appended in upload order) alongside the pre-existing `photoCount` (kept only for ticket 02's tests, always written alongside `photos`). Review Photos derive their URLs from a bare counter (`image_1.jpg .. image_N.jpg`), which is why `uploadReviewImage` needs a lease: two uploads must never contest the same positional name. Suggestion photos don't have that constraint — `placeSuggestionForReview` hands back real paths — so each upload gets a unique file name (`randomUUID().jpg`) instead, and the atomic `$push` (guarded on ownership, `pending`, and the 10-photo cap) is enough to stay race-safe without a lease, a timeout-abandonment dance, or `photoUploadLease`.
- **Publish moves photos by copying, not `moveFile`.** The Place's `_id` is generated before `Place.create()` so photos can be placed into its folder first; if ImageKit fails there, nothing is created yet and the admin's retry starts clean. Photos are *copied* (`imagekit.copyFile`, run in parallel via `Promise.all`) rather than moved: a `moveFile` failure partway through a multi-photo suggestion would permanently strand the already-moved ones with no original to retry from. The originals (kept and dropped alike) are cleared together in one `deleteImageKitFolder` call, once every kept photo's copy has landed.
- **Card image**: the frontend always requests `places-main-img/<placeId>/main.jpg` for the card regardless of what `properties.image` holds (confirmed in `PlaceCard.tsx` / `NeighborhoodPlaceCard.tsx` — it's a truthiness flag, not a URL). The first *kept* photo (first surviving item of the admin's `photoPaths`, not necessarily the first uploaded) is copied then `renameFile`d to `main.jpg`; `properties.image` is set to that path with a leading slash, matching every other stored ImageKit path (`photos` entries, `getPlaceImages()`).
- **The `published` write moved earlier**, right after `Place.create()`, before the leftover-folder cleanup and the outcome email (previously last). A suggestion photo upload still in flight when Publish reaches this point has its own atomic commit guarded on `status: "pending"`; writing `published` first makes that commit a clean no-op instead of racing the cleanup's folder delete — the file is simply left an orphan, the same tolerance already given to a late/failed upload.
- `getPlaceImages` and the new suggestion helpers share a `placePhotoFolder(placeId)` helper (was an inline template string); `deleteAllReviewImages` is renamed `deleteImageKitFolder` (it only ever deleted a folder — never review-specific) and now backs both Review Photo and suggestion-photo cleanup.
- Rate limit: no new bucket. `uploadPlaceSuggestionPhoto` reuses `guestPhoto` (20/hour), per the ticket.
- Tests: new `tests/placeSuggestionPhotos.test.ts` (10 tests) against the same fake-ImageKit-bucket pattern as `tests/uploadReviewImage.test.ts`, extended with `copyFile`/`renameFile`/`deleteFolder` fakes. Covers the ticket's checklist plus two edge cases the "Rules" section calls out: an ImageKit failure during Publish leaves nothing created/marked and a clean retry succeeds, and — the sharpest one — one photo's copy failing during a multi-photo Publish leaves every original intact so the retry still publishes all of them (this is exactly the case `moveFile` would have handled badly). `npm test` (81 pass), `tsc` and `npm run generate` (no drift) are green.
- Code review (medium): 8 findings, all addressed — the two correctness ones (moveFile's partial-failure orphan risk; a folder-delete-vs-concurrent-upload race narrowed by writing `published` earlier) drove the copy-not-move redesign and the reordering above; the rest were the `main.jpg` leading-slash inconsistency, a missing timeout on the new ImageKit calls, and small consistency nits (`awaitRateLimit` reuse, `photoCount` redundancy noted in a comment, this ticket's own status).
- Frontend ticket 04 (`../berlincoffeemap/.scratch/place-suggestions/issues/04-photos.md`) can run codegen against this schema.
