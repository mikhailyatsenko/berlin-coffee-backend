import { IPlaceSuggestion } from "../../../models/PlaceSuggestion.js";

/**
 * What Publish and Reject return: the decision just made, or, on a repeat
 * call, the one already made. Never more than status and the Place id.
 */
export function suggestionOutcome(
  suggestion: Pick<IPlaceSuggestion, "status" | "publishedPlaceId">,
) {
  return {
    status: suggestion.status,
    publishedPlaceId: suggestion.publishedPlaceId?.toString() ?? null,
  };
}
