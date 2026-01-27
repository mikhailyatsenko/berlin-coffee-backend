import { GraphQLError } from "graphql";
import { getAvailableNeighborhoods } from "./services/neighborhoodsService.js";

export async function availableNeighborhoodsResolver() {
    try {
        const neighborhoods = await getAvailableNeighborhoods();

        return {
            neighborhoods,
            total: neighborhoods.length,
        };
    } catch (error) {
        console.error("Error fetching available neighborhoods:", error);
        throw new GraphQLError("Error fetching available neighborhoods", {
            extensions: {
                code: "INTERNAL_SERVER_ERROR",
                error: error instanceof Error ? error.message : String(error),
            },
        });
    }
}
