# Single config module and a deploy gated on tests

Type: grilling
Status: resolved
Blocked by: none

## Question

Two operational decisions (architecture item A4 plus finding 11):

1. **Config.** Merge `src/config/env.ts` and `src/utils/env.utils.ts` into one typed config read at startup. What defines "production"? Today it is `NODE_ENV === "production"` in `index.ts`, `loginWithGoogle` and `logout`, but `!== "development"` in `env.utils.ts`. Where do the domains come from: env vars, or derived from the environment the way `3welle.com`, `api.3welle.com` and `dev.3welle.com` are hard-coded in five files today? Is `dev.3welle.com` a real environment that Google login and cookies must support?
2. **Deploy.** CI runs only on PRs, but branches are merged locally and pushed to `main`, and `deploy.yml` then deploys with no tests. Should tests (and `tsc`, codegen drift) run inside the deploy workflow before deploying, or should pushes to `main` be blocked in favour of PRs? The deploy also runs `rm -rf node_modules && npm ci` under the live PM2 process: is a short outage acceptable, or should it install into a fresh directory and switch over?

## Answer

Decided with the user 2026-09-27 (all recommendations accepted).

**Config**
- One typed `config` module, built and validated at startup; `process.env` is read nowhere else, `src/scripts/*` and `utils/jwt.ts` included. `src/config/env.ts` and `src/utils/env.utils.ts` merge into it; the dead `env.cookieSettings` goes.
- Mode: `NODE_ENV` must be `production`, `development` or `test`; anything else (or unset) fails startup. Production is exactly `NODE_ENV === "production"`; `test` behaves like development. Every current check (`index.ts` CORS/introspection, `database.ts` autoIndex, `loginWithGoogle`, `logout`, `env.utils`) reads this one flag.
- Domains are derived from the mode in that one module, not env vars: prod `https://3welle.com`, cookie domain `api.3welle.com`; dev `http://localhost:5173` / `localhost`. The unused `FRONTEND_DOMAIN`/`BACKEND_DOMAIN` leave `.env`. `logout` and the Google `redirect_uri` use the same config as `tokenUtils` (logout's hand-built cookie options go).
- `dev.3welle.com` is not a supported environment: it is a Vercel build of the frontend `dev` branch, last touched 2025-11-25, talking to the production API. Removed from the CORS origins. Frontend handoff (small, fully decided): stop Vercel deploying the `dev` branch (`vercel.json` `git.deploymentEnabled.dev`) and take the domain down.

**Deploy**
- Gate: `ci.yml` becomes reusable (`workflow_call`, still on PRs); `deploy.yml` runs it and the deploy job `needs` it, so `tsc`, codegen drift and tests run before every deploy of `main`. No branch protection; local merges stay.
- Server: release directories `releases/<sha>/` (unpack, `npm ci --omit=dev`, `sharp` rebuild there), then switch a `current` symlink and `pm2 restart` from `current`; keep the last few releases. A failed install never touches the live release.
- Health check after restart: an HTTP request to the local GraphQL endpoint (a POST `{ __typename }`; a bare GET `/coffee` answers 400 by Apollo's CSRF rule) instead of `pm2 list | grep online`; on failure the symlink goes back to the previous release and PM2 restarts it. A 1–2 s restart gap is acceptable (no cluster/reload).
- One-time HITL step: move the existing `/var/www/coffee-server` layout onto `releases/` + `current` and re-register the PM2 process from `current`.

**Slicing for the final ticketing:** (1) Config module (architecture foundation, lands before fixes that read env); (2) Deploy gated on CI (tiny); (3) Release directories with health check and rollback, plus the one-time server checklist. Frontend: one small ready-for-agent ticket for the Vercel `dev` deployment. No CONTEXT.md terms, no ADR (all easy to reverse).
