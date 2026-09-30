# 20: Deploy into release directories with a health check and rollback

Status: ready-for-human
Blocked by: 19 (Deploy gated on CI)
Source: [Single config module and a deploy gated on tests](../../backend-audit/issues/03-config-and-deploy-pipeline.md), Deploy (server)

## Problem

The deploy deletes `dist` and `node_modules` of the live app and reinstalls under the running PM2 process. A failed `npm ci` or a crashing build leaves production down with nothing to roll back to, and the "is it up" check is `pm2 list | grep online`, which passes for a process that crash-loops.

## Current behaviour

`deploy.yml` → on the server in `/var/www/coffee-server`: `rm -rf dist`, unpack, `rm -rf node_modules`, `npm ci --only=production --include=optional`, `npm rebuild sharp --update-binary`, `pm2 restart coffe-server` (or start), then a `pm2 list` check.

## Expected behaviour

- Each deploy unpacks into `/var/www/coffee-server/releases/<sha>/`, runs `npm ci --omit=dev` and the `sharp` rebuild there. A failed install never touches the live release.
- Then the `current` symlink is switched to the new release and PM2 restarts the app from `current`. The `.env` is shared (symlinked into each release or read from a fixed path; pick one and document it).
- **Health check:** an HTTP POST `{ "query": "{ __typename }" }` to the local GraphQL endpoint (`http://127.0.0.1:3000/coffee`, with `Content-Type: application/json`; a bare GET answers 400 by Apollo's CSRF rule), retried for a short window. On failure: point `current` back at the previous release, restart PM2, and fail the workflow.
- Keep the last 2 releases (the live one and the rollback target); older ones are removed. (Was 5; changed by the owner on 2026-09-30, see Comments.)
- A 1–2 s restart gap is acceptable (no cluster/reload).
- **One-time server migration** (human step): a checklist in the ticket's Comments (or a `/mattpocock-skills:wizard` script) that moves the existing layout onto `releases/` + `current` and re-registers the PM2 process from `current` (`pm2 delete`, `pm2 start` from `current`, `pm2 save`). The new `deploy.yml` must not be pushed to `main` before the human has run it; the agent stops on a branch and says so.

## Acceptance criteria

- [x] `deploy.yml` deploys into `releases/<sha>`, switches `current`, health-checks over HTTP, and rolls back on failure.
- [x] Old releases beyond 2 are pruned.
- [x] The deploy script is testable locally: its server-side part lives in a shell script in the repo, and a local run against a temp directory (with PM2 and the health check stubbed) shows switch, rollback on failed health check, and pruning; recorded in Comments.
- [x] The one-time migration checklist exists, and the ticket says plainly that merging waits for it.

## Comments

2026-09-30 (from ticket 19 review): deploys can overlap. CI's `cancel-in-progress` only covers the CI stage, so a newer push whose CI finishes while an older deploy is still running starts a second deploy on the server. With release directories and a `current` switch this matters more; consider `concurrency: { group: deploy-prod, cancel-in-progress: false }` on the deploy job (not on the workflow, where it could collide with the called CI's group).

2026-09-30 (implement): Done on branch `ci/release-directories-with-rollback`. **Not merged: merging waits for the one-time server migration below.** Pushing this `deploy.yml` to `main` against the old layout makes every deploy fail with "server not migrated" (the script refuses to run without `current`); the app itself keeps running.

- `deploy/release.sh <sha> <tarball>` is the server side. Steps:
  - Unpack into `releases/<sha>`, symlink `.env` into it, run `npm ci --omit=dev`, `npm rebuild sharp --update-binary` and the `require('sharp')` check. On failure the half-built directory is removed, and `current` and PM2 are untouched.
  - `ln -sfn releases/<sha> current`, then `pm2 restart coffe-server`.
  - Health check: POST `{"query":"{ __typename }"}` with `Content-Type: application/json` to `http://127.0.0.1:3000/coffee`, up to 15 × (3 s curl + 2 s pause).
  - If the restart or the health check fails: `current` gets its old link text back, PM2 restarts, the failed release is removed, and the script exits 1.
  - On success: releases beyond the newest 5 (now 2, see below) are removed, by mtime. The new release is `touch`ed, so a redeployed older sha counts as newest.
  - It refuses to run on a malformed sha, a missing `$APP_ROOT/.env`, or a missing `current` (server not migrated). Deploying the sha that is already live does nothing.
- `.env`: the one file stays at `/var/www/coffee-server/.env`, and each release gets a symlink to it (dotenv reads the cwd, PM2's cwd is `current`). Documented in the script header and in README "Deploy".
- `deploy.yml`:
  - The tarball and `release.sh` are uploaded to `/var/www/coffee-server/incoming/` (`strip_components: 1`), and the SSH step runs `bash .../incoming/release.sh "${{ github.sha }}" .../incoming/deploy.tar.gz`.
  - The deploy job has `concurrency: { group: deploy-prod, cancel-in-progress: false }` (per the note above). It is on the job, not the workflow, so it doesn't collide with ci.yml's group.
  - `timeout-minutes` goes 10 → 15 to cover npm ci and up to ~2.5 min of health checks and rollback.
- README gets a "Deploy" section: the layout, manual commands now run from `/var/www/coffee-server/current`, and a manual rollback.
- **Local run (acceptance criterion 3)**, `tests/deployRelease.test.ts`, 12 tests, part of `npm test`. It uses a temp app root laid out as the migration leaves it; `pm2`, `npm` and `curl` are stubs on PATH, and curl answers healthy unless the live release ships `dist/unhealthy`. The tests show:
  - install in `releases/<sha>` and the switch plus restart;
  - the health request's shape;
  - rollback on a failed health check, on a failed `pm2 restart`, and with an absolute `current` link;
  - a failed `npm ci` leaves `current` and PM2 alone;
  - pruning to 5, and pruning by deploy order;
  - the already-live no-op;
  - rejection of a bad sha, a missing `.env`, and a missing `current`.
- Once also run against **real PM2 7.0.4** locally (npm stubbed, a small HTTP app on another port). PM2 stores the script path as `current/dist/index.js` and `exec cwd` as `current`. After `restart`, the app answers from the new release with cwd resolved to `releases/<sha>` and reads `.env` through the symlink. A crash-looping release was rolled back, and the old one answered again. (A first attempt leaked 9 PM2 daemons because the socket path was too long; they were stopped by hand. Don't repeat this without a short `PM2_HOME` and a `pgrep -fl "PM2 v"` check afterwards.)
- After the review fixes: `tsc --noEmit` clean, `npm test` 313/313, shellcheck, actionlint, and eslint on the test file all clean.
- Code review, applied:
  - No `current` now means "server not migrated" and fails before anything happens. This replaces the fallback `pm2 start` + `pm2 save`, which quietly re-registered the process, and it stops an old-layout server from reporting success while PM2 kept running the old code.
  - An absolute `current` link no longer breaks rollback.
  - The health window was shortened and the job timeout raised.
  - `PM2_NAME` is no longer overridable.
  - The test was fixed for eslint/prettier and the duplicated pm2-call filter removed.
- Code review, not applied:
  - Requiring 2–3 consecutive healthy answers. The spec asks for one answer within a window, and a later crash is caught only by the next deploy or monitoring.
  - Surviving a dropped SSH session (`nohup`/`setsid`). The job timeout now covers the worst case.
  - Deduplicating the layout description between the script header, the README and the test header.

### One-time server migration (human step, before merging)

Run as `SERVER_USER` on the server. Nothing is deleted until the first new deploy has succeeded, so every step up to 3 can be undone.

0. **Look first.**
   ```
   cd /var/www/coffee-server
   ls -la
   pm2 describe coffe-server | grep -E "status|script path|exec cwd|interpreter"
   command -v node npm pm2
   df -h . && du -sh node_modules
   ```
   - Expected in the directory: `dist/`, `node_modules/`, `package.json`, `package-lock.json`, `.env`, maybe an old `deploy.tar.gz`. If the app keeps anything else there at runtime, stop: it would need to be shared like `.env`.
   - Disk: up to 3 copies of `node_modules` will exist (2 kept plus the one being built).
1. **Make the running code the first release.** This copies, so the old layout keeps running. `SHA` is the last successful deploy: `eeca79f…` as of 2026-09-30; if something was pushed since, take `gh run list --workflow deploy.yml -L 1 --json headSha,conclusion`.
   ```
   SHA=eeca79f77714397e81fe0c73cb2c44d802dc7200
   mkdir -p releases/$SHA incoming
   cp -a dist node_modules package.json package-lock.json releases/$SHA/
   ln -s /var/www/coffee-server/.env releases/$SHA/.env
   ln -sfn releases/$SHA current
   ls -la current/ && head -c 20 current/.env; echo
   ```
2. **Re-register PM2 from `current`** (1–2 s down):
   ```
   pm2 delete coffe-server
   pm2 start /var/www/coffee-server/current/dist/index.js --name coffe-server \
     --cwd /var/www/coffee-server/current \
     --interpreter /root/.nvm/versions/node/v22.20.0/bin/node
   pm2 save
   ```
3. **Check.**
   ```
   pm2 describe coffe-server | grep -E "status|script path|exec cwd"
   curl -fsS -X POST -H 'Content-Type: application/json' \
     --data '{"query":"{ __typename }"}' http://127.0.0.1:3000/coffee; echo
   ```
   - Expected: `online`, script path `/var/www/coffee-server/current/dist/index.js`, exec cwd `/var/www/coffee-server/current`, and `{"data":{"__typename":"Query"}}`.
   - If it fails, go back to the old layout: `pm2 delete coffe-server && cd /var/www/coffee-server && pm2 start dist/index.js --name coffe-server --interpreter /root/.nvm/versions/node/v22.20.0/bin/node && pm2 save`.
4. **Merge** `ci/release-directories-with-rollback` into `main` and push. In the Actions run, the deploy log should end with `✅ releases/<sha> is live`. On the server, `readlink current` should give `releases/<new sha>` and `ls releases` should show both.
5. **After that first deploy succeeds**, remove the old top-level copies: `cd /var/www/coffee-server && rm -rf dist node_modules package.json package-lock.json deploy.tar.gz`.
6. Record the result here and set `Status: done`.

2026-09-30: Ran step 0 on the server (read-only, as root).
- Layout: `dist/`, `node_modules/` (135M), `package.json`, `package-lock.json`, `.env`, plus `uploads/`. `uploads/` holds old local avatars and a PDF (456K, last write 2025-10-01). The code neither writes nor serves it (ImageKit; no `express.static`/`sendFile`), so it stays where it is and is not copied into releases.
- PM2: `coffe-server` is `online` as root. Script path `/var/www/coffee-server/dist/index.js`, exec cwd `/var/www/coffee-server`, interpreter `/root/.nvm/versions/node/v22.20.0/bin/node`. Other apps run in the same PM2 (`3welle-strapi`, `berlin-bars-server`, `encryptnotes`); systemd unit `pm2-root`. Daemon 6.0.13, `/usr/bin/pm2` CLI 5.4.1 (as before; don't `pm2 update`, it restarts every app).
- A non-interactive SSH session (the one the deploy uses) has `/usr/bin/node` v22.22.3, `/usr/bin/npm` and `/usr/bin/pm2`. `npm ci` builds native modules with that node, and they run under nvm's 22.20.0, which has the same ABI; that is how production already runs. Step 2 now names the current interpreter explicitly instead of `$(command -v node)`, which would differ between an interactive and a non-interactive shell.
- Disk: 6.0G free of 20G; 6 × 135M of `node_modules` fits.

2026-09-30: The owner asked to keep 2 releases instead of 5 (`KEEP_RELEASES=2`): the live one and the automatic rollback target; manual rollback further back is not needed, and the server's disk is tight (~136M per release). Tests and README updated; `deployRelease.test.ts` 12/12.

