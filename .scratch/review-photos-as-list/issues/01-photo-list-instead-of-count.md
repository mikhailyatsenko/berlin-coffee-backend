# Store a Review's Photos as a list instead of a count

Status: needs-triage

Backlog idea, not decided. Needs a grilling round before it can become a spec
or tickets.

## Problem

A Review's Photos are stored as a count, `reviewImages` on `Interaction`, and
the client derives the URLs from it: `image_1.jpg .. image_<reviewImages>.jpg`
in `3welle/review-images/<placeId>/<reviewId>/`. The file name is also the
slot number, and that causes every Photo bug fixed in
`.scratch/review-photo-followups/`:

- The files have to be contiguous. One gap breaks the image, so a one-off
  repair script was needed (ticket 05, `src/scripts/repairReviewPhotoCounts.ts`).
- An abandoned upload that lands late can overwrite a counted Photo. That is
  why `photoUploadLease`, `UPLOAD_IN_PROGRESS` and the up-to-10-minute
  abandoned-lease hold exist (tickets 02, 04, 07). This is the most complex
  code in the feature.
- A single Photo cannot be deleted without renaming the ones after it, so
  deleting Photos can only clear them all.

## Idea

Store a list on the Interaction instead, e.g.
`photos: [{ filePath, fileId, createdAt }]`:

- Upload each file under a unique name (`useUniqueFileName: true` or a uuid).
- `$push` the record only after the upload succeeds, with
  `"photos.9": { $exists: false }` in the filter to keep the limit of 10
  atomic.
- The client renders from `filePath` and stops guessing URLs.

Expected payoff:

- The lease is no longer needed: a late upload writes a new file, and if it
  was never recorded it is an invisible orphan, not a broken image.
- A single Photo can be deleted by `fileId`.
- No more drift between the count and the files.

## Open questions for the grilling

- Data migration: turn `N` into `image_1..image_N` records. Safe after the
  2026-09-26 repair, but check.
- Transition: serve both `reviewImages` and `photos` until the frontend
  switches (`../berlincoffeemap`, operation change → frontend work goes
  there), then drop `reviewImages` and the lease.
- Orphan files in ImageKit: a periodic sweep, or just leave them?
- Google reviews use the same folder scheme: do they migrate the same way?
- Is it worth it at all? Only if Photos will be touched again (e.g. deleting
  a single Photo). The current scheme works after the followups.

## To start

Run in a new session:

```
/mattpocock-skills:grilling Хочу заменить счётчик Photo (`reviewImages: number` на Interaction, клиент рендерит image_1..image_N) на массив записей `photos: [{ filePath, fileId, createdAt }]` с уникальными именами файлов в ImageKit и `$push` после успешного upload — чтобы убрать photoUploadLease, требование непрерывности файлов и дать удаление отдельной Photo. Сначала прочитай .scratch/review-photos-as-list/issues/01-photo-list-instead-of-count.md, CONTEXT.md, .scratch/review-photo-followups/map.md и тикеты 02, 04, 05, 07 там же, src/graphql/resolvers/uploadReviewImageResolver/, src/graphql/resolvers/deleteReviewResolver/, src/utils/imagekit.ts, а на фронте ../berlincoffeemap/src/shared/ui/ReviewCard/utils/getReviewImages.ts и ../berlincoffeemap/src/shared/lib/photoUpload/usePhotoUpload.ts. Прогони открытые вопросы из тикета.
```
