# 08: No unscoped upload signatures and no public caching of `/coffee`

Status: done
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

- [x] `GET /imagekit/auth` answers 404.
- [x] A `/coffee` response has no `Cache-Control: public` header.
- [x] Test: an HTTP-level test (supertest or a started app on a random port) checks both points, or, if the app can't yet be started in tests, the app setup is extracted enough for it to be.
- [x] Frontend check: `grep -r "imagekit/auth" ../berlincoffeemap/src` finds nothing (read-only).
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

**2026-09-29, implemented** (branch `chore/http-surface-cleanup`).

- The app setup moved from `src/index.ts` into `createApp()` in `src/app.ts`. It builds Express, starts Apollo and returns the `httpServer`. `index.ts` only connects the database and listens.
- `/imagekit/auth` and its `ImageKit` instance are gone; `utils/imagekit.ts` is untouched. `getUserFromToken` in `utils/tokenUtils.ts` ("used for legacy endpoints") lost its last importer with it and is removed too.
- The `Cache-Control: public, max-age=300` middleware on `/coffee` is gone. Finding: Apollo's cache-control plugin already overwrote it with `no-store` on every response Apollo sends, so personalized queries were not in fact publicly cacheable. The header only survived where Apollo never answers, such as the CORS preflight (and errors raised before Apollo, e.g. a malformed JSON body). The test checks both a POST and a preflight; both preflight and 404 failed before the change (`public, max-age=300`, 401).
- Beyond the letter of the ticket: `index.ts` listens on `httpServer` instead of `app.listen`. `app.listen` created a second server, so `ApolloServerPluginDrainHttpServer` was draining a server that never listened.
- README deploy step 4 no longer lists `/imagekit/auth` or the `reviewImages` argument (both already gone); only `captchaToken` non-null remains.
- Worth a look later: `app.ts` registers body parsers twice (`express.urlencoded` twice, `express.json` globally and again on `/coffee`). Moved as-is; not in this ticket's scope.
- Tests: `tests/httpSurface.test.ts` starts the app on a random port, no database. `tsc --noEmit` is clean, `npm test` passes 185/185. Frontend: `grep -r "imagekit/auth" ../berlincoffeemap/src` finds nothing, nothing to hand off.
- Code review (standards and spec): no blocking findings; the dead function, stale README step, glossary wording ("anonymous") in the test, the unused `app` return value and the preflight origin are applied.
