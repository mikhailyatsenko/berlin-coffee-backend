import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Interaction from "../../../models/Interaction.js";
import { GraphQLError } from "graphql";
import { deleteAllReviewImages } from "../../../utils/imagekit.js";
import { uploadLeaseUntil } from "../uploadReviewImageResolver/uploadReviewImageResolver.js";

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

    // While Photos are being cleared, delete holds the upload lease as a fence:
    // an upload arriving meanwhile gets UPLOAD_IN_PROGRESS instead of landing a
    // file in a folder that is about to be wiped, or committing a counter this
    // delete has already reset. It is taken unconditionally, so an upload that
    // leased earlier fails its commit on the token as well as the counter.
    // `until` only ever goes up: a timed-out upload's abandoned hold must not
    // be shortened, or a later upload could reuse its file name.
    const fenceToken = randomUUID();
    const fenceUntil = uploadLeaseUntil(new Date());
    const update: Record<string, Record<string, unknown>> = { $unset: unset };
    if (clearsImages) {
      update.$set = { reviewImages: 0, "photoUploadLease.token": fenceToken };
      update.$max = { "photoUploadLease.until": fenceUntil };
    }

    // A single atomic update, not load-mutate-save: it can't race a concurrent
    // write (another delete, or the upload resolver's own atomic commit) and
    // lose it.
    await Interaction.updateOne({ _id: reviewId }, update);

    // Await so the client learns the review is deleted only once the folder is
    // actually gone: otherwise an upload that starts right after this resolver
    // returns could take the lease, land a file, and have it wiped out from
    // under the just-saved photo by this still-in-flight call. If delete
    // crashes before the release, the fence expires by itself; the counter is
    // already 0 and any leftover file is overwritten by the next upload.
    if (clearsImages) {
      try {
        await deleteAllReviewImages(
          `3welle/review-images/${interaction.placeId}/${reviewId}`,
        );
      } finally {
        // Only our own fence: if a longer abandoned hold kept `until`, the
        // lease runs out on that schedule instead.
        await Interaction.updateOne(
          {
            _id: reviewId,
            "photoUploadLease.token": fenceToken,
            "photoUploadLease.until": fenceUntil,
          },
          { $unset: { photoUploadLease: "" } },
        );
      }
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
