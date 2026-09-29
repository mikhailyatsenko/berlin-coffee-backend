import { badInput, notFound } from "../../errors.js";
import type { Place, QueryResolvers } from "../../generated/types.js";
import { resolveActorRef } from "../../../utils/reviewActor.js";
import { getPlaceWithStatsById } from "./services/placeAggregationService.js";
import { getPlaceImages } from "../../../utils/imagekit.js";
import { cache } from "../../../utils/cache.js";

export const placeResolver: QueryResolvers["place"] = async (
  _parent,
  { placeId },
  { user, guest },
): Promise<Place> => {
  // Validate placeId presence and format (Mongo ObjectId 24-hex)
  if (!placeId || typeof placeId !== "string") {
    throw badInput("Invalid placeId");
  }

  const isValidMongoObjectId = /^[a-fA-F0-9]{24}$/.test(placeId);
  if (!isValidMongoObjectId) {
    throw badInput("Invalid placeId format");
  }

  const place = await getPlaceWithStatsById(placeId, resolveActorRef(user, guest));
  if (!place) {
    throw notFound("Place not found");
  }

  // Create cache key for images only
  const imagesCacheKey = `images:${placeId}`;
  
  // Check cache for images first
  let images = cache.get<string[]>(imagesCacheKey);
  if (!images) {
    // Get list of images from ImageKit
    images = await getPlaceImages(placeId) || [];
    // Cache images for 30 minutes (longer than place data)
    cache.set(imagesCacheKey, images, 30 * 60 * 1000);
  }
  const averageRating = place.averageRating;
  const ratingCount = place.ratingCount;

  return {
    id: place._id.toString(),
    type: place.type || "Feature",
    geometry: {
      type: place.geometry.type || "Point",
      coordinates: place.geometry.coordinates,
    },
    properties: {
      id: place._id.toString(),
      name: place.properties.name || "",
      description: place.properties.description || "",
      address: place.properties.address || "",
      image: place.properties.image || "",
      images: images, // array of images for individual place
      instagram: place.properties.instagram || "",
      averageRating: Number(averageRating.toFixed(1)),
      ratingCount: ratingCount,
      characteristicCounts: place.characteristicCounts,
      favoriteCount: place.favoriteCount,
      isFavorite: place.isFavorite,
      additionalInfo: place.properties.additionalInfo || {},
      googleId: place.properties.googleId || null,
      neighborhood: place.properties.neighborhood || null,
      openingHours: place.properties.openingHours || [],
      phone: place.properties.phone || null,
      website: place.properties.website || null,
    },
  };
};
