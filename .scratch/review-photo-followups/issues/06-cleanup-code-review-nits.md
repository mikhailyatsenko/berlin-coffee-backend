# Cleanup: code-review nits on the upload fix

Status: done

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

- [x] `npx eslint tests/` passes with no `no-explicit-any` on these lines.
- [x] `tests/` is included in `tsc --noEmit`'s check, and `npm run build` still produces the same `dist/` output as before (no test files leak in).
- [x] User-facing and doc-comment wording says "Photo" where `CONTEXT.md` would.
- [x] The two new env vars are read the way the rest of the repo's config is, or the resolution says why not.

## Comments

- 2026-09-26: Done on `chore/cleanup-code-review-nits` (not merged yet).
  - Tests: `tsconfig.json` now includes `tests/**/*`. The build and `watch` scripts use a new `tsconfig.build.json` (only `src/`, `rootDir: src`), because otherwise `rootDir` would move to the repo root and `dist/` would get `src/` and `tests/` subtrees. `npm run build` gives the same file list as `main`; only `config/env.js`, the upload resolver and `utils/imagekit.js` differ, as expected. Test fakes are now cast through `unknown` to the narrow shape they replace, and the fake user through `Pick<IUser, "id">`. That covers both upload test files, not just the two lines named above, so `npx eslint tests/` passes as a whole; `eslint --fix` also rewrapped `neighborhoodShortlists.test.ts`.
  - Env: both variables are now read in `src/config/env.ts`, the module that already holds the ImageKit settings, not `utils/env.utils.ts`. They are exported constants with defaults and are not in the required-variables list: the defaults are what production runs with, and only tests override them. They are now read once at module load instead of on every call, which is fine because tests set them before their dynamic imports. The env var names keep `REVIEW_IMAGE_`, like the `reviewImages` field, so deployments need no change.
  - Wording: all user-facing messages in the upload resolver now say "photo" (lowercase, as in the frontend's own copy; the frontend maps on `extensions.code`, not on the message). The resolver's and `uploadReviewImage`'s doc comments say "Photo".
  - Left for later: the four `any`s in `src/utils/imagekit.ts` (avatar and URL code) predate this ticket. The fake-ImageKit types and the fake-user cast are still duplicated across the two test files and could move into `tests/support/`.
