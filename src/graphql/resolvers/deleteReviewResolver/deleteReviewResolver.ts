import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Interaction from "../../../models/Interaction.js";
import { GraphQLError } from "graphql";
import { deleteAllReviewImages } from "../../../utils/imagekit.js";
import { uploadLeaseUntil } from "../uploadReviewImageResolver/uploadReviewImageResolver.js";

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

export async function deleteReviewResolver(
  _: never,
  {
    reviewId,
    deleteOptions,
  }: {
    reviewId: string;
    deleteOptions: "deleteReviewText" | "deleteRating" | "deleteAll";
  },
  context: { user: { id: string } },
) {
  if (!context.user) {
    return {
      success: false,
      message: "You must be logged in to delete a review",
    };
  }

  try {
    const interaction = await Interaction.findById(reviewId);

    // Guest reviews have no userId, so this also keeps them out of reach until
    // they are claimed by an account.
    if (!interaction || interaction.userId?.toString() !== context.user.id) {
      return {
        success: false,
        message: "Review not found or you don't have permission to delete it",
      };
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
        deleteAllReviewImages(
          `3welle/review-images/${interaction.placeId}/${reviewId}`,
        ),
      );
    }

    const aggregationResult = await Interaction.aggregate([
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
      averageRating: stats.averageRating.toFixed(1),
      ratingCount: stats.ratingCount,
    };
  } catch (error) {
    console.error("Error deleting review:", error);
    throw new GraphQLError("Error processing review deletion or rating update");
  }
}
