import { badInput } from "../../errors.js";
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
    // Валидация параметров
    if (minRating !== undefined && (minRating < 0 || minRating > 5)) {
        throw badInput("MinRating must be between 0 and 5");
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
}

