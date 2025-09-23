import { GraphQLError } from "graphql";
import { getPlaceWithStatsById } from "./services/placeAggregationService.js";
import { getPlaceImages } from "../../../utils/imagekit.js";
import { cache } from "../../../utils/cache.js";

export async function placeResolver(
  _: never,
  { placeId }: { placeId: string },
  { user }: { user?: { id: string } },
) {
  // Validate placeId presence and format (Mongo ObjectId 24-hex)
  if (!placeId || typeof placeId !== "string") {
    throw new GraphQLError("Invalid placeId", {
      extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
    });
  }

  const isValidMongoObjectId = /^[a-fA-F0-9]{24}$/.test(placeId);
  if (!isValidMongoObjectId) {
    throw new GraphQLError("Invalid placeId format", {
      extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
    });
  }

  try {
    const place = await getPlaceWithStatsById(placeId, user?.id);
    if (!place) {
      throw new GraphQLError("Place not found", {
        extensions: { code: "NOT_FOUND", http: { status: 404 } },
      });
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
    const googleStars = place.properties?.googleReview?.stars;
    let averageRating = place.averageRating;
    let ratingCount = place.ratingCount;
    if (typeof googleStars === "number") {
      averageRating =
        (place.averageRating * place.ratingCount + googleStars) /
        (place.ratingCount + 1);
      ratingCount = place.ratingCount + 1;
    }

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
  } catch (error) {
    console.error("Error fetching place:", error);
    throw new GraphQLError("Error fetching place", {
      extensions: {
        code: "INTERNAL_SERVER_ERROR",
        http: { status: 500 },
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
} 