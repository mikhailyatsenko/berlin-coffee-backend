# 10: Replacing an avatar removes the old file and shows the new one

Status: done
Blocked by: 04 (Typed resolvers)
Source: `map.md` Notes, "Avatar"

## Problem

Uploading a new avatar never deletes the old file, and the new picture often doesn't show up, because it is served from the same URL the CDN has already cached. Account deletion (ticket 16) needs a working avatar delete.

## Current behaviour

- `uploadAvatarResolver` calls `deleteAvatar(user.avatar)` with the full URL (`uploadAvatarResolver.ts:34`), but `deleteAvatar` expects an ImageKit file path, finds nothing and reports success. `deleteAvatarResolver` strips `IMAGEKIT_URL_ENDPOINT` first and works.
- The file is always `3welle/avatars/<userId>/avatar-<userId>.jpeg`, so the URL never changes and the CDN keeps serving the old image.
- A User who signed up with Google may have a Google-hosted avatar URL, which is not an ImageKit file.
- `deleteAvatar` logs and returns `false` on failure.

## Expected behaviour

- One helper turns a stored avatar URL into an ImageKit path, or `null` when the URL isn't ours (Google avatar); both resolvers (and ticket 16) use it.
- Each upload gets a new file name (e.g. `avatar-<userId>-<timestamp>.jpeg`), so the URL changes and no CDN purge is needed.
- Order: upload the new file, save the new URL on the User, then delete the old ImageKit file. A failed delete of the old file is logged and doesn't fail the upload (the new avatar is already in place).
- `deleteAvatar` throws on a real failure (a missing file still counts as success), so callers that must know (ticket 16) can; `deleteAvatarResolver` keeps its current outcome for the User.

## Acceptance criteria

- [x] Test (ImageKit stubbed): uploading a second avatar deletes the first file by its path and stores a different URL.
- [x] Test: replacing a Google avatar URL doesn't call ImageKit delete.
- [x] Test: a failing delete of the old file still leaves the new avatar saved.
- [x] Test: `deleteAvatar` treats a missing file as success and throws on an ImageKit error.
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

**2026-09-29, implemented** (branch `feat/avatar-replacement`).

- `src/utils/imagekit.ts`: `avatarFilePath(url)` turns a stored avatar URL into its ImageKit path (leading slash, query stripped) or `null` for a URL outside `IMAGEKIT_URL_ENDPOINT`, such as a Google avatar. `avatarUrlFor(path)` is its inverse. `deleteAvatar(path)` now goes through `deleteImageKitFile` and returns `Promise<void>`: a missing file is success, any ImageKit error is thrown with `cause`. Ticket 16 can call `avatarFilePath` then `deleteAvatar` directly.
- `uploadAvatar` names files `avatar-<userId>-<Date.now()>.jpeg`, so each upload has a new URL. The resolver uploads, saves the new URL, then deletes the old file by its path; a failed delete is only logged. If the old path equals the new one (two uploads in the same millisecond), the delete is skipped, so the new file is never removed.
- `deleteAvatarResolver` uses the same helper, skips ImageKit for a Google avatar, and still clears the avatar and returns success when ImageKit fails.
- New `tests/avatarReplacement.test.ts` (fake ImageKit bucket, throwaway mongod): the four criteria, plus an avatar URL stored by the old code (`avatar-<id>.jpeg`) being deleted on upload, and the `deleteAvatar` mutation's three outcomes.
- Code review, spec axis: applied a test for the old-style stored URL, an assertion that the old file stays when its delete fails, and collapsing repeated leading slashes in `avatarFilePath`. Standards axis: split the two-failure test, restored the reason `fileId` carries a path, made the endpoint helper a documented function, renamed `avatarUrl` to `avatarUrlFor`. Not applied: merging the resolvers' "resolve path, delete, log" shape into one swallowing helper (ticket 16 needs the throwing one; two copies), renaming the helpers to generic ImageKit names (only avatars use them), and stubbing `Date.now` instead of `sleep(2)` in the test.
- `tsc --noEmit` is clean and `npm test` passes 200/200. No frontend change: the client takes `avatarUrl` from the response and never builds the path.
