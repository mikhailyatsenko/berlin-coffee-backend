import { Request } from "express";
import { GraphQLError } from "graphql";
import PlaceSuggestion from "../../../models/PlaceSuggestion.js";
import { IUser } from "../../../models/User.js";
import { REVIEW_IMAGE_UPLOAD_TIMEOUT_MS } from "../../../config/env.js";
import { uploadPlaceSuggestionPhoto } from "../../../utils/imagekit.js";
import { clientIp, consumeRateLimit } from "../../../utils/rateLimit.js";
import { GuestContext } from "../../../utils/guestAuth.js";
import { GuestArgs, resolveReviewActor } from "../../../utils/reviewActor.js";

/** Matches the frontend's picker cap. */
const MAX_PHOTOS_PER_SUGGESTION = 10;
/** Client already downscales before sending; this is a sanity bound. */
const MAX_DECODED_BYTES = 3 * 1024 * 1024;

interface UploadPlaceSuggestionPhotoArgs extends GuestArgs {
  suggestionId: string;
  fileBuffer: string;
}

/**
 * Attaches one Photo to a Place suggestion.
 *
 * Unlike uploadReviewImage, there is no lease: photos are appended to the
 * `photos` array only after the file is confirmed stored in ImageKit, under a
 * file name unique to this upload, so two uploads can never overwrite one
 * another's file. The atomic $push below (guarded on ownership, `pending` and
 * the 10-photo cap) is what stays race-safe, not a reservation taken first.
 *
 * A photo that lands after this call already reported a failure (a timeout,
 * or a lost race against the cap) is never added to `photos`: it sits as an
 * orphan in the suggestion's ImageKit folder until Publish or Reject deletes it.
 */
export async function uploadPlaceSuggestionPhotoResolver(
  _: never,
  { suggestionId, fileBuffer, guestId, guestSecret }: UploadPlaceSuggestionPhotoArgs,
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
    throw new GraphQLError("Photo is too large", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  // Fails fast on the obvious cases before spending an ImageKit call; the
  // atomic update after the upload is what actually has to be race-safe.
  const suggestion = await PlaceSuggestion.findOne({
    _id: suggestionId,
    ...actor.owner,
  }).select("status photos");

  if (!suggestion) {
    throw new GraphQLError(
      "Suggestion not found or you don't have permission to edit it",
      { extensions: { code: "FORBIDDEN" } },
    );
  }
  if (suggestion.status !== "pending") {
    throw new GraphQLError("This suggestion has already been decided", {
      extensions: { code: "SUGGESTION_NOT_PENDING" },
    });
  }
  if (suggestion.photos.length >= MAX_PHOTOS_PER_SUGGESTION) {
    throw new GraphQLError(
      "This suggestion already has the maximum number of photos",
      { extensions: { code: "IMAGE_LIMIT_REACHED" } },
    );
  }

  if (actor.isGuest) {
    consumeRateLimit("guestPhoto", clientIp(req));
  }

  const deadline = new Date(Date.now() + REVIEW_IMAGE_UPLOAD_TIMEOUT_MS);
  let path: string;
  try {
    path = await uploadPlaceSuggestionPhoto(buffer, suggestionId, deadline);
  } catch (error) {
    console.error("Error uploading suggestion photo:", error);
    throw new GraphQLError("Failed to upload photo", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  const updated = await PlaceSuggestion.findOneAndUpdate(
    {
      _id: suggestionId,
      ...actor.owner,
      status: "pending",
      $expr: { $lt: [{ $size: "$photos" }, MAX_PHOTOS_PER_SUGGESTION] },
    },
    { $push: { photos: path }, $inc: { photoCount: 1 } },
    { new: true },
  ).select("photos");

  if (!updated) {
    // The file is uploaded but orphaned; Publish or Reject will clean it up
    // along with the rest of the suggestion's folder.
    console.error(
      `Suggestion photo ${path} was uploaded but not counted (suggestion ${suggestionId} changed underneath it)`,
    );
    throw new GraphQLError("Failed to upload photo", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  return { photoCount: updated.photos.length };
}
