# 23: Remove dead auth code and cut the request body limit

Status: done
Blocked by: 11 (Session revocation)
Source: `map.md` Notes, "Dead code"

## Problem

Unused auth helpers sit next to the real ones and invite being used by mistake (one verifies a token without checking its type); body parsers are registered twice; and the JSON body limit of 10 MB lets anyone make the server parse far more than any real request needs.

## Current behaviour

- Unused: `src/utils/verifyToken.ts`, `createJWT` in `utils/jwt.ts`, `getUserFromToken` in `utils/tokenUtils.ts` (still imported by `src/index.ts`), `types/express.d.ts`. (`env.cookieSettings` is removed by ticket 03; check it is gone.)
- `src/index.ts` registers `express.urlencoded` twice and `express.json` twice (once global with `limit: "10mb"`, once on `/coffee`).

## Expected behaviour

- The dead code above is deleted; nothing imports it.
- One `express.json` on `/coffee` and no `urlencoded` unless something needs it (GraphQL over POST is JSON).
- The JSON limit is what the largest real request needs: a 3 MB photo as base64 (~4 MB) plus the GraphQL envelope → `5mb`. Check the largest upload the frontend sends (Photo, avatar, Place suggestion photo) and record the number in Comments; if one is larger than 3 MB before encoding, size the limit to it.
- A body over the limit gets `413`, not a 500.

## Acceptance criteria

- [x] `grep` finds none of the removed symbols/files.
- [x] `src/index.ts` registers each body parser once.
- [x] Test: a JSON body just over the limit on `/coffee` gets `413`; a 3 MB image as base64 in a mutation is accepted.
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

2026-09-30 (implement): Done on `chore/dead-code-and-body-limit`.
- `createJWT`, `getUserFromToken` and `env.cookieSettings` were already gone (tickets 03, 11). This ticket deletes `src/utils/verifyToken.ts` and `types/express.d.ts` (repo root, `RequestWithUser`, imported by nothing). The app setup now lives in `src/app.ts`, not `src/index.ts`.
- `src/app.ts` has one `express.json({ limit: JSON_BODY_LIMIT })` on `/coffee`. The global `express.json` and both `urlencoded` parsers are removed. Nothing else read `req.body`, and a GET still gets `{}` from the parser.
- **Largest upload the frontend sends: the avatar, up to 5 MB before encoding.** `AvatarUpload.tsx` checks `size > 5 * 1024 * 1024` and sends the file unresized through `readAsDataURL`. That is about 6.7 MB as base64. Review, Place suggestion and admin photos go through `preparePhoto` → `resizeAndConvert` (1440px long side, WebP 0.82), and the backend caps them at 3 MB decoded. So the limit is **`7mb`** (7,340,032 bytes), about 350 KB above a 5 MB avatar plus its envelope, not `5mb`.
- A body over the limit gets 413 from Express's default error handler.
- Tests (`tests/httpSurface.test.ts`): a body of 7 MiB + 1 byte gets 413, and a 5 MB avatar as base64 in `uploadAvatar` reaches the resolver (`UNAUTHENTICATED` when signed out). This is stricter than the 3 MB photo the spec asked for.
- Not done here: `uploadAvatar` has no decoded-size cap of its own, unlike the photo resolvers. The body limit now bounds it.
