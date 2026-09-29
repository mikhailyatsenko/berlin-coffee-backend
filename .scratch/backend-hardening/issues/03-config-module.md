# 03: One validated config module

Status: done
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

- [x] `grep -r "process.env" src` finds only the config module.
- [x] Startup fails on a missing required variable and on an unknown or missing `NODE_ENV`.
- [x] CORS allows only `https://3welle.com` in production and `http://localhost:5173` otherwise.
- [x] `logout` clears cookies with the shared cookie settings.
- [x] Test: the config builder rejects an invalid `NODE_ENV` and a missing variable, and derives production vs development domains/cookie settings correctly.
- [x] `tsc --noEmit` and `npm test` pass.
- [x] Frontend follow-up exists: `../berlincoffeemap/.scratch/backend-hardening/issues/02-stop-vercel-dev-deploy.md`.

## Comments

**2026-09-29, implemented** (branch `feat/config-module`).

- `src/config/config.ts`: `buildConfig(env)` validates and builds, `config = buildConfig(process.env)` runs once on import (after `dotenv.config()`). `NODE_ENV` is checked first ("NODE_ENV must be one of production, development, test; got …" / "it is not set"). After that, every missing required variable is named in one error. `env.ts` and `env.utils.ts` are deleted, and `cookieSettings` and `backendUrl` (never used) went with them.
- The mode decides `frontendUrl` (`https://3welle.com` / `http://localhost:5173`) and `authCookie` (httpOnly, secure, sameSite, domain `api.3welle.com` / `localhost`, path). `accessTokenCookie` and `refreshTokenCookie` are `authCookie` plus `maxAge`. Clearing uses `authCookie` with no `maxAge`, because in express 4 a `maxAge` passed to `clearCookie` overrides the expiry.
- CORS on `/coffee`, the `/imagekit/auth` origin check, and loginWithGoogle's `OAuth2Client` redirect, `redirect_uri` and `Access-Control-Allow-Origin` all use `config.frontendUrl`. `dev.3welle.com` is gone.
- `logout` calls `clearAuthCookies`, which now clears with the full `authCookie`. Before, `clearAuthCookies` (called on an invalid token in the context) passed only path and domain. A browser rejects a cross-site Set-Cookie that isn't `SameSite=None; Secure`, so it likely never cleared anything in production.
- Dead guards removed, because validation at startup makes them unreachable: the five "MAILERSEND_API_KEY is not defined" throws, the `secret_not_configured` branch in `verifyRecaptcha`, and the API key check in `syncGooglePlaces`. The scripts now need `NODE_ENV` and every required variable, like the server (`docs/google-places-sync.md` updated).
- The test knobs are `config.photoUploadTimeoutMs` (it also covers Place photo uploads, hence the name; the env var keeps its name) and `config.reviewImageAbandonedLeaseMs`. `ImageKit` is built from `config.imagekit` directly.
- `FRONTEND_DOMAIN` / `BACKEND_DOMAIN` are removed from the local `.env`. There is no example file in the repo.
- **Before deploying:** the server's `.env` must say exactly `NODE_ENV=production`. The old code treated anything but `development` as production, so another value (`prod`, or unset) now stops the process at startup. `deploy.yml` doesn't set it.
- Tests: `tests/config.test.ts` covers an invalid or missing `NODE_ENV`, missing variables, production vs development/test domains and cookies, the knobs' defaults, and logout clearing both cookies with `authCookie`. CORS itself isn't exercised over HTTP; both routes read `config.frontendUrl`. `tsc --noEmit` is clean and `npm test` passes 123/123.
- Code review (standards and spec) found nothing blocking. Applied: the `photoUploadTimeoutMs` name, `new ImageKit(config.imagekit)`, no shadowed `config` in the test. Worth a look later: seven copies of `new MailerSend({ apiKey })` could become one mailer; three suggestion resolvers repeat the upload deadline expression that `uploadReviewImageResolver` wraps; `clearAuthCookies` (tokenUtils) and `setAuthCookies` (authHelpers) live in different modules.
- Frontend follow-up: `../berlincoffeemap/.scratch/backend-hardening/issues/02-stop-vercel-dev-deploy.md` (already existed).
