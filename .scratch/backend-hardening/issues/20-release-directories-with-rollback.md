# 20: Deploy into release directories with a health check and rollback

Status: ready-for-agent
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
- Keep the last 5 releases; older ones are removed.
- A 1–2 s restart gap is acceptable (no cluster/reload).
- **One-time server migration** (human step): a checklist in the ticket's Comments (or a `/mattpocock-skills:wizard` script) that moves the existing layout onto `releases/` + `current` and re-registers the PM2 process from `current` (`pm2 delete`, `pm2 start` from `current`, `pm2 save`). The new `deploy.yml` must not be pushed to `main` before the human has run it; the agent stops on a branch and says so.

## Acceptance criteria

- [ ] `deploy.yml` deploys into `releases/<sha>`, switches `current`, health-checks over HTTP, and rolls back on failure.
- [ ] Old releases beyond 5 are pruned.
- [ ] The deploy script is testable locally: its server-side part lives in a shell script in the repo, and a local run against a temp directory (with PM2 and the health check stubbed) shows switch, rollback on failed health check, and pruning; recorded in Comments.
- [ ] The one-time migration checklist exists, and the ticket says plainly that merging waits for it.

## Comments

2026-09-30 (from ticket 19 review): deploys can overlap. CI's `cancel-in-progress` only covers the CI stage, so a newer push whose CI finishes while an older deploy is still running starts a second deploy on the server. With release directories and a `current` switch this matters more; consider `concurrency: { group: deploy-prod, cancel-in-progress: false }` on the deploy job (not on the workflow, where it could collide with the called CI's group).
