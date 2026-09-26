# 02: Catch generated-types drift in CI

**What to build:** a CI check that fails a PR when
`src/graphql/generated/types.ts` no longer matches what `npm run generate`
would produce from the current schema — so it can't silently rot the way it
did before ticket 01, unnoticed for however long, with no signal to anyone.

## Background

There is currently **no PR/test CI workflow at all** in this repo —
`.github/workflows/deploy.yml` only runs on push to `main`, and it does
`npm ci` + `npm run build` (i.e. `tsc`), never `npm test` or `npm run
generate`. That's how `types.ts` drifted from the schema for as long as it did
without anyone noticing (see ticket 01).

This ticket is standing up (or extending) a CI workflow, which is a bigger
scope than "fix codegen" by itself — split out so it can be skipped or
descoped independently of ticket 01.

**Blocked by:** 01 (needs a freshly regenerated, known-good `types.ts` to
diff against — otherwise the first run of this check fails on pre-existing
drift)

**Status:** ready-for-agent

- [x] A CI workflow runs on pull requests (new workflow, e.g.
      `.github/workflows/ci.yml`, or extend the existing deploy workflow with
      a PR trigger — implementer's call)
- [x] That workflow runs `npm run generate` and fails the build if it produces
      a diff against the committed `src/graphql/generated/types.ts`
      (`git diff --exit-code` after regenerating, or equivalent)
- [x] The same workflow also runs `npm run generate`'s prerequisites cleanly
      (i.e. runs from `npm ci`, not a possibly-drifted local install) so the
      check is actually trustworthy
- [x] Passes on a clean checkout right after ticket 01 lands
- [x] Ideally also runs `npm test` and `tsc --noEmit` in the same workflow,
      since neither currently runs anywhere in CI — implementer's call whether
      to fold that in here or leave it for a separate ticket if it grows the
      scope too much

## Comments

Added `.github/workflows/ci.yml`, triggered on `pull_request` into `main`:
`npm ci` → `tsc --noEmit` → `npm run generate` + `git diff --exit-code` on
`src/graphql/generated/types.ts` (fails with an `::error::` annotation on
drift) → installs `mongodb-org-server` (the test suite spawns its own
throwaway `mongod` per file, so the runner just needs the binary on `PATH`,
not a running service) → `npm test`. Folded in `tsc --noEmit` and `npm test`
per the last checklist item rather than splitting them out, since it added
only two more steps.

Runner is pinned to `ubuntu-24.04` rather than `ubuntu-latest`: MongoDB's apt
repo is keyed by Ubuntu codename (`jammy`/`noble`), so pinning avoids a
silent break if GitHub moves what `ubuntu-latest` points to.

Verified locally before opening the PR: `npm run generate` produces no diff
against the committed `types.ts` (confirms ticket 01 is still current),
`tsc --noEmit` is clean, and `npm test` passes 14/14. Also hand-verified the
drift guard actually fails closed: appended a line to `types.ts` and
confirmed `git diff --exit-code` exits 1, then reverted.

Passed `/mattpocock-skills:code-review` (Standards + Spec). Spec axis found
no gaps. Standards axis raised judgement calls, addressed in a follow-up
commit: added `permissions: contents: read` (workflow doesn't need
`GITHUB_TOKEN` write access), a `concurrency` group to cancel superseded
runs on repeated PR pushes, and raised the job `timeout-minutes` from 15 to
25 since the per-step timeouts summed to 22. Left unpinned action tags
(`@v4`, matches this repo's existing `deploy.yml` convention) and the
single-job structure (splitting `test`/`generate`/`mongo` into separate jobs
was flagged as a "Divergent Change" judgement call, but ticket 02 asks for
one workflow and the job is small enough that splitting would mostly add
job-to-job artifact-passing overhead) as accepted tradeoffs rather than
fixing them.

Committed on `ci/guard-generated-types-drift` (`7faf8a6`, `470b114`). Not
merged yet — needs a real PR run on GitHub's runners to confirm the MongoDB
apt install and the whole pipeline actually behave as intended there (only
verified the equivalent commands locally on macOS, not the exact CI
environment).
