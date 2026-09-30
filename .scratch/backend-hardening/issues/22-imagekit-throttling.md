# 22: ImageKit calls share one throttle

Status: done
Blocked by: 16 (Account deletion: the throwing folder delete)
Source: `map.md` Notes, "ImageKit throttling"

## Problem

The spacing between ImageKit calls is implemented five times: `awaitRateLimit()` plus four hand-copied blocks of the same `lastRequestTime` / `delay` code. A change to the throttle has to be made in five places and the copies can drift.

## Current behaviour

`src/utils/imagekit.ts`: `getPlaceImages`, `listReviewPhotoNames`, `uploadAvatar`, `uploadReviewImage` and `deleteAvatar` inline the check; `deleteImageKitFile`, `deleteImageKitFolder` and others call `awaitRateLimit()`.

## Expected behaviour

- Every ImageKit call in the module waits through `awaitRateLimit()`; no inline copy of the throttle remains.
- Behaviour unchanged: same minimum interval, shared across all calls.
- If the module is split (infrastructure clients, map Note A5), the throttle moves with the ImageKit client and stays single.

## Acceptance criteria

- [x] `lastRequestTime` is read and written only inside `awaitRateLimit`.
- [x] Test: two back-to-back calls of different helpers (e.g. an upload and a delete, ImageKit client stubbed) are spaced by at least the minimum interval.
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

2026-09-30 (implement): Done on `refactor/imagekit-throttle`.

- `src/utils/imagekit.ts`: the four inline copies (`getPlaceImages`, `listReviewPhotoNames`, `uploadAvatar`, `uploadReviewImage`) now call `awaitRateLimit()`, at the same spot as before (before the resize in the uploads). `lastRequestTime` and `MIN_REQUEST_INTERVAL` moved next to `awaitRateLimit`. All ten SDK calls in the module go through it; no other file calls the SDK. Interval unchanged (50 ms). `deleteAvatar`, listed under Current behaviour, already delegated to `deleteImageKitFile` on main.
- Test: `tests/imagekitThrottle.test.ts` (2), ImageKit stubbed, no mongod: delete → `uploadAvatar`, and delete → `getPlaceImages` → `listReviewPhotoNames` → `uploadReviewImage`, every gap ≥ 50 ms (1 ms timer slack). Uploads go last, because their SDK call comes after the resize. The tests pass on the pre-refactor code too (behaviour-preserving). A mutation run (throttle removed from `getPlaceImages`) fails with "deleteFolder → listFiles: 0 ms apart".
- Code review: Standards and Spec found no violations. Applied to the test: `reviewPhotoFolder` instead of a literal path, a named deadline, reset in `beforeEach`, header narrowed to "a sample of the helpers". Kept on purpose: the test's own copy of the 50 ms interval, so the test pins it. Not tested: `uploadPlaceSuggestionPhoto`, `copyPlaceSuggestionPhotoToPlace`, `deleteImageKitFile`.
- `tsc --noEmit` clean, `npm test` 315/315. No frontend change, no deploy step beyond the usual release.
