# 03: One validated config module

Status: ready-for-agent
Blocked by: None (can start immediately)
Source: [Single config module and a deploy gated on tests](../../backend-audit/issues/03-config-and-deploy-pipeline.md), Config

## Problem

Configuration is read from `process.env` all over the code, and "production" means different things in different places, so a misconfigured process can run half in one mode and half in the other. Domains are hard-coded in five files, and a stale frontend (`dev.3welle.com`) is allowed to call the production API with credentials.

## Current behaviour

- Two config files: `src/config/env.ts` (required-variable check) and `src/utils/env.utils.ts` (cookie settings, domains). Plus direct `process.env` reads in `src/index.ts`, `utils/jwt.ts`, `utils/tokenUtils.ts`, resolvers and `src/scripts/*`.
- Production is `NODE_ENV === "production"` in `index.ts`, `loginWithGoogle` and `logout`, but `!== "development"` in `env.utils.ts`.
- `3welle.com`, `api.3welle.com` and `dev.3welle.com` are hard-coded; CORS allows `https://dev.3welle.com`. `logout` builds its own cookie options. `.env` carries unused `FRONTEND_DOMAIN` / `BACKEND_DOMAIN`. `env.cookieSettings` is dead.

## Expected behaviour

- One typed `config` module, built and validated once at startup; nothing else reads `process.env` (scripts and `jwt.ts` included). `env.ts` and `env.utils.ts` merge into it; `env.cookieSettings` goes.
- `NODE_ENV` must be `production`, `development` or `test`; anything else or unset fails startup with a clear message. `isProduction` is exactly `NODE_ENV === "production"`; `test` behaves like development. CORS, introspection, `autoIndex`, `loginWithGoogle`, `logout` and cookie settings all read that one flag.
- Domains derived from the mode inside the module: production frontend `https://3welle.com`, cookie domain `api.3welle.com`; development `http://localhost:5173` / `localhost`. `dev.3welle.com` is gone from CORS and everywhere else. `FRONTEND_DOMAIN` / `BACKEND_DOMAIN` leave `.env`/examples.
- `logout` and the Google `redirect_uri` use the same config as the token cookies; logout's hand-built cookie options go.
- The optional test knobs (`REVIEW_IMAGE_UPLOAD_TIMEOUT_MS`, `REVIEW_IMAGE_ABANDONED_LEASE_MS`) live in the module too. `tests/support/mongod.ts` keeps working (`setTestEnv` sets `NODE_ENV=test`).
- `ADMIN_EMAIL` is **not** added here (ticket 13 adds it).

## Acceptance criteria

- [ ] `grep -r "process.env" src` finds only the config module.
- [ ] Startup fails on a missing required variable and on an unknown or missing `NODE_ENV`.
- [ ] CORS allows only `https://3welle.com` in production and `http://localhost:5173` otherwise.
- [ ] `logout` clears cookies with the shared cookie settings.
- [ ] Test: the config builder rejects an invalid `NODE_ENV` and a missing variable, and derives production vs development domains/cookie settings correctly.
- [ ] `tsc --noEmit` and `npm test` pass.
- [ ] Frontend follow-up exists: `../berlincoffeemap/.scratch/backend-hardening/issues/02-stop-vercel-dev-deploy.md`.
