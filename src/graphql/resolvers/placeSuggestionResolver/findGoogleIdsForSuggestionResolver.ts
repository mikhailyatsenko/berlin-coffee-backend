import Place from "../../../models/Place.js";
import type { QueryResolvers } from "../../generated/types.js";
import { requireSuggestionForReview } from "../../../utils/placeSuggestionToken.js";
import { config } from "../../../config/config.js";

/**
 * `places.id` only: the free, uncapped "Text Search Essentials IDs Only" SKU
 * (docs/google-places-sync.md). Requesting any other field would move this
 * call onto a billed SKU, so nothing else is ever added to this mask.
 */
const FIELD_MASK = "places.id";
const MAX_RESULTS = 3;

interface GoogleTextSearchResponse {
  places?: { id: string }[];
}

/**
 * A failed lookup is unexpected: formatError logs it and masks it for the
 * client.
 */
async function searchGooglePlaceIds(query: string): Promise<string[]> {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": config.googlePlacesApiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, pageSize: MAX_RESULTS }),
  });

  if (!response.ok) {
    throw new Error(
      `Google Text Search failed: ${response.status} ${await response.text()}`,
    );
  }

  const data = (await response.json()) as GoogleTextSearchResponse;
  return (data.places ?? []).map((place) => place.id);
}

export const findGoogleIdsForSuggestionResolver: QueryResolvers["findGoogleIdsForSuggestion"] = async (
  _parent,
  { id, token },
) => {
  // Token checked before any Google request, same as every other admin operation.
  const suggestion = await requireSuggestionForReview(id, token);

  const googleIds = await searchGooglePlaceIds(
    `${suggestion.name}, ${suggestion.address}`,
  );
  if (googleIds.length === 0) return [];

  const existingPlaces = await Place.find({
    "properties.googleId": { $in: googleIds },
  })
    .select("_id properties.googleId")
    .lean();
  const existingPlaceIdByGoogleId = new Map(
    existingPlaces.map((place) => [
      place.properties.googleId as string,
      place._id.toString(),
    ]),
  );

  return googleIds.map((googleId) => ({
    googleId,
    existingPlaceId: existingPlaceIdByGoogleId.get(googleId) ?? null,
  }));
};
