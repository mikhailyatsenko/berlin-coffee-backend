import { GraphQLError } from "graphql";
import Place from "../../../models/Place.js";
import User from "../../../models/User.js";
import { requireSuggestionForReview } from "../../../utils/placeSuggestionToken.js";
import {
  isBerlinNeighborhood,
  isInsideBerlin,
} from "../../../utils/berlinGeography.js";
import { invalidateNeighborhoodsCache } from "../availableNeighborhoodsResolver/services/neighborhoodsService.js";
import { sendSuggestionPublishedEmail } from "./sendSuggestionPublishedEmail.js";
import { suggestionOutcome } from "./placeSuggestionOutcome.js";
import PlaceSuggestion from "../../../models/PlaceSuggestion.js";

interface PublishPlaceSuggestionInput {
  name: string;
  address: string;
  coordinates?: { lat: number; lng: number } | null;
  neighborhood: string;
  description?: string | null;
  instagram?: string | null;
  website?: string | null;
  phone?: string | null;
  googlePlaceId?: string | null;
  // Ignored until Place photos ship (backend ticket 03).
  photoPaths?: string[] | null;
}

const badInput = (message: string) =>
  new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });

/**
 * The message carries the existing Place's id (its last, 24-hex-char word) so
 * the review page can link to it, since only `code` and `message` survive
 * `formatError` — see `index.ts`.
 */
const duplicateGooglePlaceIdError = (placeId: string) =>
  new GraphQLError(
    `This Google Place ID already belongs to a Place: ${placeId}`,
    { extensions: { code: "DUPLICATE_GOOGLE_PLACE_ID" } },
  );

const trimmed = (value: string | null | undefined): string | undefined => {
  const text = value?.trim();
  return text || undefined;
};

// Not named requiredText: the sibling submitPlaceSuggestionResolver.ts has a
// requiredText(value, field, maxLength) that also enforces a length cap. This
// input has no length caps of its own (the ticket doesn't ask for any), so
// it gets its own name rather than a same-named helper with a thinner contract.
function requiredField(value: string | null | undefined, field: string): string {
  const text = trimmed(value);
  if (!text) throw badInput(`${field} is required`);
  return text;
}

export async function publishPlaceSuggestionResolver(
  _: never,
  { id, token, input }: { id: string; token: string; input: PublishPlaceSuggestionInput },
) {
  const suggestion = await requireSuggestionForReview(id, token);

  // A repeat changes nothing: the input isn't even looked at.
  if (suggestion.status !== "pending") {
    return suggestionOutcome(suggestion);
  }

  const name = requiredField(input.name, "name");
  const address = requiredField(input.address, "address");

  const lat = input.coordinates?.lat;
  const lng = input.coordinates?.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || !isInsideBerlin(lat, lng)) {
    throw badInput("coordinates must be inside Berlin");
  }

  const neighborhood = trimmed(input.neighborhood);
  if (!neighborhood || !isBerlinNeighborhood(neighborhood)) {
    throw badInput("neighborhood must be one of the twelve");
  }

  const description = trimmed(input.description);
  const instagram = trimmed(input.instagram);
  const website = trimmed(input.website);
  const phone = trimmed(input.phone);
  const googlePlaceId = trimmed(input.googlePlaceId);

  if (googlePlaceId) {
    const existing = await Place.findOne({ "properties.googleId": googlePlaceId })
      .select("_id")
      .lean();
    if (existing) {
      throw duplicateGooglePlaceIdError(existing._id.toString());
    }
  }

  const place = await Place.create({
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      name,
      address,
      description: description ?? null,
      instagram: instagram ?? null,
      website: website ?? null,
      phone: phone ?? null,
      googleId: googlePlaceId ?? null,
      neighborhood,
      // additionalInfo (Amenities) and openingHours stay at their schema
      // defaults — empty — and image at "", which the frontend already
      // renders as a placeholder.
      businessStatus: "OPERATIONAL",
    },
  });

  invalidateNeighborhoodsCache();

  const recipientEmail = suggestion.userId
    ? (await User.findById(suggestion.userId).select("email").lean())?.email
    : suggestion.guestEmail;

  if (recipientEmail) {
    await sendSuggestionPublishedEmail(recipientEmail, place._id.toString());
  }

  await PlaceSuggestion.updateOne(
    { _id: suggestion._id },
    {
      $set: {
        status: "published",
        publishedPlaceId: place._id,
        decidedAt: new Date(),
      },
      $unset: { guestEmail: "" },
    },
  );

  return suggestionOutcome({ status: "published", publishedPlaceId: place._id });
}
