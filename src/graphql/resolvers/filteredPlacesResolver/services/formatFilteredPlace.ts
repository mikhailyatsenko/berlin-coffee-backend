import type { Place } from "../../../generated/types.js";
import { markedCharacteristics } from "../../../../utils/markedCharacteristics.js";
import { PlaceWithStats } from "./filteredPlacesAggregationService.js";

/** A Place from the filteredPlaces aggregation, in the shape of the GraphQL `Place`. */
export function formatFilteredPlace(place: PlaceWithStats): Place {
    return {
        id: place._id.toString(),
        type: place.type || "Feature",
        geometry: {
            type: place.geometry.type || "Point",
            coordinates: place.geometry.coordinates,
        },
        properties: {
            id: place._id.toString(),
            // slug: place.properties.slug || "",
            name: place.properties.name || "",
            description: place.properties.description || "",
            address: place.properties.address || "",
            image: place.properties.image || "",
            instagram: place.properties.instagram || "",
            averageRating: place.averageRating,
            ratingCount: place.ratingCount,
            favoriteCount: place.favoriteCount,
            isFavorite: place.isFavorite,
            ownRating: place.ownReview?.rating ?? null,
            ownCharacteristics: place.ownReview
                ? markedCharacteristics(place.ownReview.characteristics)
                : null,
            googleId: place.properties.googleId || null,
            neighborhood: place.properties.neighborhood || null,
        },
    };
}
