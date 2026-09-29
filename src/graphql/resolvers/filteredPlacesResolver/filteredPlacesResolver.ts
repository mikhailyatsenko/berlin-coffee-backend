import { badInput } from "../../errors.js";
import type { QueryResolvers } from "../../generated/types.js";
import { resolveActorRef } from "../../../utils/reviewActor.js";
import { normalizeNeighborhood } from "../../../utils/neighborhood.js";
import { getFilteredPlacesWithStats } from "./services/filteredPlacesAggregationService.js";
import { formatFilteredPlace } from "./services/formatFilteredPlace.js";

/** An explicit `null` list, or `null` inside one, filters by nothing. */
const withoutNulls = (list: (string | null)[] | null | undefined) =>
    list?.filter((value): value is string => value !== null);

export const filteredPlacesResolver: QueryResolvers["filteredPlaces"] = async (
    _parent,
    args,
    { user, guest },
) => {
    const neighborhood = withoutNulls(args.neighborhood);
    const additionalInfo = withoutNulls(args.additionalInfo);
    const minRating = args.minRating ?? undefined;

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
};

