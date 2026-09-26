# Cleanup: code-review nits on the upload fix

Status: ready-for-agent

## Problem

Small quality findings from reviewing `9ce727a`/`0a085dd`, independent of each other and of the other tickets on this map — bundled into one ticket so they don't get scattered into unrelated bug fixes.

## Current behaviour

- `tests/uploadReviewImage.test.ts:56,149`: `(ImageKit.prototype as any).upload` and `{ user: {...} as any }` trip `@typescript-eslint/no-explicit-any`; `npx eslint tests/` fails on them.
- `tsconfig.json`'s `include` is `["src/**/*", "importPlaces.js"]` — `tests/` is never type-checked by `tsc`, only transpiled (`npm test` runs with `TS_NODE_TRANSPILE_ONLY=true`).
- `CONTEXT.md`'s glossary says Photo, not "image" or "review image", in prose. The resolver's doc comment and the user-facing `GraphQLError` message ("Another image of this review is still uploading") and `src/utils/imagekit.ts`'s `getReviewImageUploadTimeoutMs` comment ("How long a review image upload may take") drift from it. The new `photoUploadLease` field name is the one that already matches the glossary.
- `src/utils/imagekit.ts` reads `process.env.REVIEW_IMAGE_UPLOAD_TIMEOUT_MS` / `REVIEW_IMAGE_ABANDONED_LEASE_MS` directly, bypassing the centralised `src/config/env.ts` / `src/utils/env.utils.ts` pattern the rest of the config uses.

## Expected behaviour

- Replace the two `any` casts in the test file with a narrower type (e.g. cast through `unknown`, or type the fake upload function against `ImageKit["upload"]`'s signature; type the fake `user` context against a minimal `Pick<IUser, "id">`).
- Add `tests/**/*` to `tsconfig.json`'s `include` (confirm `npm test` and `npm run build` still both work afterward — `build` excludes tests via `rimraf dist` + its own `tsc` run, so check it doesn't start emitting test output into `dist/`).
- Reword the resolver's doc comment, the `UPLOAD_IN_PROGRESS` message, and the `imagekit.ts` timeout comment to say "Photo", matching `CONTEXT.md`.
- Route `REVIEW_IMAGE_UPLOAD_TIMEOUT_MS` and `REVIEW_IMAGE_ABANDONED_LEASE_MS` through the same convention as the rest of `src/config/env.ts` (or note in the ticket's resolution why an exception is warranted, e.g. they're optional-with-default unlike everything else there).

## Acceptance criteria

- [ ] `npx eslint tests/` passes with no `no-explicit-any` on these lines.
- [ ] `tests/` is included in `tsc --noEmit`'s check, and `npm run build` still produces the same `dist/` output as before (no test files leak in).
- [ ] User-facing and doc-comment wording says "Photo" where `CONTEXT.md` would.
- [ ] The two new env vars are read the way the rest of the repo's config is, or the resolution says why not.
