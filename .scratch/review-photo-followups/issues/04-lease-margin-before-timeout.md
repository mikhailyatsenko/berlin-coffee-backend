# The upload lease's margin is measured before the slow part of the request starts

Status: done

## Problem

The lease's `until` is set to `now + getReviewImageUploadTimeoutMs() + LEASE_MARGIN_MS` (15s) at the moment the lease is acquired — before `sharp` resizes the image and before the ImageKit rate-limit delay (`MIN_REQUEST_INTERVAL` waits, `uploadReviewImage`'s own `delay()` call) run. Both happen inside `uploadReviewImage`, ahead of `withTimeout`'s own clock. `MAX_DECODED_BYTES` allows inputs up to 3MB, so a slow `sharp` resize plus a queued rate-limit wait can eat into the 15s margin before ImageKit is even called. If that budget runs out, the lease can lapse mid-upload even though nothing actually hung — the request that follows (`withTimeout`'s real timeout) then races an already-expired lease.

## Current behaviour

- `src/graphql/resolvers/uploadReviewImageResolver/uploadReviewImageResolver.ts`: `until: new Date(now.getTime() + getReviewImageUploadTimeoutMs() + LEASE_MARGIN_MS)`, computed right after the lease's `findOneAndUpdate`, before `uploadReviewImage(...)` is called.
- `src/utils/imagekit.ts`, `uploadReviewImage`: rate-limit `delay()`, then `sharp(...).resize(...).jpeg(...).toBuffer()`, then `withTimeout(imagekit.upload(...), ...)`.

## Expected behaviour

Prefer the structural fix over just enlarging the constant: move the lease's `until` computation so it accounts for the time already spent, or — simpler and equally correct — pass the deadline down and have `withTimeout`'s clock start from the same `now` the lease used, then set `LEASE_MARGIN_MS` to comfortably cover `sharp` + rate-limit delay for a 3MB input (measure it once, then pick a round number with headroom, e.g. 30–45s) rather than the current unexplained 15s.

## Acceptance criteria

- [x] A comment or measurement records what `sharp` + rate-limit delay actually cost for a near-`MAX_DECODED_BYTES` input, so the margin isn't a guess.
- [x] The lease cannot lapse solely because of `sharp`/rate-limit time when the ImageKit call itself is fast.
- [x] Existing lease/timeout tests in `tests/uploadReviewImage.test.ts` still pass.

## Comments

- 2026-09-26: Implemented on `fix/lease-margin-before-timeout` with the "pass the
  deadline down" route. The resolver computes `uploadDeadline(now)` (upload timeout
  from the lease's own `now`) and `uploadLeaseUntil(now)` is now that deadline plus
  `LEASE_MARGIN_MS`, so the two cannot drift. `uploadReviewImage` takes the deadline:
  the rate-limit wait and the sharp resize run on its clock, `withTimeout` gets only
  the time left, and ImageKit is not called at all once the deadline has passed (a
  plain error, so the lease is released straight away; nothing is in flight).
- `LEASE_MARGIN_MS` stays 15 s: processing is now paid out of the upload timeout,
  so the margin only covers the one Mongo write after the ImageKit call (commit or
  abandoned hold). The comment next to it records the measurement: sharp resize
  (1440px, mozjpeg) of near-limit inputs on an Apple M2 took 0.1–0.8 s (worst: a
  1.4 MB noisy 1440×1080 WebP; a 2.9 MB PNG 0.35 s; a 16000px flat PNG 0.65 s).
  The rate-limit wait is at most `MIN_REQUEST_INTERVAL` (50 ms).
- Side effect: the ImageKit call now gets the timeout minus processing time, not the
  full timeout. With processing under a second against 30 s, that is accepted.
- Tests (`tests/uploadReviewImage.test.ts`, sharp slowed via `toBuffer`): processing
  plus a slow ImageKit call together exceed the timeout → treated as an abandoned
  upload, lease held; processing alone outlasts the timeout → ImageKit never called,
  slot free again.
- Not done, from code review: (1) a deadline with only a few ms left still starts
  the ImageKit call, which is abandoned at once and takes the 10-minute hold; a
  minimum remaining time could skip it. (2) `deleteAllReviewImages` has no timeout,
  so a folder delete longer than timeout + margin lets deleteReview's fence lapse
  mid-delete; worth its own ticket.
- 2026-09-26: Merged into `main` in `59cce7e` (commits `3dc2c00`, `c3d064a`).
