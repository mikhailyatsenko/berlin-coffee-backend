import { GraphQLError } from "graphql";
import { GuestContext } from "../../../utils/guestAuth.js";
import { resolveActorRef } from "../../../utils/reviewActor.js";
import { normalizeNeighborhood } from "../../../utils/neighborhood.js";
import { getFilteredPlacesWithStats } from "./services/filteredPlacesAggregationService.js";
import { formatFilteredPlace } from "./services/formatFilteredPlace.js";

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
    { user, guest }: { user?: { id: string }; guest?: GuestContext },
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
            resolveActorRef(user, guest),
            normalizedNeighborhood,
            minRating,
            additionalInfo,
        );

        // Convert to GraphQL format
        const formattedPlaces = places.map(formatFilteredPlace);

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

