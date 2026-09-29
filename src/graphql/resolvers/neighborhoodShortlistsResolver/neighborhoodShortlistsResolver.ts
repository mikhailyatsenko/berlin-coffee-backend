import { GuestContext } from "../../../utils/guestAuth.js";
import { normalizeNeighborhood } from "../../../utils/neighborhood.js";
import { resolveActorRef } from "../../../utils/reviewActor.js";
import {
    SHORTLISTS,
    SHORTLIST_MIN_RATING,
    SHORTLIST_PLACES_LIMIT,
} from "../../../amenities/shortlists.js";
import { getFilteredPlacesWithStats } from "../filteredPlacesResolver/services/filteredPlacesAggregationService.js";
import { formatFilteredPlace } from "../filteredPlacesResolver/services/formatFilteredPlace.js";

export async function neighborhoodShortlistsResolver(
    _: never,
    { neighborhood }: { neighborhood: string },
    { user, guest }: { user?: { id: string }; guest?: GuestContext },
) {
    const actor = resolveActorRef(user, guest);
    const normalizedNeighborhood = normalizeNeighborhood([neighborhood]);

    // The same filter as the map's "See all N", so `total` is that N
    return await Promise.all(
        SHORTLISTS.map(async ({ id, amenities }) => {
            const { places, total } = await getFilteredPlacesWithStats(
                actor,
                normalizedNeighborhood,
                SHORTLIST_MIN_RATING,
                [...amenities],
                { sortByRating: true, limit: SHORTLIST_PLACES_LIMIT },
            );
            return {
                id,
                amenities: [...amenities],
                places: places.map(formatFilteredPlace),
                total,
            };
        }),
    );
}
