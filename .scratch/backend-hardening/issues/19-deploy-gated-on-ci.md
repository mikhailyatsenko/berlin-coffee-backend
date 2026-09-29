# 19: Deploy runs only after CI passes

Status: ready-for-agent
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

- [ ] `deploy.yml` has a CI job that the deploy job depends on; `ci.yml` accepts `workflow_call`.
- [ ] Both workflow files pass `actionlint` (or an equivalent syntax check run locally), recorded in Comments.
- [ ] Verified on a real push after merge: the Actions run shows CI before deploy (recorded in Comments; a human may need to confirm if the agent can't read Actions runs via `gh`).
