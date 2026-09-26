import { randomUUID } from "node:crypto";
import { Request } from "express";
import { GraphQLError } from "graphql";
import Interaction from "../../../models/Interaction.js";
import { IUser } from "../../../models/User.js";
import {
  getReviewImageUploadTimeoutMs,
  uploadReviewImage,
  UploadTimeoutError,
} from "../../../utils/imagekit.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { GuestContext } from "../../../utils/guestAuth.js";
import { GuestArgs, resolveReviewActor } from "../../../utils/reviewActor.js";

/** Matches the cap the picker enforces client-side. */
const MAX_IMAGES_PER_REVIEW = 10;
/** Client already downscales to 1440px WebP; this is a sanity bound. */
const MAX_DECODED_BYTES = 3 * 1024 * 1024;
/**
 * What the lease outlasts the upload deadline by. The rate-limit wait and the
 * sharp resize run before the deadline, not after it, so the margin only has
 * to cover the one Mongo write that follows the ImageKit call: the commit, or
 * the hold on an abandoned upload. 15 s is ample for that even under load.
 * For scale, measured 2026-09-26 on an Apple M2: resizing near-limit inputs
 * (a 1.4 MB noisy 1440px WebP, a 2.9 MB PNG, a 16000px flat PNG) took 0.1–0.8 s.
 */
const LEASE_MARGIN_MS = 15_000;
/** The longest a timed-out upload keeps the lease while ImageKit may still store its file. */
const DEFAULT_ABANDONED_LEASE_MS = 10 * 60_000;

/** When an upload whose lease was taken at `now` stops waiting for ImageKit. */
function uploadDeadline(now: Date): Date {
  return new Date(now.getTime() + getReviewImageUploadTimeoutMs());
}

/**
 * When a lease taken at `now` runs out. deleteReview holds its fence to the
 * same horizon, so the fence always outlasts any upload lease taken before it.
 */
export function uploadLeaseUntil(now: Date): Date {
  return new Date(uploadDeadline(now).getTime() + LEASE_MARGIN_MS);
}

function getAbandonedLeaseMs(): number {
  return (
    Number(process.env.REVIEW_IMAGE_ABANDONED_LEASE_MS) ||
    DEFAULT_ABANDONED_LEASE_MS
  );
}

/**
 * A document that never had `reviewImages` written (pre-dates the schema
 * default, or was inserted by something that skipped it) has no field for
 * Mongo to compare against, even though the Mongoose default and the JS-side
 * `?? 0` both treat it as 0. These two helpers keep that "missing means 0"
 * equivalence in one place instead of restating it at every filter.
 */
function reviewImagesBelow(max: number) {
  return {
    $or: [{ reviewImages: { $lt: max } }, { reviewImages: { $exists: false } }],
  };
}

function reviewImagesEquals(value: number) {
  return value === 0
    ? { $or: [{ reviewImages: 0 }, { reviewImages: { $exists: false } }] }
    : { reviewImages: value };
}

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
 *
 * A timed-out upload cannot be cancelled, and ImageKit may still store its
 * image_<index> later. It keeps the lease until that request is really over, so
 * no later upload takes the same name and has its counted file overwritten by
 * the late one. The late file is never counted (the client was told it failed,
 * and a Retry would count it twice); the next upload simply overwrites it.
 *
 * deleteReview takes the same lease as a fence while it clears Photos, so an
 * upload arriving meanwhile gets UPLOAD_IN_PROGRESS like any other.
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
      $and: [
        reviewImagesBelow(MAX_IMAGES_PER_REVIEW),
        {
          $or: [
            { "photoUploadLease.until": { $exists: false } },
            { "photoUploadLease.until": { $lte: now } },
          ],
        },
      ],
    },
    {
      $set: {
        photoUploadLease: { token, until: uploadLeaseUntil(now) },
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

  // Our lease is still live when the upload times out, so whatever holds it
  // now is either us or deleteReview's fence, and the late file must be held
  // off either way. Someone else's lease is only ever extended, never cut short.
  const holdLeaseWhileAbandoned = () => {
    const holdUntil = new Date(Date.now() + getAbandonedLeaseMs());
    return Interaction.updateOne(
      {
        _id: reviewId,
        $or: [
          { "photoUploadLease.token": token },
          { "photoUploadLease.until": { $lte: holdUntil } },
        ],
      },
      { $set: { "photoUploadLease.until": holdUntil } },
    ).catch((error) => {
      // The lease then runs out on its original schedule, as before this hold existed.
      console.error("Error holding review image lease:", error);
    });
  };

  try {
    // The upload's clock starts with the lease's, not after the resize.
    await uploadReviewImage(
      buffer,
      leased.placeId.toString(),
      reviewId,
      index,
      uploadDeadline(now),
    );
  } catch (error) {
    if (error instanceof UploadTimeoutError) {
      await holdLeaseWhileAbandoned();
      void error.settled.then(releaseLease);
    } else {
      await releaseLease();
    }
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
      ...reviewImagesEquals(previous),
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
