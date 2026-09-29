import type { QueryResolvers } from "../../generated/types.js";
import { getAvailableNeighborhoods } from "./services/neighborhoodsService.js";

export const availableNeighborhoodsResolver: QueryResolvers["availableNeighborhoods"] = async () => {
    const neighborhoods = await getAvailableNeighborhoods();

    return {
        neighborhoods,
        total: neighborhoods.length,
    };
};
