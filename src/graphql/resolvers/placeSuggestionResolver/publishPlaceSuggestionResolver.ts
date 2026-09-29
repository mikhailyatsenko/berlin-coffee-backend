import { GraphQLError } from "graphql";
import mongoose from "mongoose";
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
import {
  copyPlaceSuggestionPhotoToPlace,
  deleteImageKitFolder,
  placePhotoFolder,
  placeSuggestionPhotoFolder,
} from "../../../utils/imagekit.js";
import { REVIEW_IMAGE_UPLOAD_TIMEOUT_MS } from "../../../config/env.js";
import { appError } from "../../errors.js";

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
  /** The suggestion's own photo paths to keep, in upload order. Must belong to this suggestion. */
  photoPaths?: string[] | null;
}

const badInput = (message: string) =>
  new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });

/**
 * `existingPlaceId` lets the review page link to the Place. The message keeps
 * the id as its last, 24-hex-char word for clients that still parse it out.
 */
const duplicateGooglePlaceIdError = (placeId: string) =>
  appError(
    "DUPLICATE_GOOGLE_PLACE_ID",
    `This Google Place ID already belongs to a Place: ${placeId}`,
    { existingPlaceId: placeId },
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

  // Order is what the frontend preserved after removing dropped photos: the
  // first survivor becomes the card image.
  const keptPhotoPaths = [
    ...new Set((input.photoPaths ?? []).filter((p): p is string => !!p)),
  ];
  if (keptPhotoPaths.some((path) => !suggestion.photos.includes(path))) {
    throw badInput("photoPaths must belong to this suggestion");
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

  // The Place's id is generated up front so the photos can be copied into its
  // folder before the Place document itself exists. If ImageKit fails here,
  // nothing has been created yet: the suggestion is untouched, and the admin's
  // retry starts clean rather than risking a second Place from a second
  // Place.create() after a partial success. Photos are copied, not moved, so a
  // failure partway through this Place's photos never strands an
  // already-relocated one with no original left to retry from; the originals
  // are all cleared together below, once every kept photo's copy has landed.
  const placeId = new mongoose.Types.ObjectId();
  let cardImage: string | undefined;

  if (keptPhotoPaths.length > 0) {
    const deadline = new Date(Date.now() + REVIEW_IMAGE_UPLOAD_TIMEOUT_MS);
    try {
      await Promise.all(
        keptPhotoPaths.map((path, index) =>
          copyPlaceSuggestionPhotoToPlace(
            path,
            placeId.toString(),
            index === 0,
            deadline,
          ),
        ),
      );
    } catch (error) {
      console.error("Error copying suggestion photos to the new Place:", error);
      throw new GraphQLError(
        "Failed to copy the suggestion's photos to the new Place; try Publish again",
        { extensions: { code: "INTERNAL_SERVER_ERROR" } },
      );
    }
    // Real ImageKit paths always carry a leading slash (as `photos` entries and
    // getPlaceImages() results already do); match that here too.
    cardImage = `/${placePhotoFolder(placeId.toString())}/main.jpg`;
  }

  const place = await Place.create({
    _id: placeId,
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
      // defaults — empty. image stays "" (the frontend's placeholder) with no
      // kept photos, or the copied card image's path above.
      ...(cardImage && { image: cardImage }),
      businessStatus: "OPERATIONAL",
    },
  });

  // Marked published right away, before the folder cleanup below: a photo
  // upload still in flight for this suggestion checks status === "pending" in
  // its own atomic commit, so once this write lands, that commit simply
  // no-ops instead of racing the delete that follows — the file is left an
  // orphan for the cleanup to catch, the same way a failed upload always is.
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

  invalidateNeighborhoodsCache();

  // Whatever's left in the suggestion's folder is the dropped photos' and the
  // kept ones' originals (the kept ones were only copied above), plus any
  // upload that never made it into `photos`. Best-effort: deleteImageKitFolder
  // logs and swallows its own failures, so a leftover ImageKit folder never
  // blocks Publish once the Place itself is safely created.
  if (suggestion.photos.length > 0) {
    await deleteImageKitFolder(
      placeSuggestionPhotoFolder(suggestion._id.toString()),
    );
  }

  const recipientEmail = suggestion.userId
    ? (await User.findById(suggestion.userId).select("email").lean())?.email
    : suggestion.guestEmail;

  if (recipientEmail) {
    await sendSuggestionPublishedEmail(recipientEmail, place._id.toString());
  }

  return suggestionOutcome({ status: "published", publishedPlaceId: place._id });
}
