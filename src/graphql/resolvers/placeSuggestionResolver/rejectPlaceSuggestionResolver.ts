import PlaceSuggestion from "../../../models/PlaceSuggestion.js";
import { requireSuggestionForReview } from "../../../utils/placeSuggestionToken.js";
import { suggestionOutcome } from "./placeSuggestionOutcome.js";
import {
  deleteImageKitFolder,
  placeSuggestionPhotoFolder,
} from "../../../utils/imagekit.js";
import type { MutationResolvers } from "../../generated/types.js";

export const rejectPlaceSuggestionResolver: MutationResolvers["rejectPlaceSuggestion"] =
  async (_parent, { id, token }) => {
    const suggestion = await requireSuggestionForReview(id, token);

    // A repeat changes nothing and returns the outcome already decided.
    if (suggestion.status !== "pending") {
      return suggestionOutcome(suggestion);
    }

    // Best-effort: deleteImageKitFolder logs and swallows its own failures, so a
    // stuck ImageKit folder never blocks Reject.
    if (suggestion.photos.length > 0) {
      await deleteImageKitFolder(
        placeSuggestionPhotoFolder(suggestion._id.toString()),
      );
    }

    await PlaceSuggestion.updateOne(
      { _id: suggestion._id },
      {
        $set: { status: "rejected", decidedAt: new Date() },
        $unset: { guestEmail: "" },
      },
    );

    return suggestionOutcome({
      status: "rejected",
      publishedPlaceId: undefined,
    });
  };
