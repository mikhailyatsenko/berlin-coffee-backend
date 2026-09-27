import { GraphQLError } from "graphql";
import PlaceSuggestion from "../../../models/PlaceSuggestion.js";
import { requireSuggestionForReview } from "../../../utils/placeSuggestionToken.js";
import {
  deleteImageKitFile,
  placeSuggestionPhotoFolder,
} from "../../../utils/imagekit.js";

interface DeletePlaceSuggestionPhotoArgs {
  id: string;
  token: string;
  path: string;
}

/**
 * Deletes one photo of a Place suggestion, the suggester's or the admin's,
 * authorized only by the review link's token (ADR 0002 in the frontend repo).
 *
 * The path is validated structurally, against this suggestion's own ImageKit
 * folder, rather than against the current `photos` array: that is what lets a
 * retried delete of a path the first call already removed still succeed,
 * while a path from another suggestion's folder is still refused.
 */
export async function deletePlaceSuggestionPhotoResolver(
  _: never,
  { id, token, path }: DeletePlaceSuggestionPhotoArgs,
) {
  const suggestion = await requireSuggestionForReview(id, token);

  if (suggestion.status !== "pending") {
    throw new GraphQLError("This suggestion has already been decided", {
      extensions: { code: "SUGGESTION_NOT_PENDING" },
    });
  }

  const folderPrefix = `/${placeSuggestionPhotoFolder(id)}/`;
  if (!path.startsWith(folderPrefix)) {
    throw new GraphQLError("This photo does not belong to this suggestion", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  try {
    await deleteImageKitFile(path);
  } catch (error) {
    console.error("Error deleting suggestion photo from ImageKit:", error);
    throw new GraphQLError("Failed to delete photo", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  // Guarded on `photos` containing the path (not on `status` again): the file
  // is already gone from ImageKit by this point, so the array has to drop the
  // path regardless of a status change that raced this call, or `photos`
  // would keep pointing at a file that no longer exists. A retry that finds
  // the path already pulled is a no-op rather than a second decrement of
  // photoCount.
  await PlaceSuggestion.updateOne(
    { _id: id, photos: path },
    { $pull: { photos: path }, $inc: { photoCount: -1 } },
  );

  return true;
}
