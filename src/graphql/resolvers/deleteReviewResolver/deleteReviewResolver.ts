import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Interaction from "../../../models/Interaction.js";
import {
  reviewPhotoFolder,
  tryDeleteImageKitFolder,
} from "../../../utils/imagekit.js";
import { uploadLeaseUntil } from "../uploadReviewImageResolver/uploadReviewImageResolver.js";
import { requireUser } from "../../context.js";
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
 * If delete crashes before the release, the fence expires by itself; the
 * counter is already 0 and any leftover file is overwritten by the next upload.
 */
async function clearPhotosBehindFence(
  reviewId: string,
  unset: Record<string, "">,
  deleteFolder: () => Promise<unknown>,
) {
  const token = randomUUID();
  const until = uploadLeaseUntil(new Date());
  const before = await Interaction.findOneAndUpdate(
    { _id: reviewId },
    {
      $set: { reviewImages: 0, "photoUploadLease.token": token },
      $max: { "photoUploadLease.until": until },
      $unset: unset,
    },
  ).lean();
  const previous = before?.photoUploadLease;

  try {
    // Await so the client learns the review is deleted only once the folder
    // is actually gone: otherwise an upload that starts right after this
    // resolver returns could take the lease, land a file, and have it wiped
    // out from under the just-saved photo by this still-in-flight call.
    await deleteFolder();
  } finally {
    const previousIsLive =
      !!previous?.token && !!previous.until && previous.until > new Date();

    // Nobody raised `until` past the fence: hand back what was there before.
    const released = await Interaction.updateOne(
      { _id: reviewId, "photoUploadLease.token": token, "photoUploadLease.until": until },
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
  context,
): Promise<DeleteReviewResult> => {
  const user = requireUser(context);

  const interaction = await Interaction.findById(reviewId);

  // Someone else's Review reads as a missing one, so ids don't leak. Guest
  // reviews have no userId, so this also keeps them out of reach until they
  // are claimed by an account.
  if (!interaction || interaction.userId?.toString() !== user.id) {
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
      tryDeleteImageKitFolder(
        reviewPhotoFolder(interaction.placeId.toString(), reviewId),
      ),
    );
  }

  const aggregationResult = await Interaction.aggregate<{
    averageRating: number;
    ratingCount: number;
  }>([
    {
      $match: {
        placeId: new mongoose.Types.ObjectId(interaction.placeId),
        rating: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  const stats = aggregationResult[0] || { averageRating: 0, ratingCount: 0 };

  return {
    reviewId: reviewId,
    // @ts-expect-error Ticket 21: `averageRating` is a Float; the string only works because the serializer coerces it.
    averageRating: stats.averageRating.toFixed(1),
    ratingCount: stats.ratingCount,
  };
};
