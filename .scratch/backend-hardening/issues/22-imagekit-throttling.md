# 22: ImageKit calls share one throttle

Status: ready-for-agent
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

- [ ] `lastRequestTime` is read and written only inside `awaitRateLimit`.
- [ ] Test: two back-to-back calls of different helpers (e.g. an upload and a delete, ImageKit client stubbed) are spaced by at least the minimum interval.
- [ ] `tsc --noEmit` and `npm test` pass.
