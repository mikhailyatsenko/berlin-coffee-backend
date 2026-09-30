import { randomUUID } from "node:crypto";
import Interaction from "../../../models/Interaction.js";
import {
  deleteImageKitFolder,
  reviewPhotoFolder,
} from "../../../utils/imagekit.js";
import { getPlaceStats } from "../../../utils/placeStats.js";
import { resolveReviewActor } from "../../../utils/reviewActor.js";
import { uploadLeaseUntil } from "../uploadReviewImageResolver/uploadReviewImageResolver.js";
import { notFound } from "../../errors.js";
import type {
  DeleteReviewResult,
  MutationResolvers,
} from "../../generated/types.js";

/**
 * Clears the review's Photos (and the given text/rating fields) while holding
 * the upload lease as a fence: an upload arriving meanwhile gets
 * UPLOAD_IN_PROGRESS instead of landing a file in a folder that is about to be
 * wiped, or committing a counter this delete has already reset.
 *
 * The fence is taken unconditionally, so an upload that leased earlier fails
 * its commit on the token as well as the counter. It never shortens anyone
 * else's lease: `until` only goes up, and on release a lease that was live
 * before the fence is handed back, so its holder can still release it or hold
 * it while a timed-out file may land (see uploadReviewImageResolver).
 *
 * The counter and the fields are cleared only once the folder is gone, so a
 * failed folder delete throws and leaves the text and the Photos as they were.
 * Holding the fence is what makes the late clear safe: no upload can commit
 * while it is up. A folder delete slower than the fence lets a new upload take
 * the lease and commit a Photo the clear would then wipe from the counter, so
 * the clear only runs while the fence token is still in place, and otherwise
 * the delete fails. Deleting again finishes the job, as it does after a crash
 * between the two: a missing folder counts as deleted.
 */
async function clearPhotosBehindFence(
  reviewId: string,
  unset: Record<string, "">,
  deleteFolder: () => Promise<void>,
) {
  const token = randomUUID();
  const until = uploadLeaseUntil(new Date());
  const before = await Interaction.findOneAndUpdate(
    { _id: reviewId },
    {
      $set: { "photoUploadLease.token": token },
      $max: { "photoUploadLease.until": until },
    },
  ).lean();
  const previous = before?.photoUploadLease;

  try {
    // Await so the client learns the review is deleted only once the folder
    // is actually gone: otherwise an upload that starts right after this
    // resolver returns could take the lease, land a file, and have it wiped
    // out from under the just-saved photo by this still-in-flight call.
    await deleteFolder();
    const cleared = await Interaction.updateOne(
      { _id: reviewId, "photoUploadLease.token": token },
      { $set: { reviewImages: 0 }, $unset: unset },
    );
    if (cleared.matchedCount === 0) {
      throw new Error(
        `The upload fence on review ${reviewId} expired before its Photo folder was deleted`,
      );
    }
  } finally {
    const previousIsLive =
      !!previous?.token && !!previous.until && previous.until > new Date();

    // Nobody raised `until` past the fence: hand back what was there before.
    const released = await Interaction.updateOne(
      {
        _id: reviewId,
        "photoUploadLease.token": token,
        "photoUploadLease.until": until,
      },
      previousIsLive
        ? { $set: { photoUploadLease: previous } }
        : { $unset: { photoUploadLease: "" } },
    );

    // A longer hold owns `until` now; give the earlier holder its token back so
    // it can still release early, and leave `until` to run out on its own.
    if (released.modifiedCount === 0 && previousIsLive) {
      await Interaction.updateOne(
        { _id: reviewId, "photoUploadLease.token": token },
        { $set: { "photoUploadLease.token": previous.token } },
      );
    }
  }
}

export const deleteReviewResolver: MutationResolvers["deleteReview"] = async (
  _parent,
  { reviewId, deleteOptions },
  { user, guest },
): Promise<DeleteReviewResult> => {
  // Headers only: deleteReview never took the argument form of the Guest
  // identity, so there is no older client to keep working.
  const actor = await resolveReviewActor(user, guest, {});

  // Someone else's Review reads as a missing one, so ids don't leak.
  const interaction = await Interaction.findOne({
    _id: reviewId,
    ...actor.owner,
  });
  if (!interaction) {
    throw notFound("Review not found");
  }

  const unset: Record<string, ""> = {};
  const clearsText =
    deleteOptions === "deleteReviewText" || deleteOptions === "deleteAll";
  const clearsImages =
    clearsText && !!interaction.reviewImages && interaction.reviewImages > 0;

  if (clearsText) unset.reviewText = "";
  if (deleteOptions === "deleteRating" || deleteOptions === "deleteAll") {
    unset.rating = "";
  }

  // A single atomic update, not load-mutate-save: it can't race a concurrent
  // write (another delete, or the upload resolver's own atomic commit) and
  // lose it.
  if (!clearsImages) {
    await Interaction.updateOne({ _id: reviewId }, { $unset: unset });
  } else {
    await clearPhotosBehindFence(reviewId, unset, () =>
      deleteImageKitFolder(
        reviewPhotoFolder(interaction.placeId.toString(), reviewId),
      ),
    );
  }

  const { averageRating, ratingCount } = await getPlaceStats(
    interaction.placeId,
  );

  return { reviewId, averageRating, ratingCount };
};
