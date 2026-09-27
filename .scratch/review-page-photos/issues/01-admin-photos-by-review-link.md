# 01: The admin uploads and deletes a Place suggestion's photos through the review link

**Status:** ready-for-agent

**What to build:** the admin, on the review page, adds their own Place photos to a pending Place suggestion and deletes any of its photos, the suggester's or their own. Both are authorized only by the review link's token (ADR 0002 in the frontend repo). The kept photos go live through the existing Publish.

**Blocked by:** None (can start immediately).

**Source:** frontend spec `../berlincoffeemap/.scratch/review-page-photos/spec.md`; frontend ticket `../berlincoffeemap/.scratch/review-page-photos/issues/01-admin-photos-on-review-page.md` waits for this one. Domain term: Place photo (`CONTEXT.md` in the frontend repo).

## Rules

- **Upload as the admin** (suggestion id, token, file):
  - token-authorized like `placeSuggestionForReview`; a bad token and an unknown id fail the same way;
  - only while `pending`, else `SUGGESTION_NOT_PENDING`;
  - stored like a suggester's upload: same compression, suggestion folder, unique file name, and atomic append guarded on `pending` and the cap;
  - no rate limit;
  - returns the new photo's path.
- **Delete** (suggestion id, token, path):
  - same authorization and `pending` rule;
  - the path must belong to this suggestion, else `BAD_USER_INPUT`;
  - removes the path from `photos` and deletes the file from ImageKit;
  - a path already gone succeeds, so a retry is safe.
- **One cap of 10 stored photos per suggestion**, shared by the suggester's and the admin's uploads (the existing `IMAGE_LIMIT_REACHED`). A deleted photo frees its slot at once.
- `uploadPlaceSuggestionPhoto`, Publish and Reject don't change.

## Tests

Use the fake ImageKit bucket, as in `tests/placeSuggestionPhotos.test.ts`.

- [x] An admin upload is stored, returns its path, and shows up in `placeSuggestionForReview`
- [x] The shared cap: an 11th photo is refused, whether the suggester or the admin uploads it
- [x] Delete removes the path and the file and frees a slot for a new upload
- [x] Deleting a path that is already gone succeeds
- [x] Delete refuses a path from another suggestion
- [x] A bad token and a decided suggestion are refused by both operations
- [x] Admin uploads don't consume the `guestPhoto` limit
- [x] Publish with a list that includes admin photos makes them Place photos, the first one the card image
- [x] `npm test`, `tsc` and `npm run generate` pass

## Comments

Implemented on `feat/admin-suggestion-photos`:

- `uploadPlaceSuggestionPhotoAsAdmin(id, token, fileBuffer): String!` — mirrors `uploadPlaceSuggestionPhotoResolver`'s storage and shared 10-photo cap, authorized by `requireSuggestionForReview` (token) instead of ownership, no rate limit, returns the new photo's path.
- `deletePlaceSuggestionPhoto(id, token, path): Boolean!` — validates the path structurally against this suggestion's own ImageKit folder (not against the current `photos` array), so a retried delete of an already-removed path still succeeds; deletes the ImageKit file first, then `$pull`s `photos` (guarded on the path still being present, not on `status`, so the array never points at a file that no longer exists).
- Added `deleteImageKitFile` to `src/utils/imagekit.ts` for single-file-by-path deletion.
- 8 new tests in `tests/placeSuggestionPhotos.test.ts`; full suite 94/94, `tsc` and `npm run generate` pass.
- Frontend ticket `../berlincoffeemap/.scratch/review-page-photos/issues/01-admin-photos-on-review-page.md` is now unblocked.
