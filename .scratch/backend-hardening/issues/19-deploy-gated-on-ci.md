# 19: Deploy runs only after CI passes

Status: done
Blocked by: None (can start immediately)
Source: [Single config module and a deploy gated on tests](../../backend-audit/issues/03-config-and-deploy-pipeline.md), Deploy (gate)

## Problem

Branches are merged locally and pushed to `main`, and every push to `main` deploys to production. CI (`tsc`, codegen drift, tests) runs only on pull requests, so a push that breaks the build or the tests goes live untested.

## Current behaviour

- `.github/workflows/ci.yml` runs on `pull_request` to `main` only.
- `.github/workflows/deploy.yml` runs on push to `main`: build, package, upload, install and restart, with no test step.

## Expected behaviour

- `ci.yml` also exposes `workflow_call` (still runs on PRs); its concurrency group works for both triggers.
- `deploy.yml` calls it as a first job; the deploy job `needs` it, so a failing `tsc`, codegen drift or test run stops the deploy.
- No branch protection; local merges keep working.

## Acceptance criteria

- [x] `deploy.yml` has a CI job that the deploy job depends on; `ci.yml` accepts `workflow_call`.
- [x] Both workflow files pass `actionlint` (or an equivalent syntax check run locally), recorded in Comments.
- [x] Verified on a real push after merge: the Actions run shows CI before deploy (recorded in Comments; a human may need to confirm if the agent can't read Actions runs via `gh`).

## Comments

2026-09-30 (implement): Done on `ci/deploy-gated-on-ci`.

- `ci.yml`: `workflow_call` next to `pull_request`. Concurrency group is `ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}`. In a called workflow the `github` context is the caller's, so a push gets `ci-Deploy Coffemap Server-refs/heads/main` and a PR `ci-CI-<n>`; they never share a group, and `deploy.yml` has no workflow-level concurrency, so no caller/callee deadlock. `cancel-in-progress` stays: a newer push to `main` cancels an older run's CI while it is still running, and that run's deploy is skipped (the newer commit contains it).
- `deploy.yml`: first job `ci: uses: ./.github/workflows/ci.yml` (no secrets passed, CI needs none); `deploy` has `needs: ci`, so a failed or cancelled CI skips the deploy. Also a top-level `permissions: contents: read` (not asked for): the deploy only checks out and uses SSH secrets, and the called workflow's own `contents: read` must not exceed the caller's.
- `actionlint` 1.7.12 on both files: clean. Negative check: with `workflow_call` removed from `ci.yml`, actionlint fails on `deploy.yml` (`"workflow_call" event trigger is not found`), so it does check the link.
- `tsc --noEmit` clean, `npm test` 301/301 (no TS changes).
- Code review: comments reworded (a deploy already past CI is not cancelled; the deploy.yml comment no longer lists CI's steps). Not applied: a deploy concurrency group (two deploys can still overlap if a newer push finishes CI while an older deploy runs; pre-existing, noted on ticket 20); aligning the deploy runner (`ubuntu-latest`) with CI's `ubuntu-24.04`.
- **Open:** the last criterion needs a real push to `main` after merge; check that the Actions run shows `ci` before `deploy` (`gh run list --workflow deploy.yml`, `gh run view <id>`).

2026-09-30: Merged to `main` (e4ec9ed) and pushed. Actions run 36698954507 (Deploy Coffemap Server, head e4ec9ed): `ci / test` 09:53:15–09:54:28 success, then `deploy` 09:54:30–09:55:21 success; the `deploy` job did not exist until CI finished.
