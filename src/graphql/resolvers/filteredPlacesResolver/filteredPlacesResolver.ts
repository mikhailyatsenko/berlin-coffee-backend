import { GraphQLError } from "graphql";
import { getFilteredPlacesWithStats } from "./services/filteredPlacesAggregationService.js";


function normalizeNeighborhood(input?: string[]): string[] | undefined {
    if (!input || input.length === 0) return input;
    return input.map(neighborhood =>
        neighborhood
            .trim()
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('-')
    );
}

export async function filteredPlacesResolver(
    _: never,
    {
        neighborhood,
        minRating,
        additionalInfo,
    }: {
        neighborhood?: string[];
        minRating?: number;
        additionalInfo?: string[];
    },
    { user }: { user?: { id: string } },
) {
    try {
        // Валидация параметров
        if (minRating !== undefined && (minRating < 0 || minRating > 5)) {
            throw new GraphQLError("MinRating must be between 0 and 5", {
                extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
            });
        }

        // Нормализация района
        const normalizedNeighborhood = normalizeNeighborhood(neighborhood);

        const { places, total } = await getFilteredPlacesWithStats(
            user?.id,
            normalizedNeighborhood,
            minRating,
            additionalInfo,
        );

        // Convert to GraphQL format
        const formattedPlaces = places.map((place) => {
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
                    // slug: place.properties.slug || "",
                    name: place.properties.name || "",
                    description: place.properties.description || "",
                    address: place.properties.address || "",
                    image: place.properties.image || "",
                    instagram: place.properties.instagram || "",
                    averageRating: Number(averageRating.toFixed(1)),
                    ratingCount: ratingCount,
                    favoriteCount: place.favoriteCount,
                    isFavorite: place.isFavorite,
                    googleId: place.properties.googleId || null,
                    neighborhood: place.properties.neighborhood || null,
                },
            };
        });

        return {
            places: formattedPlaces,
            total,
        };
    } catch (error) {
        console.error("Error fetching filtered places:", error);
        if (error instanceof GraphQLError) {
            throw error;
        }
        throw new GraphQLError("Error fetching filtered places", {
            extensions: {
                code: "INTERNAL_SERVER_ERROR",
                error: error instanceof Error ? error.message : String(error),
            },
        });
    }
}

