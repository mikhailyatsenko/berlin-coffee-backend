# 03: Photos in a Place suggestion become Place photos

**Status:** ready-for-agent

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

- [ ] Only the suggester can upload; others, a decided suggestion and an 11th photo are rejected
- [ ] Guest uploads count towards the Guest photo limit
- [ ] Publish moves the kept photos to the Place photo folder, sets the card image to the first, deletes the dropped ones
- [ ] Publish with no kept photos leaves the default image; paths from another suggestion are rejected
- [ ] Reject deletes every photo of the suggestion
- [ ] `npm test`, `tsc`, `npm run generate` green
