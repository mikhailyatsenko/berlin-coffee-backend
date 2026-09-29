import { getAvailableNeighborhoods } from "./services/neighborhoodsService.js";

export async function availableNeighborhoodsResolver() {
    const neighborhoods = await getAvailableNeighborhoods();

    return {
        neighborhoods,
        total: neighborhoods.length,
    };
}
