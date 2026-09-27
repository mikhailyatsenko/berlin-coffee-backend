import { GraphQLError } from "graphql";
import Place from "../../../models/Place.js";
import { requireSuggestionForReview } from "../../../utils/placeSuggestionToken.js";
import { GOOGLE_PLACES_API_KEY } from "../../../config/env.js";

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

const googleLookupError = () =>
  new GraphQLError("Could not reach Google right now; try again", {
    extensions: { code: "GOOGLE_LOOKUP_FAILED" },
  });

async function searchGooglePlaceIds(query: string): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, pageSize: MAX_RESULTS }),
    });
  } catch (error) {
    console.error("Google Text Search request failed:", error);
    throw googleLookupError();
  }

  if (!response.ok) {
    console.error(
      "Google Text Search failed:",
      response.status,
      await response.text(),
    );
    throw googleLookupError();
  }

  const data = (await response.json()) as GoogleTextSearchResponse;
  return (data.places ?? []).map((place) => place.id);
}

export async function findGoogleIdsForSuggestionResolver(
  _: never,
  { id, token }: { id: string; token: string },
) {
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
}
