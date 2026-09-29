# 23: Remove dead auth code and cut the request body limit

Status: ready-for-agent
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

- [ ] `grep` finds none of the removed symbols/files.
- [ ] `src/index.ts` registers each body parser once.
- [ ] Test: a JSON body just over the limit on `/coffee` gets `413`; a 3 MB image as base64 in a mutation is accepted.
- [ ] `tsc --noEmit` and `npm test` pass.
