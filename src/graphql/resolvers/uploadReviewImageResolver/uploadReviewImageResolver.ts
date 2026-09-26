import { randomUUID } from "node:crypto";
import { Request } from "express";
import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import { IUser } from "../../../models/User.js";
import {
  getReviewImageUploadTimeoutMs,
  uploadReviewImage,
} from "../../../utils/imagekit.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { GuestContext } from "../../../utils/guestAuth.js";
import { GuestArgs, resolveReviewActor } from "../../../utils/reviewActor.js";

/** Matches the cap the picker enforces client-side. */
const MAX_IMAGES_PER_REVIEW = 10;
/** Client already downscales to 1440px WebP; this is a sanity bound. */
const MAX_DECODED_BYTES = 3 * 1024 * 1024;
/** What the lease outlasts the upload timeout by: image processing plus the commit. */
const LEASE_MARGIN_MS = 15_000;

interface UploadReviewImageArgs extends GuestArgs {
  reviewId: string;
  fileBuffer: string;
}

/**
 * Uploads one review image through the server, the way avatars already work.
 *
 * The client cannot choose the folder or the file name: ImageKit's client-side
 * upload signature covers only token+expire, so a path can only be enforced by
 * never handing the credentials out in the first place.
 *
 * The stored counter is the source of truth for image URLs: the frontend renders
 * image_1.jpg .. image_<reviewImages>.jpg, so every one of those files must
 * exist. The counter therefore only moves after the file is stored. Names stay
 * contiguous because one upload at a time holds a short lease on the review;
 * a concurrent upload would otherwise pick the same name and overwrite the file.
 * A failed, stalled or crashed upload never touches the counter, and the lease
 * expires on its own, so the review just has fewer photos.
 */
export async function uploadReviewImageResolver(
  _: never,
  { reviewId, fileBuffer, guestId, guestSecret }: UploadReviewImageArgs,
  {
    user,
    guest,
    req,
  }: { user?: IUser | null; guest?: GuestContext; req?: Request },
) {
  const actor = await resolveReviewActor(user, guest, { guestId, guestSecret });

  if (!fileBuffer) {
    throw new GraphQLError("Invalid file data", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const buffer = Buffer.from(fileBuffer, "base64");

  if (buffer.length === 0 || buffer.length > MAX_DECODED_BYTES) {
    throw new GraphQLError("Image is too large", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (actor.isGuest) {
    consumeRateLimit("guestPhoto", clientIp(req));
  }

  // Take the lease only if the review belongs to this actor, still has room and
  // no other upload is in flight. One update, so two clients cannot both win.
  const now = new Date();
  const token = randomUUID();
  const leased = await Interaction.findOneAndUpdate(
    {
      _id: reviewId,
      ...actor.owner,
      reviewImages: { $lt: MAX_IMAGES_PER_REVIEW },
      $or: [
        { "photoUploadLease.until": { $exists: false } },
        { "photoUploadLease.until": { $lte: now } },
      ],
    },
    {
      $set: {
        photoUploadLease: {
          token,
          until: new Date(
            now.getTime() + getReviewImageUploadTimeoutMs() + LEASE_MARGIN_MS,
          ),
        },
      },
    },
    { new: true },
  );

  if (!leased) {
    const current = await Interaction.findOne({
      _id: reviewId,
      ...actor.owner,
    }).select("reviewImages");

    if (!current) {
      throw new GraphQLError(
        "Review not found or you don't have permission to edit it",
        { extensions: { code: "FORBIDDEN" } },
      );
    }
    if ((current.reviewImages ?? 0) >= MAX_IMAGES_PER_REVIEW) {
      throw new GraphQLError(
        "This review already has the maximum number of images",
        { extensions: { code: "IMAGE_LIMIT_REACHED" } },
      );
    }
    throw new GraphQLError("Another image of this review is still uploading", {
      extensions: { code: "UPLOAD_IN_PROGRESS" },
    });
  }

  const previous = leased.reviewImages ?? 0;
  const index = previous + 1;

  const releaseLease = () =>
    Interaction.updateOne(
      { _id: reviewId, "photoUploadLease.token": token },
      { $unset: { photoUploadLease: "" } },
    ).catch((error) => {
      // The lease expires by itself; this only saves the next upload the wait.
      console.error("Error releasing review image lease:", error);
    });

  try {
    await uploadReviewImage(buffer, leased.placeId.toString(), reviewId, index);
  } catch (error) {
    await releaseLease();
    console.error("Error uploading review image:", error);
    throw new GraphQLError("Failed to upload image", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  // The file exists now: count it, but only if nothing changed under us. A
  // lease that ran out and was taken over, or a review whose photos were
  // deleted meanwhile, leaves the counter alone.
  const committed = await Interaction.updateOne(
    {
      _id: reviewId,
      "photoUploadLease.token": token,
      reviewImages: previous,
    },
    { $set: { reviewImages: index }, $unset: { photoUploadLease: "" } },
  );

  if (committed.modifiedCount !== 1) {
    await releaseLease();
    console.error(
      `Review image ${index} of review ${reviewId} was uploaded but not counted`,
    );
    throw new GraphQLError("Failed to upload image", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  return { reviewImages: index };
}
