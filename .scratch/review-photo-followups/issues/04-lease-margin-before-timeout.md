# The upload lease's margin is measured before the slow part of the request starts

Status: ready-for-agent

## Problem

The lease's `until` is set to `now + getReviewImageUploadTimeoutMs() + LEASE_MARGIN_MS` (15s) at the moment the lease is acquired — before `sharp` resizes the image and before the ImageKit rate-limit delay (`MIN_REQUEST_INTERVAL` waits, `uploadReviewImage`'s own `delay()` call) run. Both happen inside `uploadReviewImage`, ahead of `withTimeout`'s own clock. `MAX_DECODED_BYTES` allows inputs up to 3MB, so a slow `sharp` resize plus a queued rate-limit wait can eat into the 15s margin before ImageKit is even called. If that budget runs out, the lease can lapse mid-upload even though nothing actually hung — the request that follows (`withTimeout`'s real timeout) then races an already-expired lease.

## Current behaviour

- `src/graphql/resolvers/uploadReviewImageResolver/uploadReviewImageResolver.ts`: `until: new Date(now.getTime() + getReviewImageUploadTimeoutMs() + LEASE_MARGIN_MS)`, computed right after the lease's `findOneAndUpdate`, before `uploadReviewImage(...)` is called.
- `src/utils/imagekit.ts`, `uploadReviewImage`: rate-limit `delay()`, then `sharp(...).resize(...).jpeg(...).toBuffer()`, then `withTimeout(imagekit.upload(...), ...)`.

## Expected behaviour

Prefer the structural fix over just enlarging the constant: move the lease's `until` computation so it accounts for the time already spent, or — simpler and equally correct — pass the deadline down and have `withTimeout`'s clock start from the same `now` the lease used, then set `LEASE_MARGIN_MS` to comfortably cover `sharp` + rate-limit delay for a 3MB input (measure it once, then pick a round number with headroom, e.g. 30–45s) rather than the current unexplained 15s.

## Acceptance criteria

- [ ] A comment or measurement records what `sharp` + rate-limit delay actually cost for a near-`MAX_DECODED_BYTES` input, so the margin isn't a guess.
- [ ] The lease cannot lapse solely because of `sharp`/rate-limit time when the ImageKit call itself is fast.
- [ ] Existing lease/timeout tests in `tests/uploadReviewImage.test.ts` still pass.
