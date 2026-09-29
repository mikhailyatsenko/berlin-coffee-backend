# 08: No unscoped upload signatures and no public caching of `/coffee`

Status: ready-for-agent
Blocked by: None (can start immediately)
Source: `map.md` Notes, "`/imagekit/auth` removed", "`Cache-Control: public` removed"

## Problem

- `GET /imagekit/auth` hands any signed-in User an unscoped ImageKit upload signature, which lets them upload anything anywhere in the media library. The frontend doesn't use it.
- Every `/coffee` response is sent with `Cache-Control: public, max-age=300`, including personalized queries (`currentUser`, `favoritePlaces`) and mutations, so a shared cache or proxy may serve one User's data to another.

## Current behaviour

`src/index.ts`: the `/imagekit/auth` route with its own CORS headers and its own token handling (the only user of the `ImageKit` instance built there); a middleware on `/coffee` setting `Cache-Control: public, max-age=300`.

## Expected behaviour

- The `/imagekit/auth` route and the `ImageKit` instance built only for it are removed (the ImageKit helpers in `utils/imagekit.ts` stay).
- The `Cache-Control` middleware on `/coffee` is removed; responses carry no public caching header. (Server-side caching in `utils/cache.ts` is unaffected.)

## Acceptance criteria

- [ ] `GET /imagekit/auth` answers 404.
- [ ] A `/coffee` response has no `Cache-Control: public` header.
- [ ] Test: an HTTP-level test (supertest or a started app on a random port) checks both points, or, if the app can't yet be started in tests, the app setup is extracted enough for it to be.
- [ ] Frontend check: `grep -r "imagekit/auth" ../berlincoffeemap/src` finds nothing (read-only).
- [ ] `tsc --noEmit` and `npm test` pass.
