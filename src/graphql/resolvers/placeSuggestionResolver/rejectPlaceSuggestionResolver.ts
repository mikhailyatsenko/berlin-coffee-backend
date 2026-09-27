import PlaceSuggestion from "../../../models/PlaceSuggestion.js";
import { requireSuggestionForReview } from "../../../utils/placeSuggestionToken.js";
import { suggestionOutcome } from "./placeSuggestionOutcome.js";

export async function rejectPlaceSuggestionResolver(
  _: never,
  { id, token }: { id: string; token: string },
) {
  const suggestion = await requireSuggestionForReview(id, token);

  // A repeat changes nothing and returns the outcome already decided.
  if (suggestion.status !== "pending") {
    return suggestionOutcome(suggestion);
  }

  await PlaceSuggestion.updateOne(
    { _id: suggestion._id },
    {
      $set: { status: "rejected", decidedAt: new Date() },
      $unset: { guestEmail: "" },
    },
  );

  return suggestionOutcome({ status: "rejected", publishedPlaceId: undefined });
}
