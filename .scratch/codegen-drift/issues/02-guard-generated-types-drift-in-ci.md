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

- [ ] A CI workflow runs on pull requests (new workflow, e.g.
      `.github/workflows/ci.yml`, or extend the existing deploy workflow with
      a PR trigger — implementer's call)
- [ ] That workflow runs `npm run generate` and fails the build if it produces
      a diff against the committed `src/graphql/generated/types.ts`
      (`git diff --exit-code` after regenerating, or equivalent)
- [ ] The same workflow also runs `npm run generate`'s prerequisites cleanly
      (i.e. runs from `npm ci`, not a possibly-drifted local install) so the
      check is actually trustworthy
- [ ] Passes on a clean checkout right after ticket 01 lands
- [ ] Ideally also runs `npm test` and `tsc --noEmit` in the same workflow,
      since neither currently runs anywhere in CI — implementer's call whether
      to fold that in here or leave it for a separate ticket if it grows the
      scope too much
