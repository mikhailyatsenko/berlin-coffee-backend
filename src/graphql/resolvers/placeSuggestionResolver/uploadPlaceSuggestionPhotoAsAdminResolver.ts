import { appError, badInput, forbidden } from "../../errors.js";
import PlaceSuggestion from "../../../models/PlaceSuggestion.js";
import { REVIEW_IMAGE_UPLOAD_TIMEOUT_MS } from "../../../config/env.js";
import { uploadPlaceSuggestionPhoto } from "../../../utils/imagekit.js";
import { requireSuggestionForReview } from "../../../utils/placeSuggestionToken.js";
import {
  MAX_DECODED_BYTES,
  MAX_PHOTOS_PER_SUGGESTION,
} from "./uploadPlaceSuggestionPhotoResolver.js";
import type { MutationResolvers } from "../../generated/types.js";

/**
 * Attaches one Photo to a Place suggestion as the admin, authorized only by
 * the review link's token (ADR 0002 in the frontend repo) rather than
 * ownership. Otherwise mirrors uploadPlaceSuggestionPhotoResolver: same
 * storage (compression, folder, unique file name), the same `pending` rule
 * and the same shared 10-photo cap enforced by the atomic $push below — but
 * no rate limit, and it returns the new photo's own path (not a count), since
 * the review page needs it to place the photo in its list.
 */
export const uploadPlaceSuggestionPhotoAsAdminResolver: MutationResolvers["uploadPlaceSuggestionPhotoAsAdmin"] =
  async (_parent, { id, token, fileBuffer }) => {
    const suggestion = await requireSuggestionForReview(id, token);

    // Same order as the sibling uploadPlaceSuggestionPhotoResolver: malformed
    // input is BAD_USER_INPUT regardless of the suggestion's own state. Fails
    // fast on the obvious cases before spending an ImageKit call; the atomic
    // update after the upload is what actually has to be race-safe.
    if (!fileBuffer) {
      throw badInput("Invalid file data");
    }

    const buffer = Buffer.from(fileBuffer, "base64");
    if (buffer.length === 0 || buffer.length > MAX_DECODED_BYTES) {
      throw badInput("Photo is too large");
    }

    if (suggestion.status !== "pending") {
      throw forbidden("This suggestion has already been decided");
    }
    if (suggestion.photos.length >= MAX_PHOTOS_PER_SUGGESTION) {
      throw appError(
        "IMAGE_LIMIT_REACHED",
        "This suggestion already has the maximum number of photos",
      );
    }

    const deadline = new Date(Date.now() + REVIEW_IMAGE_UPLOAD_TIMEOUT_MS);
    const path = await uploadPlaceSuggestionPhoto(buffer, id, deadline);

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
      throw new Error(
        `Suggestion photo ${path} was uploaded but not counted (suggestion ${id} changed underneath it)`,
      );
    }

    return path;
  };
