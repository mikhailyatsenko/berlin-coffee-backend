import { GraphQLError } from "graphql";
import PlaceSuggestion from "../../../models/PlaceSuggestion.js";
import { REVIEW_IMAGE_UPLOAD_TIMEOUT_MS } from "../../../config/env.js";
import { uploadPlaceSuggestionPhoto } from "../../../utils/imagekit.js";
import { requireSuggestionForReview } from "../../../utils/placeSuggestionToken.js";
import {
  MAX_DECODED_BYTES,
  MAX_PHOTOS_PER_SUGGESTION,
} from "./uploadPlaceSuggestionPhotoResolver.js";

interface UploadPlaceSuggestionPhotoAsAdminArgs {
  id: string;
  token: string;
  fileBuffer: string;
}

/**
 * Attaches one Photo to a Place suggestion as the admin, authorized only by
 * the review link's token (ADR 0002 in the frontend repo) rather than
 * ownership. Otherwise mirrors uploadPlaceSuggestionPhotoResolver: same
 * storage (compression, folder, unique file name), the same `pending` rule
 * and the same shared 10-photo cap enforced by the atomic $push below — but
 * no rate limit, and it returns the new photo's own path (not a count), since
 * the review page needs it to place the photo in its list.
 */
export async function uploadPlaceSuggestionPhotoAsAdminResolver(
  _: never,
  { id, token, fileBuffer }: UploadPlaceSuggestionPhotoAsAdminArgs,
) {
  const suggestion = await requireSuggestionForReview(id, token);

  // Same order as the sibling uploadPlaceSuggestionPhotoResolver: malformed
  // input is BAD_USER_INPUT regardless of the suggestion's own state. Fails
  // fast on the obvious cases before spending an ImageKit call; the atomic
  // update after the upload is what actually has to be race-safe.
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

  const deadline = new Date(Date.now() + REVIEW_IMAGE_UPLOAD_TIMEOUT_MS);
  let path: string;
  try {
    path = await uploadPlaceSuggestionPhoto(buffer, id, deadline);
  } catch (error) {
    console.error("Error uploading suggestion photo as admin:", error);
    throw new GraphQLError("Failed to upload photo", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  const updated = await PlaceSuggestion.findOneAndUpdate(
    {
      _id: id,
      status: "pending",
      $expr: { $lt: [{ $size: "$photos" }, MAX_PHOTOS_PER_SUGGESTION] },
    },
    { $push: { photos: path }, $inc: { photoCount: 1 } },
    { new: true },
  ).select("_id");

  if (!updated) {
    // The file is uploaded but orphaned; Publish or Reject will clean it up
    // along with the rest of the suggestion's folder.
    console.error(
      `Suggestion photo ${path} was uploaded but not counted (suggestion ${id} changed underneath it)`,
    );
    throw new GraphQLError("Failed to upload photo", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  return path;
}
