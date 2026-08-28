import { Request } from "express";
import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import { IUser } from "../../../models/User.js";
import { uploadReviewImage } from "../../../utils/imagekit.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { GuestContext } from "../../../utils/guestAuth.js";
import { GuestArgs, resolveReviewActor } from "../../../utils/reviewActor.js";

/** Matches the cap the picker enforces client-side. */
const MAX_IMAGES_PER_REVIEW = 10;
/** Client already downscales to 1440px WebP; this is a sanity bound. */
const MAX_DECODED_BYTES = 3 * 1024 * 1024;

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
 * The stored counter is the source of truth for image URLs, so the slot is
 * reserved with an atomic $inc before the upload and released if it fails —
 * that keeps names contiguous (image_1.jpg, image_2.jpg, ...) and makes a
 * half-finished upload a review with fewer photos rather than a broken one.
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

  // Reserve the next slot only if the review belongs to this actor and still
  // has room. Doing it in one update avoids two clients racing for a name.
  const reserved = await Interaction.findOneAndUpdate(
    {
      _id: reviewId,
      ...actor.owner,
      reviewImages: { $lt: MAX_IMAGES_PER_REVIEW },
    },
    { $inc: { reviewImages: 1 } },
    { new: true },
  );

  if (!reserved) {
    const exists = await Interaction.exists({ _id: reviewId, ...actor.owner });
    throw new GraphQLError(
      exists
        ? "This review already has the maximum number of images"
        : "Review not found or you don't have permission to edit it",
      { extensions: { code: exists ? "IMAGE_LIMIT_REACHED" : "FORBIDDEN" } },
    );
  }

  const index = reserved.reviewImages ?? 1;

  try {
    await uploadReviewImage(
      buffer,
      reserved.placeId.toString(),
      reviewId,
      index,
    );
  } catch (error) {
    await Interaction.updateOne(
      { _id: reviewId },
      { $inc: { reviewImages: -1 } },
    );
    console.error("Error uploading review image:", error);
    throw new GraphQLError("Failed to upload image", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  return { reviewImages: index };
}
