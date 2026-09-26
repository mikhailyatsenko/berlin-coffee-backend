# Review Photo followups: close the gaps found while fixing the upload hang

Label: wayfinder:map

## Destination

Every finding from diagnosing and reviewing the review-photo upload hang (`fix/review-photo-upload-hang`, merged to `main` at `9ce727a`/`0a085dd`) is triaged: either already fixed (recorded below, no ticket needed), or turned into its own ticket carrying enough detail — Problem / Current / Expected / Acceptance criteria — to hand straight to `/mattpocock-skills:implement`. Nothing from the review is left implicit.

## Notes

- Domain: `CONTEXT.md` — Photo is `reviewImages`, a count on the `Interaction` model; the client renders `image_1..image_<reviewImages>` from it, so it only grows after the file is stored.
- Backend: this repo. Frontend: `../berlincoffeemap` (`mikhailyatsenko/coffeemapberlin`); its own tracker is `../berlincoffeemap/.scratch/`. A schema change here that alters an operation the client uses belongs there, not here (`CLAUDE.md`).
- **Ticket format override for this effort**: the destination is a set of implement-ready tickets, not a multi-session decision trail, so tickets here skip the `Type:`/`Status: claimed|resolved` wayfinder lifecycle. Each is written directly in this repo's plain bug-ticket shape (`# Title`, `Status: <triage role>`, `## Problem` / `## Current behaviour` / `## Expected behaviour` / `## Acceptance criteria`), the way `../berlincoffeemap/.scratch/contribution-bugs/` does it. `Status` uses the triage roles from `docs/agents/triage-labels.md`.
- Every ticket here was already diagnosed during the original bug-fix session (code read, root cause traced); none need a live grilling round to get sharp. Take a ticket straight to `/mattpocock-skills:implement`.
- Two findings were fixed by a separate, concurrent session before this map was charted — not through this map, so they get no ticket, only the note below:
  - Backend `9ce727a`→`0a085dd`: a timed-out ImageKit upload could still land later and overwrite a counted photo. Fixed: the lease now holds until the abandoned request really settles (capped at `REVIEW_IMAGE_ABANDONED_LEASE_MS`, default 10 min); a concurrent upload gets `UPLOAD_IN_PROGRESS`; the late file is never counted.
  - Frontend `cfd0057`: `UPLOAD_IN_PROGRESS` now maps to its own `in_progress` reason ("Another photo is still uploading, try again in a minute") instead of falling back to the generic network message. Recorded in `../berlincoffeemap/.scratch/photo-without-review-text/spec.md`.

## Decisions so far

- [Documents whose `reviewImages` field is entirely missing never get to upload again](issues/01-missing-reviewimages-field.md): the lease-acquire and commit filters don't match a document lacking the field at all (pre-migration data); treat it as 0 everywhere the resolver reads it.
- [`deleteReview` races an in-flight upload's lease](issues/02-deletereview-lease-race.md): clearing photos with a load-modify-`save()` and a fire-and-forget folder delete can leave the counter pointing at a file ImageKit hasn't deleted yet, or vice versa; make the counter reset atomic and await the folder delete.
- [Remove the deprecated client-supplied `reviewImages` on `addTextReview`](issues/03-remove-legacy-addtextreview-arg.md): the old frontend build that needed it is confirmed gone; the argument re-opens the exact defect class this whole fix closed.
- [The upload lease's margin is measured before the slow part of the request starts](issues/04-lease-margin-before-timeout.md): `sharp` resizing and the ImageKit rate-limit delay run before `withTimeout`'s clock starts, eating into the 15s margin; start the clock (or grow the margin) to actually bound the worst case.
- [Repair review data already corrupted by the pre-fix bug](issues/05-repair-broken-review-photo-counts.md): a one-off dry-run/`--apply` script, in the style of `syncGooglePlaces`, to find and fix reviews whose `reviewImages` outruns the files ImageKit actually has — including the known case, Review `6ab785f66ab114864549eb0a` on Place `68861721af72dc0dcf7c0102`.
- [Cleanup: code-review nits on the upload fix](issues/06-cleanup-code-review-nits.md): `no-explicit-any` in the new test file, tests excluded from `tsconfig.json`, glossary wording drift ("image" vs "Photo"), and the new env vars read past `src/config/env.ts`'s usual convention.

## Not yet specified

(none — every finding from the review was already sharp enough to ticket or was already fixed)

## Out of scope

- `uploadAvatar` has the same missing-timeout defect as `uploadReviewImage` had. Real, but a different feature; revisit as its own effort if it causes a symptom.
- A separate dev/prod MongoDB or ImageKit split. Surfaced while researching how to run the repair script (`docs/google-places-sync.md:19-23`; this repo has exactly one `MONGO_URI` and one `IMAGEKIT_URL_ENDPOINT`, no dev/prod distinction anywhere). Infra work, not a review-photo fix.
- Replacing the `reviewImages` count with a list of Photo records, which would remove the lease and the contiguous-files requirement. Backlogged as [its own idea](../review-photos-as-list/issues/01-photo-list-instead-of-count.md), awaiting a grilling round.
