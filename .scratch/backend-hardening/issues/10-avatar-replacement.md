# 10: Replacing an avatar removes the old file and shows the new one

Status: ready-for-agent
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

- [ ] Test (ImageKit stubbed): uploading a second avatar deletes the first file by its path and stores a different URL.
- [ ] Test: replacing a Google avatar URL doesn't call ImageKit delete.
- [ ] Test: a failing delete of the old file still leaves the new avatar saved.
- [ ] Test: `deleteAvatar` treats a missing file as success and throws on an ImageKit error.
- [ ] `tsc --noEmit` and `npm test` pass.
